// Skill map with the exam specifics the plan and practice need: domain weights
// and per-section pacing, all from the learner's exam pack (worker/lib/exam.js).
// A section's timed pace is its seconds_per_question; its untimed practice
// estimate is practice_minutes_per_question (default 1 minute). Domains with
// no weight get an equal share of their section.
import { examIdFor, getExam } from "./exam.js";
import { minutesOptions } from "../plan.js";

const DEFAULT_PRACTICE_MINUTES = 1.0;
const DEFAULT_TIMED_SECONDS = 80;

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/**
 * @returns {Promise<{exam:{id,name}|null, sections:{id,name,kind}[], skills:object[], pace:Object<string,{timed_seconds,practice_minutes}>, minutes:{options:number[], default:number}}>}
 * Skills only include those with live bank questions (like the tree).
 */
export async function skillContext(env, learnerId = null) {
  const examId = await examIdFor(env, learnerId);
  const pack = examId ? await getExam(env, examId) : null;
  const exam = pack ? { id: pack.id, name: pack.name } : null;
  if (!exam) return { exam: null, sections: [], skills: [], pace: {}, minutes: minutesOptions(null) };
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
    const cfg = pack.sections.find((x) => x.id === s.id) || {};
    pace[s.id] = {
      timed_seconds: num(cfg.seconds_per_question) ?? DEFAULT_TIMED_SECONDS,
      practice_minutes: num(cfg.practice_minutes_per_question) ?? DEFAULT_PRACTICE_MINUTES,
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
        domain_weight: num(d.weight) ?? null,
        section_id: d.section_id,
        section_name: secById.get(d.section_id)?.name || "",
        items: itemCount[s.id],
      };
    });
  // A section's kind ("numbers" or "words") picks its colour on the path.
  const kindOf = (id) => pack.sections.find((x) => x.id === id)?.kind;
  return {
    exam,
    sections: sections.results.map((s) => ({ id: s.id, name: s.name, kind: kindOf(s.id) === "words" ? "words" : "numbers" })),
    skills: out,
    pace,
    minutes: minutesOptions(pack),
  };
}
