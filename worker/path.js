// The Learn path. Pure: takes the same learner state as the plan (plus which
// path circles were finished) and returns one ordered path, so it is unit
// tested directly (test/path.test.mjs) and recomputed on every GET /api/path.
//
// The path is the plan's order made visible: one unit per domain, the
// sections interleaved unit by unit (plan.js unitOrder), and in each unit its
// skills, a review circle after every three skills and a unit check at the
// end. One "end" circle after the last unit opens the plan's practice for
// the rest of the runway.
//
// Exactly one node is current: the first open one in path order, or, on a
// day with spaced reviews due, a "due" review circle placed right before it. A skill is
// done once it was tested out, mastered, or answered enough to open what
// depends on it (one lesson). Skills in units after the first unfinished unit
// stay locked even when their prerequisites are met, so the path is walked in
// order; the Practice tab can still drill any skill the engine has opened.
//
// Every word here comes from the exam pack (skill, domain and section names,
// voice.json's skill_about) or is exam-neutral.

import { UNLOCK_ATTEMPTS, LESSON_SIZE } from "./engine.js";
import { buildPlan, runwayContext, MINUTES, LESSON_QUESTIONS, midSentence } from "./plan.js";

export const REVIEW_EVERY = 3; // a review circle after every 3 skills (not at a unit's end)
export const REVIEW_QUESTIONS = 8;
export const CHECK_MIN = 8;
export const CHECK_MAX = 12;

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function practiceMinutes(list, pace, n) {
  const per = list.length
    ? list.reduce((a, s) => a + (pace[s.section_id]?.practice_minutes ?? MINUTES.practice), 0) / list.length
    : MINUTES.practice;
  return Math.max(1, Math.round(n * per));
}

/**
 * The path.
 * @param {object} o  everything buildPlan takes (routes/plan.js planInput), plus:
 * @param {string[]} [o.nodes_done]  ids of path circles with a finished session (lessons.node)
 * @param {{id:string, name:string, kind?:"numbers"|"words"}[]} [o.sections]  the exam's sections in order
 * @param {Object<string,number>} [o.reviews_due_by_skill]  due review items per skill
 * @param {Object<string,string>} [o.skill_about]  skill id → what it covers
 * @param {object} [o.stats]  {xp, streak, xp_today, reviews_due, month_days}
 */
