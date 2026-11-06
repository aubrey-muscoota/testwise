// End-to-end API check against a running dev server (npm run dev).
// Usage: node test/e2e-api.mjs [baseUrl]
import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://localhost:8787";
let learner;
const call = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-learner": learner || "", "x-tz-offset": "300" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

assert.equal((await call("/api/learners", {})).status, 403, "no learner without the age answer");
assert.equal((await call("/api/learners", { age_13_plus: false })).status, 403);
learner = (await call("/api/learners", { age_13_plus: true })).data.id;
assert.match(learner, /^[a-f0-9]{32}$/);

assert.equal((await call("/api/tree")).status, 200);
let tree = (await call("/api/tree")).data;
const skills = tree.domains.flatMap((d) => d.skills);
const first = skills.find((s) => s.id === "alg-linear-eq-1var");
const locked = skills.find((s) => s.id === "alg-linear-func");
assert.ok(first.unlocked && !locked.unlocked, "root skill open, dependent skill locked");
assert.equal((await call("/api/lessons", { skill_id: locked.id })).status, 403, "locked skill refuses lessons");

// Lesson 1: answer the first two wrong, the rest right; retry the misses at the end.
const l1 = (await call("/api/lessons", { skill_id: first.id })).data;
assert.equal(l1.items.length, 8);
assert.equal(new Set(l1.items.map((i) => i.id)).size, 8);
const wrong = (it) => (it.type === "mc" ? it.choices.find((c) => c !== it.answer) : "99999");
for (const [i, it] of l1.items.entries()) {
  const r = (await call("/api/answers", { lesson_id: l1.lesson_id, item_id: it.id, response: i < 2 ? wrong(it) : it.answer, time_ms: 5000 })).data;
  assert.equal(r.correct, i >= 2, `item ${it.id}`);
}
for (const it of l1.items.slice(0, 2)) {
  await call("/api/answers", { lesson_id: l1.lesson_id, item_id: it.id, response: it.answer, time_ms: 4000 });
}
const f1 = (await call("/api/lessons/finish", { lesson_id: l1.lesson_id })).data;
assert.equal(f1.correct, 6, "first-try correct only");
assert.equal(f1.total, 8);
assert.equal(f1.xp, 6 * 10 + 15);
assert.equal(f1.stats.streak, 1);
assert.equal(f1.stats.lessons_today, 1);
// Finishing twice doesn't double XP.
assert.equal((await call("/api/lessons/finish", { lesson_id: l1.lesson_id })).data.stats.xp, 75);

// Grid-in equivalence through the API.
const spr = l1.items.find((i) => i.type === "spr");
if (spr && /^-?\d+\/\d+$/.test(spr.answer)) {
  const [a, b] = spr.answer.split("/").map(Number);
  assert.ok((await call("/api/answers", { item_id: spr.id, response: String(a / b) })).data.correct);
}

tree = (await call("/api/tree")).data;
const after = tree.domains.flatMap((d) => d.skills);
assert.ok(after.find((s) => s.id === first.id).attempts >= 8);
assert.ok(after.find((s) => s.id === locked.id).unlocked, "dependent skill unlocks after a lesson");
assert.ok(after.find((s) => s.id === first.id).mastery > 0);

// Misses are scheduled for review tomorrow, so nothing is due yet.
assert.equal(tree.stats.reviews_due, 0);
assert.equal((await call("/api/lessons", { skill_id: null })).status, 404);

// Lesson 2 avoids questions already seen.
const l2 = (await call("/api/lessons", { skill_id: first.id })).data;
const seen = new Set(l1.items.map((i) => i.id));
assert.ok(l2.items.every((i) => !seen.has(i.id)), "no repeats while unseen questions remain");

