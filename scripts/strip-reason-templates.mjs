// One-off: wrong_reasons used to open with a template ("Picked because …",
// "Chosen because …", "Tempting because …").
// Strip that prefix and capitalize what is left, so each reason reads as
// Socrates noticing something. Usage: node scripts/strip-reason-templates.mjs exams/*/items/*.json
import { readFileSync, writeFileSync } from "node:fs";

const PREFIX = /^(Picked|Chosen|Tempting) because\s+/;
const cap = (s) => s.replace(/^(["“'‘(]*)(\p{Ll})/u, (_, q, c) => q + c.toUpperCase());

let changed = 0;
for (const file of process.argv.slice(2)) {
  const items = JSON.parse(readFileSync(file, "utf8"));
  let touched = false;
  for (const it of items) {
    for (const [k, v] of Object.entries(it.wrong_reasons ?? {})) {
      if (typeof v === "string" && PREFIX.test(v)) {
        it.wrong_reasons[k] = cap(v.replace(PREFIX, ""));
        changed++;
        touched = true;
      }
    }
  }
  if (touched) writeFileSync(file, JSON.stringify(items, null, 2) + "\n");
}
console.log(`${changed} wrong_reasons rewritten`);
