// Route-level checks against an in-memory D1 (test/d1-shim.mjs), with a
// made-up exam so nothing here depends on SAT content, and a fake Claude.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeD1 } from "./d1-shim.mjs";
import { startPractice, practiceSummary } from "../worker/routes/practice.js";
import { planRoute, setProfile } from "../worker/routes/plan.js";
import { deleteLearner, exportLearner } from "../worker/routes/learners.js";
import { answer } from "../worker/routes/answers.js";
import { report } from "../worker/routes/reports.js";
import { finishLesson } from "../worker/routes/lessons.js";
import { stats } from "../worker/lib/http.js";

const L = "learner0000000001";
function setup(envExtra = {}) {
  const DB = makeD1();
  const q = (sql, ...a) => DB.raw.prepare(sql).run(...a);
  // Migration 0004 creates the SAT exam row; this test uses its own exam only.
  q("DELETE FROM sections WHERE exam_id = 'sat'");
  q("DELETE FROM exams WHERE id = 'sat'");
  q("INSERT INTO exams (id, name, config) VALUES ('tx', 'Test Exam', ?)", JSON.stringify({
    name: "Test Exam", default_section: "tx-q",
    sections: [{ id: "tx-q", name: "Quant", seconds_per_question: 80, practice_minutes_per_question: 1 }],
    placement: {}, plan: {},
  }));
  q("INSERT INTO sections (id, exam_id, name, position) VALUES ('tx-q', 'tx', 'Quant', 0)");
  q("INSERT INTO domains (id, exam_id, section_id, name, position) VALUES ('tx-d', 'tx', 'tx-q', 'Numbers', 0)");
  q("INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES ('tx-add', 'tx', 'tx-d', 'Adding', 0, '[]')");
  q("INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES ('tx-mul', 'tx', 'tx-d', 'Multiplying', 1, '[\"tx-add\"]')");
  for (const [skill, n] of [["tx-add", 12], ["tx-mul", 12]]) {
    for (let i = 0; i < n; i++) {
      const a = i + 2;
      q(`INSERT INTO items (id, skill_id, difficulty, type, stem, choices, answer, explanation, hints, wrong_reasons, rating, status)
         VALUES (?, ?, ?, 'mc', ?, ?, ?, '["a","b"]', '["h1","h2"]', ?, 0, 'live')`,
        `${skill}-${i}`, skill, 1 + (i % 3), `What is ${a} + 1?`, JSON.stringify([`${a - 1}`, `${a}`, `${a + 1}`, `${a + 2}`]), `${a + 1}`,
        JSON.stringify({ [a - 1]: "x", [a]: "y", [a + 2]: "z" }));
    }
  }
  q("INSERT INTO learners (id, created_at, age_confirmed_at) VALUES (?, 0, 0)", L);
  return { DB, DEFAULT_EXAM: "tx", ...envExtra };
}
const req = (path = "/api/x") => new Request("http://local" + path, { headers: { "x-tz-offset": "0" } });
const body = async (res) => ({ ...(await res.json()), http: res.status });

const rawMc = (k) => ({
  type: "mc", passage: null, passage2: null, stem: `Fresh question ${k}: what is ${k} + ${k}?`, table: null,
  choices: [`${k}`, `${2 * k}`, `${2 * k + 1}`, `${k * k + 7}`], answer: `${2 * k}`, accept: [],
  explanation: ["Add the numbers.", `So it is ${2 * k}.`], hints: ["What does + mean?", "Count up?"],
  wrong_reasons: [{ choice: `${k}`, reason: "Took one." }, { choice: `${2 * k + 1}`, reason: "Off by one." }, { choice: `${k * k + 7}`, reason: "Squared." }],
});
function fakeClient() {
  let call = 0;
  return {
    messages: {
      async create(params) {
        call++;
        const writer = call % 2 === 1;
        const text = writer
          ? JSON.stringify({ items: [rawMc(3), rawMc(4), { ...rawMc(5), answer: "nope" }] })
          : JSON.stringify({ answers: [{ number: 1, answer: "B" }, { number: 2, answer: "A" }] });
        return { stop_reason: "end_turn", model: params.model, content: [{ type: "text", text }] };
      },
    },
  };
}

