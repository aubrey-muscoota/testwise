// Builds seed/seed.sql from the exam packs in exams/<id>/
// (exam.json, skills.json, voice.json, items/*.json; see docs/ADDING_AN_EXAM.md).
// Enabled packs are loaded whole. A pack that isn't enabled only gets its
// listing (name, short name, place) so the test picker can show it as not
// ready yet; its config is never touched, so a pack that was live and is
// turned off keeps working for the learners already on it.
// Content rows are upserted, so re-running keeps learner progress and
// adaptive item ratings. Items removed from content files are retired, not deleted.
//
// Usage: node scripts/build-seed.mjs [--exams <dir>] [--out <file>]
// Exits with a list of problems (and writes nothing) if any pack is invalid.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { START_ITEM_RATING } from "../worker/engine.js";
import { loadPacks, validatePacks } from "./lib/packs.mjs";

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v == null ? "NULL" : q(JSON.stringify(v)));

/**
 * @param {{examsDir?: string}} [o]
 * @returns {{ok: true, sql: string, summary: string, packs: object[]} | {ok: false, problems: string[]}}
 */
export function buildSeed({ examsDir = "exams", today = new Date().toISOString().slice(0, 10) } = {}) {
  const every = loadPacks(examsDir, { enabledOnly: false });
  const packs = every.filter((p) => p.exam?.enabled === true);
  if (!packs.length) return { ok: false, problems: [`${examsDir}: no exam pack has "enabled": true`] };
  const problems = validatePacks(every);
  if (problems.length) return { ok: false, problems };

  // The picker's order: the pack's "order", then its id.
  const place = new Map([...every]
    .sort((a, b) => (a.exam.order ?? 1e6) - (b.exam.order ?? 1e6) || a.exam.id.localeCompare(b.exam.id))
    .map((p, i) => [p.exam.id, i]));
  const out = [];
  for (const { exam } of every.filter((p) => p.exam.enabled !== true)) {
    out.push(`INSERT INTO exams (id, name, short_name, position, enabled) VALUES (${q(exam.id)}, ${q(exam.name)}, ${q(exam.short_name)}, ${place.get(exam.id)}, 0) ON CONFLICT (id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, position = excluded.position, enabled = 0;`);
  }
  // Official test dates run out; say so while there's time to add the next year's.
  const warnings = [];
  for (const { exam } of packs) {
    const ahead = (exam.test_dates?.dates || []).filter((d) => d.date > today).length;
    if (exam.test_dates && ahead < 2) warnings.push(`exams/${exam.id}: only ${ahead} test date${ahead === 1 ? "" : "s"} left after ${today}; add the next ones to exam.json "test_dates"`);
  }
  let pos = 0;
  let dpos = 0;
  let nDomains = 0;
  const ids = [];
  packs.forEach((pack) => {
    const { exam, skills, voice } = pack;
    // The whole exam.json and voice.json go into the exams row; the Worker reads them from there (worker/lib/exam.js).
    out.push(`INSERT INTO exams (id, name, short_name, config, voice, position, enabled) VALUES (${q(exam.id)}, ${q(exam.name)}, ${q(exam.short_name)}, ${j(exam)}, ${j(voice)}, ${place.get(exam.id)}, 1) ON CONFLICT (id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, config = excluded.config, voice = excluded.voice, position = excluded.position, enabled = 1;`);
    const names = new Map(exam.sections.map((s) => [s.id, s.name]));
    const order = new Map(exam.sections.map((s, i) => [s.id, i]));
    for (const sec of skills.sections) {
      out.push(`INSERT INTO sections (id, exam_id, name, position) VALUES (${q(sec.id)}, ${q(exam.id)}, ${q(names.get(sec.id))}, ${order.get(sec.id)}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, name = excluded.name, position = excluded.position;`);
      for (const d of sec.domains) {
        nDomains++;
        out.push(`INSERT INTO domains (id, exam_id, section_id, name, position, weight) VALUES (${q(d.id)}, ${q(exam.id)}, ${q(sec.id)}, ${q(d.name)}, ${dpos++}, ${d.weight}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, section_id = excluded.section_id, name = excluded.name, position = excluded.position, weight = excluded.weight;`);
        for (const s of d.skills) {
          out.push(`INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES (${q(s.id)}, ${q(exam.id)}, ${q(d.id)}, ${q(s.name)}, ${pos++}, ${j(s.prereqs || [])}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, name = excluded.name, domain_id = excluded.domain_id, position = excluded.position, prereqs = excluded.prereqs;`);
        }
      }
    }
    for (const it of pack.items) {
      ids.push(it.id);
      out.push(
        `INSERT INTO items (id, skill_id, difficulty, type, stem, table_json, choices, answer, accept, explanation, hints, wrong_reasons, rating, status, passage, passage2, figure_json) VALUES (` +
          [q(it.id), q(it.skill_id), it.difficulty, q(it.type), q(it.stem), j(it.table), j(it.choices), q(it.answer), j(it.accept || []), j(it.explanation), j(it.hints), j(it.wrong_reasons || {}), START_ITEM_RATING[it.difficulty] ?? 0, "'live'", q(it.passage), q(it.passage2), j(it.figure)].join(", ") +
          `) ON CONFLICT (id) DO UPDATE SET skill_id = excluded.skill_id, difficulty = excluded.difficulty, type = excluded.type, stem = excluded.stem, table_json = excluded.table_json, choices = excluded.choices, answer = excluded.answer, accept = excluded.accept, explanation = excluded.explanation, hints = excluded.hints, wrong_reasons = excluded.wrong_reasons, status = 'live', passage = excluded.passage, passage2 = excluded.passage2, figure_json = excluded.figure_json;`,
      );
    }
  });
  if (ids.length) out.push(`UPDATE items SET status = 'retired' WHERE id NOT IN (${ids.map(q).join(", ")});`);
  const files = packs.reduce((n, p) => n + p.files.length, 0);
  const listed = every.length - packs.length;
  const summary = `${packs.length} exam${packs.length > 1 ? "s" : ""} (${packs.map((p) => p.exam.id).join(", ")}): ${nDomains} domains, ${pos} skills, ${ids.length} items from ${files} files` +
    (listed ? `; ${listed} listed as not ready (${every.filter((p) => p.exam.enabled !== true).map((p) => p.exam.id).join(", ")})` : "");
  return { ok: true, sql: out.join("\n") + "\n", summary, packs, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, dflt) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : dflt;
  };
  const outFile = arg("--out", "seed/seed.sql");
  const res = buildSeed({ examsDir: arg("--exams", "exams") });
  if (!res.ok) {
    console.error(`Exam packs have ${res.problems.length} problem${res.problems.length > 1 ? "s" : ""}; nothing written:`);
    for (const m of res.problems) console.error(`  - ${m}`);
    process.exit(1);
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, res.sql);
  console.log(`${outFile}: ${res.summary}`);
  for (const w of res.warnings) console.warn(`Reminder: ${w}`);
}
