// Profile (test date, target, daily time) and the personalized plan.
import * as E from "../engine.js";
import { json, fail, masteryMap, today as localToday } from "../lib/http.js";
import { skillContext } from "../lib/skill-context.js";
import { learnerExam } from "../lib/exam.js";
import { buildPlan, addDays, daysBetween, isDay, effectiveExamDate, normalizeMinutes, minutesOptions, DEFAULT_DAILY_MINUTES } from "../plan.js";

export const MAX_EXAM_DAYS = 730; // a test date at most 2 years out
export const INVALID = "__invalid__";

/**
 * Checks a profile body (POST /api/profile, or the profile in POST
 * /api/learners) against the current values. Only given fields change.
 * @returns {{error: string} | {exam_date: string|null, target_score: number|null, daily_minutes: number|null}}
 */
export function checkProfile(b, cur, day, minutes) {
  let examDate = cur.exam_date ?? null;
  if (b.not_booked === true) examDate = null;
  else if (b.exam_date !== undefined) {
    if (b.exam_date === null) examDate = null;
    else if (b.exam_date === INVALID || !isDay(b.exam_date)) return { error: "exam_date must be YYYY-MM-DD" };
    else if (daysBetween(day, b.exam_date) < 0) return { error: "exam_date is in the past" };
    else if (daysBetween(day, b.exam_date) > MAX_EXAM_DAYS) return { error: "exam_date is more than 2 years away" };
    else examDate = b.exam_date;
  }
  let target = cur.target_score ?? null;
  if (b.target_score !== undefined) {
    if (b.target_score === null) target = null;
    else if (!Number.isInteger(b.target_score) || b.target_score < 1 || b.target_score > 10000) return { error: "target_score must be a whole number" };
    else target = b.target_score;
  }
  let dailyMinutes = cur.daily_minutes ?? null;
  if (b.daily_minutes !== undefined) {
    if (!minutes.options.includes(b.daily_minutes)) return { error: `daily_minutes must be one of ${minutes.options.join(", ")}` };
    dailyMinutes = b.daily_minutes;
  }
  return { exam_date: examDate, target_score: target, daily_minutes: dailyMinutes };
}

export async function getProfile(env, learnerId, day) {
  const [r, exam] = await Promise.all([
    env.DB.prepare("SELECT exam_date, target_score, daily_minutes, plan_started_at FROM learners WHERE id = ?").bind(learnerId).first(),
    learnerExam(env, learnerId).catch(() => null),
  ]);
  const onboarded = !!r?.plan_started_at;
  const eff = day && onboarded ? effectiveExamDate({ exam_date: r.exam_date, plan_started_at: r.plan_started_at, today: day }) : null;
  return {
    onboarded,
    exam_date: r?.exam_date ?? null,
    not_booked: onboarded && !r?.exam_date,
    assumed_exam_date: eff?.assumed ? eff.date : null,
    target_score: r?.target_score ?? null,
    // A time from before today's options (30, 45) reads as the nearest one below.
    daily_minutes: normalizeMinutes(r?.daily_minutes ?? null, minutesOptions(exam).options),
    plan_started_at: r?.plan_started_at ?? null,
  };
}

export async function profileRoute(env, request, learnerId) {
  return json(await getProfile(env, learnerId, localToday(request)));
}

// POST /api/profile. Every field is optional; only given fields change.
export async function setProfile(env, request, learnerId, b) {
  const day = localToday(request);
  const [cur, exam] = await Promise.all([
    env.DB.prepare("SELECT exam_date, target_score, daily_minutes, plan_started_at FROM learners WHERE id = ?").bind(learnerId).first(),
    learnerExam(env, learnerId).catch(() => null),
  ]);
  const minutes = minutesOptions(exam);
  const v = checkProfile(b, cur, day, minutes);
  if (v.error) return fail(400, v.error);
  // A new (or first) test date starts a new plan from today, so pacing and
  // "behind" are measured from when the learner committed to that date.
  const started = !cur.plan_started_at || v.exam_date !== cur.exam_date ? day : cur.plan_started_at;
  await env.DB.prepare(
    "UPDATE learners SET exam_date = ?, target_score = ?, daily_minutes = ?, plan_started_at = ? WHERE id = ?",
  ).bind(v.exam_date, v.target_score, v.daily_minutes ?? minutes.default, started, learnerId).run();
  return json(await getProfile(env, learnerId, day));
}