// Socrates: opening message, a reply, and the daily cap.
const it = l1.items[0];
assert.equal((await call("/api/socrates", { item_id: it.id, response: wrong(it), history: [] })).status, 403, "Socrates needs AI consent first");
assert.equal((await call("/api/tree")).data.learner.ai_consent, false);
assert.deepEqual((await call("/api/consent", { ai: true })).data, { age_confirmed: true, ai_consent: true });
const s1 = await call("/api/socrates", { item_id: it.id, response: wrong(it), history: [] });
assert.equal(s1.status, 200);
assert.ok(s1.data.reply.length > 10);
const s2 = await call("/api/socrates", { item_id: it.id, response: wrong(it), history: [{ role: "socrates", content: s1.data.reply }, { role: "student", content: "I'm not sure" }] });
assert.equal(s2.status, 200);
assert.equal((await call("/api/socrates", { item_id: it.id, response: "x", history: [{ role: "socrates", content: "hi" }] })).status, 400, "must end on a student turn");
const ids = l2.items.map((x) => x.id);
for (const id of ids.slice(0, 4)) assert.equal((await call("/api/socrates", { item_id: id, response: "1", history: [] })).status, 200);
const capped = await call("/api/socrates", { item_id: ids[4], response: "1", history: [] });
assert.equal(capped.status, 429, "sixth conversation of the day is capped");
assert.equal((await call("/api/socrates", { item_id: it.id, response: "1", history: [] })).status, 200, "an existing conversation can continue");

// Reports, auth and junk input.
assert.equal((await call("/api/reports", { item_id: it.id, note: "test" })).status, 200);
learner = "nope";
assert.equal((await call("/api/tree")).status, 401);
learner = "' OR 1=1 --";
assert.equal((await call("/api/tree")).status, 401);

// Placement quiz: a new learner who gets everything right skips ahead.
learner = (await call("/api/learners", { age_13_plus: true })).data.id;
const pq = (await call("/api/lessons", { placement: true })).data;
assert.equal(pq.placement, true);
assert.equal(pq.items.length, 12);
assert.equal(new Set(pq.items.map((i) => i.skill_id)).size, 12, "one question per probed skill");
assert.ok(pq.items[0].difficulty <= pq.items[pq.items.length - 1].difficulty, "easy questions first");
for (const it of pq.items) {
  await call("/api/answers", { lesson_id: pq.lesson_id, item_id: it.id, response: it.answer, time_ms: 3000 });
}
const pf = (await call("/api/lessons/finish", { lesson_id: pq.lesson_id })).data;
assert.equal(pf.correct, 12);
assert.ok(pf.placement.tested_out.length >= 12, "probed skills and their prerequisites are tested out");
assert.ok(pf.placement.next.length >= 1, "something is left to learn");
tree = (await call("/api/tree")).data;
const placed = tree.domains.flatMap((d) => d.skills);
assert.ok(placed.find((s) => s.id === "adv-nonlinear-eq").unlocked, "a deep skill is open after placement");
for (const n of pf.placement.next) assert.ok(placed.find((s) => s.id === n.id).unlocked, `${n.id} open`);
assert.ok(placed.find((s) => s.id === "alg-linear-eq-1var").tested_out);
assert.ok(!placed.find((s) => s.id === pf.placement.next[0].id).tested_out);
// Finishing again changes nothing.
assert.equal((await call("/api/lessons/finish", { lesson_id: pq.lesson_id })).data.placement.tested_out.length, pf.placement.tested_out.length);

// A learner who misses everything stays at the start.
learner = (await call("/api/learners", { age_13_plus: true })).data.id;
const pq2 = (await call("/api/lessons", { placement: true })).data;
for (const it of pq2.items) {
  await call("/api/answers", { lesson_id: pq2.lesson_id, item_id: it.id, response: wrong(it), time_ms: 3000 });
}
const pf2 = (await call("/api/lessons/finish", { lesson_id: pq2.lesson_id })).data;
assert.equal(pf2.placement.tested_out.length, 0);
const after2 = (await call("/api/tree")).data.domains.flatMap((d) => d.skills);
assert.ok(!after2.find((s) => s.id === "alg-linear-func").unlocked);
assert.ok(after2.every((s) => s.attempts === 0 && !s.tested_out), "placement answers don't count as practice");

// Deleting a learner removes them.
assert.equal((await call("/api/learner/delete", {})).status, 200);
assert.equal((await call("/api/tree")).status, 401, "deleted learner is gone");

console.log(`e2e ok (offline Socrates: ${s1.data.offline === true})`);
