// Builds seed/seed.sql from content/skills.json and content/items/*.json.
// Content rows are upserted, so re-running keeps learner progress and
// adaptive item ratings. Items removed from content files are retired, not deleted.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { START_ITEM_RATING } from "../worker/engine.js";

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v) => (v == null ? "NULL" : q(JSON.stringify(v)));

const map = JSON.parse(readFileSync("content/skills.json", "utf8"));
const out = [];
out.push(`INSERT INTO exams (id, name) VALUES (${q(map.exam.id)}, ${q(map.exam.name)}) ON CONFLICT (id) DO UPDATE SET name = excluded.name;`);
let pos = 0;
map.domains.forEach((d, di) => {
  out.push(`INSERT INTO domains (id, exam_id, name, position) VALUES (${q(d.id)}, ${q(map.exam.id)}, ${q(d.name)}, ${di}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, position = excluded.position;`);
  for (const s of d.skills) {
    out.push(`INSERT INTO skills (id, exam_id, domain_id, name, position, prereqs) VALUES (${q(s.id)}, ${q(map.exam.id)}, ${q(d.id)}, ${q(s.name)}, ${pos++}, ${j(s.prereqs)}) ON CONFLICT (id) DO UPDATE SET name = excluded.name, domain_id = excluded.domain_id, position = excluded.position, prereqs = excluded.prereqs;`);
  }
});

const ids = [];
const files = readdirSync("content/items").filter((f) => f.endsWith(".json")).sort();
for (const f of files) {
  for (const it of JSON.parse(readFileSync(`content/items/${f}`, "utf8"))) {
    ids.push(it.id);
    out.push(
      `INSERT INTO items (id, skill_id, difficulty, type, stem, table_json, choices, answer, accept, explanation, hints, wrong_reasons, rating, status) VALUES (` +
        [q(it.id), q(it.skill_id), it.difficulty, q(it.type), q(it.stem), j(it.table), j(it.choices), q(it.answer), j(it.accept || []), j(it.explanation), j(it.hints), j(it.wrong_reasons || {}), START_ITEM_RATING[it.difficulty] ?? 0, "'live'"].join(", ") +
        `) ON CONFLICT (id) DO UPDATE SET skill_id = excluded.skill_id, difficulty = excluded.difficulty, type = excluded.type, stem = excluded.stem, table_json = excluded.table_json, choices = excluded.choices, answer = excluded.answer, accept = excluded.accept, explanation = excluded.explanation, hints = excluded.hints, wrong_reasons = excluded.wrong_reasons, status = 'live';`,
    );
  }
}
if (ids.length) out.push(`UPDATE items SET status = 'retired' WHERE id NOT IN (${ids.map(q).join(", ")});`);

mkdirSync("seed", { recursive: true });
writeFileSync("seed/seed.sql", out.join("\n") + "\n");
console.log(`seed/seed.sql: ${map.domains.length} domains, ${pos} skills, ${ids.length} items from ${files.length} files`);
