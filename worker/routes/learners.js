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
    env.DB.prepare("DELETE FROM learners WHERE id = ?").bind(learnerId),
  ]);
  return json({ ok: true });
}
