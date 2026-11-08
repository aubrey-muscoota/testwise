import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceSkills, pickPractice, allocate, orderItems, bankSummary, lowUnseen } from "../worker/practice.js";
import { seededRandom } from "../worker/engine.js";

const skills = [
  { id: "a", section_id: "m", weight: 0.3, mastery: 0.9, started: true },
  { id: "b", section_id: "m", weight: 0.3, mastery: 0.3, started: true },
  { id: "c", section_id: "m", weight: 0.1, mastery: 0.2, started: true },
  { id: "d", section_id: "v", weight: 0.2, mastery: 0.5, started: true, mistakes: 3 },
  { id: "e", section_id: "v", weight: 0.1, mastery: 0, started: false },
];
const items = [];
for (const s of ["a", "b", "c", "d", "e"]) for (let i = 0; i < 30; i++) items.push({ id: `${s}${i}`, skill_id: s, rating: (i % 3) - 1 });
const ratings = { a: 1, b: -0.5, c: -1, d: 0, e: 0 };

test("weak picks the highest weight × (1 − mastery) among started skills", () => {
  const plan = practiceSkills({ mode: "weak", skills, n: 10 });
  assert.deepEqual(plan.map((p) => p.id), ["b", "d", "c"]);
  assert.ok(plan[0].share > plan[2].share);
  // Nothing started: falls back to all skills.
  const none = practiceSkills({ mode: "weak", skills: skills.map((s) => ({ ...s, started: false })), n: 10 });
  assert.equal(none.length, 3);
});

test("mixed uses started skills evenly; falls back to the current section; timed weights by the test", () => {
  const mixed = practiceSkills({ mode: "mixed", skills });
  assert.deepEqual(mixed.map((p) => p.id), ["a", "b", "c", "d"]);
  assert.ok(mixed.every((p) => p.share === 0.25));
  const none = practiceSkills({ mode: "mixed", skills: skills.map((s) => ({ ...s, started: false })), current_section: "v" });
  assert.deepEqual(none.map((p) => p.id), ["d", "e"]);
  const timed = practiceSkills({ mode: "timed", skills });
  assert.ok(timed.find((p) => p.id === "a").share > timed.find((p) => p.id === "c").share);
  const sec = practiceSkills({ mode: "mixed", skills, section: "v" });
  assert.deepEqual(sec.map((p) => p.id), ["d"]);
  assert.deepEqual(practiceSkills({ mode: "skill", skills, skill_id: "c" }), [{ id: "c", share: 1 }]);
  assert.deepEqual(practiceSkills({ mode: "mistakes", skills }).map((p) => p.id), ["d"]);
});

test("allocate splits n by share, at least one each when possible", () => {
  const q = allocate(10, [{ id: "x", share: 0.7 }, { id: "y", share: 0.2 }, { id: "z", share: 0.1 }]);
  assert.equal([...q.values()].reduce((a, b) => a + b, 0), 10);
  assert.ok(q.get("z") >= 1 && q.get("x") > q.get("y"));
  const few = allocate(2, [{ id: "x", share: 0.7 }, { id: "y", share: 0.2 }, { id: "z", share: 0.1 }]);
  assert.deepEqual([...few.entries()].filter(([, v]) => v).map(([k]) => k), ["x", "y"]);
});

test("order: unseen first (near level), then missed, then oldest seen", () => {
  const list = items.filter((it) => it.skill_id === "a").slice(0, 6);
  const history = new Map([
    ["a0", { last_at: 300, last_correct: true }],
    ["a1", { last_at: 100, last_correct: true }],
    ["a2", { last_at: 200, last_correct: false }],
  ]);
  const order = orderItems(list, history, 0, seededRandom(1)).map((it) => it.id);
  assert.deepEqual(order.slice(3), ["a2", "a1", "a0"]);
  assert.deepEqual(new Set(order.slice(0, 3)), new Set(["a3", "a4", "a5"]));
  assert.deepEqual(orderItems(list, history, 0, seededRandom(1), { mistakesOnly: true }).map((it) => it.id), ["a2"]);
});

