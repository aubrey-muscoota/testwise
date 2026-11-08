// Practice mode: sessions that never run out, plus fresh questions from Claude.
// A session is a lessons row with kind = 'practice'; the app runs it with the
// same lesson screen, /api/answers and /api/lessons/finish as a lesson.
import * as E from "../engine.js";
import { json, fail, parseItem, masteryMap, today as localToday } from "../lib/http.js";
import { skillContext } from "../lib/skill-context.js";
import { prepareSkills } from "../plan.js";
import { MODES, DEFAULT_N, DEFAULT_FRESH_N, MAX_N, practiceSkills, pickPractice, bankSummary, lowUnseen } from "../practice.js";
import {
  generateBatch, makeClient, generatorModel, globalDailyCap, newItemId, BATCH_SIZE, PER_LEARNER_DAILY,
} from "../generate.js";

const inList = (ids) => ids.map(() => "?").join(", ");

// Latest answer per item for this learner.
async function history(env, learnerId) {
  const { results } = await env.DB.prepare(
    `SELECT item_id, skill_id, correct, answered_at FROM (
       SELECT item_id, skill_id, correct, answered_at,
         ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY answered_at DESC, id DESC) AS rn
       FROM attempts WHERE learner_id = ?) WHERE rn = 1`,
  ).bind(learnerId).all();
  return new Map(results.map((r) => [r.item_id, { skill_id: r.skill_id, last_at: r.answered_at, last_correct: !!r.correct }]));
}

async function poolItems(env, skillIds) {
  if (!skillIds.length) return [];
  return (await env.DB.prepare(
    `SELECT id, skill_id, rating, source FROM items WHERE status IN ('live', 'generated') AND skill_id IN (${inList(skillIds)})`,
  ).bind(...skillIds).all()).results;
}

// Skills with this learner's state, for practiceSkills/pickPractice.
async function learnerSkills(env, learnerId) {
  const [ctx, mastery, hist] = await Promise.all([skillContext(env, learnerId), masteryMap(env, learnerId), history(env, learnerId)]);
  const mistakes = new Map();
  for (const h of hist.values()) if (!h.last_correct) mistakes.set(h.skill_id, (mistakes.get(h.skill_id) || 0) + 1);
  const raw = ctx.skills.map((s) => {
    const m = mastery[s.id] || { rating: 0, attempts: 0, tested_out: 0 };
    return { ...s, attempts: m.attempts, rating: m.rating, tested_out: !!m.tested_out, mastery: E.masteryPct(m.rating, m.attempts) };
  });
  const skills = prepareSkills(raw).map((s) => ({
    ...s,
    unlocked: E.isUnlocked(s, mastery),
    mistakes: mistakes.get(s.id) || 0,
  }));
  return { ctx, mastery, hist, skills };
}

// Section of the learner's most recent answer, for "nothing started yet" fallbacks.
async function currentSection(env, learnerId, skills) {
  const last = await env.DB.prepare("SELECT skill_id FROM attempts WHERE learner_id = ? ORDER BY answered_at DESC LIMIT 1").bind(learnerId).first();
  return skills.find((s) => s.id === last?.skill_id)?.section_id || skills[0]?.section_id || null;
}

const targetDifficulty = (rating) => {
  const t = rating - Math.log(E.TARGET_P / (1 - E.TARGET_P));
  return t < -0.5 ? 1 : t < 0.5 ? 2 : 3;
};

async function generatedCounts(env, learnerId, day) {
  const utcDay = new Date().toISOString().slice(0, 10);
  const [mine, all] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM generated_items WHERE learner_id = ? AND learner_day = ?").bind(learnerId, day).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM generated_items WHERE created_day = ?").bind(utcDay).first(),
  ]);
  return { mine: mine.n, all: all.n, utcDay };
}

/**
 * Asks Claude for a batch on one skill and stores the questions that pass.
 * Never throws: returns {ids, reason} where reason is null on success, or
 * "offline" | "cap" | "no_examples" | "error" | "none_passed".
 */
