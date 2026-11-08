// Study plan engine. Pure: takes the learner's state as data and returns
// today's tasks and the weeks ahead. No I/O, so it is unit tested directly
// (test/plan.test.mjs) and recomputed on every GET /api/plan.
//
// The plan works back from the test date in phases:
//   learn       start every skill (new-skill lessons spread evenly so all are
//               started by about 60% of the runway, both sections interleaved)
//   strengthen  weak spots first (weight × (1 − mastery)), mixed sets, review
//   test_ready  the last ~15% (7–10 days on a normal runway): timed mixed sets
//   rest        the day before the test (and test day): light review only
//   after       the test date has passed: practice stays open
//
// Everything is computed from the state at the start of the learner's day
// (attempts made today are subtracted back out), so today's task list stays
// the same while the learner works through it; what they did today only marks
// tasks done.

import { UNLOCK_ATTEMPTS } from "./engine.js";

export const MINUTES = { lesson: 6, review: 0.6, practice: 1 };
export const LESSON_QUESTIONS = 8;
export const NOT_BOOKED_DAYS = 56; // "not booked yet" assumes a test 8 weeks out
export const DAILY_MINUTES_OPTIONS = [10, 20, 30, 45];
export const DEFAULT_DAILY_MINUTES = 20;
export const LEARN_SHARE = 0.6; // all skills started by ~60% of the runway
export const LONG_RUNWAY_DAYS = 150; // ~5 months+: at most one new skill a day
export const REVIEW_CHUNK = LESSON_QUESTIONS; // a review lesson serves up to 8 due items
const DEFAULT_TIMED_SECONDS = 80;

