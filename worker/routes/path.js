// GET /api/path: the Learn tab's one path (worker/path.js), built from the
// same learner state as the plan plus the path circles already finished.
import { json, stats, today as localToday } from "../lib/http.js";
import { learnerExam } from "../lib/exam.js";
import { buildPath } from "../path.js";
import { planInput } from "./plan.js";

export async function pathRoute(env, request, learnerId) {
  const day = localToday(request);
  const [{ input, ctx }, exam, nodes, due, st] = await Promise.all([
    planInput(env, learnerId, day),
    learnerExam(env, learnerId).catch(() => null),
    env.DB.prepare("SELECT DISTINCT node FROM lessons WHERE learner_id = ? AND completed_at IS NOT NULL AND node IS NOT NULL").bind(learnerId).all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM reviews WHERE learner_id = ? AND due_at <= ? GROUP BY skill_id").bind(learnerId, Date.now()).all(),
    stats(env, learnerId, day),
  ]);
  return json(buildPath({
    ...input,
    nodes_done: nodes.results.map((r) => r.node),
    sections: ctx.sections,
    reviews_due_by_skill: Object.fromEntries(due.results.map((r) => [r.skill_id, r.n])),
    skill_about: exam?.voice?.skill_about,
    stats: st,
  }));
}
