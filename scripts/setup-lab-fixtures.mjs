// Writes app/src/lab/setup.json: the setup review page's fixtures (?lab=setup,
// test/ui/setup.spec.mjs). The exam is the SAT pack as GET /api/exam serves it
// (every test date: the page filters them by the browser's day, which the
// screenshot checks fix at Nov 12, 2026), and the test picker's list is every
// pack as GET /api/exams lists it. Run after changing a pack's setup fields:
//   node scripts/setup-lab-fixtures.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPacks } from "./lib/packs.mjs";

const packs = loadPacks(fileURLToPath(new URL("../exams", import.meta.url)), { enabledOnly: false });
const order = (p) => p.exam.order ?? 1e6;
packs.sort((a, b) => order(a) - order(b) || a.exam.id.localeCompare(b.exam.id));
const sat = packs.find((p) => p.exam.id === "sat");
const { exam: e, skills, voice } = sat;
const exam = {
  id: e.id, name: e.name, short_name: e.short_name, tagline: e.tagline, audience: e.audience, publisher: e.publisher,
  score: e.score, default_section: e.default_section, placement: e.placement, plan: e.plan, voice,
  sections: e.sections.map((s) => ({ ...s, domains: skills.sections.find((x) => x.id === s.id).domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })) })),
  test_dates: e.test_dates.dates,
};
const exams = packs.map((p) => (p.exam.enabled
  ? { id: p.exam.id, name: p.exam.name, short_name: p.exam.short_name, ready: true, sections: p.exam.sections.map((s) => s.name) }
  : { id: p.exam.id, name: p.exam.name, short_name: p.exam.short_name, ready: false }));
writeFileSync(new URL("../app/src/lab/setup.json", import.meta.url), JSON.stringify({ exam, exams }) + "\n");
console.log(`setup.json: ${exams.map((x) => `${x.short_name}${x.ready ? "" : " (not ready)"}`).join(", ")}; ${exam.test_dates.length} test dates`);