// ─── Dates (YYYY-MM-DD strings, calendar arithmetic in UTC) ─────────────────
const toMs = (day) => Date.parse(day + "T00:00:00Z");
export function addDays(day, n) {
  return new Date(toMs(day) + n * 86_400_000).toISOString().slice(0, 10);
}
export function daysBetween(from, to) {
  return Math.round((toMs(to) - toMs(from)) / 86_400_000);
}
export const isDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toMs(s)) && addDays(s, 0) === s;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(day) {
  const d = new Date(toMs(day));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * The test date the plan works toward. "Not booked yet" assumes 8 weeks after
 * the plan started; once that gets close it keeps sliding (never under 4 weeks
 * away), so an unbooked learner never lands in test-ready or rest days.
 */
export function effectiveExamDate({ exam_date, plan_started_at, today }) {
  if (exam_date) return { date: exam_date, assumed: false };
  const start = plan_started_at || today;
  let date = addDays(start, NOT_BOOKED_DAYS);
  if (daysBetween(today, date) < 28) date = addDays(today, 28);
  return { date, assumed: true };
}

// Days at the end spent in test-ready mode (not counting the rest day).
export function testReadyDays(totalDays) {
  if (totalDays >= 60) return Math.min(10, Math.max(7, Math.round(0.15 * totalDays)));
  if (totalDays >= 21) return 7;
  return Math.min(7, Math.max(2, Math.round(totalDays * 0.4)));
}

// ─── Skills ─────────────────────────────────────────────────────────────────

// Longest prerequisite chain under each skill (roots are 0).
function depths(skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map();
  const visit = (id, stack = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const pre = (byId.get(id)?.prereqs || []).filter((p) => byId.has(p));
    const d = pre.length ? 1 + Math.max(...pre.map((p) => visit(p, stack))) : 0;
    memo.set(id, d);
    return d;
  };
  skills.forEach((s) => visit(s.id));
  return memo;
}

/**
 * Normalizes skill input. Each skill's weight is its share of the whole exam:
 * sections count equally, a domain's weight is its fraction of its section
 * (equal split when missing), and a domain's weight is split evenly over its
 * skills. Start-of-day attempts are attempts minus attempts made today.
 */
export function prepareSkills(skills) {
  const sections = [...new Set(skills.map((s) => s.section_id))];
  const depth = depths(skills);
  const domainSkills = new Map();
  for (const s of skills) domainSkills.set(s.domain_id, (domainSkills.get(s.domain_id) || 0) + 1);
  const sectionDomains = new Map();
  for (const s of skills) {
    if (!sectionDomains.has(s.section_id)) sectionDomains.set(s.section_id, new Map());
    sectionDomains.get(s.section_id).set(s.domain_id, s.domain_weight);
  }
  const domainShare = (s) => {
    const doms = sectionDomains.get(s.section_id);
    const ws = [...doms.values()];
    if (ws.some((w) => !(w > 0))) return 1 / doms.size;
    const sum = ws.reduce((a, b) => a + b, 0);
    return s.domain_weight / sum;
  };
  const out = skills.map((s, i) => {
    const attempts = s.attempts || 0;
    const sod = Math.max(0, attempts - (s.attempts_today || 0));
    return {
      ...s,
      position: s.position ?? i,
      prereqs: s.prereqs || [],
      depth: depth.get(s.id) || 0,
      weight: domainShare(s) / domainSkills.get(s.domain_id) / sections.length,
      mastery: Math.max(0, Math.min(1, (s.mastery || 0) / 100)),
      attempts,
      sod_attempts: sod,
      started: !!s.tested_out || attempts > 0,
      started_sod: !!s.tested_out || sod > 0,
    };
  });
  const total = out.reduce((a, s) => a + s.weight, 0) || 1;
  out.forEach((s) => { s.weight /= total; });
  return out;
}

const unlockedBy = (skill, attemptsOf) => skill.prereqs.every((p) => attemptsOf(p) >= UNLOCK_ATTEMPTS || attemptsOf(p) === Infinity);

/**
 * New skills in the order the plan starts them: open (prerequisites done)
 * skills first by prerequisite depth, then by weight; the two sections are
 * interleaved so neither falls behind. With `byWeight` (a runway too short to
 * start everything) weight comes before depth.
 */
export function orderNewSkills(skills, startedIds, attemptsOf, { byWeight = false } = {}) {
  const open = skills.filter((s) => !startedIds.has(s.id) && unlockedBy(s, attemptsOf));
  const cmp = byWeight
    ? (a, b) => b.weight - a.weight || a.depth - b.depth || a.position - b.position
    : (a, b) => a.depth - b.depth || b.weight - a.weight || a.position - b.position;
  const queues = new Map();
  for (const s of [...open].sort(cmp)) {
    if (!queues.has(s.section_id)) queues.set(s.section_id, []);
    queues.get(s.section_id).push(s);
  }
  const totalIn = new Map();
  const doneIn = new Map();
  for (const s of skills) {
    totalIn.set(s.section_id, (totalIn.get(s.section_id) || 0) + 1);
    if (startedIds.has(s.id)) doneIn.set(s.section_id, (doneIn.get(s.section_id) || 0) + 1);
  }
  const order = [];
  while ([...queues.values()].some((q) => q.length)) {
    let best = null;
    let bestFrac = Infinity;
    for (const [sec, q] of queues) {
      if (!q.length) continue;
      const frac = (doneIn.get(sec) || 0) / totalIn.get(sec);
      if (frac < bestFrac - 1e-9) { best = sec; bestFrac = frac; }
    }
    const s = queues.get(best).shift();
    order.push(s);
    doneIn.set(best, (doneIn.get(best) || 0) + 1);
  }
  return order;
}

// Weak-spot priority: points at stake.
export const weakness = (s) => s.weight * (1 - s.mastery);
export function weakest(skills, k = 3) {
  return skills
    .filter((s) => s.started)
    .sort((a, b) => weakness(b) - weakness(a) || a.mastery - b.mastery || a.position - b.position)
    .slice(0, k);
}

// ─── Timeline ───────────────────────────────────────────────────────────────

/** Shape of the runway: phase boundaries as days-left numbers and dates. */
export function timeline({ today, exam, planStart }) {
  const daysLeft = daysBetween(today, exam);
  const total = Math.max(1, daysLeft, daysBetween(planStart, exam));
  const tr = testReadyDays(total);
  const start = addDays(exam, -total);
  // Last day that new-skill lessons are scheduled on time, and the last day
  // before test-ready starts.
  const lastPrep = addDays(exam, -(tr + 2));
  let learnEnd = addDays(start, Math.ceil(LEARN_SHARE * total) - 1);
  if (daysBetween(learnEnd, lastPrep) < 0) learnEnd = lastPrep;
  return { daysLeft, total, tr, start, learnEnd, lastPrep };
}

export function phaseOn(daysLeft, tr, anyUnstarted) {
  if (daysLeft < 0) return "after";
  if (daysLeft <= 1) return "rest";
  if (daysLeft <= tr + 1) return "test_ready";
  return anyUnstarted ? "learn" : "strengthen";
}

// Lesson cap per day: lessons may use up to ~75% of the daily time.
export const lessonCap = (minutes, daysLeft) => {
  const cap = Math.max(1, Math.floor((0.75 * minutes) / MINUTES.lesson));
  return daysLeft > LONG_RUNWAY_DAYS ? 1 : cap;
};

/**
 * How many new skills to start on `day`. Spreads the remaining skills evenly
 * over the days left in the learn window; when that is less than one a day it
 * schedules one every `interval` days (rounded down, so the window is met).
 */
export function newLessonsOn({ day, unstarted, tl, minutes, lastNewDay }) {
  if (!unstarted) return 0;
  const daysLeft = daysBetween(day, addDays(tl.start, tl.total));
  let window = daysBetween(day, tl.learnEnd) + 1;
  if (window < 1) window = Math.max(1, daysBetween(day, tl.lastPrep) + 1); // behind: catch up before test-ready
  const rate = unstarted / window;
  const cap = lessonCap(minutes, daysLeft);
  if (rate >= 1) return Math.min(Math.ceil(rate), cap);
  const interval = Math.max(1, Math.floor(1 / rate));
  const gap = lastNewDay ? daysBetween(lastNewDay, day) : Infinity;
  return gap >= interval ? 1 : 0;
}

// ─── Task building ──────────────────────────────────────────────────────────

const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const round1 = (x) => Math.round(x * 10) / 10;

function practiceMinutesPer(skills, pace) {
  if (!skills.length) return MINUTES.practice;
  const v = skills.map((s) => pace[s.section_id]?.practice_minutes ?? MINUTES.practice);
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function timedSecondsPer(skills, pace) {
  if (!skills.length) return DEFAULT_TIMED_SECONDS;
  // Timed sets mix sections by weight, like the real test.
  const w = skills.reduce((a, s) => a + s.weight, 0) || 1;
  return skills.reduce((a, s) => a + s.weight * (pace[s.section_id]?.timed_seconds ?? DEFAULT_TIMED_SECONDS), 0) / w;
}

function recentLine(s) {
  if (!s.recent?.total) return null;
  return `You got ${s.recent.correct} of your last ${s.recent.total} right on ${s.name}.`;
}

function weakWhy(list) {
  if (!list.length) return "Practice on the skills you've started.";
  const lead = recentLine(list[0]) || `${list[0].name} is your lowest at ${pct(list[0].mastery)}.`;
  const rest = list.slice(1).map((s) => `${s.name} (${pct(s.mastery)})`);
  return rest.length ? `${lead} Also in this set: ${rest.join(" and ")}.` : lead;
}

/**
 * Today's plan.
 * @param {object} o
 * @param {string} o.today                 learner's local day, YYYY-MM-DD
 * @param {string|null} o.exam_date        YYYY-MM-DD or null (not booked / no profile)
 * @param {string|null} o.plan_started_at  YYYY-MM-DD or null
 * @param {number} [o.daily_minutes]
 * @param {object[]} o.skills  {id, name, section_id, domain_id, domain_weight, prereqs, position,
 *   attempts, attempts_today, mastery (0–100), tested_out, mastered, first_day, last_day,
 *   recent: {correct, total}}
 * @param {number} o.reviews_due          due right now
 * @param {number} [o.reviews_done_today] review answers already given today
 * @param {number} [o.mistakes]           items whose latest answer is wrong
 * @param {{kind:string, mode:string|null, skill_id:string|null, completed:boolean}[]} [o.lessons_today]
 * @param {string[]} [o.active_days]      days (last 2 weeks or more) with a finished lesson
 * @param {Object<string,{practice_minutes:number, timed_seconds:number}>} [o.pace] per section
 */
export function buildPlan(o) {
  const today = o.today;
  const minutes = DAILY_MINUTES_OPTIONS.includes(o.daily_minutes) ? o.daily_minutes : DEFAULT_DAILY_MINUTES;
  const pace = o.pace || {};
  const planStart = o.plan_started_at && daysBetween(o.plan_started_at, today) >= 0 ? o.plan_started_at : today;
  const exam = effectiveExamDate({ exam_date: o.exam_date, plan_started_at: planStart, today });
  const tl = timeline({ today, exam: exam.date, planStart });
  const skills = prepareSkills(o.skills || []);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const lessonsToday = o.lessons_today || [];
  const done = lessonsToday.filter((l) => l.completed);
  const active = new Set(o.active_days || []);

  const startedSod = new Set(skills.filter((s) => s.started_sod).map((s) => s.id));
  const unstartedSod = skills.filter((s) => !s.started_sod);
  const phase = phaseOn(tl.daysLeft, tl.tr, unstartedSod.length > 0);

  // New-skill pacing (as of the start of today).
  const lastNewDay = skills
    .filter((s) => s.started_sod && !s.tested_out && s.first_day && s.first_day < today)
    .map((s) => s.first_day).sort().pop() || null;
  const shortRunway = unstartedSod.length > lessonCap(minutes, tl.daysLeft) * Math.max(1, daysBetween(today, tl.lastPrep) + 1);
  const sodAttempts = (id) => byId.get(id)?.sod_attempts ?? Infinity;
  const candidates = orderNewSkills(skills, startedSod, sodAttempts, { byWeight: shortRunway });

  // Behind: the even pace line from plan start vs skills started by today.
  const learnLen = Math.max(1, daysBetween(planStart, tl.learnEnd) + 1);
  const elapsed = Math.max(0, daysBetween(planStart, today));
  const expected = Math.floor(skills.length * Math.min(1, elapsed / learnLen));
  let behind = 0;
  if (phase === "learn") behind = Math.max(0, expected - startedSod.size);
  else if (phase === "test_ready" || phase === "rest") behind = unstartedSod.length;

  const tasks = [];
  let budget = minutes;
  const add = (t) => { tasks.push(t); budget -= t.minutes; };
  const startedNow = skills.filter((s) => s.started);
  const doneByMode = (mode) => done.filter((l) => l.kind === "practice" && l.mode === mode).length;
  const used = new Map();
  const takeDone = (mode) => {
    const n = used.get(mode) || 0;
    if (n < doneByMode(mode)) { used.set(mode, n + 1); return true; }
    return false;
  };

  // Review tasks (due at start of day ≈ due now + answered today).
  const reviewsSod = (o.reviews_due || 0) + (o.reviews_done_today || 0);
  const reviewLessonsDone = done.filter((l) => l.kind !== "practice" && l.kind !== "placement" && !l.skill_id).length;
  const addReview = (cap) => {
    const n = Math.min(reviewsSod, cap, Math.floor(Math.max(0, budget) / MINUTES.review));
    for (let i = 0, left = n; left > 0; i++, left -= REVIEW_CHUNK) {
      const k = Math.min(REVIEW_CHUNK, left);
      add({
        id: `review-${i + 1}`,
        kind: "review",
        n: k,
        minutes: round1(k * MINUTES.review),
        title: `Review ${plural(k, "question")}`,
        why: i === 0
          ? `${plural(reviewsSod, "question")} you missed before ${reviewsSod === 1 ? "is" : "are"} due today. Getting ${reviewsSod === 1 ? "it" : "them"} right now is what makes ${reviewsSod === 1 ? "it" : "them"} stick.`
          : "More of your due reviews.",
        done: i < reviewLessonsDone || (o.reviews_due || 0) === 0,
        start: { method: "POST", path: "/api/lessons", body: { skill_id: null } },
      });
    }
  };

  const lessonTask = (s, isDone) => {
    const opens = skills.filter((x) => x.prereqs.includes(s.id)).map((x) => x.name);
    const left = skills.filter((x) => !x.started).length;
    let why = isDone ? `You started ${s.name} today.` : `You haven't started ${s.name} yet.`;
    if (opens.length) why += ` It opens up ${opens.slice(0, 2).join(" and ")}.`;
    if (!isDone && phase === "learn" && left > 1) why += ` ${plural(left, "skill")} left to start by ${shortDate(tl.learnEnd)}.`;
    return {
      id: `lesson-${s.id}`,
      kind: "lesson",
      skill_id: s.id,
      minutes: MINUTES.lesson,
      title: `Learn: ${s.name}`,
      why,
      done: isDone,
      start: { method: "POST", path: "/api/lessons", body: { skill_id: s.id } },
    };
  };

  const practiceTask = (mode, list, n, extra = {}) => {
    const per = mode === "timed" ? timedSecondsPer(list.length ? list : startedNow, pace) / 60 : practiceMinutesPer(list.length ? list : startedNow, pace);
    const body = { mode, n };
    if (extra.skill_ids?.length) body.skill_ids = extra.skill_ids;
    return {
      id: `practice-${mode}`,
      kind: "practice",
      mode,
      n,
      minutes: round1(n * per),
      ...(extra.skill_ids ? { skill_ids: extra.skill_ids } : {}),
      title: extra.title,
      why: extra.why,
      done: takeDone(mode),
      start: { method: "POST", path: "/api/practice", body },
    };
  };
  const nFor = (mins, per) => Math.max(5, Math.min(30, Math.round(mins / per)));

  // New-skill lessons done today are always shown, done.
  const newDoneToday = [...new Set(done.filter((l) => l.kind === "skill" && l.skill_id && !startedSod.has(l.skill_id)).map((l) => l.skill_id))]
    .filter((id) => byId.has(id));

  if (phase === "learn") {
    let L = newLessonsOn({ day: today, unstarted: unstartedSod.length, tl, minutes, lastNewDay });
    if (!startedSod.size) L =Math.max(L, Math.min(lessonCap(minutes, tl.daysLeft), Math.floor(minutes / MINUTES.lesson)));
    for (const id of newDoneToday) add(lessonTask(byId.get(id), true));
    for (const s of candidates) {
      if (tasks.filter((t) => t.kind === "lesson").length >= L) break;
      if (newDoneToday.includes(s.id)) continue;
      add(lessonTask(s, false));
    }
    addReview(tl.daysLeft > LONG_RUNWAY_DAYS ? 16 : Math.max(5, Math.floor((0.3 * minutes) / MINUTES.review)));
    // Practice fills the rest: skills already started plus today's new ones.
    const todayIds = new Set(tasks.filter((t) => t.kind === "lesson").map((t) => t.skill_id));
    const pool = skills.filter((s) => s.started || todayIds.has(s.id));
    if (budget >= 3 && pool.length) {
      const weak = weakest(skills, 3);
      const struggling = weak.filter((s) => s.mastery < 0.6 && s.sod_attempts >= LESSON_QUESTIONS);
      if (struggling.length) {
        const per = practiceMinutesPer(struggling, pace);
        add(practiceTask("weak", struggling, nFor(budget, per), {
          skill_ids: struggling.map((s) => s.id),
          title: "Weak spots",
          why: weakWhy(struggling),
        }));
      } else {
        const per = practiceMinutesPer(pool, pace);
        add(practiceTask("mixed", pool, nFor(budget, per), {
          title: "Mixed practice",
          why: startedNow.length
            ? `A mix from the ${plural(startedNow.length, "skill")} you've started, so the early ones don't fade while you learn new ones.`
            : "After today's lessons: a mixed set on what you just learned, to lock it in.",
        }));
      }
    }
  } else if (phase === "strengthen") {
    for (const id of newDoneToday) add(lessonTask(byId.get(id), true));
    addReview(Math.max(5, Math.floor((0.3 * minutes) / MINUTES.review)));
    const weak = weakest(skills, minutes >= 30 ? 4 : 3);
    const weakShare = budget >= 8 ? 0.6 : 1;
    if (budget >= 3 && weak.length) {
      const per = practiceMinutesPer(weak, pace);
      add(practiceTask("weak", weak, nFor(budget * weakShare, per), {
        skill_ids: weak.map((s) => s.id),
        title: "Weak spots",
        why: `Every skill is started; now we fix the weak ones. ${weakWhy(weak)}`,
      }));
    }
    if (budget >= 3) {
      const useMistakes = (o.mistakes || 0) >= 5 && daysBetween(planStart, today) % 2 === 1;
      if (useMistakes) {
        const per = practiceMinutesPer(startedNow, pace);
        add(practiceTask("mistakes", [], Math.min(o.mistakes, nFor(budget, per)), {
          title: "My mistakes",
          why: `${plural(o.mistakes, "question")} you missed and haven't gotten right since. Let's clear some.`,
        }));
      } else {
        const per = practiceMinutesPer(startedNow, pace);
        add(practiceTask("mixed", startedNow, nFor(budget, per), {
          title: "Mixed practice",
          why: "On the test, skills come in any order. Mixed sets train you to spot which one a question needs.",
        }));
      }
    }
  } else if (phase === "test_ready") {
    addReview(Math.max(3, Math.floor((0.15 * minutes) / MINUTES.review)));
    const pool = startedNow.length ? startedNow : skills;
    const secs = timedSecondsPer(pool, pace);
    const n = Math.max(5, Math.min(30, Math.round((budget * 0.75) / (secs / 60))));
    add(practiceTask("timed", pool, n, {
      title: `Timed set: ${n} questions`,
      why: `${plural(tl.daysLeft, "day")} to go. This set runs at test pace (about ${Math.round(secs)} seconds a question), so the real clock feels normal.`,
    }));
    if (budget >= 3) {
      const weak = weakest(skills, 3);
      const mode = (o.mistakes || 0) >= 3 ? "mistakes" : weak.length ? "weak" : "mixed";
      if (mode === "mixed") {
        add(practiceTask("mixed", pool, nFor(budget, practiceMinutesPer(pool, pace)), {
          title: "Mixed practice",
          why: "A relaxed, untimed mix to go with the timed set.",
        }));
      } else {
      const per = practiceMinutesPer(mode === "weak" ? weak : pool, pace);
      const k = mode === "mistakes" ? Math.min(o.mistakes, nFor(budget, per)) : nFor(budget, per);
      add(practiceTask(mode, weak, k, mode === "weak"
        ? { skill_ids: weak.map((s) => s.id), title: "Weak spots", why: weakWhy(weak) }
        : { title: "My mistakes", why: `${plural(o.mistakes, "question")} you missed and haven't fixed yet. Worth one more look before the test.` }));
      }
    }
  } else if (phase === "rest") {
    if (tl.daysLeft === 1) addReview(5);
    tasks.push({
      id: "rest",
      kind: "rest",
      minutes: 0,
      title: tl.daysLeft === 1 ? "Rest" : "Test day",
      why: tl.daysLeft === 1
        ? "Your test is tomorrow. Sleep does more for your score tonight than cramming. A few reviews, then put it away."
        : "Today's the day. Eat something, bring your charged device and ID, and trust the work you put in.",
      done: false,
      start: null,
    });
  } else {
    addReview(8);
    const pool = startedNow.length ? startedNow : skills;
    const per = practiceMinutesPer(pool, pace);
    add(practiceTask("mixed", pool, nFor(Math.min(budget, 10), per), {
      title: "Mixed practice",
      why: "Your test date has passed. Practice is still here if you're retaking or just want to keep sharp.",
    }));
  }

  // ─── Status ───
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const planDays = daysBetween(planStart, today);
  const missedTwo = planDays >= 2 && !active.has(yesterday) && !active.has(dayBefore);
  const missedYesterday = planDays >= 1 && !active.has(yesterday);
  const onTrack = behind === 0 && !missedTwo;
  const assumedNote = exam.assumed ? ` (We're assuming a test around ${shortDate(exam.date)} until you pick a date.)` : "";
  let message;
  if (phase === "after") {
    message = "Your test date has passed. Hope it went well! Practice stays open, and you can set a new date anytime.";
  } else if (phase === "rest") {
    message = tl.daysLeft === 1 ? "Test tomorrow. Light review, then rest." : "Test day. You've got this.";
  } else if (phase === "test_ready") {
    if (!startedSod.size) message = `${plural(tl.daysLeft, "day")} left. We'll spend them on timed mixed sets across the whole test.`;
    else if (behind) message = `${plural(tl.daysLeft, "day")} left. ${plural(behind, "skill")} never got started, so we'll sharpen what you know instead.`;
    else message = `${plural(tl.daysLeft, "day")} left. Timed sets now, so test pace feels normal.`;
  } else if (phase === "strengthen") {
    const w = weakest(skills, 1)[0];
    message = `All ${skills.length} skills started. Now we fix weak spots${w ? `: ${w.name} is lowest at ${pct(w.mastery)}` : ""}.`;
    if (missedTwo) message += " You've missed a couple of days; today's plan picks it back up.";
  } else {
    const left = unstartedSod.length;
    message = shortRunway
      ? `${plural(tl.daysLeft, "day")} isn't enough to start all ${plural(left, "skill")}, so we'll start the ones worth the most points first.`
      : behind
      ? `${plural(behind, "lesson")} behind. ${plural(left, "skill")} left to start by ${shortDate(tl.learnEnd)}, so today has a bit more.`
      : `On track: ${startedNow.length} of ${skills.length} skills started. ${plural(skills.length - startedNow.length, "skill")} to go by ${shortDate(tl.learnEnd)}.`;
    if (missedYesterday && !behind) message += " You missed yesterday, but you're still on pace.";
  }
  message += assumedNote;

  const weeks = phase === "after" ? [] : projectWeeks({ today, tl, skills, minutes, lastNewDay, startedSod, todayNew: tasks.filter((t) => t.kind === "lesson").map((t) => t.skill_id), shortRunway });

  return {
    date: today,
    exam_date: exam.date,
    exam_date_assumed: exam.assumed,
    days_left: tl.daysLeft,
    phase,
    status: { on_track: onTrack, behind_by_lessons: behind, missed_yesterday: missedYesterday, message },
    today_tasks_done: tasks.filter((t) => t.done).length,
    today: tasks,
    minutes_planned: round1(tasks.reduce((a, t) => a + t.minutes, 0)),
    daily_minutes: minutes,
    skills_started: startedNow.length,
    skills_total: skills.length,
    learn_by: tl.learnEnd,
    test_ready_from: addDays(exam.date, -(tl.tr + 1)),
    weeks,
  };
}

/**
 * The weeks ahead, assuming the learner follows the plan: a day-by-day
 * simulation grouped into blocks of up to 7 days that never cross a phase
 * boundary.
 */
export function projectWeeks({ today, tl, skills, minutes, lastNewDay, startedSod, todayNew, shortRunway }) {
  const exam = addDays(tl.start, tl.total);
  const started = new Set(startedSod);
  const attempts = new Map(skills.map((s) => [s.id, s.sod_attempts]));
  const attemptsOf = (id) => attempts.get(id) ?? Infinity;
  let last = lastNewDay;
  const days = [];
  const horizon = Math.min(tl.daysLeft, 800);
  for (let i = 0; i <= horizon; i++) {
    const day = addDays(today, i);
    const left = daysBetween(day, exam);
    const unstarted = skills.length - started.size;
    const phase = phaseOn(left, tl.tr, unstarted > 0);
    let newIds = [];
    if (phase === "learn") {
      if (i === 0) newIds = todayNew;
      else {
        const L = newLessonsOn({ day, unstarted, tl, minutes, lastNewDay: last });
        newIds = orderNewSkills(skills, started, attemptsOf, { byWeight: shortRunway }).slice(0, L).map((s) => s.id);
      }
    }
    for (const id of newIds) {
      started.add(id);
      attempts.set(id, Math.max(attemptsOf(id), LESSON_QUESTIONS));
    }
    if (newIds.length) last = day;
    days.push({ day, phase, newIds });
  }
  const weeks = [];
  for (const d of days) {
    const cur = weeks[weeks.length - 1];
    if (cur && cur.phase === d.phase && daysBetween(cur.start, d.day) < 7) {
      cur.end = d.day;
      cur.new.push(...d.newIds);
    } else weeks.push({ start: d.day, end: d.day, phase: d.phase, new: [...d.newIds] });
  }
  const weakList = [...skills].sort((a, b) => weakness(b) - weakness(a) || a.position - b.position);
  let strengthenIdx = 0;
  const nameOf = new Map(skills.map((s) => [s.id, s.name]));
  return weeks.map((w) => {
    let focus = [];
    let goal;
    if (w.phase === "learn") {
      focus = w.new;
      goal = focus.length
        ? `Start ${plural(focus.length, "new skill")}: ${focus.slice(0, 3).map((id) => nameOf.get(id)).join(", ")}${focus.length > 3 ? ", and more" : ""}.`
        : "Keep up with review and practice; the next new skill comes soon.";
    } else if (w.phase === "strengthen") {
      const k = 3;
      const n = weakList.length;
      focus = n ? Array.from({ length: Math.min(k, n) }, (_, j) => weakList[(strengthenIdx * k + j) % n].id) : [];
      strengthenIdx++;
      goal = focus.length ? `Raise ${focus.map((id) => nameOf.get(id)).join(", ")}, plus mixed sets.` : "Mixed sets and review.";
    } else if (w.phase === "test_ready") {
      focus = weakList.slice(0, 3).map((s) => s.id);
      goal = "Timed mixed sets at test pace, and a last pass on your weakest skills.";
    } else {
      goal = daysBetween(w.end, exam) === 0 ? "Rest, then the test." : "Rest.";
    }
    return { start: w.start, end: w.end, phase: w.phase, focus_skill_ids: focus, goal };
  });
}
