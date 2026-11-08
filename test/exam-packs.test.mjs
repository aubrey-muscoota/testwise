// Exam packs: the seed builder accepts any valid pack, rejects broken ones with
// readable problems, and the generic code (skill map, placement, the Worker's
// routes, Socrates' persona) runs a brand-new exam with no code changes.
// The new exam is a test-only pack in test/fixtures/exams/demo/.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldExam } from "../scripts/new-exam.mjs";
import { DatabaseSync } from "node:sqlite";
import { buildSeed } from "../scripts/build-seed.mjs";
import { loadPack, loadPacks, packSkills, validatePacks } from "../scripts/lib/packs.mjs";
import { pickPlacementProbes, placementTestOut } from "../worker/engine.js";
import { buildPersona } from "../worker/socrates.js";
import { _clearExamCache } from "../worker/lib/exam.js";
import worker from "../worker/index.js";

const path = (p) => fileURLToPath(new URL(p, import.meta.url));
const FIXTURES = path("./fixtures/exams");
const demo = () => ({ ...loadPack(`${FIXTURES}/demo`), folder: "demo" });
const clone = (v) => JSON.parse(JSON.stringify(v));

test("build-seed accepts the demo pack", () => {
  const res = buildSeed({ examsDir: FIXTURES });
  assert.ok(res.ok, res.problems?.join("\n"));
  assert.match(res.summary, /1 exam \(demo\): 2 domains, 3 skills, 6 items from 3 files/);
  assert.match(res.sql, /INSERT INTO exams \(id, name, config, voice, position\) VALUES \('demo', 'Demo Exam'/);
  assert.match(res.sql, /INSERT INTO domains .*'demo-arith'.* 0\.6\)/);
  assert.ok(!res.sql.includes('"//"'), "comment keys are dropped");
});

test("the SAT pack is valid and is the only enabled exam", () => {
  const packs = loadPacks(path("../exams"));
  assert.deepEqual(packs.map((p) => p.exam.id), ["sat"]);
  assert.deepEqual(validatePacks(packs), []);
  const weights = packs[0].skills.sections.map((s) => s.domains.reduce((a, d) => a + d.weight, 0));
  for (const w of weights) assert.ok(Math.abs(w - 1) < 1e-9);
});

test("broken packs get one readable problem each", () => {
  const p = demo();
  p.exam = clone(p.exam);
  p.skills = clone(p.skills);
  delete p.exam.publisher.disclaimer;
  p.exam.default_section = "nope";
  p.skills.sections[0].domains[1].weight = 0.3;
  p.skills.sections[0].domains[1].skills[0].prereqs = ["demo-missing"];
  p.skills.sections[0].domains[0].skills.push({ id: "demo-add", name: "Again", prereqs: [] });
  p.items = [
    ...p.items,
    { ...p.items[0] }, // duplicate id
    { ...p.items[1], id: "demo-x-001", skill_id: "demo-x" }, // unknown skill
    { ...p.items[0], id: "demo-add-099", choices: ["1", "2", "3", "1/2"] }, // 4 choices in a 3-choice exam
  ];
  const problems = validatePacks([p]).join("\n");
  for (const want of [
    /missing "publisher\.disclaimer"/,
    /"default_section" "nope" is not one of the sections/,
    /domain weights in section "demo-quant" add up to 0\.9, not 1/,
    /skill "demo-eq" has prerequisite "demo-missing", which is not a skill in this exam/,
    /duplicate skill id "demo-add"/,
    /duplicate item id "demo-add-001"/,
    /unknown skill_id "demo-x"/,
    /"demo-add-099": needs 3 choices/,
  ]) assert.match(problems, want);
  assert.ok(problems.split("\n").every((m) => m.startsWith("exams/demo: ")));
});

test("ids must be unique across packs", () => {
  const sat = { ...loadPack(path("../exams/sat")), folder: "sat" };
  const p = demo();
  p.skills = clone(p.skills);
  p.skills.sections[0].domains[0].id = "alg";
  assert.match(validatePacks([sat, p]).join("\n"), /exams\/demo: duplicate domain id "alg" \(also in exams\/sat\)/);
});

test("prerequisite loops are caught", () => {
  const p = demo();
  p.skills = clone(p.skills);
  p.skills.sections[0].domains[0].skills[0].prereqs = ["demo-eq"];
  assert.match(validatePacks([p]).join("\n"), /prerequisites loop back/);
});