test("fresh mode: generated questions are stored, served first, and work with answers and reports", async () => {
  const env = setup({ GENERATOR_CLIENT: fakeClient(), GENERATOR_MODEL: "configured" });
  const r = await body(await startPractice(env, req(), L, { mode: "fresh", skill_id: "tx-add", n: 5 }, null));
  assert.equal(r.http, 200);
  assert.equal(r.fresh, true);
  assert.equal(r.generated, 1, "one passed shape and agreement (one bad key, one solver disagreement)");
  assert.match(r.note, /I just wrote 1 new question on Adding/);
  assert.equal(r.items.length, 5);
  assert.match(r.items[0].id, /^gen-tx-add-/);
  assert.equal(r.items[0].source, "generated");
  assert.ok(r.items.slice(1).every((i) => i.source === "bank"));
  const gen = env.DB.raw.prepare("SELECT * FROM generated_items").all();
  assert.equal(gen.length, 1);
  assert.equal(gen[0].learner_id, L);
  assert.equal(gen[0].model, "configured");
  assert.equal(gen[0].served_count, 1);
  const row = env.DB.raw.prepare("SELECT status, source FROM items WHERE id = ?").get(r.items[0].id);
  assert.deepEqual({ ...row }, { status: "generated", source: "generated" });
  // Answering works (attempts reference items) and moves ratings like any item.
  const a = await body(await answer(env, req(), L, { lesson_id: r.lesson_id, item_id: r.items[0].id, response: "6" }));
  assert.equal(a.correct, true);
  // One report pulls a generated question.
  await report(env, L, { item_id: r.items[0].id, note: "wrong" });
  assert.equal(env.DB.raw.prepare("SELECT status FROM items WHERE id = ?").get(r.items[0].id).status, "pulled");
  // Summary sees it.
  const s = await body(await practiceSummary(env, req(), L));
  assert.equal(s.fresh.generated_today, 1);
  assert.equal(s.fresh.available, true);
  // Deleting the learner keeps the question but drops the link.
  await deleteLearner(env, L);
  assert.equal(env.DB.raw.prepare("SELECT learner_id FROM generated_items").get().learner_id, null);
});

