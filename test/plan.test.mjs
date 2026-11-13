import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPlan, addDays, daysBetween, effectiveExamDate, testReadyDays, prepareSkills, unitOrder, pathOrder, isDay, normalizeMinutes,
} from "../worker/plan.js";

// The real SAT skill map and domain weights from the exam pack.
const map = JSON.parse(readFileSync(new URL("../exams/sat/skills.json", import.meta.url)));
const SKILLS = [];
for (const sec of map.sections) for (const d of sec.domains) for (const s of d.skills) {
  SKILLS.push({ id: s.id, name: s.name, official_name: s.official_name, prereqs: s.prereqs, section_id: sec.id, domain_id: d.id, domain_name: d.name, domain_official_name: d.official_name, domain_weight: d.weight, position: SKILLS.length });
}
const PACE = { "sat-math": { practice_minutes: 1, timed_seconds: 95 }, "sat-rw": { practice_minutes: 1.2, timed_seconds: 71 } };
const TODAY = "2026-11-08";

const fresh = () => SKILLS.map((s) => ({ ...s, attempts: 0, mastery: 0 }));
// Every skill started, with mastery from a given function.
const allStarted = (mastery = () => 60) => SKILLS.map((s, i) => ({
  ...s, attempts: 16, mastery: mastery(s, i), first_day: addDays(TODAY, -40), last_day: addDays(TODAY, -2), recent: { correct: 5, total: 8 },
}));

const plan = (o) => buildPlan({ today: TODAY, daily_minutes: 20, reviews_due: 0, pace: PACE, active_days: [addDays(TODAY, -1)], ...o });
const examIn = (days) => addDays(TODAY, days);

test("date helpers", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(daysBetween("2026-11-08", "2027-02-06"), 90);
  assert.ok(isDay("2027-02-28") && !isDay("2027-02-30") && !isDay("tomorrow"));
});

test("phases at 90, 30, 10, 3, 1, 0 and -1 days on a 90-day plan", () => {
  const start = addDays(TODAY, -0);
  // Started 90 days before the exam; state roughly what a learner would have by then.
  const at = (left, skills) => buildPlan({
    today: addDays(examIn(90), -left), exam_date: examIn(90), plan_started_at: start,
    daily_minutes: 20, skills, reviews_due: 3, pace: PACE,
  }).phase;
  assert.equal(at(90, fresh()), "learn");
  assert.equal(at(30, allStarted()), "strengthen");
  assert.equal(at(10, allStarted()), "test_ready");
  assert.equal(at(3, allStarted()), "test_ready");
  assert.equal(at(1, allStarted()), "rest");
  assert.equal(at(0, allStarted()), "rest");
  assert.equal(at(-1, allStarted()), "after");
});

test("test-ready is about 15% of a long runway, 7–10 days, and shrinks on short ones", () => {
  assert.equal(testReadyDays(56), 7);
  assert.equal(testReadyDays(90), 10);
  assert.equal(testReadyDays(200), 10);
  assert.equal(testReadyDays(60), 9);
  assert.ok(testReadyDays(5) >= 2 && testReadyDays(5) <= 3);
});

test("the day before the test is a rest day with only light review", () => {
  const p = plan({ exam_date: examIn(1), plan_started_at: addDays(TODAY, -60), skills: allStarted(), reviews_due: 12 });
  assert.equal(p.phase, "rest");
  assert.ok(p.today.some((t) => t.kind === "rest"));
  const review = p.today.filter((t) => t.kind === "review");
  assert.ok(review.reduce((a, t) => a + t.n, 0) <= 5);
  assert.ok(!p.today.some((t) => t.kind === "lesson" || t.kind === "practice"));
  assert.match(p.status.message, /tomorrow/);
});

test("after the test date: gentle message, practice still offered, no weeks", () => {
  const p = plan({ exam_date: examIn(-1), plan_started_at: addDays(TODAY, -60), skills: allStarted() });
  assert.equal(p.phase, "after");
  assert.ok(p.today.some((t) => t.kind === "practice"));
  assert.equal(p.weeks.length, 0);
  assert.match(p.status.message, /passed/);
});

