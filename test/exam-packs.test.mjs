// Exam packs: the seed builder accepts any valid pack, rejects broken ones with
// readable problems, and the generic code (skill map, placement, the Worker's
// routes, Socrates' persona) runs a brand-new exam with no code changes.
// The new exam is a test-only pack in test/fixtures/exams/demo/.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  assert.match(res.sql, /INSERT INTO exams \(id, name, short_name, config, voice, position, enabled\) VALUES \('demo', 'Demo Exam', 'Demo'/);
  assert.match(res.sql, /INSERT INTO domains .*'demo-arith'.* 0\.6\)/);
  assert.ok(!res.sql.includes('"//"'), "comment keys are dropped");
});

test("the SAT pack is valid and is the only enabled exam; GRE, GMAT and CFA are listed", () => {
  const packs = loadPacks(path("../exams"));
  assert.deepEqual(packs.map((p) => p.exam.id), ["sat"]);
  assert.deepEqual(validatePacks(packs), []);
  const every = loadPacks(path("../exams"), { enabledOnly: false });
  assert.deepEqual(validatePacks(every), []);
  assert.deepEqual(every.filter((p) => !p.exam.enabled).map((p) => p.exam.id).sort(), ["cfa", "gmat", "gre"]);
  assert.deepEqual(packs[0].exam.sections.map((s) => s.kind), ["numbers", "words"]);
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
  p.skills.sections[0].domains[1].name = "Algebra with one unknown and a few steps"; // too long for a card title
  p.skills.sections[0].domains[0].skills[0].official_name = 7;
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
    /domain "demo-alg" "name" is 40 characters; keep it to 32/,
    /skill "demo-add" "official_name" must be text/,
  ]) assert.match(problems, want);
  assert.ok(problems.split("\n").every((m) => m.startsWith("exams/demo: ")));
});

// A stub folder: only an exam.json listing.
function stubDir(exam) {
  const dir = mkdtempSync(join(tmpdir(), "testwise-stub-"));
  mkdirSync(join(dir, exam.id));
  writeFileSync(join(dir, exam.id, "exam.json"), JSON.stringify(exam));
  return dir;
}