test("fresh mode falls back to the bank offline, at the cap, and when nothing passes", async () => {
  const offline = setup();
  const r = await body(await startPractice(offline, req(), L, { mode: "fresh", skill_id: "tx-add" }, null));
  assert.equal(r.fresh, false);
  assert.equal(r.generated, 0);
  assert.match(r.note, /^I can't write new ones right now, so these are from the bank\./);
  assert.equal(r.items.length, 5);

  const capped = setup({ GENERATOR_CLIENT: fakeClient(), GENERATOR_MODEL: "m", GENERATOR_DAILY_CAP: "0" });
  const c = await body(await startPractice(capped, req(), L, { mode: "fresh", skill_id: "tx-add" }, null));
  assert.equal(c.fresh, false);
  assert.match(c.note, /all the new ones I can write today/);

  const failing = setup({ GENERATOR_CLIENT: { messages: { create: async () => { throw new Error("down"); } } }, GENERATOR_MODEL: "m" });
  const f = await body(await startPractice(failing, req(), L, { mode: "fresh", skill_id: "tx-add" }, null));
  assert.equal(f.fresh, false);
  assert.match(f.note, /couldn't write new ones/);

  // Per-learner cap: 20 a day.
  const many = setup({ GENERATOR_CLIENT: fakeClient(), GENERATOR_MODEL: "m" });
  const day = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 20; i++) {
    many.DB.raw.prepare("INSERT INTO items (id, skill_id, difficulty, type, stem, answer, explanation, hints, rating, status, source) VALUES (?, 'tx-add', 1, 'mc', 's', 'a', '[]', '[]', 0, 'generated', 'generated')").run(`gen-x-${i}`);
    many.DB.raw.prepare("INSERT INTO generated_items (id, skill_id, difficulty, learner_id, created_at, created_day, learner_day) VALUES (?, 'tx-add', 1, ?, 0, ?, ?)").run(`gen-x-${i}`, L, day, day);
  }
  const m = await body(await startPractice(many, req(), L, { mode: "fresh", skill_id: "tx-mul" }, null));
  assert.equal(m.http, 403, "tx-mul is still locked");
  const m2 = await body(await startPractice(many, req(), L, { mode: "fresh", skill_id: "tx-add" }, null));
  assert.equal(m2.fresh, false);
});

test("generated items survive the seed's retire step", () => {
  const env = setup();
  env.DB.raw.prepare("INSERT INTO items (id, skill_id, difficulty, type, stem, answer, explanation, hints, rating, status, source) VALUES ('gen-tx-add-1', 'tx-add', 1, 'mc', 's', 'a', '[]', '[]', 0, 'generated', 'generated')").run();
  env.DB.raw.prepare("UPDATE items SET status = 'retired' WHERE id NOT IN ('tx-add-0')").run();
  assert.equal(env.DB.raw.prepare("SELECT status FROM items WHERE id = 'gen-tx-add-1'").get().status, "generated");
  assert.equal(env.DB.raw.prepare("SELECT status FROM items WHERE id = 'tx-add-1'").get().status, "retired");
});

test("a background top-up is queued when a skill's unseen bank drops under 10%", async () => {
  const env = setup({ GENERATOR_CLIENT: fakeClient(), GENERATOR_MODEL: "m" });
  const now = Date.now();
  for (let i = 0; i < 11; i++) {
    env.DB.raw.prepare("INSERT INTO attempts (learner_id, item_id, skill_id, correct, answered_at, local_day) VALUES (?, ?, 'tx-add', 1, ?, '2026-01-01')").run(L, `tx-add-${i}`, now - i);
  }
  env.DB.raw.prepare("INSERT INTO skill_mastery (learner_id, skill_id, rating, attempts, correct, updated_at) VALUES (?, 'tx-add', 0.5, 11, 11, 0)").run(L);
  const waits = [];
  const r = await body(await startPractice(env, req(), L, { mode: "skill", skill_id: "tx-add", n: 5 }, { waitUntil: (p) => waits.push(p) }));
  assert.equal(r.items.length, 5);
  assert.equal(waits.length, 1);
  const g = await waits[0];
  assert.equal(g.ids.length, 1);
});

test("the plan works for an exam with no weights or pacing on file", async () => {
  const env = setup();
  const day = new Date().toISOString().slice(0, 10);
  const later = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await setProfile(env, req(), L, { exam_date: later, daily_minutes: 10 });
  const p = await body(await planRoute(env, req(), L));
  assert.equal(p.http, 200);
  assert.equal(p.date, day);
  assert.equal(p.days_left, 40);
  assert.equal(p.skills_total, 2);
  assert.equal(p.phase, "learn");
  assert.equal(p.today[0].skill_id, "tx-add");
  const t = await body(await startPractice(env, req(), L, { mode: "timed", n: 4 }, null));
  assert.equal(t.time_limit_seconds, 4 * 80, "generic pace without exam data");
});

test("a timed set that ends with nothing answered earns nothing and isn't a finished lesson", async () => {
  const env = setup();
  const t = await body(await startPractice(env, req(), L, { mode: "timed", n: 5 }, null));
  assert.ok(t.time_limit_seconds > 0);
  const f = await body(await finishLesson(env, req(), L, { lesson_id: t.lesson_id }));
  assert.equal(f.xp, 0);
  assert.equal(f.total, 0);
  assert.equal(f.stats.xp, 0);
  assert.equal(f.stats.lessons_today, 0);
  assert.equal(f.stats.streak, 0);
  assert.deepEqual(f.stats.recent_days, []);
  assert.equal(env.DB.raw.prepare("SELECT completed_at FROM lessons WHERE id = ?").get(t.lesson_id).completed_at, null);

  // One answer is enough to count.
  const t2 = await body(await startPractice(env, req(), L, { mode: "timed", n: 5 }, null));
  await answer(env, req(), L, { lesson_id: t2.lesson_id, item_id: t2.items[0].id, response: t2.items[0].answer, time_ms: 9000 });
  const f2 = await body(await finishLesson(env, req(), L, { lesson_id: t2.lesson_id }));
  assert.ok(f2.xp > 0);
  assert.equal(f2.stats.lessons_today, 1);
  assert.deepEqual(f2.stats.recent_days, [new Date().toISOString().slice(0, 10)]);
});

test("the placement quiz keeps the streak but isn't the day's first lesson", async () => {
  const env = setup();
  const day = new Date().toISOString().slice(0, 10);
  env.DB.raw.prepare("INSERT INTO lessons (id, learner_id, skill_id, started_at, completed_at, correct, total, xp, local_day, kind) VALUES ('pl1', ?, NULL, 0, 1, 3, 4, 0, ?, 'placement')").run(L, day);
  const p = await body(await startPractice(env, req(), L, { mode: "mixed", n: 2 }, null));
  for (const it of p.items) await answer(env, req(), L, { lesson_id: p.lesson_id, item_id: it.id, response: it.answer, time_ms: 1000 });
  const f = await body(await finishLesson(env, req(), L, { lesson_id: p.lesson_id }));
  assert.equal(f.stats.lessons_today, 2);
  assert.equal(f.stats.lessons_today_no_placement, 1);
  assert.equal(f.stats.streak, 1);
});

test("month_days lists this month's lesson days for the calendar, and nothing from other months or unfinished lessons", async () => {
  const env = setup();
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const ins = env.DB.raw.prepare("INSERT INTO lessons (id, learner_id, skill_id, started_at, completed_at, correct, total, xp, local_day, kind) VALUES (?, ?, NULL, 0, ?, 1, 1, 10, ?, 'practice')");
  ins.run("m1", L, 1, `${month}-01`);
  ins.run("m2", L, 1, `${month}-01`);
  ins.run("m3", L, null, day); // started, never finished
  const prev = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 2, 15)).toISOString().slice(0, 10);
  ins.run("m4", L, 1, prev);
  const st = await stats(env, L, day);
  assert.deepEqual(st.month_days, [`${month}-01`]);
});

