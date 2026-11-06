import * as E from "../engine.js";
import { json, masteryMap, stats, today } from "../lib/http.js";
import { consentState } from "./learners.js";

export async function tree(env, request, learnerId) {
  const [exam, domains, skills, counts, mastery, st, consent] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM exams LIMIT 1").first(),
    env.DB.prepare("SELECT id, name FROM domains ORDER BY position").all(),
    env.DB.prepare("SELECT id, domain_id, name, prereqs FROM skills ORDER BY position").all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM items WHERE status = 'live' GROUP BY skill_id").all(),
    masteryMap(env, learnerId),
    stats(env, learnerId, today(request)),
    consentState(env, learnerId),
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
  return json({ exam, domains: out, stats: st, learner: consent });
}
