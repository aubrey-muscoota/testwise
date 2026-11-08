import * as E from "../engine.js";
import { json, fail, parseItem, tzOffset, masteryMap, allSkills, stats } from "../lib/http.js";
import { learnerExam, sectionOf } from "../lib/exam.js";

export async function startLesson(env, request, learnerId, skillId) {
  const now = Date.now();
  const today = E.localDay(now, tzOffset(request));
  const mastery = await masteryMap(env, learnerId);

  let items;
  let dueIds;
  if (skillId) {
    const skill = await env.DB.prepare("SELECT id, prereqs FROM skills WHERE id = ?").bind(skillId).first();
    if (!skill) return fail(404, "unknown skill");
    if (!E.isUnlocked({ prereqs: JSON.parse(skill.prereqs) }, mastery)) return fail(403, "skill locked");
    items = (await env.DB.prepare("SELECT * FROM items WHERE skill_id = ? AND status = 'live'").bind(skillId).all()).results;
    dueIds = (await env.DB.prepare(
      "SELECT item_id FROM reviews WHERE learner_id = ? AND skill_id = ? AND due_at <= ? ORDER BY due_at",
    ).bind(learnerId, skillId, now).all()).results.map((r) => r.item_id);
  } else {
    // Review lesson: due items across all skills.
    const due = (await env.DB.prepare(
      `SELECT i.* FROM reviews r JOIN items i ON i.id = r.item_id
       WHERE r.learner_id = ? AND r.due_at <= ? AND i.status = 'live' ORDER BY r.due_at LIMIT ?`,
    ).bind(learnerId, now, E.LESSON_SIZE).all()).results;
    if (!due.length) return fail(404, "nothing due for review");
    items = due;
    dueIds = due.map((r) => r.id);
  }

  const seen = (await env.DB.prepare(
    "SELECT item_id, MAX(answered_at) AS t FROM attempts WHERE learner_id = ? GROUP BY item_id",
  ).bind(learnerId).all()).results;
  const lastSeen = new Map(seen.map((r) => [r.item_id, r.t]));

  const rating = skillId ? mastery[skillId]?.rating || 0 : 0;
  const lessonId = crypto.randomUUID();
  const picked = skillId
    ? E.pickLesson({ items, learnerRating: rating, lastSeen, dueReviewIds: dueIds, rand: E.seededRandom(lessonId) })
    : dueIds.map((id) => ({ id, review: true }));

  await env.DB.prepare(
    "INSERT INTO lessons (id, learner_id, skill_id, started_at, local_day) VALUES (?, ?, ?, ?, ?)",
  ).bind(lessonId, learnerId, skillId || null, now, today).run();

  const byId = new Map(items.map((r) => [r.id, r]));
  return json({
    lesson_id: lessonId,
    skill_id: skillId || null,
    items: picked.map((p) => ({ ...parseItem(byId.get(p.id)), review: p.review })),
  });
}

