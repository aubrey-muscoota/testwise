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
// Fallbacks when the exam pack has no plan.daily_minutes / default_daily_minutes.
export const DAILY_MINUTES_OPTIONS = [5, 10, 15, 20];
export const DEFAULT_DAILY_MINUTES = 10;
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

// A skill or unit name in the middle of a sentence: "You start at solving
// linear equations". Names are sentence case, so only the first letter drops,
// and not for an acronym ("SAT") or a word that keeps its capital (a name like
// "Pythagorean").
const KEEPS_CAPITAL = /^(?:[A-Z]{2,}|[A-Z][a-z]*(?:ean|ian)|English)\b/;
export const midSentence = (name) => (KEEPS_CAPITAL.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1));

/**
 * The path's units in order: one unit per domain, its skills by prerequisite
 * depth then position, so a unit's own prerequisites always come first. The
 * sections are interleaved unit by unit, picking the section with the lowest
 * share of its skills placed so far (ties go to the section that comes first
 * in the exam). A unit is ready once every prerequisite it has in another
 * domain is in a unit already placed; within a section the ready unit with the
 * most weight goes first. With `byWeight` (a runway too short to start
 * everything) it is the most weight per skill, so the points per lesson lead.
 * Skills come from prepareSkills. A pack with a cross-domain cycle still gets
 * an order: the unit with the fewest unmet prerequisites goes next.
 * @returns {{id:string, name:string, official_name:string, section_id:string, skills:object[]}[]}
 */
export function unitOrder(skills, { byWeight = false } = {}) {
  const domainOf = new Map(skills.map((s) => [s.id, s.domain_id]));
  const units = new Map();
  for (const s of skills) {
    if (!units.has(s.domain_id)) units.set(s.domain_id, { id: s.domain_id, name: s.domain_name || s.domain_id, official_name: s.domain_official_name || s.domain_name || s.domain_id, section_id: s.section_id, skills: [], weight: 0, position: s.position });
    const u = units.get(s.domain_id);
    u.skills.push(s);
    u.weight += s.weight;
    u.position = Math.min(u.position, s.position);
  }
  for (const u of units.values()) {
    u.skills.sort((a, b) => a.depth - b.depth || a.position - b.position);
    u.perSkill = u.weight / u.skills.length;
    u.needs = new Set(u.skills.flatMap((s) => s.prereqs).filter((p) => domainOf.has(p) && domainOf.get(p) !== u.id).map((p) => domainOf.get(p)));
  }
  const secPos = new Map();
  for (const s of [...skills].sort((a, b) => a.position - b.position)) if (!secPos.has(s.section_id)) secPos.set(s.section_id, secPos.size);
  const totalIn = new Map();
  for (const s of skills) totalIn.set(s.section_id, (totalIn.get(s.section_id) || 0) + 1);
  const placedIn = new Map();
  const placed = new Set();
  const left = new Set(units.values());
  const order = [];
  const unmet = (u) => [...u.needs].filter((d) => !placed.has(d)).length;
  const better = (a, b) => (byWeight ? b.perSkill - a.perSkill : b.weight - a.weight) || a.position - b.position;
  while (left.size) {
    let pool = [...left].filter((u) => unmet(u) === 0);
    if (!pool.length) {
      const least = Math.min(...[...left].map(unmet));
      pool = [...left].filter((u) => unmet(u) === least);
    }
    const share = (sec) => (placedIn.get(sec) || 0) / totalIn.get(sec);
    const sec = [...new Set(pool.map((u) => u.section_id))]
      .sort((a, b) => share(a) - share(b) || secPos.get(a) - secPos.get(b))[0];
    const u = pool.filter((x) => x.section_id === sec).sort(better)[0];
    left.delete(u);
    placed.add(u.id);
    placedIn.set(sec, (placedIn.get(sec) || 0) + u.skills.length);
    order.push(u);
  }
  return order.map(({ id, name, official_name, section_id, skills: list }) => ({ id, name, official_name, section_id, skills: list }));
}

/** Every skill in path order (the units of unitOrder, one after another). */
export const pathOrder = (skills, opts) => unitOrder(skills, opts).flatMap((u) => u.skills);

/**
 * The next new skills to start: the first `n` not yet started in path order
 * whose prerequisites are done, counting the ones picked before them as done
 * (one lesson is enough answers to open what depends on it), so a day can
 * chain a skill and the one it opens.
 */