test("today's tasks add up to the daily time (±25%) across phases and settings", () => {
  const cases = [];
  for (const minutes of [5, 10, 15, 20]) {
    for (const [left, skills, reviews] of [[90, fresh(), 0], [60, fresh(), 6], [40, allStarted(), 9], [8, allStarted(), 4], [3, allStarted(), 4], [200, fresh(), 0]]) {
      cases.push({ minutes, left, skills, reviews });
    }
  }
  for (const c of cases) {
    const p = plan({ exam_date: examIn(c.left), plan_started_at: TODAY, daily_minutes: c.minutes, skills: c.skills, reviews_due: c.reviews, mistakes: 7 });
    const sum = p.today.reduce((a, t) => a + t.minutes, 0);
    assert.ok(Math.abs(sum - c.minutes) <= 0.25 * c.minutes, `${c.minutes} min, ${c.left} days, ${p.phase}: planned ${sum} (${p.today.map((t) => `${t.id}:${t.minutes}`).join(" ")})`);
    assert.equal(p.minutes_planned, Math.round(sum * 10) / 10);
  }
});

test("daily time is read as one of today's options: 30 and 45 become 20", () => {
  for (const [m, want] of [[5, 5], [10, 10], [15, 15], [20, 20], [30, 20], [45, 20], [12, 10], [3, 5], [null, null], [undefined, null]]) {
    assert.equal(normalizeMinutes(m, [5, 10, 15, 20]), want, `${m}`);
  }
  assert.equal(normalizeMinutes(20, [15, 30]), 15, "another pack's options");
  assert.equal(normalizeMinutes(45), 20, "the fallback options");
  // The plan paces an old 45-minute learner as a 20-minute one.
  const old = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh(), daily_minutes: 45 });
  assert.equal(old.daily_minutes, 20);
});

test("each daily goal's setup description matches a first learn day", () => {
  // The words in the app's goal step (app/src/setup/GoalStep.tsx): lessons on day one.
  const lessons = { 5: 1, 10: 1, 15: 1, 20: 2 };
  for (const [m, n] of Object.entries(lessons)) {
    const p = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh(), daily_minutes: Number(m) });
    assert.equal(p.phase, "learn");
    assert.equal(p.today.filter((t) => t.kind === "lesson").length, n, `${m} minutes`);
    const other = p.today.filter((t) => t.kind !== "lesson");
    if (Number(m) === 5) assert.equal(other.length, 0, "5 minutes is one lesson and nothing else");
    else assert.ok(other.length >= 1, `${m} minutes has more than the lesson`);
  }
});

test("every task has a stable id, a title, a plain why and a way to start it", () => {
  const p = plan({ exam_date: examIn(40), plan_started_at: addDays(TODAY, -20), skills: allStarted((s, i) => 30 + i * 2), reviews_due: 11, mistakes: 9 });
  const ids = p.today.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of p.today) {
    assert.ok(t.title && t.why && t.why.length > 15, t.id);
    assert.ok(t.kind === "rest" || t.start?.path?.startsWith("/api/"), t.id);
    assert.equal(typeof t.done, "boolean");
  }
  // The weak-spots why names the learner's actual weakest skill and their result.
  const weak = p.today.find((t) => t.mode === "weak");
  assert.ok(weak, "strengthen phase has weak spots");
  assert.match(weak.why, /Every skill is started; now we fix the weak ones/);
  assert.match(weak.why, /You got 5 of your last 8 right on /);
  // Same input, same plan.
  assert.deepEqual(plan({ exam_date: examIn(40), plan_started_at: addDays(TODAY, -20), skills: allStarted((s, i) => 30 + i * 2), reviews_due: 11, mistakes: 9 }).today, p.today);
});