test("placement probes follow the demo pack's placement config", () => {
  const pack = demo();
  const skills = packSkills(pack, pack.exam.default_section);
  assert.deepEqual(skills.map((s) => s.id), ["demo-add", "demo-mult", "demo-eq"]);
  const probes = pickPlacementProbes(skills, pack.exam.placement);
  // per_domain 2 with difficulties [1, 3]; the one-skill domain gets one easy probe.
  assert.deepEqual(probes.map((p) => [p.skill_id, p.difficulty]), [["demo-add", 1], ["demo-eq", 1], ["demo-mult", 3]]);
  const out = placementTestOut(probes, new Map(probes.map((p) => [p.skill_id, true])), skills);
  assert.deepEqual(out, ["demo-add", "demo-mult", "demo-eq"]);
});

test("Socrates' persona comes from the pack", () => {
  const pack = demo();
  const persona = buildPersona({ ...pack.exam, voice: pack.voice });
  assert.match(persona, /^You are Socrates, the tutor in Testwise, an app where test takers practice for the Demo \(Quant\) in short daily lessons\./);
  assert.match(persona, /About this exam:\n- The Demo Exam has one section/);
  assert.ok(!/SAT/.test(persona));
  const sat = loadPack(path("../exams/sat"));
  assert.match(buildPersona({ ...sat.exam, voice: sat.voice }),
    /^You are Socrates, the tutor in Testwise, an app where high school students practice for the SAT \(Math, and Reading and Writing\) in short daily lessons\./);
});

test("new-exam scaffolds a disabled pack that is valid once enabled", () => {
  const dir = mkdtempSync(join(tmpdir(), "testwise-exams-"));
  try {
    scaffoldExam("gre", "GRE General Test", dir);
    assert.throws(() => scaffoldExam("gre", "Again", dir), /already exists/);
    assert.throws(() => scaffoldExam("GRE!", "Bad", dir), /exam id must be/);
    assert.deepEqual(loadPacks(dir), [], "disabled packs are skipped");
    const [pack] = loadPacks(dir, { enabledOnly: false });
    assert.equal(pack.exam.enabled, false);
    assert.ok(!Object.keys(pack.exam).some((k) => k.startsWith("//")));
    pack.exam.enabled = true;
    assert.deepEqual(validatePacks([pack]), []);
    assert.equal(pack.items.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A minimal D1 stand-in over node:sqlite, enough for the Worker's routes.
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => (db.prepare(sql).run(...args), { success: true }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

test("the Worker serves the demo exam end to end with no code changes", async () => {
  const db = new DatabaseSync(":memory:");
  const migrations = path("../migrations");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(`${migrations}/${f}`, "utf8"));
  const seed = buildSeed({ examsDir: FIXTURES });
  db.exec(seed.sql);
  _clearExamCache();
  const env = { DB: d1(db), ASSETS: { fetch: async () => new Response("") } };
  let learner = "";
  const call = async (p, body) => {
    const res = await worker.fetch(new Request(`http://x${p}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-learner": learner },
      body: body ? JSON.stringify(body) : undefined,
    }), env, {});
    return { status: res.status, data: await res.json() };
  };

  const exam = (await call("/api/exam")).data;
  assert.equal(exam.id, "demo");
  assert.equal(exam.publisher.disclaimer, "Testwise is not affiliated with Demo Board.");
  assert.equal(exam.default_section, "demo-quant");
  assert.deepEqual(exam.sections[0].domains, [
    { id: "demo-arith", name: "Arithmetic", weight: 0.6 },
    { id: "demo-alg", name: "Algebra", weight: 0.4 },
  ]);
  assert.equal(exam.plan.default_weeks, 6);
  assert.equal(exam.voice.terms.spr, "numeric entry");

  learner = (await call("/api/learners", { age_13_plus: true })).data.id;
  const tree = (await call("/api/tree")).data;
  assert.equal(tree.exam.id, "demo");
  assert.deepEqual(tree.sections.map((s) => s.id), ["demo-quant"]);
  assert.deepEqual(tree.domains.map((d) => [d.id, d.weight]), [["demo-arith", 0.6], ["demo-alg", 0.4]]);

  // Placement without a section uses the pack's default section and placement config.
  const quiz = (await call("/api/lessons", { placement: true })).data;
  assert.deepEqual(quiz.items.map((i) => i.skill_id), ["demo-add", "demo-eq", "demo-mult"]);
  for (const it of quiz.items) {
    assert.ok((await call("/api/answers", { lesson_id: quiz.lesson_id, item_id: it.id, response: it.answer, time_ms: 3000 })).data.correct);
  }
  const done = (await call("/api/lessons/finish", { lesson_id: quiz.lesson_id })).data;
  assert.deepEqual(done.placement.tested_out.map((s) => s.id), ["demo-add", "demo-mult", "demo-eq"]);
  assert.equal((await call("/api/lessons", { placement: true, section: "sat-math" })).status, 404, "other exams' sections are refused");

  // A normal lesson on a skill works too.
  const lesson = (await call("/api/lessons", { skill_id: "demo-add" })).data;
  assert.equal(lesson.items.length, 2);
});
