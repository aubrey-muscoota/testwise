// GET /api/path: the Learn tab's one path (worker/path.js), built from the
// same learner state as the plan plus the path circles already finished.
import { json, stats, today as localToday } from "../lib/http.js";
import { learnerExam } from "../lib/exam.js";
import { buildPath, nodeAllowed } from "../path.js";
import { planInput } from "./plan.js";

// The path for this learner today. `withStats: false` skips the top bar's
// numbers (only the circles are needed to check a start).
export async function loadPath(env, learnerId, day, { withStats = true } = {}) {
  const [{ input, ctx }, exam, nodes, st] = await Promise.all([
    planInput(env, learnerId, day),
    learnerExam(env, learnerId).catch(() => null),
    env.DB.prepare("SELECT DISTINCT node FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL AND node IS NOT NULL").bind(learnerId).all(),
    withStats ? stats(env, learnerId, day) : undefined,
  ]);
  return buildPath({
    ...input,
    nodes_done: nodes.results.map((r) => r.node),
    sections: ctx.sections,
    skill_about: exam?.voice?.skill_about,
    stats: st,
  });
}

// The node a lesson or practice start may record, or null (worker/path.js nodeAllowed).
export async function checkedNode(env, request, learnerId, node, endpoint, body) {
  if (!node) return null;
  try {
    const p = await loadPath(env, learnerId, localToday(request), { withStats: false });
    return nodeAllowed(p, node, endpoint, body) ? node : null;
  } catch {
    return null;
  }
}

export async function pathRoute(env, request, learnerId) {
  return json(await loadPath(env, learnerId, localToday(request)));
}
