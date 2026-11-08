// Skill map with the exam specifics the plan and practice need: domain weights
// and per-section pacing. Reads them from the database when the exam pack
// provides them (domains.weight; sections.seconds_per_question and
// sections.practice_minutes), else falls back to the SAT numbers below, else
// equal weights and generic pacing.
//
// TODO(exam packs): once worker/lib/exam.js serves weights and pacing from
// exams/<id>/exam.json, read them from there and delete the fallback maps.

// Fraction of its section, per domain (College Board's published SAT ranges, mid-points).
const FALLBACK_DOMAIN_WEIGHTS = {
  alg: 0.35, adv: 0.35, psda: 0.15, geo: 0.15,
  "rw-ii": 0.26, "rw-cs": 0.28, "rw-eoi": 0.20, "rw-sec": 0.26,
};
// timed_seconds: test pace per question; practice_minutes: untimed estimate.
const FALLBACK_PACE = {
  "sat-math": { timed_seconds: 95, practice_minutes: 1.0 },
  "sat-rw": { timed_seconds: 71, practice_minutes: 1.2 },
};
const GENERIC_PACE = { timed_seconds: 80, practice_minutes: 1.0 };

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/**
 * @returns {Promise<{exam:{id,name}|null, sections:{id,name}[], skills:object[], pace:Object<string,{timed_seconds,practice_minutes}>}>}
 * Skills only include those with live bank questions (like the tree).
 */
export async function skillContext(env) {
  // The configured exam if there is one, else the first exam that has skills.
  const exam = (env.DEFAULT_EXAM && await env.DB.prepare("SELECT id, name FROM exams WHERE id = ?").bind(env.DEFAULT_EXAM).first())
    || await env.DB.prepare("SELECT e.id, e.name FROM exams e WHERE EXISTS (SELECT 1 FROM skills s WHERE s.exam_id = e.id) ORDER BY e.id LIMIT 1").first();
  if (!exam) return { exam: null, sections: [], skills: [], pace: {} };
  const [sections, domains, skills, counts] = await Promise.all([
    env.DB.prepare("SELECT * FROM sections WHERE exam_id = ? ORDER BY position").bind(exam.id).all(),
    env.DB.prepare("SELECT * FROM domains WHERE exam_id = ? ORDER BY position").bind(exam.id).all(),
    env.DB.prepare("SELECT id, name, domain_id, position, prereqs FROM skills WHERE exam_id = ? ORDER BY position").bind(exam.id).all(),
    env.DB.prepare("SELECT skill_id, COUNT(*) AS n FROM items WHERE status = 'live' GROUP BY skill_id").all(),
  ]);
  const itemCount = Object.fromEntries(counts.results.map((r) => [r.skill_id, r.n]));
  const secById = new Map(sections.results.map((s) => [s.id, s]));
  const domById = new Map(domains.results.map((d) => [d.id, d]));
  const pace = {};
  for (const s of sections.results) {
    const fb = FALLBACK_PACE[s.id] || GENERIC_PACE;
    pace[s.id] = {
      timed_seconds: num(s.seconds_per_question) ?? fb.timed_seconds,
      practice_minutes: num(s.practice_minutes) ?? fb.practice_minutes,
    };
  }
  const out = skills.results
    .filter((s) => itemCount[s.id] > 0 && domById.has(s.domain_id))
    .map((s) => {
      const d = domById.get(s.domain_id);
      return {
        id: s.id,
        name: s.name,
        position: s.position,
        prereqs: JSON.parse(s.prereqs || "[]"),
        domain_id: d.id,
        domain_name: d.name,
        domain_weight: num(d.weight) ?? FALLBACK_DOMAIN_WEIGHTS[d.id] ?? null,
        section_id: d.section_id,
        section_name: secById.get(d.section_id)?.name || "",
        items: itemCount[s.id],
      };
    });
  return { exam, sections: sections.results.map((s) => ({ id: s.id, name: s.name })), skills: out, pace };
}