export function buildPath(o) {
  const ctx = runwayContext(o);
  const plan = buildPlan(o);
  const { skills, units, pace } = ctx;
  const nodesDone = new Set(o.nodes_done || []);
  const dueBy = o.reviews_due_by_skill || {};
  const about = o.skill_about || {};
  const byId = new Map(skills.map((s) => [s.id, s]));
  const attemptsOf = (id) => byId.get(id)?.attempts ?? 0;
  const isDone = (s) => s.tested_out || !!s.mastered || s.attempts >= UNLOCK_ATTEMPTS;
  const engineOpen = (s) => s.prereqs.every((p) => attemptsOf(p) >= UNLOCK_ATTEMPTS);
  const sectionList = o.sections?.length ? o.sections : [];
  const sectionIndex = (id) => {
    const i = sectionList.findIndex((x) => x.id === id);
    return i >= 0 ? i : [...new Set(skills.map((s) => s.section_id))].indexOf(id);
  };
  // The kind of thinking a section asks for picks its colour (blue for numbers, teal for words).
  const sectionKind = (id) => (sectionList.find((x) => x.id === id)?.kind === "words" ? "words" : "numbers");
  const sectionName = (id) => sectionList.find((x) => x.id === id)?.name ?? skills.find((s) => s.section_id === id)?.section_name ?? "";

  // A review is passed once the learner learned (not tested out of) a later
  // skill in the same unit; work elsewhere (Practice, another unit) doesn't count.
  const unitOf = new Map(units.flatMap((u) => u.skills.map((s, i) => [s.id, { u, i }])));
  const learnedAfter = (s) => {
    const at = unitOf.get(s.id);
    return !!at && at.u.skills.slice(at.i + 1).some((x) => isDone(x) && !x.tested_out);
  };
  const frontier = units.findIndex((u) => u.skills.some((s) => !isDone(s)));
  const front = frontier < 0 ? units.length : frontier;

  const skillNode = (s, ui) => {
    const done = isDone(s);
    const engine = engineOpen(s);
    const state = done ? "done" : engine && ui <= front ? "open" : "locked";
    let locked_reason;
    if (state === "locked") {
      const first = s.prereqs.map((p) => byId.get(p)).find((p) => !p || p.attempts < UNLOCK_ATTEMPTS);
      locked_reason = !engine
        ? first ? `Opens after ${midSentence(first.name)}` : "Opens once every skill before it has questions"
        : `Opens when you finish ${units[ui - 1] ? midSentence(units[ui - 1].name) : "the unit above"}`;
    }
    const a = about[s.id];
    const lead = a ? `${a}.` : `A first lesson on ${midSentence(s.name)}.`;
    const why = s.tested_out && s.attempts <= UNLOCK_ATTEMPTS && !s.mastered
      ? `${lead} You tested out of it in the placement quiz.`
      : `${lead} ${LESSON_QUESTIONS} questions, about ${MINUTES.lesson} minutes.`;
    const id = `skill:${s.id}`;
    return {
      id, kind: "skill", state, title: s.name, official_name: s.official_name || s.name, why,
      skill_id: s.id, mastery: Math.round(s.mastery * 100), tested_out: !!s.tested_out,
      questions: LESSON_QUESTIONS, minutes: MINUTES.lesson,
      ...(locked_reason ? { locked_reason } : {}),
      start: state === "locked" ? null : { method: "POST", path: "/api/lessons", body: { skill_id: s.id, node: id } },
    };
  };

  // A review or unit-check circle over `covers`; `after` is the last skill above it.
  const circle = (kind, id, covers, after, unitName) => {
    const finished = covers.every(isDone);
    // A unit check is done only once taken (or every skill in it tested out),
    // so later work can't close it without it being started.
    const done = nodesDone.has(id) || covers.every((s) => s.tested_out) || (kind === "review" && finished && learnedAfter(after));
    const state = done ? "done" : finished ? "open" : "locked";
    const due = covers.reduce((a, s) => a + (dueBy[s.id] || 0), 0);
    const n = kind === "review" ? REVIEW_QUESTIONS : clamp(2 * covers.length, CHECK_MIN, CHECK_MAX);
    const minutes = practiceMinutes(covers, pace, n);
    const skill_ids = covers.map((s) => s.id);
    let title;
    let why;
    let locked_reason;
    if (kind === "review") {
      title = "Review";
      const mix = covers.length === 1 ? `the skill above` : `the ${covers.length} skills above`;
      why = due
        ? `${plural(due, "question")} you missed ${due === 1 ? "is" : "are"} due, then a mix of ${mix}.`
        : `A mix of ${mix}, so they stick.`;
      if (state === "locked") locked_reason = `Opens after ${midSentence([...covers].reverse().find((s) => !isDone(s)).name)}`;
    } else {
      title = "Unit check";
      why = `${n} questions across ${midSentence(unitName)}. Finish it to close the unit.`;
      const left = covers.filter((s) => !isDone(s)).length;
      if (state === "locked") locked_reason = left === 1 ? "Opens when you finish the lesson above" : `Opens when you finish the ${left} lessons above`;
    }
    const body = kind === "review"
      ? { mode: "review", skill_ids, n, node: id }
      : { mode: "mixed", skill_ids, n, node: id };
    return {
      id, kind, state, title, why, skill_ids, questions: n, minutes,
      ...(kind === "review" ? { due } : {}),
      ...(locked_reason ? { locked_reason } : {}),
      start: state === "locked" ? null : { method: "POST", path: "/api/practice", body },
    };
  };

  const outUnits = units.map((u, ui) => {
    const nodes = [];
    let block = [];
    let k = 0;
    u.skills.forEach((s, i) => {
      nodes.push(skillNode(s, ui));
      block.push(s);
      if (block.length === REVIEW_EVERY && i < u.skills.length - 1) {
        k++;
        nodes.push(circle("review", `review:${u.id}:${k}`, block, s, u.name));
        block = [];
      }
    });
    nodes.push(circle("check", `check:${u.id}`, u.skills, u.skills[u.skills.length - 1], u.name));
    return {
      id: u.id,
      name: u.name,
      official_name: u.official_name || u.name,
      section_id: u.section_id,
      section_name: sectionName(u.section_id),
      section_index: Math.max(0, sectionIndex(u.section_id)),
      section_kind: sectionKind(u.section_id),
      number: ui + 1,
      of: units.length,
      done: u.skills.filter(isDone).length,
      total: u.skills.length,
      nodes,
    };
  });

  // The end circle: the plan's practice once the path is walked.
  const all = outUnits.flatMap((u) => u.nodes);
  const task = plan.today.find((t) => !t.done && t.start && t.kind !== "lesson") ?? plan.today.find((t) => t.start && t.kind !== "lesson");
  const rest = plan.phase === "rest";
  // Any day but a rest day, the end circle always has something to start.
  const fallback = rest ? null : { method: "POST", path: "/api/practice", body: { mode: "weak", n: 10 } };
  const launch = task?.start ?? fallback;
  const restWhy = plan.today.find((t) => t.kind === "rest")?.why;
  const end = {
    id: "end",
    kind: "end",
    state: all.every((n) => n.state === "done") ? "open" : "locked",
    title: "Test-day practice",
    why: rest && restWhy ? restWhy : "Timed sets, mixed practice and your weak spots, once every unit is done.",
    task_title: task?.title ?? (rest ? null : "Weak spots"),
    start: launch ? { ...launch, body: { ...launch.body, node: "end" } } : null,
  };

  // Exactly one current circle: the first open one. A pack where nothing can
  // open (a broken prerequisite chain) still gets the end circle.
  const current = all.find((n) => n.state === "open") ?? end;
  if (current === end) end.state = "open";
  if (end.state === "locked") {
    end.locked_reason = "Opens when every unit is done";
    end.start = null;
  }
  current.state = "current";

  // Spaced review: on a day with missed questions due, a review circle right
  // before the current one (the old Today list's review task) takes the
  // glow. It goes away once the due questions are answered.
  const dueTotal = o.reviews_due_by_skill ? Object.values(dueBy).reduce((a, n) => a + n, 0) : o.reviews_due || 0;
  let currentId = current.id;
  if (dueTotal > 0 && plan.phase !== "rest" && outUnits.length) {
    const n = Math.min(dueTotal, LESSON_SIZE);
    const dueNode = {
      id: "due", kind: "review", state: "current", title: "Review",
      why: `${plural(dueTotal, "question")} you missed before ${dueTotal === 1 ? "is" : "are"} due today. Getting ${dueTotal === 1 ? "it" : "them"} right now is what makes ${dueTotal === 1 ? "it" : "them"} stick.`,
      skill_ids: Object.keys(dueBy).filter((k) => dueBy[k] > 0),
      due: dueTotal, questions: n, minutes: Math.max(1, Math.round(n * MINUTES.review)),
      start: { method: "POST", path: "/api/lessons", body: { skill_id: null, node: "due" } },
    };
    if (!dueNode.skill_ids.length) dueNode.skill_ids = [skills[0]?.id].filter(Boolean);
    const host = outUnits.find((u) => u.nodes.includes(current)) ?? outUnits[outUnits.length - 1];
    const at = host.nodes.indexOf(current);
    host.nodes.splice(at >= 0 ? at : host.nodes.length, 0, dueNode);
    current.state = "open";
    if (current === end && !end.start) end.state = "locked";
    currentId = "due";
  }

  const st = o.stats || {};
  return {
    date: plan.date,
    exam_date: plan.exam_date,
    exam_date_assumed: plan.exam_date_assumed,
    days_left: plan.days_left,
    phase: plan.phase,
    stats: { xp: st.xp ?? 0, streak: st.streak ?? 0, xp_today: st.xp_today ?? 0, reviews_due: st.reviews_due ?? o.reviews_due ?? 0, month_days: st.month_days ?? [] },
    current: currentId,
    units: outUnits,
    end,
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Whether a lesson or practice start may record `nodeId` as its path circle:
 * the circle exists, isn't locked, and the request is the one its start gives
 * (same endpoint, same fields, at least as many questions). The routes drop
 * the node otherwise, so a request can't claim a circle (or its XP bonus).
 * @param {object} path  buildPath's result
 * @param {string} nodeId
 * @param {"/api/lessons"|"/api/practice"} endpoint
 * @param {object} body  the parsed request body
 */
export function nodeAllowed(path, nodeId, endpoint, body) {
  const n = [...path.units.flatMap((u) => u.nodes), path.end].find((x) => x.id === nodeId);
  if (!n || n.state === "locked" || !n.start || n.start.path !== endpoint) return false;
  for (const [k, v] of Object.entries(n.start.body)) {
    if (k === "node") continue;
    if (k === "n") {
      if (!(Number(body.n) >= v)) return false;
    } else if (!same(body[k], v)) return false;
  }
  return true;
}