test("weak spots are chosen by weight × (1 − mastery)", () => {
  // A heavy-domain skill at 50% beats a light one at 40%.
  const skills = allStarted((s) => (s.id === "alg-systems" ? 50 : s.id === "geo-circles" ? 40 : 95));
  const p = plan({ exam_date: examIn(40), plan_started_at: addDays(TODAY, -20), skills });
  const weak = p.today.find((t) => t.mode === "weak");
  assert.equal(weak.skill_ids[0], "alg-systems");
  assert.ok(weak.skill_ids.includes("geo-circles"));
});

test("learn phase: sections alternate unit by unit, and today's lessons follow the path", () => {
  const skills = prepareSkills(fresh());
  const units = unitOrder(skills);
  // Sections take turns by share of skills placed; Math comes first in the exam.
  assert.deepEqual(units.map((u) => u.id), ["alg", "rw-cs", "adv", "rw-ii", "psda", "rw-sec", "geo", "rw-eoi"]);
  const p = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh() });
  const lessons = p.today.filter((t) => t.kind === "lesson").map((t) => t.skill_id);
  assert.ok(lessons.length >= 1);
  // The first lessons of the path, each one's prerequisites started or earlier in today's list.
  assert.deepEqual(lessons, pathOrder(skills).slice(0, lessons.length).map((s) => s.id));
  for (const [i, id] of lessons.entries()) {
    const pre = SKILLS.find((s) => s.id === id).prereqs;
    assert.ok(pre.every((x) => lessons.slice(0, i).includes(x)), `${id} needs ${pre}`);
  }
});

test("the weeks start skills in path order", () => {
  const p = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh() });
  const started = p.weeks.filter((w) => w.phase === "learn").flatMap((w) => w.focus_skill_ids);
  assert.deepEqual(started, pathOrder(prepareSkills(fresh())).map((s) => s.id));
});

test("all skills are covered before strengthen, by about 60% of the runway", () => {
  for (const total of [56, 90, 120]) {
    const p = plan({ exam_date: examIn(total), plan_started_at: TODAY, skills: fresh() });
    const learnWeeks = p.weeks.filter((w) => w.phase === "learn");
    const firstStrengthen = p.weeks.findIndex((w) => w.phase === "strengthen");
    assert.ok(firstStrengthen > 0, `${total}: has a strengthen phase`);
    assert.ok(p.weeks.slice(firstStrengthen).every((w) => w.phase !== "learn"), "learn never comes back");
    const covered = new Set(learnWeeks.flatMap((w) => w.focus_skill_ids));
    assert.equal(covered.size, SKILLS.length, `${total}: every skill gets a start week`);
    const lastLearnDay = learnWeeks[learnWeeks.length - 1].end;
    assert.ok(daysBetween(TODAY, lastLearnDay) <= Math.ceil(0.6 * total), `${total}: learn ends ${lastLearnDay}`);
    assert.equal(p.weeks[p.weeks.length - 1].phase, "rest");
    assert.equal(p.weeks[p.weeks.length - 1].end, examIn(total));
  }
});

test("weeks are contiguous and never span two phases", () => {
  const p = plan({ exam_date: examIn(75), plan_started_at: TODAY, skills: fresh() });
  for (let i = 0; i < p.weeks.length; i++) {
    const w = p.weeks[i];
    assert.ok(daysBetween(w.start, w.end) >= 0 && daysBetween(w.start, w.end) < 7);
    // A week names its skills, one per line, or says what it is for. No template sentence, no trailing period.
    assert.ok(w.focus_names.length || (w.goal && w.goal.length > 3), JSON.stringify(w));
    if (w.goal) assert.ok(!w.goal.endsWith("."), w.goal);
    if (w.focus_names.length) assert.equal(w.goal, null);
    if (i) assert.equal(daysBetween(p.weeks[i - 1].end, w.start), 1);
  }
  assert.equal(p.weeks[0].start, TODAY);
});

