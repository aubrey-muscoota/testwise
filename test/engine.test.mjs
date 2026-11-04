import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pCorrect, updateLearner, updateItem, masteryPct, isMastered, isUnlocked,
  pickLesson, nextReview, streak, localDay, isCorrect, seededRandom, DAY_MS, LESSON_SIZE,
} from "../worker/engine.js";

test("pCorrect is 0.5 at equal ratings and rises with learner rating", () => {
  assert.equal(pCorrect(0, 0), 0.5);
  assert.ok(pCorrect(1, 0) > 0.7);
  assert.ok(pCorrect(-1, 0) < 0.3);
});

test("ratings move the right way and stay bounded", () => {
  assert.ok(updateLearner(0, 0, 0, true) > 0);
  assert.ok(updateLearner(0, 0, 0, false) < 0);
  // A right answer on an easy item moves you less than on a hard one.
  assert.ok(updateLearner(0, 0, -2, true) < updateLearner(0, 0, 2, true));
  // Items that people miss get harder.
  assert.ok(updateItem(0, 0, false) > 0);
  assert.ok(updateItem(3, 0, false) <= 3);
});

test("mastery needs both accuracy and volume", () => {
  assert.equal(masteryPct(2, 0), 0);
  assert.equal(isMastered(3, 5), false);
  assert.equal(isMastered(3, 20), true);
  assert.equal(isMastered(-1, 50), false);
});

test("a learner who keeps answering correctly reaches mastery in a few lessons", () => {
  let r = 0, n = 0;
  for (let i = 0; i < 24; i++) { r = updateLearner(r, n, 0.5, true); n++; }
  assert.ok(isMastered(r, n), `rating ${r}`);
});

test("skills unlock after practice on every prerequisite", () => {
  const skill = { id: "b", prereqs: ["a", "c"] };
  assert.equal(isUnlocked({ id: "a", prereqs: [] }, {}), true);
  assert.equal(isUnlocked(skill, { a: { attempts: 8 } }), false);
  assert.equal(isUnlocked(skill, { a: { attempts: 8 }, c: { attempts: 9 } }), true);
});

const items = Array.from({ length: 27 }, (_, i) => ({ id: `q${i}`, rating: [-1, 0, 1][Math.floor(i / 9)] }));

test("a lesson has the right size, no repeats, and puts due reviews first", () => {
  const lesson = pickLesson({ items, learnerRating: 0, lastSeen: new Map([["q3", 1]]), dueReviewIds: ["q3", "nope"], rand: seededRandom(1) });
  assert.equal(lesson.length, LESSON_SIZE);
  assert.deepEqual(lesson[0], { id: "q3", review: true });
  assert.equal(new Set(lesson.map((x) => x.id)).size, LESSON_SIZE);
});

test("new questions track the learner's level", () => {
  const avg = (r) => {
    const l = pickLesson({ items, learnerRating: r, lastSeen: new Map(), dueReviewIds: [], rand: seededRandom(r) });
    const byId = new Map(items.map((x) => [x.id, x.rating]));
    return l.reduce((s, x) => s + byId.get(x.id), 0) / l.length;
  };
  assert.ok(avg(-2) < avg(2), `${avg(-2)} vs ${avg(2)}`);
});

test("when everything has been seen, the oldest come back", () => {
  const lastSeen = new Map(items.map((it, i) => [it.id, 1000 + i]));
  const l = pickLesson({ items, learnerRating: 0, lastSeen, dueReviewIds: [], rand: seededRandom(2) });
  assert.equal(l.length, LESSON_SIZE);
  assert.ok(l.every((x) => Number(x.id.slice(1)) < LESSON_SIZE));
});

test("spaced review: miss → tomorrow, success → longer, then graduates", () => {
  const now = 1_000_000;
  assert.equal(nextReview(null, true, now), null);
  let r = nextReview(null, false, now);
  assert.equal(r.due_at, now + DAY_MS);
  r = nextReview(r, true, now); assert.equal(r.interval_days, 2.5);
  r = nextReview(r, true, now); assert.equal(r.interval_days, 6.25);
  r = nextReview(r, true, now); assert.equal(r.interval_days, 15.625);
  assert.equal(nextReview(r, true, now), null);
  assert.equal(nextReview(r, false, now).interval_days, 1);
});

test("streaks count consecutive days and survive until the day ends", () => {
  assert.equal(streak([], "2026-11-04"), 0);
  assert.equal(streak(["2026-11-04", "2026-11-03", "2026-11-01"], "2026-11-04"), 2);
  assert.equal(streak(["2026-11-03", "2026-11-02"], "2026-11-04"), 2);
  assert.equal(streak(["2026-11-02"], "2026-11-04"), 0);
  assert.equal(streak(["2026-03-01", "2026-02-28"], "2026-03-01"), 2);
});

test("local day respects the learner's time zone", () => {
  const t = Date.UTC(2026, 10, 5, 2, 0); // 02:00 UTC Nov 5 = 21:00 Nov 4 in New York
  assert.equal(localDay(t, 300), "2026-11-04");
  assert.equal(localDay(t, 0), "2026-11-05");
});

test("answer checking", () => {
  const mc = { type: "mc", answer: "14/5" };
  assert.ok(isCorrect(mc, "14/5"));
  assert.ok(!isCorrect(mc, "2.8")); // multiple choice is exact
  const spr = { type: "spr", answer: "1/2", accept: [] };
  for (const r of ["1/2", "0.5", ".5", " 0.50 "]) assert.ok(isCorrect(spr, r), r);
  assert.ok(!isCorrect(spr, "2"));
  assert.ok(isCorrect({ type: "spr", answer: "-3" }, "−3"));
  assert.ok(isCorrect({ type: "spr", answer: "1,200" }, "1200"));
  assert.ok(!isCorrect(spr, ""));
  assert.ok(!isCorrect(spr, "1/0"));
});
