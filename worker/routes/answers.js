import * as E from "../engine.js";
import { json, fail, parseItem, tzOffset } from "../lib/http.js";

export async function answer(env, request, learnerId, b) {
  const now = Date.now();
  const today = E.localDay(now, tzOffset(request));
  const row = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(String(b.item_id || "")).first();
  if (!row) return fail(404, "unknown item");
  const item = parseItem(row);
  const response = b.response == null ? "" : String(b.response).slice(0, 200);
  const correct = E.isCorrect(item, response);

  // Placement answers are only recorded for scoring: they don't move ratings,
  // progress or the review queue (most probe skills aren't open yet).
  const lesson = b.lesson_id
    ? await env.DB.prepare("SELECT kind FROM lessons WHERE id = ? AND learner_id = ?").bind(String(b.lesson_id), learnerId).first()
    : null;
  if (lesson?.kind === "placement") {
    await env.DB.prepare(
      `INSERT INTO attempts (learner_id, item_id, skill_id, lesson_id, correct, response, time_ms, is_review, answered_at, local_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(learnerId, item.id, item.skill_id, String(b.lesson_id), correct ? 1 : 0, response,
      Number.isFinite(b.time_ms) ? Math.round(b.time_ms) : null, now, today).run();
    return json({ correct, answer: item.answer, mastery: 0, xp: correct ? E.XP_CORRECT : 0 });
  }

  const m = await env.DB.prepare(
    "SELECT rating, attempts, correct FROM skill_mastery WHERE learner_id = ? AND skill_id = ?",
  ).bind(learnerId, item.skill_id).first() || { rating: 0, attempts: 0, correct: 0 };
  const existingReview = await env.DB.prepare(
    "SELECT due_at, interval_days FROM reviews WHERE learner_id = ? AND item_id = ?",
  ).bind(learnerId, item.id).first();

  const newRating = E.updateLearner(m.rating, m.attempts, row.rating, correct);
  const newItemRating = E.updateItem(row.rating, m.rating, correct);
  // Only reschedule a review when it was actually due (or it's a new miss),
  // so re-answering early doesn't skip the spacing.
  const isReview = !!existingReview && existingReview.due_at <= now;
  let review = existingReview;
  if (!correct || isReview) review = E.nextReview(existingReview, correct, now);

  const stmts = [
    env.DB.prepare(
      `INSERT INTO attempts (learner_id, item_id, skill_id, lesson_id, correct, response, time_ms, is_review, answered_at, local_day)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(learnerId, item.id, item.skill_id, b.lesson_id || null, correct ? 1 : 0, response,
      Number.isFinite(b.time_ms) ? Math.round(b.time_ms) : null, isReview ? 1 : 0, now, today),
    env.DB.prepare(
      `INSERT INTO skill_mastery (learner_id, skill_id, rating, attempts, correct, updated_at) VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT (learner_id, skill_id) DO UPDATE SET rating = excluded.rating, attempts = attempts + 1,
       correct = correct + excluded.correct, updated_at = excluded.updated_at`,
    ).bind(learnerId, item.skill_id, newRating, correct ? 1 : 0, now),
    env.DB.prepare("UPDATE items SET rating = ? WHERE id = ?").bind(newItemRating, item.id),
  ];
  if (review && review !== existingReview) {
    stmts.push(env.DB.prepare(
      `INSERT INTO reviews (learner_id, item_id, skill_id, due_at, interval_days) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (learner_id, item_id) DO UPDATE SET due_at = excluded.due_at, interval_days = excluded.interval_days`,
    ).bind(learnerId, item.id, item.skill_id, review.due_at, review.interval_days));
  } else if (!review && existingReview) {
    stmts.push(env.DB.prepare("DELETE FROM reviews WHERE learner_id = ? AND item_id = ?").bind(learnerId, item.id));
  }
  await env.DB.batch(stmts);

  return json({
    correct,
    answer: item.answer,
    mastery: E.masteryPct(newRating, m.attempts + 1),
    xp: correct ? E.XP_CORRECT : 0,
  });
}
