// End-to-end API check against a running dev server (npm run dev).
// Usage: node test/e2e-api.mjs [baseUrl]   (or BASE=http://localhost:8791 node test/e2e-api.mjs)
// Expects the SAT pack to be seeded.
import assert from "node:assert/strict";
import { PathResponse } from "../worker/schemas.js";

const BASE = process.argv[2] || process.env.BASE || "http://localhost:8787";
let learner;
const call = async (path, body) => {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-learner": learner || "", "x-tz-offset": "300" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

// The exam pack is readable before there is a learner (Welcome needs it).
{
  const e = (await call("/api/exam")).data;
  assert.equal(e.id, "sat");
  assert.equal(e.default_section, "sat-math");
  assert.match(e.publisher.disclaimer, /not affiliated with College Board/);
  assert.deepEqual(e.sections.map((s) => s.id), ["sat-math", "sat-rw"]);
  for (const s of e.sections) assert.ok(Math.abs(s.domains.reduce((a, d) => a + d.weight, 0) - 1) < 1e-9, `${s.id} weights add up to 1`);
  assert.equal(e.plan.default_weeks, 8);
  assert.deepEqual(e.plan.daily_minutes, [5, 10, 15, 20]);
  assert.deepEqual(e.sections.map((s) => s.kind), ["numbers", "words"]);
  // Test dates still ahead of the caller's day, in order.
  const today = new Date(Date.now() - 300 * 60_000).toISOString().slice(0, 10);
  assert.ok(Array.isArray(e.test_dates));
  assert.ok(e.test_dates.every((d, i) => d.date > today && (i === 0 || d.date > e.test_dates[i - 1].date)));
}

// The test picker: SAT ready, then GRE, GMAT and CFA not ready yet.
{
  const { exams } = (await call("/api/exams")).data;
  assert.deepEqual(exams.map((x) => [x.short_name, x.ready]), [["SAT", true], ["GRE", false], ["GMAT", false], ["CFA", false]]);
  assert.deepEqual(exams[0].sections, ["Math", "Reading and Writing"]);
  assert.ok(exams.slice(1).every((x) => Object.keys(x).sort().join() === "id,name,ready,short_name"), "nothing from a config");
  assert.equal((await call("/api/exam?exam=sat")).data.id, "sat");
  assert.equal((await call("/api/exam?exam=gre")).status, 404);
  assert.equal((await call("/api/learners", { age_13_plus: true, exam_id: "gre" })).status, 400);
  // A learner made in one call with the setup answers, then placement over every section.
  const r = (await call("/api/learners", { age_13_plus: true, exam_id: "sat", profile: { not_booked: true, daily_minutes: 15, target_score: 1400 } })).data;
  learner = r.id;
  const prof = (await call("/api/profile")).data;
  assert.deepEqual([prof.onboarded, prof.not_booked, prof.daily_minutes, prof.target_score], [true, true, 15, 1400]);
  const quiz = (await call("/api/lessons", { placement: true, all_sections: true })).data;
  assert.equal(quiz.items.length, 16, "2 a domain over 8 domains");
  const rw = quiz.items.filter((i) => i.skill_id.startsWith("rw-")).length;
  assert.equal(rw, 8, "both sections");
  for (const it of quiz.items) await call("/api/answers", { lesson_id: quiz.lesson_id, item_id: it.id, response: it.answer, time_ms: 2000 });
  const done = (await call("/api/lessons/finish", { lesson_id: quiz.lesson_id })).data;
  assert.equal(done.placement.total_skills, 29, "the whole exam");
  assert.ok(done.placement.tested_out.some((x) => x.id.startsWith("rw-")) && done.placement.tested_out.some((x) => !x.id.startsWith("rw-")));
  const path = PathResponse.parse((await call("/api/path")).data);
  assert.ok(path.units.some((u) => u.section_kind === "words"));
  learner = undefined;
}

assert.equal((await call("/api/learners", {})).status, 403, "no learner without the age answer");
assert.equal((await call("/api/learners", { age_13_plus: false })).status, 403);
learner = (await call("/api/learners", { age_13_plus: true })).data.id;
assert.match(learner, /^[a-f0-9]{32}$/);

assert.equal((await call("/api/tree")).status, 200);
{
  const t = (await call("/api/tree")).data;
  assert.ok(t.sections.length >= 1 && t.sections[0].id === "sat-math", "sections listed, Math first");
  assert.ok(t.domains.every((d) => d.section_id), "every domain has a section");
  assert.equal((await call("/api/lessons", { placement: true, section: "nope" })).status, 404, "unknown section");
}
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
assert.equal(f1.stats.lessons_today_no_placement, 1);
assert.equal(f1.stats.recent_days.length, 1, "today is a lesson day");
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
assert.equal(pf.stats.lessons_today, 1, "placement keeps the streak");
assert.equal(pf.stats.lessons_today_no_placement, 0, "but isn't the day's first lesson");
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

// v1.5: test-date profile, the plan, and practice mode.
learner = (await call("/api/learners", { age_13_plus: true })).data.id;
{
  const localDay = (offsetDays = 0) => new Date(Date.now() - 300 * 60_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
  const t0 = (await call("/api/tree")).data;
  assert.equal(t0.profile.onboarded, false, "no profile yet");

  // A plan works before onboarding: "not booked", 8 weeks from today.
  const p0 = (await call("/api/plan")).data;
  assert.equal(p0.exam_date_assumed, true);
  assert.equal(p0.days_left, 56);
  assert.equal(p0.phase, "learn");

  // Validation.
  assert.equal((await call("/api/profile", { exam_date: "2020-01-01" })).status, 400, "past date");
  assert.equal((await call("/api/profile", { exam_date: "next tuesday" })).status, 400, "not a date");
  assert.equal((await call("/api/profile", { exam_date: localDay(800) })).status, 400, "over 2 years out");
  assert.equal((await call("/api/profile", { daily_minutes: 30 })).status, 400, "minutes must be 5/10/15/20");
  assert.equal((await call("/api/profile", { target_score: "lots" })).status, 400);

  const examDate = localDay(60);
  const prof = (await call("/api/profile", { exam_date: examDate, target_score: 1400, daily_minutes: 20 })).data;
  assert.deepEqual(
    { onboarded: prof.onboarded, exam_date: prof.exam_date, not_booked: prof.not_booked, target_score: prof.target_score, daily_minutes: prof.daily_minutes, plan_started_at: prof.plan_started_at },
    { onboarded: true, exam_date: examDate, not_booked: false, target_score: 1400, daily_minutes: 20, plan_started_at: localDay() },
  );
  assert.deepEqual((await call("/api/profile")).data, prof);
  assert.equal((await call("/api/tree")).data.profile.exam_date, examDate);
  // Only given fields change.
  assert.equal((await call("/api/profile", { daily_minutes: 15 })).data.exam_date, examDate);
  await call("/api/profile", { daily_minutes: 20 });

  let plan = (await call("/api/plan")).data;
  assert.equal(plan.exam_date, examDate);
  assert.equal(plan.days_left, 60);
  assert.equal(plan.phase, "learn");
  assert.equal(plan.profile.target_score, 1400);
  assert.ok(Math.abs(plan.minutes_planned - 20) <= 5, `planned ${plan.minutes_planned}`);
  assert.ok(plan.weeks.length >= 9 && plan.weeks[plan.weeks.length - 1].end === examDate);
  assert.equal(plan.skills_total, 29);

  // Start the first lesson task exactly as the plan says, and finish it.
  const task = plan.today.find((x) => x.kind === "lesson");
  const l = (await call(task.start.path, task.start.body)).data;
  assert.equal(l.items.length, 8);
  for (const it of l.items) await call("/api/answers", { lesson_id: l.lesson_id, item_id: it.id, response: it.answer, time_ms: 3000 });
  await call("/api/lessons/finish", { lesson_id: l.lesson_id });
  plan = (await call("/api/plan")).data;
  assert.equal(plan.today.find((x) => x.id === task.id).done, true, "finished lesson marks its task done");
  assert.ok(plan.today.find((x) => x.id === task.id), "and the task stays on the list");

  // Nothing missed yet: no mistakes session.
  assert.equal((await call("/api/practice", { mode: "mistakes" })).status, 404);
  assert.equal((await call("/api/practice", { mode: "nope" })).status, 400);
  assert.equal((await call("/api/practice", { mode: "skill" })).status, 400, "a drill needs a skill");
  assert.equal((await call("/api/practice", { mode: "skill", skill_id: "adv-nonlinear-eq" })).status, 403, "locked skill");

  // Mixed practice: same shape as a lesson; miss three, then finish.
  const mx = (await call("/api/practice", { mode: "mixed", n: 10 })).data;
  assert.equal(mx.practice, true);
  assert.equal(mx.mode, "mixed");
  assert.equal(mx.items.length, 10);
  assert.equal(new Set(mx.items.map((i) => i.id)).size, 10, "no repeats in a session");
  assert.ok(mx.items.every((i) => i.choices || i.type === "spr"));
  assert.ok(mx.items.every((i) => !l.items.some((seen) => seen.id === i.id)), "unseen questions first");
  const missed = [];
  for (const [i, it] of mx.items.entries()) {
    const r = (await call("/api/answers", { lesson_id: mx.lesson_id, item_id: it.id, response: i < 3 ? wrong(it) : it.answer, time_ms: 4000 })).data;
    assert.equal(r.correct, i >= 3);
    if (i < 3) missed.push(it.id);
  }
  const mf = (await call("/api/lessons/finish", { lesson_id: mx.lesson_id })).data;
  assert.equal(mf.correct, 7);
  assert.equal(mf.total, 10);
  assert.equal(mf.xp, 7 * 10 + 15, "practice earns XP like a lesson");
  assert.equal(mf.stats.lessons_today, 2);
  assert.equal(mf.stats.streak, 1);

  // My mistakes: exactly the three misses.
  const ms = (await call("/api/practice", { mode: "mistakes" })).data;
  assert.deepEqual(ms.items.map((i) => i.id).sort(), [...missed].sort());

  // Weak spots, a skill drill, a timed set.
  const wk = (await call("/api/practice", { mode: "weak", n: 6 })).data;
  assert.equal(wk.items.length, 6);
  const dr = (await call("/api/practice", { mode: "skill", skill_id: task.skill_id, n: 5 })).data;
  assert.equal(dr.skill_id, task.skill_id);
  assert.ok(dr.items.every((i) => i.skill_id === task.skill_id));
  assert.ok(dr.items.every((i) => !l.items.some((seen) => seen.id === i.id)), "drill skips seen questions while unseen remain");
  const tm = (await call("/api/practice", { mode: "timed", n: 8 })).data;
  assert.equal(tm.items.length, 8);
  assert.ok(tm.time_limit_seconds >= 8 * 60 && tm.time_limit_seconds <= 8 * 100, `time limit ${tm.time_limit_seconds}`);
  assert.equal((await call("/api/practice", { mode: "mixed", section: "nope" })).status, 404);
  const rwOnly = (await call("/api/practice", { mode: "mixed", section: "sat-rw", n: 4 })).data;
  assert.ok(rwOnly.items.every((i) => i.skill_id.startsWith("rw-")), "section filter");

  // Fresh questions fall back to the bank when Claude isn't available (no key in dev).
  const fr = await call("/api/practice", { mode: "fresh" });
  assert.equal(fr.status, 200);
  assert.equal(fr.data.mode, "fresh");
  if (!fr.data.fresh) {
    assert.equal(fr.data.generated, 0);
    assert.match(fr.data.note, /bank/);
  }
  assert.ok(fr.data.items.length >= 3);

  // Summary.
  const sm = (await call("/api/practice/summary")).data;
  assert.ok(sm.totals.bank >= 3000);
  assert.equal(sm.totals.seen, 8 + 10);
  assert.equal(sm.totals.missed, 3);
  assert.equal(sm.totals.unseen, sm.totals.bank - sm.totals.seen);
  assert.equal(sm.skills.length, 29);
  assert.equal(sm.fresh.daily_limit, 20);

  // A mixed practice task in the plan is done once a mixed session is finished.
  plan = (await call("/api/plan")).data;
  const mixedTask = plan.today.find((x) => x.mode === "mixed");
  if (mixedTask) assert.equal(mixedTask.done, true);

  // Not booked: no date, plan assumes one 8 weeks out.
  const nb = (await call("/api/profile", { not_booked: true })).data;
  assert.equal(nb.exam_date, null);
  assert.equal(nb.not_booked, true);
  assert.equal(nb.assumed_exam_date, localDay(56));
  plan = (await call("/api/plan")).data;
  assert.equal(plan.exam_date_assumed, true);
}

// The export carries everything above.
{
  const ex = await call("/api/learner/export");
  assert.equal(ex.status, 200);
  assert.equal(ex.data.learner.id, learner);
  assert.ok(ex.data.attempts.length >= 18, "attempts exported");
  assert.ok(ex.data.lessons.length >= 2, "lessons exported");
  assert.ok(Array.isArray(ex.data.tutor_turns), "Socrates chats exported (this learner had none)");
  assert.ok(ex.data.skills.length >= 1);
  assert.equal(ex.data.learner.not_booked, undefined);
  assert.equal(ex.data.learner.exam_date, null, "the learner just switched to not booked");
}

// The Learn path: one current circle; finish it and the next one opens.
{
  learner = (await call("/api/learners", { age_13_plus: true })).data.id;
  const finish = async (start) => {
    const l = await call(start.path, start.body);
    assert.equal(l.status, 200, JSON.stringify(l.data));
    for (const it of l.data.items) await call("/api/answers", { lesson_id: l.data.lesson_id, item_id: it.id, response: it.answer, time_ms: 3000 });
    return (await call("/api/lessons/finish", { lesson_id: l.data.lesson_id })).data;
  };
  const nodes = (p) => [...p.units.flatMap((u) => u.nodes), p.end];
  let p = (await call("/api/path")).data;
  assert.ok(PathResponse.safeParse(p).success, JSON.stringify(PathResponse.safeParse(p).error?.issues?.slice(0, 3)));
  assert.equal(nodes(p).filter((n) => n.state === "current").length, 1);
  assert.equal(p.current, `skill:${p.units[0].nodes[0].skill_id}`, "the first unit's first skill");
  assert.equal(p.current, "skill:alg-linear-eq-1var");
  assert.equal(p.units.length, 8);
  assert.equal(p.stats.xp, 0);
  // Walk the first three circles, then the review after them.
  for (let i = 0; i < 3; i++) {
    const cur = nodes(p).find((n) => n.state === "current");
    assert.equal(cur.kind, "skill");
    await finish(cur.start);
    const next = (await call("/api/path")).data;
    assert.equal(nodes(next).find((n) => n.id === cur.id).state, "done", `${cur.id} done`);
    assert.notEqual(next.current, cur.id);
    p = next;
  }
  assert.equal(p.current, "review:alg:1");
  const review = nodes(p).find((n) => n.id === p.current);
  assert.equal(review.start.body.mode, "review");
  const rf = await finish(review.start);
  assert.ok(rf.total > 0);
  p = (await call("/api/path")).data;
  assert.equal(nodes(p).find((n) => n.id === "review:alg:1").state, "done");
  assert.equal(p.current, "skill:alg-systems");
  assert.ok(p.stats.xp > 0 && p.stats.streak === 1);
  // A skill the engine keeps locked still refuses a lesson, path or not.
  assert.equal((await call("/api/lessons", { skill_id: "adv-nonlinear-eq", node: "skill:adv-nonlinear-eq" })).status, 403);
  assert.equal((await call("/api/practice", { mode: "review", n: 5 })).status, 200, "review practice works without skill ids");
  // The plan's lessons today are the path's.
  const plan = (await call("/api/plan")).data;
  assert.ok(plan.today.filter((t) => t.kind === "lesson").every((t) => t.skill_id.startsWith("alg-")));
}

// A start can't claim a circle the path doesn't offer, and work elsewhere closes no circle.
{
  learner = (await call("/api/learners", { age_13_plus: true })).data.id;
  const run = async (body) => {
    const l = await call("/api/practice", body);
    assert.equal(l.status, 200, JSON.stringify(l.data));
    for (const it of l.data.items) await call("/api/answers", { lesson_id: l.data.lesson_id, item_id: it.id, response: it.answer, time_ms: 3000 });
    return (await call("/api/lessons/finish", { lesson_id: l.data.lesson_id })).data;
  };
  const state = (p, id) => [...p.units.flatMap((u) => u.nodes), p.end].find((n) => n.id === id).state;
  await run({ mode: "weak", n: 1, node: "check:alg" });
  let p = (await call("/api/path")).data;
  assert.equal(state(p, "check:alg"), "locked", "a locked check isn't recorded");
  // A Practice drill in the next unit closes neither Algebra's review nor its check.
  await run({ mode: "skill", skill_id: "rw-words-context", n: 8 });
  p = (await call("/api/path")).data;
  assert.equal(state(p, "review:alg:1"), "locked");
  assert.equal(state(p, "check:alg"), "locked");
  assert.equal(p.current, "skill:alg-linear-eq-1var");
  const ex = (await call("/api/learner/export")).data;
  assert.ok(ex.lessons.every((l) => l.node == null), "no node recorded, so no unit-check bonus either");
}

// Deleting a learner removes them.
assert.equal((await call("/api/learner/delete", {})).status, 200);
assert.equal((await call("/api/tree")).status, 401, "deleted learner is gone");

console.log(`e2e ok (offline Socrates: ${s1.data.offline === true})`);
