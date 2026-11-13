// The Learn path (worker/path.js), on the real SAT skill map and the
// test-only demo pack. Pure functions, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPath, nodeAllowed, REVIEW_EVERY } from "../worker/path.js";
import { buildPlan, pathOrder, prepareSkills, addDays } from "../worker/plan.js";
import { PathResponse } from "../worker/schemas.js";

function load(dir) {
  const map = JSON.parse(readFileSync(new URL(`${dir}/skills.json`, import.meta.url)));
  const exam = JSON.parse(readFileSync(new URL(`${dir}/exam.json`, import.meta.url)));
  const skills = [];
  for (const sec of map.sections) for (const d of sec.domains) for (const s of d.skills) {
    skills.push({ id: s.id, name: s.name, prereqs: s.prereqs, section_id: sec.id, domain_id: d.id, domain_name: d.name, domain_weight: d.weight, position: skills.length });
  }
  return { skills, sections: exam.sections.map((s) => ({ id: s.id, name: s.name, kind: s.kind })) };
}
const SAT = load("../exams/sat");
const DEMO = load("./fixtures/exams/demo");
const TODAY = "2026-11-12";
const fresh = (base = SAT.skills) => base.map((s) => ({ ...s, attempts: 0, mastery: 0 }));
const path = (o = {}) => buildPath({
  today: TODAY, exam_date: addDays(TODAY, 120), plan_started_at: TODAY, daily_minutes: 20, reviews_due: 0,
  sections: SAT.sections, skills: fresh(), ...o,
});
const nodes = (p) => p.units.flatMap((u) => u.nodes);
const allNodes = (p) => [...nodes(p), p.end];
const currentOf = (p) => allNodes(p).filter((n) => n.state === "current");
// Finishing a skill node: one lesson's worth of answers.
const learn = (skills, id) => skills.map((s) => (s.id === id ? { ...s, attempts: Math.max(s.attempts, 8), mastery: 50 } : s));

// A tiny seeded random, so failures repeat.
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("units are the domains, sections interleaved, prerequisites always earlier", () => {
  const p = path();
  assert.deepEqual(p.units.map((u) => u.name), [
    "Algebra", "Craft and Structure", "Advanced Math", "Information and Ideas",
    "Problem-Solving and Data Analysis", "Standard English Conventions", "Geometry and Trigonometry", "Expression of Ideas",
  ]);
  assert.deepEqual(p.units.map((u) => u.section_index), [0, 1, 0, 1, 0, 1, 0, 1]);
  // The colour comes from the kind of thinking, from the pack.
  assert.deepEqual(p.units.map((u) => u.section_kind), ["numbers", "words", "numbers", "words", "numbers", "words", "numbers", "words"]);
  assert.deepEqual(p.units.map((u) => u.section_name), ["Math", "Reading and Writing", "Math", "Reading and Writing", "Math", "Reading and Writing", "Math", "Reading and Writing"]);
  const order = nodes(p).filter((n) => n.kind === "skill").map((n) => n.skill_id);
  assert.equal(order.length, SAT.skills.length);
  assert.equal(new Set(order).size, order.length, "each skill once");
  for (const s of SAT.skills) for (const pre of s.prereqs) {
    assert.ok(order.indexOf(pre) < order.indexOf(s.id), `${pre} before ${s.id}`);
  }
  p.units.forEach((u, i) => { assert.equal(u.number, i + 1); assert.equal(u.of, 8); assert.equal(u.done, 0); });
});

test("a review after every three skills unless the unit ends there, and a check at each unit's end", () => {
  const p = path();
  const shape = Object.fromEntries(p.units.map((u) => [u.id, u.nodes.map((n) => n.kind[0]).join("")]));
  assert.equal(shape.alg, "sssrssc"); // 5 skills
  assert.equal(shape["rw-eoi"], "ssc"); // 2
  assert.equal(shape["rw-cs"], "sssc"); // 3
  assert.equal(shape.geo, "sssrsc"); // 4
  assert.equal(shape.psda, "sssrsssrsc"); // 7
  assert.equal(REVIEW_EVERY, 3);
  const ids = allNodes(p).map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, "node ids are unique");
  assert.ok(ids.includes("review:alg:1") && ids.includes("check:alg") && ids.includes("review:psda:2") && ids.at(-1) === "end");
});