test("the data export holds every table the learner appears in, and nothing after a delete", async () => {
  const env = setup();
  const l = await body(await startPractice(env, req(), L, { mode: "mixed", n: 4 }, null));
  for (const it of l.items) await answer(env, req(), L, { lesson_id: l.lesson_id, item_id: it.id, response: it.answer, time_ms: 1000 });
  await finishLesson(env, req(), L, { lesson_id: l.lesson_id });
  await setProfile(env, req(), L, { daily_minutes: 15 });
  // A time stored before today's options stays as it was in the export.
  env.DB.raw.prepare("UPDATE learners SET daily_minutes = 45 WHERE id = ?").run(L);
  const ex = await body(await exportLearner(env, L));
  assert.equal(ex.http, 200);
  assert.equal(ex.learner.id, L);
  assert.equal(ex.learner.daily_minutes, 45);
  assert.equal(ex.attempts.length, 4);
  assert.ok(ex.attempts.every((a) => a.item_id && a.skill_id && typeof a.correct === "number"));
  assert.equal(ex.lessons.length, 1);
  assert.equal(ex.lessons[0].id, l.lesson_id);
  assert.ok(ex.skills.length >= 1);
  assert.ok(Array.isArray(ex.reviews) && Array.isArray(ex.tutor_turns) && Array.isArray(ex.generated_items));
  // Nothing in it names a model.
  assert.ok(!JSON.stringify(ex).includes("claude-"));
  await deleteLearner(env, L);
  assert.equal((await body(await exportLearner(env, L))).http, 401);
});

// ─── The Learn path ─────────────────────────────────────────────────────────
import { pathRoute } from "../worker/routes/path.js";
import { startLesson } from "../worker/routes/lessons.js";
import { PathResponse } from "../worker/schemas.js";