export async function generateForSkill(env, { learnerId, day, skill, ctx, rating, n = BATCH_SIZE, client = makeClient(env) }) {
  const model = generatorModel(env);
  if (!client || !model) return { ids: [], reason: "offline" };
  try {
    const counts = await generatedCounts(env, learnerId, day);
    const room = Math.min(PER_LEARNER_DAILY - counts.mine, globalDailyCap(env) - counts.all, n);
    if (room <= 0) return { ids: [], reason: "cap" };
    const difficulty = targetDifficulty(rating || 0);
    const ex = (await env.DB.prepare(
      `SELECT * FROM items WHERE skill_id = ? AND status = 'live' AND source = 'bank' AND figure_json IS NULL
       ORDER BY (difficulty = ?) DESC, RANDOM() LIMIT 2`,
    ).bind(skill.id, difficulty).all()).results.map((r) => parseItem(r));
    if (ex.length < 2) return { ids: [], reason: "no_examples" };
    const res = await generateBatch({
      client, model,
      exam: ctx.exam?.name || "", section: skill.section_name, domain: skill.domain_name,
      skill: { id: skill.id, name: skill.name }, difficulty, examples: ex, n: room,
    });
    for (const r of res.rejected) console.log("generated item rejected", skill.id, r.reason);
    if (!res.accepted.length) return { ids: [], reason: "none_passed" };
    const now = Date.now();
    const ids = [];
    const stmts = [];
    for (const it of res.accepted) {
      const id = newItemId(skill.id);
      ids.push(id);
      stmts.push(env.DB.prepare(
        `INSERT INTO items (id, skill_id, difficulty, type, stem, table_json, choices, answer, accept, explanation, hints, wrong_reasons, rating, status, passage, passage2, figure_json, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generated', ?, ?, NULL, 'generated')`,
      ).bind(id, skill.id, it.difficulty, it.type, it.stem, it.table ? JSON.stringify(it.table) : null,
        it.choices ? JSON.stringify(it.choices) : null, it.answer, JSON.stringify(it.accept || []),
        JSON.stringify(it.explanation), JSON.stringify(it.hints), JSON.stringify(it.wrong_reasons || {}),
        E.START_ITEM_RATING[it.difficulty] ?? 0, it.passage, it.passage2));
      stmts.push(env.DB.prepare(
        `INSERT INTO generated_items (id, skill_id, difficulty, learner_id, created_at, created_day, learner_day, model)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, skill.id, it.difficulty, learnerId, now, counts.utcDay, day, res.model || model));
    }
    await env.DB.batch(stmts);
    return { ids, reason: null };
  } catch (err) {
    console.error("generate error", err?.status, err?.message);
    return { ids: [], reason: "error" };
  }
}

const FALLBACK_NOTES = {
  offline: "Socrates can't write new questions right now",
  cap: "That's all the new questions Socrates can write today",
  no_examples: "Socrates can't write questions for this skill yet",
  error: "Socrates couldn't write new questions just now",
  none_passed: "Socrates' new questions didn't pass the answer check this time",
};

// POST /api/practice
export async function startPractice(env, request, learnerId, b, execCtx) {
  const mode = b.mode || "mixed";
  if (!MODES.includes(mode)) return fail(400, `mode must be one of ${MODES.join(", ")}`);
  const day = localToday(request);
  const now = Date.now();
  const n = Math.max(3, Math.min(MAX_N, b.n || (mode === "fresh" ? DEFAULT_FRESH_N : DEFAULT_N)));
  const { ctx, hist, skills } = await learnerSkills(env, learnerId);
  if (b.section && !skills.some((s) => s.section_id === b.section)) return fail(404, "unknown section");

  let skillId = b.skill_id || null;
  if (mode === "skill" && !skillId) return fail(400, "skill_id is required for a skill drill");
  if (skillId) {
    const s = skills.find((x) => x.id === skillId);
    if (!s) return fail(404, "unknown skill");
    if (!s.unlocked && !s.started) return fail(403, "skill locked");
  }
  // Practice draws from skills the learner can open.
  const open = skills.filter((s) => s.unlocked || s.started);
  const current = await currentSection(env, learnerId, open);

  const rand = E.seededRandom(`${learnerId}:${now}`);
  const extra = {};
  let freshIds = [];
  if (mode === "fresh") {
    if (!skillId) {
      // The skill whose bank this learner has used up the most, weakest first.
      const summary = bankSummary(await poolItems(env, open.map((s) => s.id)), hist);
      const pool = (open.some((s) => s.started) ? open.filter((s) => s.started) : open.filter((s) => s.section_id === (b.section || current)))
        .filter((s) => !b.section || s.section_id === b.section);
      const share = (s) => { const r = summary.get(s.id); return r ? r.unseen / r.bank : 1; };
      skillId = [...pool].sort((a, c) => share(a) - share(c) || c.weight * (1 - c.mastery) - a.weight * (1 - a.mastery))[0]?.id || null;
    }
    const skill = skills.find((s) => s.id === skillId);
    if (!skill) return fail(404, "no skills to practice yet");
    const gen = await generateForSkill(env, { learnerId, day, skill, ctx, rating: skill.rating, n: Math.min(n, BATCH_SIZE) });
    freshIds = gen.ids;
    extra.fresh = freshIds.length > 0;
    extra.generated = freshIds.length;
    extra.note = gen.reason
      ? `${FALLBACK_NOTES[gen.reason]}, so here are questions from the bank on ${skill.name}.`
      : `Socrates just wrote ${freshIds.length} new ${freshIds.length === 1 ? "question" : "questions"} on ${skill.name}. A second solver checked each answer, but tap Report if one looks off.`;
  }

  const plan = practiceSkills({
    mode: mode === "fresh" ? "skill" : mode,
    skills: open,
    skill_id: skillId,
    skill_ids: b.skill_ids,
    section: b.section,
    current_section: current,
    n,
  });
  if (!plan.length) return fail(404, mode === "mistakes" ? "no mistakes to fix" : "no skills to practice yet");
  const items = await poolItems(env, plan.map((p) => p.id));
  const ratings = Object.fromEntries(skills.map((s) => [s.id, s.rating]));
  const picked = [
    ...freshIds.map((id) => ({ id, skill_id: skillId, seen: false })),
    ...pickPractice({ mode: mode === "fresh" ? "skill" : mode, plan, items, history: hist, ratings, n: n - freshIds.length, rand, exclude: new Set(freshIds) }),
  ];
  if (!picked.length) return fail(404, mode === "mistakes" ? "no mistakes to fix" : "no questions yet");
  if (mode === "fresh" && !extra.fresh && picked.every((p) => p.seen)) extra.note = extra.note.replace("questions from the bank", "bank questions you've seen least recently");

  const rows = (await env.DB.prepare(`SELECT * FROM items WHERE id IN (${inList(picked.map((p) => p.id))})`).bind(...picked.map((p) => p.id)).all()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lessonId = crypto.randomUUID();
  const sectionOf = new Map(skills.map((s) => [s.id, s.section_id]));
  const stmts = [env.DB.prepare(
    "INSERT INTO lessons (id, learner_id, skill_id, started_at, local_day, kind, section_id, mode) VALUES (?, ?, ?, ?, ?, 'practice', ?, ?)",
  ).bind(lessonId, learnerId, plan.length === 1 ? plan[0].id : null, now, day, b.section || null, mode)];
  const genServed = picked.filter((p) => byId.get(p.id)?.source === "generated").map((p) => p.id);
  if (genServed.length) stmts.push(env.DB.prepare(`UPDATE generated_items SET served_count = served_count + 1 WHERE id IN (${inList(genServed)})`).bind(...genServed));
  await env.DB.batch(stmts);

  if (mode === "timed") {
    extra.time_limit_seconds = Math.round(picked.reduce((a, p) => a + (ctx.pace[sectionOf.get(p.skill_id)]?.timed_seconds ?? 80), 0));
  }

  // Running low on unseen questions in a skill: write more in the background
  // so they're ready next time (same caps; silently skipped offline).
  if (mode !== "fresh" && execCtx?.waitUntil && makeClient(env)) {
    const summary = bankSummary(items, hist);
    const low = plan.map((p) => skills.find((s) => s.id === p.id)).find((s) => s && summary.get(s.id) && lowUnseen(summary.get(s.id)));
    if (low) execCtx.waitUntil(generateForSkill(env, { learnerId, day, skill: low, ctx, rating: low.rating }));
  }

  return json({
    lesson_id: lessonId,
    skill_id: plan.length === 1 ? plan[0].id : null,
    practice: true,
    mode,
    ...extra,
    items: picked.map((p) => ({ ...parseItem(byId.get(p.id)), review: false, source: byId.get(p.id).source })),
  });
}

// GET /api/practice/summary
export async function practiceSummary(env, request, learnerId) {
  const day = localToday(request);
  const { skills, hist } = await learnerSkills(env, learnerId);
  const items = await poolItems(env, skills.map((s) => s.id));
  const by = bankSummary(items, hist);
  const counts = await generatedCounts(env, learnerId, day);
  const rows = skills.map((s) => {
    const r = by.get(s.id) || { bank: 0, generated: 0, seen: 0, unseen: 0, missed: 0 };
    return { skill_id: s.id, name: s.name, section_id: s.section_id, ...r, started: s.started, unlocked: s.unlocked, low: lowUnseen(r) };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return json({
    totals: { bank: sum("bank"), generated: sum("generated"), seen: sum("seen"), unseen: sum("unseen"), missed: sum("missed") },
    skills: rows,
    fresh: {
      available: !!(makeClient(env) && generatorModel(env)),
      generated_today: counts.mine,
      daily_limit: PER_LEARNER_DAILY,
    },
  });
}