test("a stub pack (exam.json only, not enabled) loads and validates; it needs a short name", () => {
  const dir = stubDir({ id: "gre", enabled: false, name: "GRE General Test", short_name: "GRE", order: 1 });
  try {
    const [pack] = loadPacks(dir, { enabledOnly: false });
    assert.deepEqual(pack.problems, []);
    assert.deepEqual(validatePacks([pack]), []);
    delete pack.exam.short_name;
    assert.match(validatePacks([pack]).join("\n"), /"short_name" must be 1 to 5 characters/);
    pack.exam.short_name = "GRE-GT";
    assert.match(validatePacks([pack]).join("\n"), /"short_name" must be 1 to 5 characters/);
    pack.exam.short_name = "GRE";
    pack.exam.order = 1.5;
    assert.match(validatePacks([pack]).join("\n"), /"order" must be a whole number/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an enabled pack still needs skills.json and voice.json", () => {
  const dir = stubDir({ id: "gre", enabled: true, name: "GRE General Test", short_name: "GRE" });
  try {
    const [pack] = loadPacks(dir);
    const problems = validatePacks([pack]).join("\n");
    assert.match(problems, /skills\.json: missing/);
    assert.match(problems, /voice\.json: missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sections need a kind, and score targets sit on the scale in order", () => {
  const p = demo();
  p.exam = clone(p.exam);
  delete p.exam.sections[0].kind;
  assert.match(validatePacks([p]).join("\n"), /sections\[0\] \(demo-quant\): "kind" must be "numbers" or "words"/);
  p.exam.sections[0].kind = "colour";
  assert.match(validatePacks([p]).join("\n"), /"kind" must be "numbers" or "words"/);
  p.exam.sections[0].kind = "words";
  assert.deepEqual(validatePacks([p]), []);
  for (const targets of [undefined, [], [{ value: 70 }], [{ value: 50 }, { value: 40 }], [{ value: 40.5 }], [{ value: 40, label: "" }]]) {
    p.exam.score.targets = targets;
    assert.match(validatePacks([p]).join("\n"), /"score\.targets" must list/, JSON.stringify(targets));
  }
});

test("test dates: real days, in order, deadlines before their day, an https source", () => {
  const p = demo();
  p.exam = clone(p.exam);
  const good = { source: "https://example.org/dates", checked: "2026-11-12", dates: [{ date: "2026-12-05", register_by: "2026-11-20" }, { date: "2027-03-06", anticipated: true }] };
  p.exam.test_dates = clone(good);
  assert.deepEqual(validatePacks([p]), []);
  const bad = (mut, want) => {
    p.exam.test_dates = clone(good);
    mut(p.exam.test_dates);
    assert.match(validatePacks([p]).join("\n"), want);
  };
  bad((t) => t.dates.reverse(), /dates must be in order with no repeats/);
  bad((t) => t.dates.push({ date: "2027-03-06" }), /dates must be in order with no repeats/);
  bad((t) => { t.dates[0].register_by = "2026-12-06"; }, /"register_by" must be a real day before 2026-12-05/);
  bad((t) => { t.dates[1].date = "2027-02-30"; }, /"date" must be a real day/);
  bad((t) => { t.source = "http://example.org/dates"; }, /"test_dates\.source" must be the https link/);
  bad((t) => { t.checked = "Nov 12"; }, /"test_dates\.checked"/);
  bad((t) => { t.dates[1].anticipated = "yes"; }, /"anticipated" must be true or false/);
  // The SAT pack's dates are in the same shape.
  const sat = loadPack(path("../exams/sat"));
  assert.ok(sat.exam.test_dates.dates.length >= 4);
  assert.ok(sat.exam.test_dates.dates.filter((d) => !d.anticipated).every((d) => d.register_by));
});

test("the seed lists stubs (no config, not enabled, nothing else) and places ready packs by order", () => {
  const dir = mkdtempSync(join(tmpdir(), "testwise-seed-"));
  try {
    cpSync(`${FIXTURES}/demo`, join(dir, "demo"), { recursive: true });
    const demoExam = JSON.parse(readFileSync(join(dir, "demo", "exam.json"), "utf8"));
    writeFileSync(join(dir, "demo", "exam.json"), JSON.stringify({ ...demoExam, order: 0 }));
    mkdirSync(join(dir, "gre"));
    writeFileSync(join(dir, "gre", "exam.json"), JSON.stringify({ id: "gre", enabled: false, name: "GRE General Test", short_name: "GRE", order: 1 }));
    const res = buildSeed({ examsDir: dir });
    assert.ok(res.ok, res.problems?.join("\n"));
    assert.match(res.summary, /1 listed as not ready \(gre\)/);
    const db = new DatabaseSync(":memory:");
    const migrations = path("../migrations");
    for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(`${migrations}/${f}`, "utf8"));
    db.exec(res.sql);
    // Seeding twice is the same as once, and a stub never gains a config.
    db.exec(res.sql);
    const rows = db.prepare("SELECT id, short_name, enabled, position, config IS NOT NULL AS ok FROM exams WHERE id IN ('demo', 'gre') ORDER BY position").all();
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { id: "demo", short_name: "Demo", enabled: 1, position: 0, ok: 1 },
      { id: "gre", short_name: "GRE", enabled: 0, position: 1, ok: 0 },
    ]);
    for (const t of ["sections", "domains", "skills"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE exam_id = 'gre'`).get().n, 0, t);
    // A pack that was live and is turned off keeps its config for learners already on it.
    writeFileSync(join(dir, "demo", "exam.json"), JSON.stringify({ ...demoExam, enabled: false }));
    writeFileSync(join(dir, "gre", "exam.json"), JSON.stringify({ id: "gre", enabled: true, name: "GRE General Test", short_name: "GRE" }));
    assert.equal(buildSeed({ examsDir: dir }).ok, false, "gre has no content yet");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build-seed reminds when fewer than two test dates are left", () => {
  const sat = buildSeed({ examsDir: path("../exams"), today: "2028-05-10" });
  assert.ok(sat.ok);
  assert.match(sat.warnings.join("\n"), /exams\/sat: only 1 test date left after 2028-05-10/);
  assert.deepEqual(buildSeed({ examsDir: path("../exams"), today: "2026-11-12" }).warnings, []);
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
    // A stub listing is filled in, keeping its name, short name and order.
    mkdirSync(join(dir, "cfa"));
    writeFileSync(join(dir, "cfa", "exam.json"), JSON.stringify({ id: "cfa", enabled: false, name: "CFA Level I", short_name: "CFA", order: 3 }));
    scaffoldExam("cfa", "", dir);
    const cfa = loadPack(join(dir, "cfa"));
    assert.deepEqual([cfa.exam.name, cfa.exam.short_name, cfa.exam.order, cfa.exam.enabled], ["CFA Level I", "CFA", 3, false]);
    cfa.exam.enabled = true;
    assert.deepEqual(validatePacks([{ ...cfa, folder: "cfa" }]), []);
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
    { id: "demo-arith", name: "Arithmetic", official_name: "Arithmetic", weight: 0.6 },
    { id: "demo-alg", name: "Algebra", official_name: "Algebra", weight: 0.4 },
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

test("no wrong_reason opens with a 'Picked/Chosen/Tempting because' template", () => {
  const dir = path("../exams/sat/items/");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const it of JSON.parse(readFileSync(join(dir, f), "utf8"))) {
      for (const [k, v] of Object.entries(it.wrong_reasons ?? {})) assert.ok(!/^(Picked|Chosen|Tempting) because/.test(v), `${it.id} ${k}: ${v}`);
    }
  }
});

test("the SAT pack names every skill and unit in a student's words and keeps College Board's name", () => {
  const sat = loadPack(path("../exams/sat"));
  const all = sat.skills.sections.flatMap((s) => s.domains.flatMap((d) => [d, ...d.skills]));
  assert.equal(all.length, 8 + 29);
  for (const x of all) {
    assert.ok(x.official_name && x.official_name.trim(), `${x.id} has an official name`);
    assert.ok(x.name.length <= 32, `${x.id}: "${x.name}" fits a card title`);
    assert.match(x.name, /^[A-Z][^A-Z]*(?:[A-Z][a-z]*(?:ean|ian)?[^A-Z]*)*$/, `${x.id}: "${x.name}" is sentence case`);
  }
  const byId = new Map(all.map((x) => [x.id, x]));
  assert.equal(byId.get("rw-boundaries").name, "Commas, dashes and semicolons");
  assert.equal(byId.get("rw-boundaries").official_name, "Boundaries");
  assert.equal(packSkills(sat).find((s) => s.id === "rw-boundaries").official_name, "Boundaries");
  // The seed stores both.
  const res = buildSeed({ examsDir: path("../exams") });
  assert.match(res.sql, /INSERT INTO skills \(id, exam_id, domain_id, name, official_name, .*'rw-boundaries', 'sat', 'rw-sec', 'Commas, dashes and semicolons', 'Boundaries'/);
});
