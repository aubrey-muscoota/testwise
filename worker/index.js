// Testwise API, a Cloudflare Worker. Static app files are served from app/dist
// by Workers static assets; everything under /api/ comes here.

import * as E from "./engine.js";
import { socratesReply, offlineReply, DAILY_CONVERSATIONS, MAX_STUDENT_TURNS } from "./socrates.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const fail = (status, error) => json({ error }, status);

function parseItem(row, { withAnswer = true } = {}) {
  const item = {
    id: row.id,
    skill_id: row.skill_id,
    difficulty: row.difficulty,
    type: row.type,
    stem: row.stem,
    table: row.table_json ? JSON.parse(row.table_json) : null,
    choices: row.choices ? JSON.parse(row.choices) : null,
    rating: row.rating,
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

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function requireLearner(env, id) {
  if (!id || !ID_RE.test(id)) return null;
  return env.DB.prepare("SELECT id FROM learners WHERE id = ?").bind(id).first();
}

function tzOffset(request) {
  const v = Number(request.headers.get("x-tz-offset"));
  return Number.isFinite(v) && Math.abs(v) <= 14 * 60 ? v : 0;
}

async function masteryMap(env, learnerId) {
  const { results } = await env.DB.prepare(
    "SELECT skill_id, rating, attempts, correct, tested_out FROM skill_mastery WHERE learner_id = ?",
  ).bind(learnerId).all();
  return Object.fromEntries(results.map((r) => [r.skill_id, r]));
}

async function stats(env, learnerId, today) {
  const [xpRow, daysRes, todayRow, dueRow] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(xp),0) AS xp FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL").bind(learnerId).first(),
    env.DB.prepare("SELECT DISTINCT local_day FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL ORDER BY local_day DESC LIMIT 400").bind(learnerId).all(),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(xp),0) AS xp FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL AND local_day = ?").bind(learnerId, today).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE learner_id = ? AND due_at <= ?").bind(learnerId, Date.now()).first(),
  ]);
  return {
    xp: xpRow.xp,
    streak: E.streak(daysRes.results.map((r) => r.local_day), today),
    lessons_today: todayRow.n,
    xp_today: todayRow.xp,
    reviews_due: dueRow.n,
  };
}

// ---------- handlers ----------

async function createLearner(env) {
  const id = crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare("INSERT INTO learners (id, created_at) VALUES (?, ?)").bind(id, Date.now()).run();
  return json({ id });
}

async function tree(env, request, learnerId) {
  const today = E.localDay(Date.now(), tzOffset(request));
  const [exam, domains, skills, counts, mastery, st] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM exams LIMIT 1").first(),
    env.DB.prepare("SELECT id, name FROM domains ORDER BY position").all(),
    env.DB.prepare("SELECT id, domain_id, name, prereqs FROM skills ORDER BY position").all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM items WHERE status = 'live' GROUP BY skill_id").all(),
    masteryMap(env, learnerId),
    stats(env, learnerId, today),
  ]);
  const itemCount = Object.fromEntries(counts.results.map((r) => [r.skill_id, r.n]));
  const out = domains.results.map((d) => ({
    id: d.id,
    name: d.name,
    skills: skills.results
      .filter((s) => s.domain_id === d.id)
      .map((s) => {
        const prereqs = JSON.parse(s.prereqs);
        const m = mastery[s.id] || { rating: 0, attempts: 0, correct: 0 };
        return {
          id: s.id,
          name: s.name,
          prereqs,
          items: itemCount[s.id] || 0,
          attempts: m.attempts,
          mastery: E.masteryPct(m.rating, m.attempts),
          mastered: E.isMastered(m.rating, m.attempts),
          tested_out: !!m.tested_out,
          unlocked: E.isUnlocked({ prereqs }, mastery) && (itemCount[s.id] || 0) > 0,
        };
      }),
  }));
  return json({ exam, domains: out, stats: st });
}