test("exactly one current node in any state, in every phase", () => {
  const r = rng(7);
  const phases = new Set();
  for (let i = 0; i < 200; i++) {
    const skills = SAT.skills.map((s) => {
      const x = r();
      // Every other round of six, every skill is started (the strengthen phase needs that).
      const floor = Math.floor(i / 6) % 2 ? 1 : 0;
      const attempts = Math.max(floor, x < 0.4 ? 0 : x < 0.6 ? Math.floor(r() * 8) : 8 + Math.floor(r() * 20));
      return { ...s, attempts, mastery: Math.floor(r() * 100), mastered: r() < 0.1, tested_out: r() < 0.08 };
    });
    const ids = path({ skills }).units.flatMap((u) => u.nodes).map((n) => n.id).filter((id) => !id.startsWith("skill:"));
    const nodes_done = ids.filter(() => r() < 0.3);
    const left = [120, 40, 6, 1, 0, -3][i % 6];
    const p = path({ skills, nodes_done, exam_date: addDays(TODAY, left), plan_started_at: addDays(TODAY, -60) });
    phases.add(p.phase);
    const cur = currentOf(p);
    assert.equal(cur.length, 1, `case ${i}: ${cur.map((n) => n.id)}`);
    assert.equal(p.current, cur[0].id);
    assert.ok(cur[0].start || p.phase === "rest", `case ${i}: current ${cur[0].id} can start`);
    assert.ok(PathResponse.safeParse(p).success, `case ${i}: shape`);
  }
  assert.deepEqual([...phases].sort(), ["after", "learn", "rest", "strengthen", "test_ready"]);
});

test("try it: finish the glowing circle and the next one opens, all the way to the end", () => {
  let skills = fresh();
  const done = [];
  const seen = [];
  let p = path({ skills });
  assert.equal(p.current, "skill:alg-linear-eq-1var");
  for (let guard = 0; guard < 200 && p.current !== "end"; guard++) {
    const cur = currentOf(p)[0];
    seen.push(cur.id);
    if (cur.kind === "skill") skills = learn(skills, cur.skill_id);
    else done.push(cur.id);
    const next = path({ skills, nodes_done: done });
    const order = allNodes(next).map((n) => n.id);
    assert.ok(order.indexOf(next.current) > order.indexOf(cur.id), `${cur.id} → ${next.current}`);
    assert.equal(allNodes(next).find((n) => n.id === cur.id).state, "done");
    p = next;
  }
  assert.equal(p.current, "end");
  assert.equal(p.end.state, "current");
  assert.ok(p.end.start, "the end circle starts the plan's practice");
  assert.equal(p.end.start.body.node, "end");
  assert.deepEqual(seen, nodes(p).map((n) => n.id), "every circle was current once, in order");
  assert.ok(nodes(p).every((n) => n.state === "done"));
});

test("placement: skipped skills are done, the review over them too, and the path picks up after them", () => {
  const out = ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"];
  const skills = fresh().map((s) => (out.includes(s.id) ? { ...s, attempts: 8, tested_out: true, mastery: 70 } : s));
  const p = path({ skills });
  const alg = p.units[0];
  assert.deepEqual(alg.nodes.slice(0, 4).map((n) => n.state), ["done", "done", "done", "done"]);
  assert.equal(p.current, "skill:alg-systems");
  assert.equal(alg.done, 3);
  assert.match(alg.nodes[0].why, /tested out of it in the placement quiz/);
});

