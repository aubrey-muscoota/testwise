import { json, fail } from "../lib/http.js";

// A learner is created only after the app's age question says 13 or older.
export async function createLearner(env, b) {
  if (b.age_13_plus !== true) return fail(403, "age_gate");
  const id = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await env.DB.prepare("INSERT INTO learners (id, created_at, age_confirmed_at) VALUES (?, ?, ?)").bind(id, now, now).run();
  return json({ id });
}

export async function consentState(env, learnerId) {
  const r = await env.DB.prepare("SELECT age_confirmed_at, ai_consent_at FROM learners WHERE id = ?").bind(learnerId).first();
  return { age_confirmed: !!r?.age_confirmed_at, ai_consent: !!r?.ai_consent_at };
}

// Records the age answer (for learners created before the age gate) and/or AI consent.
// ai: false withdraws consent.
export async function setConsent(env, learnerId, b) {
  const now = Date.now();
  const stmts = [];
  if (b.age_13_plus === true) stmts.push(env.DB.prepare("UPDATE learners SET age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?").bind(now, learnerId));
  if (b.ai === true) stmts.push(env.DB.prepare("UPDATE learners SET ai_consent_at = COALESCE(ai_consent_at, ?) WHERE id = ?").bind(now, learnerId));
  if (b.ai === false) stmts.push(env.DB.prepare("UPDATE learners SET ai_consent_at = NULL WHERE id = ?").bind(learnerId));
  if (stmts.length) await env.DB.batch(stmts);
  return json(await consentState(env, learnerId));
}

// Deletes everything stored for this learner. Question reports stay: they only
// carry a 6-character id prefix and are about the question, not the learner.
export async function deleteLearner(env, learnerId) {
  const tables = ["attempts", "skill_mastery", "reviews", "lessons", "tutor_turns"];
  await env.DB.batch([
    ...tables.map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE learner_id = ?`).bind(learnerId)),
    // Questions Claude wrote at this learner's request stay (they're content,
    // shared with everyone); only the link back to the learner goes.
    env.DB.prepare("UPDATE generated_items SET learner_id = NULL WHERE learner_id = ?").bind(learnerId),
    env.DB.prepare("DELETE FROM learners WHERE id = ?").bind(learnerId),
  ]);
  return json({ ok: true });
}

// Everything stored about this learner, as one JSON document they can keep
// ("Download my data" in Me). Questions are referred to by id; their text is
// content, not the learner's data.
export async function exportLearner(env, learnerId) {
  const q = (sql) => env.DB.prepare(sql).bind(learnerId);
  const rows = async (sql) => (await q(sql).all()).results;
  const learner = await q("SELECT id, created_at, age_confirmed_at, ai_consent_at, exam_id, exam_date, target_score, daily_minutes, plan_started_at FROM learners WHERE id = ?").first();
  if (!learner) return fail(401, "unknown learner");
  const [attempts, skills, reviews, lessons, tutor_turns, generated_items] = await Promise.all([
    rows("SELECT item_id, skill_id, lesson_id, correct, response, time_ms, is_review, answered_at, local_day FROM attempts WHERE learner_id = ? ORDER BY answered_at, id"),
    rows("SELECT skill_id, rating, attempts, correct, tested_out, updated_at FROM skill_mastery WHERE learner_id = ? ORDER BY skill_id"),
    rows("SELECT item_id, skill_id, due_at, interval_days FROM reviews WHERE learner_id = ? ORDER BY due_at"),
    rows("SELECT id, kind, mode, skill_id, section_id, started_at, completed_at, correct, total, xp, local_day FROM lessons WHERE learner_id = ? ORDER BY started_at"),
    rows("SELECT item_id, local_day, role, content, created_at FROM tutor_turns WHERE learner_id = ? ORDER BY created_at, id"),
    rows("SELECT id, skill_id, created_at FROM generated_items WHERE learner_id = ? ORDER BY created_at"),
  ]);
  return json({
    exported_at: new Date().toISOString(),
    about: "Your Testwise data. Times are milliseconds since 1970 (UTC); days are your local day. Questions are referred to by id.",
    learner,
    skills,
    lessons,
    attempts,
    reviews,
    tutor_turns,
    generated_items,
  });
}