async function finishWith(env, start, right = true) {
  const l = await body(start.path === "/api/lessons"
    ? await startLesson(env, req(), L, start.body.skill_id ?? null, start.body.node ?? null)
    : await startPractice(env, req(), L, start.body, null));
  assert.equal(l.http, 200, JSON.stringify(l));
  for (const it of l.items) await answer(env, req(), L, { lesson_id: l.lesson_id, item_id: it.id, response: right ? it.answer : "nope", time_ms: 1000 });
  return { lesson: l, finish: await body(await finishLesson(env, req(), L, { lesson_id: l.lesson_id })) };
}

test("path: one unit; finish the current circle and the next one opens, then the check pays a bonus once", async () => {
  const env = setup();
  let p = await body(await pathRoute(env, req("/api/path"), L));
  assert.equal(p.http, 200);
  assert.ok(PathResponse.safeParse(p).success);
  assert.equal(p.units.length, 1);
  assert.equal(p.units[0].name, "Numbers");
  assert.equal(p.units[0].section_name, "Quant");
  assert.deepEqual(p.units[0].nodes.map((n) => n.id), ["skill:tx-add", "skill:tx-mul", "check:tx-d"]);
  assert.equal(p.current, "skill:tx-add");
  assert.equal(p.stats.xp, 0);

  await finishWith(env, p.units[0].nodes[0].start);
  assert.equal(env.DB.raw.prepare("SELECT node FROM lessons WHERE skill_id = 'tx-add'").get().node, "skill:tx-add");
  p = await body(await pathRoute(env, req("/api/path"), L));
  assert.equal(p.units[0].nodes[0].state, "done");
  assert.equal(p.current, "skill:tx-mul");
  assert.ok(p.stats.xp > 0);

  await finishWith(env, p.units[0].nodes[1].start);
  p = await body(await pathRoute(env, req("/api/path"), L));
  assert.equal(p.current, "check:tx-d");
  const check = p.units[0].nodes[2];
  assert.equal(check.start.body.mode, "mixed");
  const one = await finishWith(env, check.start);
  assert.equal(one.finish.xp, one.finish.correct * 10 + 15 + 20, "unit check bonus");
  p = await body(await pathRoute(env, req("/api/path"), L));
  assert.equal(p.units[0].nodes[2].state, "done");
  assert.equal(p.current, "end");
  const again = await finishWith(env, check.start);
  assert.equal(again.finish.xp, again.finish.correct * 10 + 15, "the bonus is paid once");
  // The export carries the node, and the end circle starts something.
  const ex = await body(await exportLearner(env, L));
  assert.ok(ex.lessons.some((l) => l.node === "check:tx-d"));
  assert.ok(p.end.start);
  await finishWith(env, p.end.start);
});

test("practice mode review serves a due miss first and counts as the plan's review", async () => {
  const env = setup();
  const day = new Date().toISOString().slice(0, 10);
  const later = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
  await setProfile(env, req(), L, { exam_date: later, daily_minutes: 20 });
  // Learn tx-add, missing everything, then make one miss due now.
  const { lesson } = await finishWith(env, { path: "/api/lessons", body: { skill_id: "tx-add" } }, false);
  const missed = lesson.items[3].id;
  env.DB.raw.prepare("UPDATE reviews SET due_at = 0 WHERE learner_id = ? AND item_id = ?").run(L, missed);
  env.DB.raw.prepare("UPDATE reviews SET due_at = ? WHERE learner_id = ? AND item_id != ?").run(Date.now() + 86_400_000, L, missed);
  const r = await body(await startPractice(env, req(), L, { mode: "review", skill_ids: ["tx-add"], n: 6, node: "review:tx-d:1" }, null));
  assert.equal(r.http, 200);
  assert.equal(r.items.length, 6);
  assert.equal(r.items[0].id, missed);
  assert.equal(r.items[0].review, true);
  assert.ok(r.items.slice(1).every((i) => !i.review && i.id !== missed));
  assert.equal(env.DB.raw.prepare("SELECT node, mode FROM lessons WHERE id = ?").get(r.lesson_id).node, "review:tx-d:1");
  for (const it of r.items) await answer(env, req(), L, { lesson_id: r.lesson_id, item_id: it.id, response: it.answer, time_ms: 1000 });
  await finishLesson(env, req(), L, { lesson_id: r.lesson_id });
  const p = await body(await planRoute(env, req(), L));
  const review = p.today.find((t) => t.kind === "review");
  assert.ok(review?.done, JSON.stringify(p.today.map((t) => [t.id, t.done])));
  assert.equal(p.date, day);
});