export function pickNewSkills(order, startedIds, attemptsOf, n) {
  const picked = [];
  const chosen = new Set();
  const att = (id) => (chosen.has(id) ? Math.max(attemptsOf(id), LESSON_QUESTIONS) : attemptsOf(id));
  for (const s of order) {
    if (picked.length >= n) break;
    if (startedIds.has(s.id) || !unlockedBy(s, att)) continue;
    picked.push(s);
    chosen.add(s.id);
  }
  return picked;
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

/**
 * A stored daily time as one of today's options: the largest option at or
 * below it, else the smallest. Learners who chose 30 or 45 before the options
 * became 5, 10, 15 and 20 get 20; their row keeps the old value, so an older
 * Worker still reads it. null stays null (no profile yet).
 */
export function normalizeMinutes(m, options) {
  if (typeof m !== "number" || !Number.isFinite(m)) return null;
  const opts = [...(options?.length ? options : DAILY_MINUTES_OPTIONS)].sort((a, b) => a - b);
  const below = opts.filter((x) => x <= m);
  return below.length ? below[below.length - 1] : opts[0];
}

/** The daily-time options and default from the exam pack (falling back to plan.js). */
export function minutesOptions(exam) {
  const options = Array.isArray(exam?.plan?.daily_minutes) && exam.plan.daily_minutes.length ? exam.plan.daily_minutes : DAILY_MINUTES_OPTIONS;
  const dflt = options.includes(exam?.plan?.default_daily_minutes) ? exam.plan.default_daily_minutes : (options.includes(DEFAULT_DAILY_MINUTES) ? DEFAULT_DAILY_MINUTES : options[0]);
  return { options, default: dflt };
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
 * What the plan and the path both start from: the day, the daily time, the
 * runway to the test, the skills as of the start of today, new-skill pacing,
 * and the path order. The order uses the runway as it was when the plan
 * started (too short to start every skill means the heaviest units go first),
 * so it doesn't reshuffle as a learner falls behind; the "isn't enough to
 * start all N skills" message still looks at today (`shortRunway`).
 */
export function runwayContext(o) {
  const today = o.today;
  const minutes = normalizeMinutes(o.daily_minutes, o.minutes_options) ?? o.default_minutes ?? DEFAULT_DAILY_MINUTES;
  const pace = o.pace || {};
  const planStart = o.plan_started_at && daysBetween(o.plan_started_at, today) >= 0 ? o.plan_started_at : today;
  const exam = effectiveExamDate({ exam_date: o.exam_date, plan_started_at: planStart, today });
  const tl = timeline({ today, exam: exam.date, planStart });
  const skills = prepareSkills(o.skills || []);
  const startedSod = new Set(skills.filter((s) => s.started_sod).map((s) => s.id));
  const unstartedSod = skills.filter((s) => !s.started_sod);
  const lastNewDay = skills
    .filter((s) => s.started_sod && !s.tested_out && s.first_day && s.first_day < today)
    .map((s) => s.first_day).sort().pop() || null;
  const shortRunway = unstartedSod.length > lessonCap(minutes, tl.daysLeft) * Math.max(1, daysBetween(today, tl.lastPrep) + 1);
  const atStart = timeline({ today: planStart, exam: exam.date, planStart });
  const orderByWeight = skills.length > lessonCap(minutes, atStart.daysLeft) * Math.max(1, daysBetween(planStart, atStart.lastPrep) + 1);
  const units = unitOrder(skills, { byWeight: orderByWeight });
  const order = units.flatMap((u) => u.skills);
  return { today, minutes, pace, planStart, exam, tl, skills, startedSod, unstartedSod, lastNewDay, shortRunway, orderByWeight, units, order };
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
 * @param {Object<string,string>} [o.skill_about] skill id → what it covers (from the exam's voice.json)
 */
export function buildPlan(o) {
  const { today, minutes, pace, planStart, exam, tl, skills, startedSod, unstartedSod, lastNewDay, shortRunway, order } = runwayContext(o);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const lessonsToday = o.lessons_today || [];
  const done = lessonsToday.filter((l) => l.completed);
  const active = new Set(o.active_days || []);
  const phase = phaseOn(tl.daysLeft, tl.tr, unstartedSod.length > 0);
  const sodAttempts = (id) => byId.get(id)?.sod_attempts ?? Infinity;

  // Behind: the even pace line from plan start (as of the start of today) vs
  // skills started so far, today's lessons included, so every lesson done
  // today closes the gap at once.
  const learnLen = Math.max(1, daysBetween(planStart, tl.learnEnd) + 1);
  const elapsed = Math.max(0, daysBetween(planStart, today));
  const expected = Math.floor(skills.length * Math.min(1, elapsed / learnLen));
  const startedCount = skills.filter((s) => s.started).length;
  let behind = 0;
  if (phase === "learn") behind = Math.max(0, expected - startedCount);
  else if (phase === "test_ready" || phase === "rest") behind = skills.length - startedCount;
  const tasks = [];
  let plannedNew = 0; // new-skill lessons today's plan asks for
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
  // A review lesson, or a review circle on the path (practice in mode "review").
  const reviewLessonsDone = done.filter((l) => (l.kind !== "practice" && l.kind !== "placement" && !l.skill_id) || (l.kind === "practice" && l.mode === "review")).length;
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
    // What the skill covers, in plain words (the row's title and ring already say whether it's started).
    const about = o.skill_about?.[s.id];
    const why = about ? `${about}. ${LESSON_QUESTIONS} questions.` : `A first lesson on ${midSentence(s.name)}.`;
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
  // A set is 3 to 30 questions, sized to the time left (3, not more, so a
  // 5-minute day isn't pushed past its time by a set's minimum).
  const nFor = (mins, per) => Math.max(3, Math.min(30, Math.round(mins / per)));
  // At least 5 reviews when there's room; a 5-minute day keeps room for a short set.
  const reviewFloor = Math.min(5, Math.floor((0.4 * minutes) / MINUTES.review));

  // New-skill lessons done today are always shown, done.
  const newDoneToday = [...new Set(done.filter((l) => l.kind === "skill" && l.skill_id && !startedSod.has(l.skill_id)).map((l) => l.skill_id))]
    .filter((id) => byId.has(id));

  if (phase === "learn") {
    let L = newLessonsOn({ day: today, unstarted: unstartedSod.length, tl, minutes, lastNewDay });
    if (!startedSod.size) L =Math.max(L, Math.min(lessonCap(minutes, tl.daysLeft), Math.floor(minutes / MINUTES.lesson)));
    plannedNew = L;
    for (const id of newDoneToday) add(lessonTask(byId.get(id), true));
    // The next skills on the path, as of the start of today.
    const left = Math.max(0, L - newDoneToday.length);
    const notYet = new Set([...startedSod, ...newDoneToday]);
    const att = (id) => (newDoneToday.includes(id) ? Math.max(sodAttempts(id), LESSON_QUESTIONS) : sodAttempts(id));
    for (const s of pickNewSkills(order, notYet, att, left)) add(lessonTask(s, false));
    addReview(tl.daysLeft > LONG_RUNWAY_DAYS ? 16 : Math.max(reviewFloor, Math.floor((0.3 * minutes) / MINUTES.review)));
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
            ? `Mixed from the ${plural(startedNow.length, "skill")} you've started.`
            : "Today's new skills, mixed together.",
        }));
      }
    }
  } else if (phase === "strengthen") {
    for (const id of newDoneToday) add(lessonTask(byId.get(id), true));
    addReview(Math.max(reviewFloor, Math.floor((0.3 * minutes) / MINUTES.review)));
    const weak = weakest(skills, minutes >= 20 ? 4 : 3);
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
          why: "Skills in any order, the way the test mixes them.",
        }));
      }
    }
  } else if (phase === "test_ready") {
    addReview(Math.max(3, Math.floor((0.15 * minutes) / MINUTES.review)));
    const pool = startedNow.length ? startedNow : skills;
    const secs = timedSecondsPer(pool, pace);
    const timedN = (share) => Math.max(3, Math.min(30, Math.round((budget * share) / (secs / 60))));
    // Three quarters of the time, unless what's left is too short for a second set.
    const n = budget - timedN(0.75) * (secs / 60) < 3 ? timedN(1) : timedN(0.75);
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
  // A finished lesson today puts a learner who missed two days back on pace.
  const activeToday = done.length > 0 || active.has(today);
  const onTrack = behind === 0 && !(missedTwo && !activeToday);
  // Ahead: lessons (not skills tested out by placement) past the even pace
  // line by tonight, rounded up so that doing exactly today's plan reads as on
  // track, and never more than the learner was ahead this morning plus new
  // skills started today beyond today's plan. Learn phase only, and not on a
  // short runway, where the plan can't start every skill anyway.
  let ahead = 0;
  if (phase === "learn" && !behind && !shortRunway) {
    const learned = (sod) => skills.filter((s) => !s.tested_out && (sod ? s.sod_attempts > 0 : s.attempts > 0)).length;
    const needed = skills.filter((s) => !s.tested_out).length;
    const paceBy = (days) => Math.ceil(needed * Math.min(1, days / learnLen));
    const learnedNow = learned(false);
    const learnedSod = learned(true);
    const aheadSod = Math.max(0, learnedSod - paceBy(elapsed));
    const extraToday = Math.max(0, learnedNow - learnedSod - plannedNew);
    ahead = Math.max(0, Math.min(learnedNow - paceBy(elapsed + 1), aheadSod + extraToday));
  }
  // The weeks ahead, and from them the one date every skill is started by, so
  // Today, the plan header and the weekly list never disagree.
  const weeks = phase === "after" ? [] : projectWeeks({ today, tl, skills, minutes, lastNewDay, startedSod, todayNew: tasks.filter((t) => t.kind === "lesson").map((t) => t.skill_id), order });
  const learnWeeks = weeks.filter((w) => w.phase === "learn");
  const learnBy = learnWeeks.length ? learnWeeks[learnWeeks.length - 1].end : tl.learnEnd;
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
    if (missedTwo && !activeToday) message += " You've missed a couple of days; today's plan picks it back up.";
  } else {
    const left = skills.length - startedCount;
    message = shortRunway
      ? `${plural(tl.daysLeft, "day")} isn't enough to start all ${plural(left, "skill")}, so we'll start the ones worth the most points first.`
      : behind
      ? `${plural(behind, "lesson")} behind. ${plural(left, "skill")} left to start by ${shortDate(learnBy)}, so today has a bit more.`
      : `You've started ${startedNow.length} of ${skills.length} skills. ${skills.length - startedNow.length} to go by ${shortDate(learnBy)}.`;
    if (missedYesterday && !behind) message += " You missed yesterday, but you're still on pace.";
  }
  message += assumedNote;

  return {
    date: today,
    exam_date: exam.date,
    exam_date_assumed: exam.assumed,
    days_left: tl.daysLeft,
    phase,
    status: {
      on_track: onTrack,
      behind_by_lessons: behind,
      ahead_by_lessons: ahead,
      short_runway: phase === "learn" && shortRunway,
      missed_yesterday: missedYesterday,
      message,
    },
    today_tasks_done: tasks.filter((t) => t.done).length,
    today: tasks,
    minutes_planned: round1(tasks.reduce((a, t) => a + t.minutes, 0)),
    daily_minutes: minutes,
    skills_started: startedNow.length,
    skills_total: skills.length,
    learn_by: learnBy,
    test_ready_from: addDays(exam.date, -(tl.tr + 1)),
    weeks,
  };
}