async function startLesson(env, request, learnerId, skillId) {
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

async function allSkills(env) {
  const { results } = await env.DB.prepare("SELECT id, name, domain_id, position, prereqs FROM skills ORDER BY position").all();
  return results.map((r) => ({ ...r, prereqs: JSON.parse(r.prereqs || "[]") }));
}

// Placement quiz: a few questions per domain, easy to hard, so a learner who
// already knows the basics can skip ahead. Answers go through /api/answers.
async function startPlacement(env, request, learnerId) {
  const now = Date.now();
  const today = E.localDay(now, tzOffset(request));
  const probes = E.pickPlacementProbes(await allSkills(env));
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
    "INSERT INTO lessons (id, learner_id, skill_id, started_at, local_day, kind) VALUES (?, ?, NULL, ?, ?, 'placement')",
  ).bind(lessonId, learnerId, now, today).run();
  return json({
    lesson_id: lessonId,
    skill_id: null,
    placement: true,
    items: chosen.map((id) => ({ ...parseItem(byId.get(id)), review: false })),
  });
}

// Tests out the skills a finished placement quiz showed the learner knows.
// Only ever raises progress, so finishing twice (or late) is harmless.
async function applyPlacement(env, learnerId, lessonId) {
  const skills = await allSkills(env);
  const probes = E.pickPlacementProbes(skills);
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

async function placementSummary(env, learnerId, testedOut) {
  const skills = await allSkills(env);
  const mastery = await masteryMap(env, learnerId);
  const set = new Set(testedOut);
  const name = (s) => ({ id: s.id, name: s.name });
  return {
    tested_out: skills.filter((s) => set.has(s.id)).map(name),
    // The skills that are now open to start on.
    next: skills.filter((s) => !mastery[s.id]?.tested_out && !(mastery[s.id]?.attempts >= E.UNLOCK_ATTEMPTS) && E.isUnlocked(s, mastery)).map(name),
    total_skills: skills.length,
  };
}

async function answer(env, request, learnerId, b) {
  const now = Date.now();
  const today = E.localDay(now, tzOffset(request));
  const row = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(String(b.item_id || "")).first();
  if (!row) return fail(404, "unknown item");
  const item = parseItem(row);
  const response = b.response == null ? "" : String(b.response).slice(0, 200);
  const correct = E.isCorrect(item, response);

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

async function finishLesson(env, request, learnerId, b) {
  const lesson = await env.DB.prepare(
    "SELECT * FROM lessons WHERE id = ? AND learner_id = ?",
  ).bind(String(b.lesson_id || ""), learnerId).first();
  if (!lesson) return fail(404, "unknown lesson");
  if (!lesson.completed_at) {
    const r = await env.DB.prepare(
      "SELECT COUNT(DISTINCT item_id) AS total, SUM(correct) AS correct FROM attempts WHERE lesson_id = ?",
    ).bind(lesson.id).first();
    // First-try results only count once per item, so retries at the end of a lesson don't farm XP.
    const firstTry = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM attempts a WHERE lesson_id = ? AND correct = 1 AND answered_at =
        (SELECT MIN(answered_at) FROM attempts b WHERE b.lesson_id = a.lesson_id AND b.item_id = a.item_id)`,
    ).bind(lesson.id).first();
    const xp = firstTry.n * E.XP_CORRECT + E.XP_LESSON;
    const today = E.localDay(Date.now(), tzOffset(request));
    await env.DB.prepare(
      "UPDATE lessons SET completed_at = ?, correct = ?, total = ?, xp = ?, local_day = ? WHERE id = ?",
    ).bind(Date.now(), firstTry.n, r.total || 0, xp, today, lesson.id).run();
  }
  const done = await env.DB.prepare("SELECT correct, total, xp FROM lessons WHERE id = ?").bind(lesson.id).first();
  const today = E.localDay(Date.now(), tzOffset(request));
  const extra = {};
  if (lesson.kind === "placement") {
    extra.placement = await placementSummary(env, learnerId, await applyPlacement(env, learnerId, lesson.id));
  }
  return json({ ...done, ...extra, stats: await stats(env, learnerId, today) });
}

async function socrates(env, request, learnerId, b) {
  const today = E.localDay(Date.now(), tzOffset(request));
  const row = await env.DB.prepare("SELECT * FROM items WHERE id = ?").bind(String(b.item_id || "")).first();
  if (!row) return fail(404, "unknown item");
  const item = parseItem(row);
  const response = String(b.response ?? "").slice(0, 200);
  const history = Array.isArray(b.history)
    ? b.history
        .filter((t) => t && (t.role === "student" || t.role === "socrates") && typeof t.content === "string")
        .map((t) => ({ role: t.role, content: t.content.slice(0, 1000) }))
        .slice(-2 * MAX_STUDENT_TURNS)
    : [];
  const studentTurns = history.filter((t) => t.role === "student").length;
  if (studentTurns >= MAX_STUDENT_TURNS) {
    return json({ reply: "We've thought hard about this one together. Let's look at the full solution and keep going!", done: true });
  }
  if (history.length && history[history.length - 1].role !== "student") return fail(400, "expected a student turn");

  // Daily cap on conversations (distinct questions), not on messages.
  const convs = await env.DB.prepare(
    "SELECT DISTINCT item_id FROM tutor_turns WHERE learner_id = ? AND local_day = ?",
  ).bind(learnerId, today).all();
  const ids = convs.results.map((r) => r.item_id);
  if (!ids.includes(item.id) && ids.length >= DAILY_CONVERSATIONS) {
    return json({ error: "daily_limit", reply: "I've loved our talks today! Come back tomorrow for more. For now, the worked solution is right below." }, 429);
  }

  let reply = null;
  let model = "offline";
  if (env.ANTHROPIC_API_KEY) {
    try {
      const r = await socratesReply({ apiKey: env.ANTHROPIC_API_KEY, model: env.TUTOR_MODEL, item, response, history });
      reply = r.text;
      model = r.model;
    } catch (err) {
      console.error("socrates error", err?.status, err?.message);
    }
  }
  if (!reply) {
    reply = offlineReply(item, studentTurns);
    model = "offline";
  }

  const now = Date.now();
  const stmts = [];
  const last = history[history.length - 1];
  if (last) {
    stmts.push(env.DB.prepare(
      "INSERT INTO tutor_turns (learner_id, item_id, local_day, role, content, created_at) VALUES (?, ?, ?, 'student', ?, ?)",
    ).bind(learnerId, item.id, today, last.content, now));
  }
  stmts.push(env.DB.prepare(
    "INSERT INTO tutor_turns (learner_id, item_id, local_day, role, content, model, created_at) VALUES (?, ?, ?, 'socrates', ?, ?, ?)",
  ).bind(learnerId, item.id, today, reply, model, now));
  await env.DB.batch(stmts);

  return json({ reply, offline: model === "offline", remaining_today: Math.max(0, DAILY_CONVERSATIONS - ids.length - (ids.includes(item.id) ? 0 : 1)) });
}

async function report(env, learnerId, b) {
  const row = await env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(String(b.item_id || "")).first();
  if (!row) return fail(404, "unknown item");
  const note = String(b.note || "").slice(0, 500);
  await env.DB.batch([
    env.DB.prepare("UPDATE items SET reports = reports + 1 WHERE id = ?").bind(row.id),
    env.DB.prepare("INSERT INTO item_checks (item_id, kind, passed, note, created_at) VALUES (?, 'report', 0, ?, ?)")
      .bind(row.id, `learner ${learnerId.slice(0, 6)}: ${note}`, Date.now()),
  ]);
  return json({ ok: true });
}

// ---------- router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/testwise/, ""); // also works when mounted at muscoota.com/testwise
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      if (path === "/api/health") return json({ ok: true });
      if (path === "/api/learners" && request.method === "POST") return await createLearner(env);

      const b = request.method === "POST" ? await body(request) : {};
      const learnerId = request.headers.get("x-learner") || url.searchParams.get("learner") || b.learner;
      const learner = await requireLearner(env, learnerId);
      if (!learner) return fail(401, "unknown learner");

      if (path === "/api/tree" && request.method === "GET") return await tree(env, request, learner.id);
      if (path === "/api/lessons" && request.method === "POST") return b.placement
        ? await startPlacement(env, request, learner.id)
        : await startLesson(env, request, learner.id, b.skill_id || null);
      if (path === "/api/answers" && request.method === "POST") return await answer(env, request, learner.id, b);
      if (path === "/api/lessons/finish" && request.method === "POST") return await finishLesson(env, request, learner.id, b);
      if (path === "/api/socrates" && request.method === "POST") return await socrates(env, request, learner.id, b);
      if (path === "/api/reports" && request.method === "POST") return await report(env, learner.id, b);
      return fail(404, "not found");
    } catch (err) {
      console.error(err);
      return fail(500, "server error");
    }
  },
};