test("short runway (5 days) compresses: learn the heaviest skills, then test-ready, then rest", () => {
  const p = plan({ exam_date: examIn(5), plan_started_at: TODAY, skills: fresh() });
  assert.equal(p.phase, "learn");
  assert.match(p.status.message, /isn't enough to start all 29 skills/);
  const phases = p.weeks.map((w) => w.phase);
  assert.deepEqual([...new Set(phases)], ["learn", "test_ready", "rest"]);
  const lessons = p.today.filter((t) => t.kind === "lesson");
  // The first lesson is the heaviest open skill of the first section, and the
  // units go by points per lesson within each section.
  const prepared = prepareSkills(fresh());
  const first = prepared.find((x) => x.id === lessons[0].skill_id);
  const open = prepared.filter((x) => x.section_id === "sat-math" && !x.prereqs.length);
  assert.equal(first.section_id, "sat-math");
  assert.equal(first.weight, Math.max(...open.map((x) => x.weight)));
  const units = unitOrder(prepared, { byWeight: true });
  for (const sec of ["sat-math", "sat-rw"]) {
    const per = units.filter((u) => u.section_id === sec && !u.skills.some((s) => s.prereqs.some((x) => !u.skills.some((y) => y.id === x))))
      .map((u) => u.skills[0].weight);
    assert.deepEqual(per, [...per].sort((x, y) => y - x), sec);
  }
});

test("long runway (8 months): at most one new skill a day, spread out, more review", () => {
  const p = plan({ exam_date: examIn(240), plan_started_at: TODAY, skills: fresh(), reviews_due: 20 });
  assert.equal(p.phase, "learn");
  assert.equal(p.today.filter((t) => t.kind === "lesson").length, 1);
  const learn = p.weeks.filter((w) => w.phase === "learn");
  assert.ok(learn.every((w) => w.focus_skill_ids.length <= 7));
  assert.ok(learn.length >= 10, "new skills are spread over months, not crammed into weeks");
  const reviews = p.today.filter((t) => t.kind === "review").reduce((a, t) => a + t.n, 0);
  assert.ok(reviews >= 8, `reviews ${reviews}`);
  // A day after a new lesson on a long runway, there's no new lesson.
  const skills = fresh().map((s) => (s.id === "alg-linear-eq-1var" ? { ...s, attempts: 8, mastery: 50, first_day: TODAY } : s));
  const next = buildPlan({ today: addDays(TODAY, 1), exam_date: examIn(240), plan_started_at: TODAY, daily_minutes: 20, skills, reviews_due: 0, pace: PACE });
  assert.equal(next.today.filter((t) => t.kind === "lesson").length, 0);
  assert.ok(next.today.some((t) => t.kind === "practice"));
});

test("missed days put the learner behind and today's plan catches up", () => {
  // 30 days into a 90-day plan with only 4 skills started.
  const skills = fresh().map((s, i) => (i < 4 && !s.prereqs.length ? { ...s, attempts: 8, mastery: 50, first_day: addDays(TODAY, -30) } : s));
  const started = skills.filter((s) => s.attempts).length;
  const behind = buildPlan({
    today: TODAY, exam_date: examIn(60), plan_started_at: addDays(TODAY, -30), daily_minutes: 30,
    skills, reviews_due: 0, pace: PACE, active_days: [],
  });
  assert.equal(behind.phase, "learn");
  assert.ok(behind.status.behind_by_lessons > 0, JSON.stringify(behind.status));
  assert.equal(behind.status.on_track, false);
  assert.match(behind.status.message, /behind/);
  assert.equal(behind.status.missed_yesterday, true);
  // Same learner on pace: on track.
  const onPace = buildPlan({
    today: TODAY, exam_date: examIn(60), plan_started_at: addDays(TODAY, -2), daily_minutes: 30,
    skills, reviews_due: 0, pace: PACE, active_days: [addDays(TODAY, -1)],
  });
  assert.equal(onPace.status.behind_by_lessons, 0);
  assert.equal(onPace.status.on_track, true);
  // Behind means more new lessons today than on pace.
  const n = (p) => p.today.filter((t) => t.kind === "lesson").length;
  assert.ok(n(behind) >= n(onPace) && n(behind) >= 2, `${n(behind)} vs ${n(onPace)} (started ${started})`);
});

test("ahead counts skills started past the even pace by tonight, and only when not behind", () => {
  // 2 days into a 90-day plan: the even pace line asks for a skill or two by
  // tonight, so 6 started is 4 to 6 ahead.
  const skills = fresh().map((s, i) => (i < 6 ? { ...s, attempts: 8, mastery: 50, first_day: addDays(TODAY, -1) } : s));
  const p = buildPlan({
    today: TODAY, exam_date: examIn(88), plan_started_at: addDays(TODAY, -2), daily_minutes: 20,
    skills, reviews_due: 0, pace: PACE, active_days: [addDays(TODAY, -1)],
  });
  assert.equal(p.phase, "learn");
  assert.equal(p.status.on_track, true);
  assert.equal(p.status.behind_by_lessons, 0);
  assert.ok(p.status.ahead_by_lessons >= 4 && p.status.ahead_by_lessons <= 6, JSON.stringify(p.status));
  // A fresh learner on day one is neither ahead nor behind.
  const f = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh() });
  assert.equal(f.status.ahead_by_lessons, 0);
  assert.equal(f.status.behind_by_lessons, 0);
  // Behind is never also ahead.
  const late = buildPlan({
    today: TODAY, exam_date: examIn(60), plan_started_at: addDays(TODAY, -30), daily_minutes: 20,
    skills: fresh(), reviews_due: 0, pace: PACE, active_days: [],
  });
  assert.ok(late.status.behind_by_lessons > 0);
  assert.equal(late.status.ahead_by_lessons, 0);
});

