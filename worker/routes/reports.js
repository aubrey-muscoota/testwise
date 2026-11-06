import { json, fail } from "../lib/http.js";

export async function report(env, learnerId, b) {
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