/**
 * The weeks ahead, assuming the learner follows the plan: a day-by-day
 * simulation grouped into blocks of up to 7 days that never cross a phase
 * boundary.
 */
export function projectWeeks({ today, tl, skills, minutes, lastNewDay, startedSod, todayNew, order }) {
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
        newIds = pickNewSkills(order, started, attemptsOf, L).map((s) => s.id);
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
  // Each week names its skills (focus_names, one per line in the app) or, when
  // it has none to name, says what it is for in `goal`. No template sentences:
  // the phase heading says the verb once.
  return weeks.map((w) => {
    let focus = [];
    let named = true;
    let goal = null;
    if (w.phase === "learn") {
      focus = w.new;
      if (!focus.length) goal = "Review and practice";
    } else if (w.phase === "strengthen") {
      const k = 3;
      const n = weakList.length;
      focus = n ? Array.from({ length: Math.min(k, n) }, (_, j) => weakList[(strengthenIdx * k + j) % n].id) : [];
      strengthenIdx++;
      if (!focus.length) goal = "Review and practice";
    } else if (w.phase === "test_ready") {
      focus = weakList.slice(0, 3).map((s) => s.id);
      named = false;
      goal = "Timed sets at test pace";
    } else {
      named = false;
      goal = daysBetween(w.end, exam) === 0 ? "Rest, then the test" : "Rest";
    }
    const focus_names = named ? focus.map((id) => nameOf.get(id)) : [];
    return { start: w.start, end: w.end, phase: w.phase, focus_skill_ids: focus, focus_names, goal };
  });
}
