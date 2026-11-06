import * as E from "../engine.js";
import { json, fail, parseItem, tzOffset } from "../lib/http.js";
import { socratesReply, offlineReply, DAILY_CONVERSATIONS, MAX_STUDENT_TURNS } from "../socrates.js";

export async function socrates(env, request, learnerId, b) {
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