// Placement quiz: a few questions per domain, easy to hard, so a learner who
// already knows the basics can skip ahead. Answers go through /api/answers.
// The section defaults to the exam pack's default_section; other exams' sections are refused.
export async function startPlacement(env, request, learnerId, requested = null) {
  const now = Date.now();
  const today = E.localDay(now, tzOffset(request));
  const exam = await learnerExam(env, learnerId);
  const sectionId = sectionOf(exam, requested)?.id;
  const skills = sectionId ? await allSkills(env, sectionId) : [];
  if (!skills.length) return fail(404, "unknown section");
  const probes = E.pickPlacementProbes(skills, exam.placement);
  const ids = [...new Set(probes.map((p) => p.skill_id))];
  const pool = (await env.DB.prepare(
    `SELECT id, skill_id, difficulty FROM items WHERE status = 'live' AND skill_id IN (${ids.map(() => "?").join(", ")})`,
  ).bind(...ids).all()).results;
  const lessonId = crypto.randomUUID();
  const rand = E.seededRandom(lessonId);
  const chosen = [];
  for (const p of probes) {
    const mine = pool.filter((r) => r.skill_id === p.skill_id);
    const exact = mine.filter((r) => r.difficulty === p.difficulty);
    const from = exact.length ? exact : mine;
    if (from.length) chosen.push(from[Math.floor(rand() * from.length)].id);
  }
  if (!chosen.length) return fail(404, "no questions yet");
  const rows = (await env.DB.prepare(
    `SELECT * FROM items WHERE id IN (${chosen.map(() => "?").join(", ")})`,
  ).bind(...chosen).all()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  await env.DB.prepare(
    "INSERT INTO lessons (id, learner_id, skill_id, started_at, local_day, kind, section_id) VALUES (?, ?, NULL, ?, ?, 'placement', ?)",
  ).bind(lessonId, learnerId, now, today, sectionId).run();
  return json({
    lesson_id: lessonId,
    skill_id: null,
    placement: true,
    items: chosen.map((id) => ({ ...parseItem(byId.get(id)), review: false })),
  });
}

// Tests out the skills a finished placement quiz showed the learner knows.
// Only ever raises progress, so finishing twice (or late) is harmless.
// Placement lessons from before sections were stored have no section_id; they
// were for the exam's default section.
async function applyPlacement(env, exam, learnerId, lessonId, sectionId) {
  const skills = await allSkills(env, sectionId || exam.default_section);
  const probes = E.pickPlacementProbes(skills, exam.placement);
  const first = (await env.DB.prepare(
    `SELECT a.skill_id, a.correct FROM attempts a WHERE a.lesson_id = ? AND a.answered_at =
      (SELECT MIN(answered_at) FROM attempts b WHERE b.lesson_id = a.lesson_id AND b.item_id = a.item_id)`,
  ).bind(lessonId).all()).results;
  const correctBySkill = new Map();
  for (const r of first) correctBySkill.set(r.skill_id, correctBySkill.get(r.skill_id) || !!r.correct);
  const out = E.placementTestOut(probes, correctBySkill, skills);
  const now = Date.now();
  if (out.length) {
    const credit = Math.round(E.UNLOCK_ATTEMPTS * 0.75);
    await env.DB.batch(out.map((id) => env.DB.prepare(
      `INSERT INTO skill_mastery (learner_id, skill_id, rating, attempts, correct, updated_at, tested_out) VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT (learner_id, skill_id) DO UPDATE SET rating = MAX(rating, excluded.rating), tested_out = 1,
       attempts = MAX(attempts, excluded.attempts), correct = MAX(correct, excluded.correct), updated_at = excluded.updated_at`,
    ).bind(learnerId, id, E.PLACEMENT_RATING, E.UNLOCK_ATTEMPTS, credit, now)));
  }
  return out;
}

async function placementSummary(env, exam, learnerId, sectionId) {
  const skills = await allSkills(env, sectionId || exam.default_section);
  const mastery = await masteryMap(env, learnerId);
  const name = (s) => ({ id: s.id, name: s.name });
  const m = (s) => mastery[s.id] || { rating: 0, attempts: 0 };
  return {
    tested_out: skills.filter((s) => m(s).tested_out).map(name),
    // Open skills to work on next, in path order (the app's START picks the first).
    next: skills.filter((s) => !m(s).tested_out && !E.isMastered(m(s).rating, m(s).attempts) && E.isUnlocked(s, mastery)).map(name),
    total_skills: skills.length,
  };
}

export async function finishLesson(env, request, learnerId, b) {
  const lesson = await env.DB.prepare(
    "SELECT * FROM lessons WHERE id = ? AND learner_id = ?",
  ).bind(String(b.lesson_id || ""), learnerId).first();
  if (!lesson) return fail(404, "unknown lesson");
  if (!lesson.completed_at) {
    const r = await env.DB.prepare(
      "SELECT COUNT(DISTINCT item_id) AS total, SUM(correct) AS correct FROM attempts WHERE lesson_id = ?",
    ).bind(lesson.id).first();
    // A set that ends with nothing answered (a timed set that ran out) earns
    // nothing and isn't a finished lesson: no XP, no streak day, no task done.
    if (!((r.total || 0) > 0) && lesson.kind !== "placement") {
      const today = E.localDay(Date.now(), tzOffset(request));
      return json({ correct: 0, total: 0, xp: 0, stats: await stats(env, learnerId, today) });
    }
    // First-try results only count once per item, so retries at the end of a lesson don't farm XP.
    const firstTry = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM attempts a WHERE lesson_id = ? AND correct = 1 AND answered_at =
        (SELECT MIN(answered_at) FROM attempts b WHERE b.lesson_id = a.lesson_id AND b.item_id = a.item_id)`,
    ).bind(lesson.id).first();
    const xp = (r.total || 0) > 0 ? firstTry.n * E.XP_CORRECT + E.XP_LESSON : 0;
    const today = E.localDay(Date.now(), tzOffset(request));
    await env.DB.prepare(
      "UPDATE lessons SET completed_at = ?, correct = ?, total = ?, xp = ?, local_day = ? WHERE id = ?",
    ).bind(Date.now(), firstTry.n, r.total || 0, xp, today, lesson.id).run();
  }
  const done = await env.DB.prepare("SELECT correct, total, xp FROM lessons WHERE id = ?").bind(lesson.id).first();
  const today = E.localDay(Date.now(), tzOffset(request));
  const extra = {};
  if (lesson.kind === "placement") {
    const exam = await learnerExam(env, learnerId);
    if (!lesson.completed_at) await applyPlacement(env, exam, learnerId, lesson.id, lesson.section_id);
    extra.placement = await placementSummary(env, exam, learnerId, lesson.section_id);
  }
  return json({ ...done, ...extra, stats: await stats(env, learnerId, today) });
}
