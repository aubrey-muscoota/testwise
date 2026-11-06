// Builds seed/seed.sql from content/skills.json and content/items/*.json.
// Content rows are upserted, so re-running keeps learner progress and
// adaptive item ratings. Items removed from content files are retired, not deleted.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { START_ITEM_RATING } from "../worker/engine.js";

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v == null ? "NULL" : q(JSON.stringify(v)));

const map = JSON.parse(readFileSync("content/skills.json", "utf8"));
const out = [];
let pos = 0;
let nDomains = 0;
let dpos = 0;
for (const exam of map.exams) {
  out.push(`INSERT INTO exams (id, name) VALUES (${q(exam.id)}, ${q(exam.name)}) ON CONFLICT (id) DO UPDATE SET name = excluded.name;`);
  exam.sections.forEach((sec, si) => {
    out.push(`INSERT INTO sections (id, exam_id, name, position) VALUES (${q(sec.id)}, ${q(exam.id)}, ${q(sec.name)}, ${si}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, name = excluded.name, position = excluded.position;`);
    for (const d of sec.domains) {
      nDomains++;
      out.push(`INSERT INTO domains (id, exam_id, section_id, name, position) VALUES (${q(d.id)}, ${q(exam.id)}, ${q(sec.id)}, ${q(d.name)}, ${dpos++}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, section_id = excluded.section_id, name = excluded.name, position = excluded.position;`);
      for (const s of d.skills) {
        out.push(`INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES (${q(s.id)}, ${q(exam.id)}, ${q(d.id)}, ${q(s.name)}, ${pos++}, ${j(s.prereqs)}) ON CONFLICT (id) DO UPDATE SET exam_id = excluded.exam_id, name = excluded.name, domain_id = excluded.domain_id, position = excluded.position, prereqs = excluded.prereqs;`);
      }
    }
  });
}

const ids = [];
const files = readdirSync("content/items").filter((f) => f.endsWith(".json")).sort();
for (const f of files) {
  for (const it of JSON.parse(readFileSync(`content/items/${f}`, "utf8"))) {
    ids.push(it.id);
    out.push(
      `INSERT INTO items (id, skill_id, difficulty, type, stem, table_json, choices, answer, accept, explanation, hints, wrong_reasons, rating, status, passage, passage2, figure_json) VALUES (` +
        [q(it.id), q(it.skill_id), it.difficulty, q(it.type), q(it.stem), j(it.table), j(it.choices), q(it.answer), j(it.accept || []), j(it.explanation), j(it.hints), j(it.wrong_reasons || {}), START_ITEM_RATING[it.difficulty] ?? 0, "'live'", q(it.passage), q(it.passage2), j(it.figure)].join(", ") +
        `) ON CONFLICT (id) DO UPDATE SET skill_id = excluded.skill_id, difficulty = excluded.difficulty, type = excluded.type, stem = excluded.stem, table_json = excluded.table_json, choices = excluded.choices, answer = excluded.answer, accept = excluded.accept, explanation = excluded.explanation, hints = excluded.hints, wrong_reasons = excluded.wrong_reasons, status = 'live', passage = excluded.passage, passage2 = excluded.passage2, figure_json = excluded.figure_json;`,
    );
  }
}
if (ids.length) out.push(`UPDATE items SET status = 'retired' WHERE id NOT IN (${ids.map(q).join(", ")});`);

mkdirSync("seed", { recursive: true });
writeFileSync("seed/seed.sql", out.join("\n") + "\n");
console.log(`seed/seed.sql: ${nDomains} domains, ${pos} skills, ${ids.length} items from ${files.length} files`);