// ─── Setup: the test picker, test dates, a learner made with a profile ──────
import worker from "../worker/index.js";
import { profileRoute } from "../worker/routes/plan.js";
import { upcomingTestDates, _clearExamCache } from "../worker/lib/exam.js";
import { startPlacement } from "../worker/routes/lessons.js";
import { mock } from "node:test";

const TX_DATES = {
  source: "https://example.org/dates", checked: "2026-11-12",
  dates: [{ date: "2026-12-05", register_by: "2026-11-20" }, { date: "2027-03-06", register_by: "2027-02-19" }, { date: "2027-08-28", anticipated: true }, { date: "2029-01-06" }],
};
// The test exam with two sections (numbers, words), test dates, and two stubs.
function setupCatalog() {
  const env = setup();
  const q = (sql, ...a) => env.DB.raw.prepare(sql).run(...a);
  q("UPDATE exams SET short_name = 'TX', position = 0, config = ? WHERE id = 'tx'", JSON.stringify({
    name: "Test Exam", short_name: "TX", default_section: "tx-q",
    sections: [{ id: "tx-q", name: "Quant", kind: "numbers", seconds_per_question: 80 }, { id: "tx-v", name: "Verbal", kind: "words", seconds_per_question: 60 }],
    score: { min: 0, max: 60, step: 1, targets: [{ value: 40 }, { value: 50 }] },
    placement: { per_domain: 3, difficulties: [1, 2, 3], max_questions: 4 },
    plan: { daily_minutes: [5, 10, 15, 20], default_daily_minutes: 10 },
    test_dates: TX_DATES,
  }));
  q("INSERT INTO sections (id, exam_id, name, position) VALUES ('tx-v', 'tx', 'Verbal', 1)");
  q("INSERT INTO domains (id, exam_id, section_id, name, position) VALUES ('tx-w', 'tx', 'tx-v', 'Words', 1)");
  q("INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES ('tx-syn', 'tx', 'tx-w', 'Synonyms', 2, '[]')");
  q("INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES ('tx-ant', 'tx', 'tx-w', 'Antonyms', 3, '[\"tx-syn\"]')");
  for (const skill of ["tx-syn", "tx-ant"]) {
    for (let i = 0; i < 6; i++) {
      q(`INSERT INTO items (id, skill_id, difficulty, type, stem, choices, answer, explanation, hints, wrong_reasons, rating, status)
         VALUES (?, ?, ?, 'mc', ?, '["a","b","c","d"]', 'a', '["a"]', '["h"]', '{}', 0, 'live')`, `${skill}-${i}`, skill, 1 + (i % 3), `Word ${skill} ${i}?`);
    }
  }
  q("INSERT INTO exams (id, name, short_name, position, enabled) VALUES ('gre', 'GRE General Test', 'GRE', 1, 0)");
  q("INSERT INTO exams (id, name, short_name, position, enabled) VALUES ('cfa', 'CFA Level I', 'CFA', 3, 0)");
  q("INSERT INTO exams (id, name, short_name, position, enabled) VALUES ('gmat', 'GMAT Focus Edition', 'GMAT', 2, 0)");
  _clearExamCache();
  return { ...env, DEFAULT_EXAM: undefined, ASSETS: { fetch: async () => new Response("") } };
}
const call = async (env, path, { body: b, learner, tz = "0" } = {}) => {
  const res = await worker.fetch(new Request(`http://local${path}`, {
    method: b ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-tz-offset": tz, ...(learner ? { "x-learner": learner } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  }), env, {});
  return { ...(await res.json()), http: res.status };
};

test("GET /api/exams lists every pack in picker order; not-ready ones carry only their names", async () => {
  const env = setupCatalog();
  const r = await call(env, "/api/exams");
  assert.equal(r.http, 200);
  assert.deepEqual(r.exams, [
    { id: "tx", name: "Test Exam", short_name: "TX", ready: true, sections: ["Quant", "Verbal"] },
    { id: "gre", name: "GRE General Test", short_name: "GRE", ready: false },
    { id: "gmat", name: "GMAT Focus Edition", short_name: "GMAT", ready: false },
    { id: "cfa", name: "CFA Level I", short_name: "CFA", ready: false },
  ]);
  // A ready pack that was turned off isn't offered.
  env.DB.raw.prepare("UPDATE exams SET enabled = 0 WHERE id = 'tx'").run();
  assert.equal((await call(env, "/api/exams")).exams[0].ready, false);
});

test("GET /api/exam?exam= loads a ready exam without a learner, never a stub", async () => {
  const env = setupCatalog();
  const tx = await call(env, "/api/exam?exam=tx");
  assert.equal(tx.http, 200);
  assert.equal(tx.id, "tx");
  assert.deepEqual(tx.sections.map((x) => x.kind), ["numbers", "words"]);
  assert.equal((await call(env, "/api/exam?exam=gre")).http, 404);
  assert.equal((await call(env, "/api/exam?exam=nope")).http, 404);
  assert.equal((await call(env, "/api/exam?exam=BAD!")).http, 404);
  // Without ?exam= it is the default (first ready) exam.
  assert.equal((await call(env, "/api/exam")).id, "tx");
});

test("test dates are filtered by the learner's local day, and a passed deadline drops", async () => {
  const env = setupCatalog();
  // 03:00 UTC on Dec 5: still Dec 4 in New York (offset 300), already Dec 5 in Paris (offset -60).
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-12-05T03:00:00Z") });
  try {
    const ny = await call(env, "/api/exam", { tz: "300" });
    assert.deepEqual(ny.test_dates.map((d) => d.date), ["2026-12-05", "2027-03-06", "2027-08-28"], "two years out at most");
    assert.equal(ny.test_dates[0].register_by, undefined, "Nov 20 has passed");
    assert.equal(ny.test_dates[1].register_by, "2027-02-19");
    assert.equal(ny.test_dates[2].anticipated, true);
    const paris = await call(env, "/api/exam", { tz: "-60" });
    assert.deepEqual(paris.test_dates.map((d) => d.date), ["2027-03-06", "2027-08-28"]);
  } finally {
    mock.timers.reset();
  }
  assert.deepEqual(upcomingTestDates({ test_dates: TX_DATES }, "2026-11-20")[0], { date: "2026-12-05", register_by: "2026-11-20" }, "the deadline day itself still counts");
  assert.deepEqual(upcomingTestDates({}, "2026-11-20"), []);
});

test("POST /api/learners makes the learner with its exam and profile in one call", async () => {
  const env = setupCatalog();
  const day = new Date().toISOString().slice(0, 10);
  const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const r = await call(env, "/api/learners", { body: { age_13_plus: true, exam_id: "tx", profile: { exam_date: date, daily_minutes: 5, target_score: 50 } } });
  assert.equal(r.http, 200);
  const row = env.DB.raw.prepare("SELECT exam_id, exam_date, daily_minutes, target_score, plan_started_at FROM learners WHERE id = ?").get(r.id);
  assert.deepEqual({ ...row }, { exam_id: "tx", exam_date: date, daily_minutes: 5, target_score: 50, plan_started_at: day });
  const prof = await body(await profileRoute(env, req(), r.id));
  assert.equal(prof.onboarded, true);
  // Not booked: no date, the default time.
  const nb = await call(env, "/api/learners", { body: { age_13_plus: true, exam_id: "tx", profile: { not_booked: true, target_score: null } } });
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT exam_date, daily_minutes, plan_started_at FROM learners WHERE id = ?").get(nb.id) }, { exam_date: null, daily_minutes: 10, plan_started_at: day });
  const count = () => env.DB.raw.prepare("SELECT COUNT(*) AS n FROM learners").get().n;
  const before = count();
  for (const [bad, want] of [
    [{ age_13_plus: true, exam_id: "gre" }, "exam_id is not available"],
    [{ age_13_plus: true, exam_id: "nope" }, "exam_id is not available"],
    [{ age_13_plus: true, exam_id: "Bad id" }, "exam_id is not available"],
    [{ age_13_plus: true, exam_id: "tx", profile: { daily_minutes: 30 } }, "daily_minutes must be one of 5, 10, 15, 20"],
    [{ age_13_plus: true, exam_id: "tx", profile: { exam_date: "2020-01-01" } }, "exam_date is in the past"],
  ]) {
    const res = await call(env, "/api/learners", { body: bad });
    assert.equal(res.http, 400, JSON.stringify(bad));
    assert.equal(res.error, want);
  }
  assert.equal(count(), before, "no learner made on a 400");
  assert.equal((await call(env, "/api/learners", { body: { exam_id: "tx" } })).http, 403, "the age answer is still needed");
  // Old builds: only the age answer.
  const old = await call(env, "/api/learners", { body: { age_13_plus: true } });
  assert.equal(old.http, 200);
  assert.deepEqual({ ...env.DB.raw.prepare("SELECT exam_id, plan_started_at FROM learners WHERE id = ?").get(old.id) }, { exam_id: null, plan_started_at: null });
});

test("daily time: 5 and 15 save, 30 doesn't, and a stored 45 reads back as 20", async () => {
  const env = setupCatalog();
  for (const m of [5, 15]) assert.equal((await body(await setProfile(env, req(), L, { daily_minutes: m }))).daily_minutes, m);
  const bad = await body(await setProfile(env, req(), L, { daily_minutes: 30 }));
  assert.equal(bad.http, 400);
  env.DB.raw.prepare("UPDATE learners SET daily_minutes = 45 WHERE id = ?").run(L);
  assert.equal((await body(await profileRoute(env, req(), L))).daily_minutes, 20);
  const plan = await body(await planRoute(env, req(), L));
  assert.equal(plan.daily_minutes, 20);
});

test("placement over every section probes both sections and tests out skills in each", async () => {
  const env = setupCatalog();
  const quiz = await body(await startPlacement(env, req(), L, { all: true }));
  assert.equal(quiz.http, 200);
  // max_questions 4 over 2 domains: 2 probes a domain, sections taking turns.
  const skillOf = (id) => env.DB.raw.prepare("SELECT skill_id FROM items WHERE id = ?").get(id).skill_id;
  assert.deepEqual(quiz.items.map((i) => skillOf(i.id)), ["tx-add", "tx-syn", "tx-mul", "tx-ant"]);
  const row = env.DB.raw.prepare("SELECT kind, mode, section_id FROM lessons WHERE id = ?").get(quiz.lesson_id);
  assert.deepEqual({ ...row }, { kind: "placement", mode: "all", section_id: null });
  for (const it of quiz.items) await answer(env, req(), L, { lesson_id: quiz.lesson_id, item_id: it.id, response: it.answer, time_ms: 1000 });
  const done = await body(await finishLesson(env, req(), L, { lesson_id: quiz.lesson_id }));
  assert.deepEqual(done.placement.tested_out.map((x) => x.id).sort(), ["tx-add", "tx-ant", "tx-mul", "tx-syn"]);
  assert.equal(done.placement.total_skills, 4, "the whole exam");
  // A one-section quiz still works (older app builds).
  const one = await body(await startPlacement(env, req(), L, "tx-v"));
  assert.equal(one.http, 200);
  assert.ok(one.items.every((i) => skillOf(i.id).startsWith("tx-syn") || skillOf(i.id).startsWith("tx-ant")));
});

test("the path colours each unit by its section's kind", async () => {
  const env = setupCatalog();
  const p = await body(await pathRoute(env, req(), L));
  assert.deepEqual([...new Set(p.units.map((u) => `${u.section_id}:${u.section_kind}`))].sort(), ["tx-q:numbers", "tx-v:words"]);
  PathResponse.parse(p);
});