test("a review is passed by a later skill learned, not by one tested out", () => {
  let skills = fresh();
  for (const id of ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"]) skills = learn(skills, id);
  assert.equal(path({ skills }).current, "review:alg:1");
  // A Reading and Writing placement later in the path doesn't skip a Math review.
  const tested = skills.map((s) => (s.section_id === "sat-rw" ? { ...s, attempts: 8, tested_out: true } : s));
  assert.equal(path({ skills: tested }).current, "review:alg:1");
  // An old learner who already moved on past it isn't sent back.
  const moved = learn(skills, "alg-systems");
  const p = path({ skills: moved });
  assert.equal(nodes(p).find((n) => n.id === "review:alg:1").state, "done");
  assert.equal(p.current, "skill:alg-inequalities");
  // Finished from the path: done.
  assert.equal(nodes(path({ skills, nodes_done: ["review:alg:1"] })).find((n) => n.id === "review:alg:1").state, "done");
});

test("work in another unit closes neither a review nor a unit check", () => {
  // A new learner drills a Reading and Writing skill from Practice.
  const drilled = learn(fresh(), "rw-words-context");
  const p = path({ skills: drilled });
  const at = (q, id) => allNodes(q).find((n) => n.id === id).state;
  assert.equal(p.current, "skill:alg-linear-eq-1var");
  assert.equal(at(p, "review:alg:1"), "locked");
  assert.equal(at(p, "check:alg"), "locked");
  // Algebra's skills done, then a lesson in the next unit: the check still waits.
  let skills = fresh();
  for (const s of SAT.skills.filter((x) => x.domain_id === "alg")) skills = learn(skills, s.id);
  skills = learn(skills, "rw-words-context");
  const q = path({ skills });
  assert.equal(at(q, "check:alg"), "current");
  assert.equal(at(q, "review:alg:1"), "done", "passed by later Algebra lessons");
  // Everything learned and no checks taken: every check is still there to take.
  let all = fresh();
  for (const s of SAT.skills) all = learn(all, s.id);
  const r = path({ skills: all });
  assert.ok(nodes(r).filter((n) => n.kind === "check").every((n) => n.state !== "done"));
  assert.equal(r.current, "check:alg");
  // Taken: done.
  assert.equal(at(path({ skills, nodes_done: ["check:alg"] }), "check:alg"), "done");
});

test("due reviews: a review circle before the current one takes the glow", () => {
  let skills = fresh();
  for (const id of ["alg-linear-eq-1var", "alg-linear-func"]) skills = learn(skills, id);
  const p = path({ skills, reviews_due_by_skill: { "alg-linear-func": 3, "alg-linear-eq-1var": 0 }, reviews_due: 3 });
  assert.equal(p.current, "due");
  assert.equal(currentOf(p).length, 1);
  const alg = p.units[0];
  const i = alg.nodes.findIndex((n) => n.id === "due");
  assert.equal(alg.nodes[i + 1].id, "skill:alg-linear-eq-2var");
  assert.equal(alg.nodes[i + 1].state, "open");
  const due = alg.nodes[i];
  assert.equal(due.kind, "review");
  assert.equal(due.due, 3);
  assert.deepEqual(due.start, { method: "POST", path: "/api/lessons", body: { skill_id: null, node: "due" } });
  assert.match(due.why, /^3 questions you missed before are due today\./);
  assert.ok(PathResponse.safeParse(p).success);
  // Nothing due: no circle.
  assert.ok(!allNodes(path({ skills })).some((n) => n.id === "due"));
  // Everything walked: it sits before the end circle.
  const doneAll = [];
  let all = fresh();
  for (const s of SAT.skills) all = learn(all, s.id);
  for (const n of nodes(path({ skills: all }))) if (n.kind !== "skill") doneAll.push(n.id);
  const q = path({ skills: all, nodes_done: doneAll, reviews_due_by_skill: { "geo-circles": 1 } });
  assert.equal(q.current, "due");
  assert.equal(q.end.state, "open");
  assert.equal(q.units.at(-1).nodes.at(-1).id, "due");
});

test("a start records its circle only when the path offers that start", () => {
  let skills = fresh();
  for (const id of ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"]) skills = learn(skills, id);
  const p = path({ skills });
  const review = nodes(p).find((n) => n.id === "review:alg:1");
  assert.ok(nodeAllowed(p, "review:alg:1", "/api/practice", review.start.body));
  assert.ok(nodeAllowed(p, "review:alg:1", "/api/practice", { ...review.start.body, n: 12 }));
  assert.ok(!nodeAllowed(p, "review:alg:1", "/api/practice", { ...review.start.body, n: 1 }), "fewer questions");
  assert.ok(!nodeAllowed(p, "review:alg:1", "/api/practice", { ...review.start.body, mode: "weak" }), "another mode");
  assert.ok(!nodeAllowed(p, "review:alg:1", "/api/lessons", review.start.body), "another endpoint");
  assert.ok(!nodeAllowed(p, "check:alg", "/api/practice", { mode: "weak", n: 1, node: "check:alg" }), "locked check");
  assert.ok(!nodeAllowed(p, "check:nope", "/api/practice", { mode: "mixed" }), "no such circle");
  assert.ok(nodeAllowed(p, "skill:alg-systems", "/api/lessons", { skill_id: "alg-systems" }));
  assert.ok(!nodeAllowed(p, "skill:alg-systems", "/api/lessons", { skill_id: "alg-linear-func" }), "another skill");
  assert.ok(nodeAllowed(p, "skill:alg-linear-func", "/api/lessons", { skill_id: "alg-linear-func" }), "a done circle, again");
});

test("what each circle starts", () => {
  let skills = fresh();
  for (const s of SAT.skills.filter((x) => x.domain_id === "alg")) skills = learn(skills, s.id);
  const p = path({ skills, reviews_due_by_skill: { "alg-linear-func": 2, "alg-systems": 1 } });
  const alg = p.units[0];
  const review = alg.nodes.find((n) => n.kind === "review");
  assert.deepEqual(review.start, {
    method: "POST", path: "/api/practice",
    body: { mode: "review", skill_ids: ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"], n: 8, node: "review:alg:1" },
  });
  assert.equal(review.due, 2);
  assert.match(review.why, /^2 questions you missed are due, then a mix of the 3 skills above\.$/);
  const check = alg.nodes.at(-1);
  // With questions due, the due review before it has the glow.
  assert.equal(check.state, "open");
  assert.equal(p.current, "due");
  assert.equal(check.start.body.mode, "mixed");
  assert.deepEqual(check.start.body.skill_ids, SAT.skills.filter((x) => x.domain_id === "alg").map((x) => x.id).sort((a, b) => check.skill_ids.indexOf(a) - check.skill_ids.indexOf(b)));
  assert.equal(check.skill_ids.length, 5);
  assert.ok(check.start.body.n >= 8 && check.start.body.n <= 12);
  assert.equal(check.start.body.node, "check:alg");
  const skill = alg.nodes[0];
  assert.deepEqual(skill.start, { method: "POST", path: "/api/lessons", body: { skill_id: "alg-linear-eq-1var", node: "skill:alg-linear-eq-1var" } });
  for (const n of allNodes(path())) {
    if (n.state === "locked") { assert.equal(n.start, null, n.id); assert.ok(n.locked_reason, n.id); }
    else assert.ok(n.start, n.id);
  }
});

test("later units stay locked until the units before them are finished", () => {
  const p = path();
  const cs = p.units[1];
  const words = cs.nodes[0];
  assert.equal(words.skill_id, "rw-words-context");
  assert.equal(words.state, "locked", "open in the engine, but not on the path yet");
  assert.equal(words.locked_reason, "Opens when you finish Algebra");
  assert.equal(p.units[0].nodes[1].locked_reason, "Opens after Linear equations in one variable");
  assert.equal(p.end.locked_reason, "Opens when every unit is done");
  // Algebra's skills done: Craft and Structure opens even before Algebra's check.
  let skills = fresh();
  for (const s of SAT.skills.filter((x) => x.domain_id === "alg")) skills = learn(skills, s.id);
  const q = path({ skills });
  assert.equal(q.current, "check:alg");
  assert.equal(q.units[1].nodes[0].state, "open");
});

test("the plan's lessons today are the first circles of the path", () => {
  for (const [left, minutes] of [[120, 20], [90, 45], [40, 30], [5, 20]]) {
    const o = { today: TODAY, exam_date: addDays(TODAY, left), plan_started_at: TODAY, daily_minutes: minutes, skills: fresh(), reviews_due: 0 };
    const plan = buildPlan(o);
    const lessons = plan.today.filter((t) => t.kind === "lesson").map((t) => t.skill_id);
    const p = buildPath({ ...o, sections: SAT.sections });
    const pathSkills = nodes(p).filter((n) => n.kind === "skill").map((n) => n.skill_id);
    assert.deepEqual(lessons, pathSkills.slice(0, lessons.length), `${left} days, ${minutes} min`);
    assert.equal(lessons[0], p.current.replace("skill:", ""));
    const weeks = plan.weeks.filter((w) => w.phase === "learn").flatMap((w) => w.focus_skill_ids);
    assert.deepEqual(weeks, pathSkills.slice(0, weeks.length));
  }
  assert.deepEqual(pathOrder(prepareSkills(fresh())).map((s) => s.id).slice(0, 3), ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"]);
});

test("exam-neutral: another pack and a one-section exam carry only their own names", () => {
  const p = path({ skills: fresh(DEMO.skills), sections: DEMO.sections });
  const text = JSON.stringify(p);
  assert.doesNotMatch(text, /SAT|Math\b|Reading/);
  assert.deepEqual(p.units.map((u) => u.name), ["Arithmetic", "Algebra"]);
  assert.ok(p.units.every((u) => u.section_index === 0));
  assert.ok(p.units.every((u) => u.section_kind === "numbers"));
  assert.equal(p.current, "skill:demo-add");
  assert.ok(PathResponse.safeParse(p).success);
  // Without section names the unit still says which section it's in.
  const bare = path({ skills: fresh(DEMO.skills).map((s) => ({ ...s, section_name: "Quant" })), sections: [] });
  assert.equal(bare.units[0].section_name, "Quant");
});

test("a pack with a prerequisite loop doesn't throw and still has one current circle", () => {
  const loop = [
    { id: "a1", name: "A one", prereqs: ["b1"], section_id: "s", domain_id: "a", domain_name: "A", domain_weight: 0.5, position: 0 },
    { id: "b1", name: "B one", prereqs: ["a1"], section_id: "s", domain_id: "b", domain_name: "B", domain_weight: 0.5, position: 1 },
  ];
  const p = path({ skills: fresh(loop), sections: [{ id: "s", name: "Only" }] });
  assert.equal(currentOf(p).length, 1);
  assert.equal(p.current, "end");
  assert.ok(p.end.start, "something to do");
  assert.ok(PathResponse.safeParse(p).success);
});

test("the response shape", () => {
  const p = path({ stats: { xp: 75, streak: 1, xp_today: 75, reviews_due: 2 } });
  const r = PathResponse.safeParse(p);
  assert.ok(r.success, JSON.stringify(r.error?.issues?.slice(0, 3)));
  assert.deepEqual(p.stats, { xp: 75, streak: 1, xp_today: 75, reviews_due: 2 });
  assert.equal(p.days_left, 120);
  assert.equal(p.phase, "learn");
});

// Exam names, sections and dates come from the packs: the setup screens and
// the Worker never name a test or its sections themselves.
test("exam-neutral: setup and Worker code name no test or section", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = new URL("..", import.meta.url).pathname;
  const files = (dir) => readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : /\.(m?js|tsx?)$/.test(f) ? [p] : [];
  });
  for (const f of [...files("app/src/setup"), ...files("worker")]) {
    const code = readFileSync(join(root, f), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    assert.doesNotMatch(code, /\b(SAT|GRE|GMAT|CFA|PSAT)\b|College Board|Reading and Writing|"Math"|'Math'/, f);
  }
});
