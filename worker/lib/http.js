// Shared helpers for the API routes.
import * as E from "../engine.js";

export const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
export const fail = (status, error) => json({ error }, status);

export function parseItem(row, { withAnswer = true } = {}) {
  const item = {
    id: row.id,
    skill_id: row.skill_id,
    difficulty: row.difficulty,
    type: row.type,
    stem: row.stem,
    table: row.table_json ? JSON.parse(row.table_json) : null,
    choices: row.choices ? JSON.parse(row.choices) : null,
    rating: row.rating,
    passage: row.passage ?? null,
    passage2: row.passage2 ?? null,
    figure: row.figure_json ? JSON.parse(row.figure_json) : null,
  };
  if (withAnswer) {
    item.answer = row.answer;
    item.accept = JSON.parse(row.accept || "[]");
    item.explanation = JSON.parse(row.explanation);
    item.hints = JSON.parse(row.hints);
    item.wrong_reasons = JSON.parse(row.wrong_reasons || "{}");
  }
  return item;
}

export const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function requireLearner(env, id) {
  if (!id || !ID_RE.test(id)) return null;
  return env.DB.prepare("SELECT id FROM learners WHERE id = ?").bind(id).first();
}

export function tzOffset(request) {
  const v = Number(request.headers.get("x-tz-offset"));
  return Number.isFinite(v) && Math.abs(v) <= 14 * 60 ? v : 0;
}

export const today = (request) => E.localDay(Date.now(), tzOffset(request));

export async function masteryMap(env, learnerId) {
  const { results } = await env.DB.prepare(
    "SELECT skill_id, rating, attempts, correct, tested_out FROM skill_mastery WHERE learner_id = ?",
  ).bind(learnerId).all();
  return Object.fromEntries(results.map((r) => [r.skill_id, r]));
}

// All skills, or only those in one section (an id from the exam pack).
export async function allSkills(env, sectionId = null) {
  const { results } = await (sectionId
    ? env.DB.prepare(
      "SELECT s.id, s.name, s.domain_id, s.position, s.prereqs FROM skills s JOIN domains d ON d.id = s.domain_id WHERE d.section_id = ? ORDER BY s.position",
    ).bind(sectionId)
    : env.DB.prepare("SELECT id, name, domain_id, position, prereqs FROM skills ORDER BY position")).all();
  return results.map((r) => ({ ...r, prereqs: JSON.parse(r.prereqs || "[]") }));
}

export async function stats(env, learnerId, day) {
  const [xpRow, daysRes, todayRow, dueRow] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL").bind(learnerId).first(),
    env.DB.prepare("SELECT DISTINCT local_day FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL ORDER BY local_day DESC LIMIT 400").bind(learnerId).all(),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN kind = 'placement' THEN 0 ELSE 1 END),0) AS learned, COALESCE(SUM(xp),0) AS xp FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL AND local_day = ?").bind(learnerId, day).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE learner_id = ? AND due_at <= ?").bind(learnerId, Date.now()).first(),
  ]);
  const days = daysRes.results.map((r) => r.local_day);
  return {
    xp: xpRow.xp,
    streak: E.streak(days, day),
    recent_days: E.recentDays(days, day),
    lessons_today: todayRow.n,
    // Placement counts for the streak but isn't a lesson: the streak screen
    // follows the first of these each day.
    lessons_today_no_placement: todayRow.learned,
    xp_today: todayRow.xp,
    reviews_due: dueRow.n,
  };
}
