// Exam packs in the Worker: everything exam-specific (names, sections, timing,
// scoring, placement, plan defaults, the publisher disclaimer, Socrates' lines)
// comes from the pack in exams/<id>/, never from literals in code.
//
// Where the pack lives at runtime: in D1. scripts/build-seed.mjs writes each
// enabled pack's exam.json and voice.json into its `exams` row (config, voice),
// next to the sections, domains, skills and items it describes. We don't bundle
// the JSON into the Worker because a static import names one exam: adding GRE
// would then be a code change (or a generated import list that has to be rebuilt
// before every deploy). With D1 the seed is the only step, the config can never
// be out of step with the content that was loaded, and old Worker builds keep
// working. Rows are cached per isolate for a minute, so a re-seed shows up
// within that time.
//
// One exam per learner: learners.exam_id (set when the learner picks a test in
// setup; NULL for learners from before the picker) falls back to the
// DEFAULT_EXAM var in wrangler.jsonc, then to the first ready exam.
//
// The test picker lists every pack (listExams). A pack that isn't enabled is
// seeded as a listing only (config NULL), shown as not ready yet.

const TTL_MS = 60_000;
const cache = new Map();

/** The full pack for one exam, or null if it isn't seeded. */
export async function getExam(env, examId) {
  const hit = cache.get(examId);
  if (hit && hit.db === env.DB && Date.now() - hit.at < TTL_MS) return hit.exam;
  const [row, domains] = await Promise.all([
    env.DB.prepare("SELECT id, name, config, voice FROM exams WHERE id = ?").bind(examId).first(),
    env.DB.prepare("SELECT id, name, section_id, weight FROM domains WHERE exam_id = ? ORDER BY position").bind(examId).all(),
  ]);
  const exam = row?.config ? toExam(row, domains.results) : null;
  cache.set(examId, { exam, at: Date.now(), db: env.DB });
  return exam;
}

function toExam(row, domains) {
  const cfg = JSON.parse(row.config);
  const voice = row.voice ? JSON.parse(row.voice) : {};
  return {
    ...cfg,
    id: row.id,
    name: cfg.name || row.name,
    sections: (cfg.sections || []).map((s) => ({
      ...s,
      domains: domains.filter((d) => d.section_id === s.id).map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
    })),
    voice,
  };
}

/** The exam id a learner is preparing for (or the default exam when learnerId is null). */
export async function examIdFor(env, learnerId) {
  if (learnerId) {
    const r = await env.DB.prepare("SELECT exam_id FROM learners WHERE id = ?").bind(learnerId).first();
    if (r?.exam_id) return r.exam_id;
  }
  if (env.DEFAULT_EXAM) return env.DEFAULT_EXAM;
  const first = await env.DB.prepare("SELECT id FROM exams WHERE config IS NOT NULL AND enabled = 1 ORDER BY position, id LIMIT 1").first();
  return first?.id ?? null;
}

/** Whether learners can pick this exam now: enabled and seeded. */
export async function isReady(env, examId) {
  const r = await env.DB.prepare("SELECT enabled, config IS NOT NULL AS ok FROM exams WHERE id = ?").bind(examId).first();
  return !!(r && r.enabled && r.ok);
}

/**
 * Every exam for the test picker, in picker order. Ready exams carry their
 * section names (the option's sub-line); the rest carry only their names,
 * never anything from a config.
 */
export async function listExams(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, short_name, enabled, config IS NOT NULL AS ok FROM exams ORDER BY position, id",
  ).all();
  const out = [];
  for (const r of results) {
    const ready = !!(r.enabled && r.ok);
    const row = { id: r.id, name: r.name, short_name: r.short_name || r.name, ready };
    if (ready) {
      const exam = await getExam(env, r.id);
      row.name = exam?.name || r.name;
      row.short_name = exam?.short_name || row.short_name;
      row.sections = (exam?.sections || []).map((s) => s.name);
    }
    out.push(row);
  }
  return out;
}

/**
 * The official test days still ahead of `today` (the learner's local day),
 * at most two years out. A registration deadline is kept only while it
 * hasn't passed. Packs without test_dates return [].
 */
export function upcomingTestDates(exam, today, maxDays = 730) {
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + maxDays * 86400000).toISOString().slice(0, 10);
  return (exam?.test_dates?.dates || [])
    .filter((d) => d.date > today && d.date <= last)
    .map((d) => ({
      date: d.date,
      ...(d.register_by && d.register_by >= today ? { register_by: d.register_by } : {}),
      ...(d.anticipated ? { anticipated: true } : {}),
    }));
}

/** The learner's exam pack. Throws if nothing is seeded, which is a deploy bug. */
export async function learnerExam(env, learnerId) {
  const id = await examIdFor(env, learnerId);
  const exam = id ? await getExam(env, id) : null;
  if (!exam) throw new Error(`exam pack "${id}" is not seeded; run npm run seed and load seed/seed.sql`);
  return exam;
}

/** A section of the exam by id, or the exam's default section when sectionId is empty. */
export function sectionOf(exam, sectionId) {
  return exam.sections.find((s) => s.id === (sectionId || exam.default_section)) || null;
}

/**
 * What GET /api/exam returns: the pack as the app needs it. `today` is the
 * learner's local day; test dates on or before it are left out.
 */
export function publicExam(exam, today) {
  const { id, name, short_name, tagline, audience, publisher, score, default_section, sections, placement, plan, voice } = exam;
  const out = { id, name, short_name, tagline, audience, publisher, score, default_section, sections, placement, plan, voice };
  if (exam.test_dates) out.test_dates = upcomingTestDates(exam, today);
  return out;
}

// Clears the cache (tests).
export const _clearExamCache = () => cache.clear();