test("a session never repeats, interleaves skills and prefers unseen questions", () => {
  const history = new Map(items.filter((it) => Number(it.id.slice(1)) < 25).map((it, i) => [it.id, { last_at: i, last_correct: i % 4 !== 0 }]));
  const plan = practiceSkills({ mode: "mixed", skills });
  const s = pickPractice({ mode: "mixed", plan, items, history, ratings, n: 16, rand: seededRandom(7) });
  assert.equal(s.length, 16);
  assert.equal(new Set(s.map((x) => x.id)).size, 16);
  for (let i = 1; i < s.length; i++) assert.notEqual(s[i].skill_id, s[i - 1].skill_id, `back to back at ${i}`);
  const unseen = s.filter((x) => !x.seen).length;
  assert.equal(unseen, 16, "5 unseen per skill cover 4 per skill");
  // Seen everything: missed ones come first.
  const all = new Map(items.map((it, i) => [it.id, { last_at: i, last_correct: i % 5 !== 0 }]));
  const s2 = pickPractice({ mode: "skill", plan: [{ id: "a", share: 1 }], items, history: all, ratings, n: 6, rand: seededRandom(3) });
  assert.ok(s2.filter((x) => !all.get(x.id).last_correct).length === 6, "all six a-items missed come back first");
});

test("difficulty tracks the learner's rating for unseen questions", () => {
  const avg = (r) => {
    const s = pickPractice({ mode: "skill", plan: [{ id: "a", share: 1 }], items, history: new Map(), ratings: { a: r }, n: 6, rand: seededRandom(r) });
    const by = new Map(items.map((it) => [it.id, it.rating]));
    return s.reduce((a, x) => a + by.get(x.id), 0) / s.length;
  };
  assert.ok(avg(-2) < avg(2));
});

test("a skill that runs dry hands its share to the others; mistakes mode only serves missed items", () => {
  const plan = [{ id: "a", share: 0.5 }, { id: "b", share: 0.5 }];
  const small = items.filter((it) => it.skill_id === "b" || it.id === "a0" || it.id === "a1");
  const s = pickPractice({ mode: "mixed", plan, items: small, history: new Map(), ratings, n: 10, rand: seededRandom(2) });
  assert.equal(s.length, 10);
  assert.equal(s.filter((x) => x.skill_id === "a").length, 2);
  const history = new Map([["d1", { last_at: 5, last_correct: false }], ["d2", { last_at: 1, last_correct: false }], ["d3", { last_at: 9, last_correct: true }]]);
  const m = pickPractice({ mode: "mistakes", plan: [{ id: "d", share: 1 }], items, history, ratings, n: 10, rand: seededRandom(1) });
  assert.deepEqual(m.map((x) => x.id).sort(), ["d1", "d2"]);
});

test("exclude keeps fresh items out of the bank top-up", () => {
  const s = pickPractice({ mode: "skill", plan: [{ id: "a", share: 1 }], items, history: new Map(), ratings, n: 30, rand: seededRandom(1), exclude: new Set(["a0", "a1"]) });
  assert.equal(s.length, 28);
  assert.ok(!s.some((x) => x.id === "a0" || x.id === "a1"));
});

test("bank summary counts unseen, seen and missed; low when under 10% unseen", () => {
  const history = new Map(items.filter((it) => it.skill_id === "a" && Number(it.id.slice(1)) < 28).map((it) => [it.id, { last_at: 1, last_correct: it.id !== "a3" }]));
  const by = bankSummary(items.map((it) => (it.id === "a29" ? { ...it, source: "generated" } : it)), history);
  assert.deepEqual(by.get("a"), { bank: 30, generated: 1, seen: 28, unseen: 2, missed: 1 });
  assert.equal(lowUnseen(by.get("a")), true);
  assert.equal(lowUnseen(by.get("b")), false);
});