/** Loads everything buildPlan needs for this learner and today. */
export async function planInput(env, learnerId, day) {
  const now = Date.now();
  const notPlacement = "LEFT JOIN lessons l ON l.id = a.lesson_id WHERE a.learner_id = ? AND (l.kind IS NULL OR l.kind != 'placement')";
  const [profile, ctx, mastery, todayRes, spanRes, recentRes, due, reviewedToday, lessonsRes, activeRes, mistakesRow] = await Promise.all([
    getProfile(env, learnerId, day),
    skillContext(env, learnerId),
    masteryMap(env, learnerId),
    env.DB.prepare(`SELECT a.skill_id, COUNT(*) AS n FROM attempts a ${notPlacement} AND a.local_day = ? GROUP BY a.skill_id`).bind(learnerId, day).all(),
    env.DB.prepare(`SELECT a.skill_id, MIN(a.local_day) AS first_day, MAX(a.local_day) AS last_day FROM attempts a ${notPlacement} GROUP BY a.skill_id`).bind(learnerId).all(),
    env.DB.prepare(
      `SELECT skill_id, COUNT(*) AS total, SUM(correct) AS correct FROM (
         SELECT a.skill_id, a.correct, ROW_NUMBER() OVER (PARTITION BY a.skill_id ORDER BY a.answered_at DESC, a.id DESC) AS rn
         FROM attempts a ${notPlacement}) WHERE rn <= 8 GROUP BY skill_id`,
    ).bind(learnerId).all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM reviews WHERE learner_id = ? AND due_at <= ? GROUP BY skill_id").bind(learnerId, now).all(),
    env.DB.prepare("SELECT COUNT(DISTINCT item_id) AS n FROM attempts WHERE learner_id = ? AND local_day = ? AND is_review = 1").bind(learnerId, day).first(),
    env.DB.prepare("SELECT kind, mode, skill_id, completed_at FROM lessons WHERE learner_id = ? AND local_day = ?").bind(learnerId, day).all(),
    env.DB.prepare("SELECT DISTINCT local_day FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL AND local_day >= ?").bind(learnerId, addDays(day, -14)).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM (SELECT correct, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY answered_at DESC, id DESC) AS rn
       FROM attempts WHERE learner_id = ?) WHERE rn = 1 AND correct = 0`,
    ).bind(learnerId).first(),
  ]);
  const dueBy = Object.fromEntries(due.results.map((r) => [r.skill_id, r.n]));
  const todayBy = Object.fromEntries(todayRes.results.map((r) => [r.skill_id, r.n]));
  const spanBy = Object.fromEntries(spanRes.results.map((r) => [r.skill_id, r]));
  const recentBy = Object.fromEntries(recentRes.results.map((r) => [r.skill_id, { correct: r.correct || 0, total: r.total }]));
  const skills = ctx.skills.map((s) => {
    const m = mastery[s.id] || { rating: 0, attempts: 0, correct: 0, tested_out: 0 };
    return {
      ...s,
      attempts: m.attempts,
      attempts_today: Math.min(m.attempts, todayBy[s.id] || 0),
      rating: m.rating,
      mastery: E.masteryPct(m.rating, m.attempts),
      mastered: E.isMastered(m.rating, m.attempts),
      tested_out: !!m.tested_out,
      first_day: spanBy[s.id]?.first_day || null,
      last_day: spanBy[s.id]?.last_day || null,
      recent: recentBy[s.id] || null,
    };
  });
  return {
    profile,
    ctx,
    input: {
      today: day,
      exam_date: profile.exam_date,
      plan_started_at: profile.plan_started_at,
      daily_minutes: profile.daily_minutes ?? ctx.minutes?.default ?? DEFAULT_DAILY_MINUTES,
      minutes_options: ctx.minutes?.options,
      skills,
      reviews_due: Object.values(dueBy).reduce((a, n) => a + n, 0),
      reviews_due_by_skill: dueBy,
      reviews_done_today: reviewedToday.n,
      mistakes: mistakesRow.n,
      lessons_today: lessonsRes.results.map((l) => ({ kind: l.kind, mode: l.mode, skill_id: l.skill_id, completed: !!l.completed_at })),
      active_days: activeRes.results.map((r) => r.local_day),
      pace: ctx.pace,
    },
  };
}

// GET /api/plan
export async function planRoute(env, request, learnerId) {
  const day = localToday(request);
  const [{ profile, input }, exam] = await Promise.all([planInput(env, learnerId, day), learnerExam(env, learnerId).catch(() => null)]);
  return json({ profile, ...buildPlan({ ...input, skill_about: exam?.voice?.skill_about }) });
}
