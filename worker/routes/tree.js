import * as E from "../engine.js";
import { json, masteryMap, stats, today } from "../lib/http.js";
import { consentState } from "./learners.js";
import { getProfile } from "./plan.js";

export async function tree(env, request, learnerId) {
  const [exam, sections, domains, skills, counts, mastery, st, consent, profile] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM exams LIMIT 1").first(),
    env.DB.prepare("SELECT id, name FROM sections ORDER BY position").all(),
    env.DB.prepare("SELECT id, name, section_id FROM domains ORDER BY position").all(),
    env.DB.prepare("SELECT id, domain_id, name, prereqs FROM skills ORDER BY position").all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM items WHERE status = 'live' GROUP BY skill_id").all(),
    masteryMap(env, learnerId),
    stats(env, learnerId, today(request)),
    consentState(env, learnerId),
    getProfile(env, learnerId, today(request)),
  ]);
  const itemCount = Object.fromEntries(counts.results.map((r) => [r.skill_id, r.n]));
  const out = domains.results.map((d) => ({
    id: d.id,
    name: d.name,
    section_id: d.section_id,
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
  // Sections only list domains that have skills with questions, so a section
  // appears in the app once its content ships.
  const live = new Set(out.filter((d) => d.skills.some((sk) => sk.items > 0)).map((d) => d.id));
  const secs = sections.results
    .map((s) => ({ id: s.id, name: s.name, domains: out.filter((d) => d.section_id === s.id && live.has(d.id)).map((d) => d.id) }))
    .filter((s) => s.domains.length);
  return json({ exam, sections: secs, domains: out.filter((d) => live.has(d.id)), stats: st, learner: consent, profile });
}