test("lessons started today close the behind gap at once", () => {
  const base = {
    today: TODAY, exam_date: examIn(60), plan_started_at: addDays(TODAY, -30), daily_minutes: 30,
    reviews_due: 0, pace: PACE, active_days: [],
  };
  const sod = buildPlan({ ...base, skills: fresh() });
  assert.ok(sod.status.behind_by_lessons >= 3, JSON.stringify(sod.status));
  // Two of today's lessons done: two fewer behind, same day.
  const ids = sod.today.filter((t) => t.kind === "lesson").slice(0, 2).map((t) => t.skill_id);
  assert.equal(ids.length, 2);
  const skills = fresh().map((s) => (ids.includes(s.id) ? { ...s, attempts: 8, attempts_today: 8, mastery: 50, first_day: TODAY } : s));
  const now = buildPlan({
    ...base, skills, active_days: [TODAY],
    lessons_today: ids.map((id) => ({ kind: "skill", mode: null, skill_id: id, completed: true })),
  });
  assert.equal(now.status.behind_by_lessons, sod.status.behind_by_lessons - 2);
  assert.equal(now.status.ahead_by_lessons, 0);
});

test("doing exactly today's plan is on track, not ahead; placement is not lessons ahead", () => {
  const f = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: fresh() });
  const ids = f.today.filter((t) => t.kind === "lesson").map((t) => t.skill_id);
  assert.ok(ids.length >= 1);
  const skills = fresh().map((s) => (ids.includes(s.id) ? { ...s, attempts: 8, attempts_today: 8, mastery: 50, first_day: TODAY } : s));
  const after = plan({
    exam_date: examIn(90), plan_started_at: TODAY, skills, active_days: [TODAY],
    lessons_today: ids.map((id) => ({ kind: "skill", mode: null, skill_id: id, completed: true })),
  });
  assert.equal(after.status.on_track, true);
  assert.equal(after.status.ahead_by_lessons, 0, JSON.stringify(after.status));
  // One lesson past today's plan is one ahead.
  const next = prepareSkills(skills).find((s) => !ids.includes(s.id) && !s.prereqs.length);
  const more = skills.map((s) => (s.id === next.id ? { ...s, attempts: 8, attempts_today: 8, mastery: 50, first_day: TODAY } : s));
  const plus = plan({
    exam_date: examIn(90), plan_started_at: TODAY, skills: more, active_days: [TODAY],
    lessons_today: [...ids, next.id].map((id) => ({ kind: "skill", mode: null, skill_id: id, completed: true })),
  });
  assert.equal(plus.status.ahead_by_lessons, 1, JSON.stringify(plus.status));
  // Placement only: skills tested out are not lessons ahead.
  const placed = fresh().map((s, i) => (i < 20 ? { ...s, tested_out: true, mastery: 80 } : s));
  const p = plan({ exam_date: examIn(90), plan_started_at: TODAY, skills: placed });
  assert.equal(p.status.ahead_by_lessons, 0, JSON.stringify(p.status));
  assert.equal(p.status.behind_by_lessons, 0);
});

