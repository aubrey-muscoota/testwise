// Writes app/src/lab/path.json: Learn path fixtures for the ?lab=path review
// page and its screenshot checks (test/ui/path.spec.mjs), built by the real
// worker/path.js from the SAT pack. Run after changing the path's shape:
//   node scripts/path-lab-fixtures.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { buildPath } from "../worker/path.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const map = read("../exams/sat/skills.json");
const exam = read("../exams/sat/exam.json");
const voice = read("../exams/sat/voice.json");
const SKILLS = [];
for (const sec of map.sections) for (const d of sec.domains) for (const s of d.skills) {
  SKILLS.push({ id: s.id, name: s.name, prereqs: s.prereqs, section_id: sec.id, domain_id: d.id, domain_name: d.name, domain_weight: d.weight, position: SKILLS.length, attempts: 0, mastery: 0 });
}
const sections = exam.sections.map((s) => ({ id: s.id, name: s.name }));
const learned = (ids, mastery = 55) => SKILLS.map((s) => (ids.includes(s.id) ? { ...s, attempts: 10, mastery } : s));
const base = { today: "2026-11-12", exam_date: "2027-03-13", plan_started_at: "2026-11-01", daily_minutes: 20, reviews_due: 0, sections, skill_about: voice.skill_about };
const path = (o) => buildPath({ ...base, ...o });

const alg = SKILLS.filter((s) => s.domain_id === "alg").map((s) => s.id);
const all = SKILLS.map((s) => s.id);
const out = {
  // Shown by the lab's top bar and disclaimer.
  exam: {
    id: exam.id, name: exam.name, short_name: exam.short_name, default_section: exam.default_section,
    publisher: exam.publisher, placement: exam.placement,
    sections: exam.sections.map((s) => ({ id: s.id, name: s.name, domains: map.sections.find((x) => x.id === s.id).domains.map((d) => ({ id: d.id, name: d.name, weight: d.weight })) })),
  },
  states: {
    fresh: path({ skills: SKILLS, stats: { xp: 0, streak: 0, xp_today: 0, reviews_due: 0 } }),
    mid: path({
      skills: learned(["alg-linear-eq-1var", "alg-linear-func"]).map((s) => (s.id === "alg-linear-eq-1var" ? { ...s, mastery: 41 } : s)),
      reviews_due_by_skill: { "alg-linear-func": 2 },
      stats: { xp: 150, streak: 3, xp_today: 75, reviews_due: 2 },
    }),
    teal: path({
      skills: learned(alg, 70),
      nodes_done: ["review:alg:1", "check:alg"],
      stats: { xp: 640, streak: 6, xp_today: 95, reviews_due: 0 },
    }),
    done: path({
      skills: learned(all, 85).map((s) => ({ ...s, mastered: true })),
      nodes_done: ["check:rw-eoi"],
      stats: { xp: 4210, streak: 41, xp_today: 120, reviews_due: 4 },
    }),
  },
};
writeFileSync(new URL("../app/src/lab/path.json", import.meta.url), JSON.stringify(out) + "\n");
console.log(Object.entries(out.states).map(([k, p]) => `${k}: current ${p.current}`).join("\n"));