test("short runway after placement: never ahead, and says so", () => {
  const placed = fresh().map((s, i) => (i < 8 ? { ...s, tested_out: true, mastery: 80 } : s));
  const p = buildPlan({
    today: TODAY, exam_date: examIn(23), plan_started_at: TODAY, daily_minutes: 10,
    skills: placed, reviews_due: 0, pace: PACE, active_days: [],
  });
  assert.equal(p.phase, "learn");
  assert.equal(p.status.short_runway, true, p.status.message);
  assert.match(p.status.message, /isn't enough/);
  assert.equal(p.status.ahead_by_lessons, 0);
});

test("a lesson today ends the missed-two-days state", () => {
  const skills = fresh().map((s, i) => (i < 6 ? { ...s, attempts: 8, mastery: 50, first_day: addDays(TODAY, -5) } : s));
  const base = { today: TODAY, exam_date: examIn(88), plan_started_at: addDays(TODAY, -6), daily_minutes: 20, reviews_due: 0, pace: PACE };
  const missed = buildPlan({ ...base, skills, active_days: [addDays(TODAY, -3)] });
  assert.equal(missed.status.behind_by_lessons, 0, JSON.stringify(missed.status));
  assert.equal(missed.status.on_track, false);
  const back = buildPlan({
    ...base, skills, active_days: [addDays(TODAY, -3), TODAY],
    lessons_today: [{ kind: "practice", mode: "mixed", skill_id: null, completed: true }],
  });
  assert.equal(back.status.on_track, true);
});

test("work done today marks tasks done without changing the list", () => {
  const base = { exam_date: examIn(90), plan_started_at: addDays(TODAY, -5), skills: fresh(), reviews_due: 5 };
  const before = plan(base);
  const lesson = before.today.find((t) => t.kind === "lesson");
  const mixed = before.today.find((t) => t.kind === "practice");
  // The learner does the first lesson (8 answers today) and a review lesson.
  const skills = fresh().map((s) => (s.id === lesson.skill_id ? { ...s, attempts: 8, attempts_today: 8, mastery: 55, first_day: TODAY } : s));
  const after = plan({
    ...base, skills, reviews_due: 0, reviews_done_today: 5,
    lessons_today: [
      { kind: "skill", mode: null, skill_id: lesson.skill_id, completed: true },
      { kind: "skill", mode: null, skill_id: null, completed: true },
      { kind: "practice", mode: mixed.mode, skill_id: null, completed: true },
    ],
  });
  assert.deepEqual(after.today.map((t) => t.id).sort(), before.today.map((t) => t.id).sort(), "same tasks");
  assert.ok(after.today.find((t) => t.id === lesson.id).done);
  assert.ok(after.today.find((t) => t.kind === "review").done);
  assert.ok(after.today.find((t) => t.id === mixed.id).done);
  assert.ok(!after.today.filter((t) => t.kind === "lesson" && t.id !== lesson.id).some((t) => t.done));
  assert.equal(after.today_tasks_done, 3);
  assert.equal(before.phase, after.phase);
  // An unfinished lesson doesn't count.
  const half = plan({ ...base, lessons_today: [{ kind: "skill", skill_id: lesson.skill_id, completed: false }] });
  assert.ok(!half.today.find((t) => t.id === lesson.id).done);
});

test("not booked assumes 8 weeks from plan start, and never gets closer than 4 weeks", () => {
  assert.deepEqual(effectiveExamDate({ exam_date: null, plan_started_at: TODAY, today: TODAY }), { date: examIn(56), assumed: true });
  const late = effectiveExamDate({ exam_date: null, plan_started_at: addDays(TODAY, -50), today: TODAY });
  assert.equal(daysBetween(TODAY, late.date), 28);
  const p = plan({ exam_date: null, plan_started_at: TODAY, skills: fresh() });
  assert.equal(p.exam_date_assumed, true);
  assert.equal(p.days_left, 56);
  assert.match(p.status.message, /assuming a test around/);
  // No profile at all behaves like "not booked" from today.
  const none = plan({ exam_date: null, plan_started_at: null, skills: fresh() });
  assert.equal(none.days_left, 56);
});

test("test-ready: a timed set at test pace plus light review", () => {
  const p = plan({ exam_date: examIn(6), plan_started_at: addDays(TODAY, -80), skills: allStarted(), reviews_due: 30, mistakes: 6 });
  assert.equal(p.phase, "test_ready");
  const timed = p.today.find((t) => t.mode === "timed");
  assert.ok(timed && timed.n >= 5);
  assert.ok(timed.minutes > timed.n, "timed pace is over a minute a question on this mix");
  const review = p.today.filter((t) => t.kind === "review").reduce((a, t) => a + t.n, 0);
  assert.ok(review <= 8, `light review: ${review}`);
});

test("an empty skill list doesn't crash", () => {
  const p = plan({ exam_date: examIn(30), plan_started_at: TODAY, skills: [] });
  assert.ok(Array.isArray(p.today) && Array.isArray(p.weeks));
});

test("the plan's learn-by date is the end of its last learn week", () => {
  for (const total of [40, 75, 125, 200]) {
    const p = plan({ exam_date: examIn(total), plan_started_at: TODAY, skills: fresh() });
    const learn = p.weeks.filter((w) => w.phase === "learn");
    assert.equal(learn[learn.length - 1].end, p.learn_by, `${total} days`);
    // Socrates' status line owns the count and names the same date.
    const [y, m, d] = p.learn_by.split("-").map(Number);
    const short = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    assert.match(p.status.message, new RegExp(`^You've started \\d+ of 29 skills\\. \\d+ to go by ${short}\\.`));
  }
});

test("a lesson task's why doesn't repeat the skills count", () => {
  const p = plan({ exam_date: examIn(75), plan_started_at: TODAY, skills: fresh() });
  for (const t of p.today.filter((t) => t.kind === "lesson")) assert.doesNotMatch(t.why, /left to start/);
});

// The daily goal cards (app/src/setup/goal-copy.ts) say what a learning day
// gives at each goal; check those words against the plan itself.
test("each daily goal's description matches the plan's learning day", async () => {
  const { lessonsFor, goalDetail } = await import("../app/src/setup/goal-copy.ts");
  for (const minutes of [5, 10, 15, 20]) {
    const p = plan({ exam_date: examIn(60), plan_started_at: TODAY, skills: fresh(), daily_minutes: minutes, reviews_due: 3 });
    assert.equal(p.phase, "learn");
    const lessons = p.today.filter((t) => t.kind === "lesson").length;
    assert.equal(lessons, lessonsFor(minutes), `${minutes} min: ${goalDetail(minutes)}`);
    const words = { 1: /^(One lesson|A lesson)/, 2: /^Two lessons/ }[lessons];
    assert.match(goalDetail(minutes), words);
    // Anything past "one lesson" promises more than the lesson.
    if (minutes >= 10) assert.ok(p.today.some((t) => t.kind !== "lesson"), `${minutes} min has more than lessons`);
  }
});
