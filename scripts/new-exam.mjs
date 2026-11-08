// Scaffolds a new exam pack in exams/<id>/ (see docs/ADDING_AN_EXAM.md).
//
// Usage: npm run new-exam -- <id> "<Name>" [--dir <examsDir>]
//   e.g. npm run new-exam -- gre "GRE General Test"
//
// The pack starts with "enabled": false, so the seed skips it until it is ready.
// Every file is valid as written: flip "enabled" to true and the seed loads the
// example skill and question, which is a quick way to see a new exam in the app.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const json = (v) => JSON.stringify(v, null, 2) + "\n";

/** Writes the pack files and returns the folder. Throws on a bad id or an existing folder. */
export function scaffoldExam(id, name, examsDir = "exams") {
  if (!/^[a-z][a-z0-9-]{1,15}$/.test(id || "")) throw new Error(`exam id must be 2-16 lowercase letters, digits or hyphens, starting with a letter (got ${JSON.stringify(id)})`);
  if (!name?.trim()) throw new Error('give the exam a name, e.g. npm run new-exam -- gre "GRE General Test"');
  const dir = join(examsDir, id);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  const section = `${id}-section1`;
  const domain = `${id}-domain1`;
  const skill = `${id}-skill1`;

  const exam = {
    "//": "Exam pack config. Keys starting with // are comments; the seed drops them. Field reference: docs/ADDING_AN_EXAM.md.",
    id,
    "// enabled": "false keeps this pack out of the seed (and the app) until it meets the definition of ready.",
    enabled: false,
    name,
    short_name: id.toUpperCase(),
    "// tagline": "Welcome screen headline.",
    tagline: `${id.toUpperCase()} practice, five minutes a day`,
    "// audience": "Who studies for it, as Socrates should picture them (\"high school students\", \"graduate school applicants\").",
    audience: "test takers",
    publisher: {
      name: "The publisher",
      "// disclaimer": "Shown on Welcome and Home. Name the trademark owner.",
      disclaimer: `Testwise is not affiliated with the publisher of the ${id.toUpperCase()}.`,
    },
    "// score": "Total score scale.",
    score: { min: 0, max: 100, step: 1 },
    "// default_section": "The section the sign-up placement quiz covers and the path Home opens on.",
    default_section: section,
    sections: [
      {
        "// id": "Globally unique (prefix it with the exam id). skills.json lists its domains under the same id.",
        id: section,
        name: "Section one",
        "// minutes, questions, modules": "As on the real test. seconds_per_question is the pacing target for timed sets.",
        minutes: 30,
        questions: 20,
        modules: 1,
        seconds_per_question: 90,
        score: { min: 0, max: 50, step: 1 },
        "// item_types": "Which of mc (multiple choice) and spr (typed answer) this section uses.",
        item_types: ["mc", "spr"],
        "// choices": "Answer choices per mc question (4 for SAT, 5 for GRE/GMAT, 3 for CFA).",
        choices: 4,
        "// code_checks": "true: every computable answer carries Python in `check` (scripts/check_items.py runs it). false: check must be null.",
        code_checks: true,
        "// passage": "Optional. {\"required\": true, \"min_words\": 20, \"max_words\": 165, \"paired_max_words\": 125} makes check_items enforce a passage per item.",
      },
    ],
    "// placement": "Sign-up quiz: per_domain questions per domain, from early to late skills, at these difficulties (1 easy, 2 medium, 3 hard).",
    placement: { per_domain: 3, difficulties: [1, 2, 3], seconds_per_question: 25 },
    "// plan": "Study plan defaults: weeks when there's no test date, daily time options, and how the weeks split into phases (shares add up to 1).",
    plan: {
      default_weeks: 8,
      daily_minutes: [10, 20, 30, 45],
      default_daily_minutes: 20,
      rest_days_per_week: 1,
      phases: [
        { id: "learn", name: "Learn", share: 0.5 },
        { id: "strengthen", name: "Strengthen", share: 0.3 },
        { id: "test-ready", name: "Test-ready", share: 0.2 },
      ],
    },
  };

  const skills = {
    "//": "Sections (ids from exam.json) → domains → skills. A domain's weight is its share of the section's questions; weights in a section add up to 1. Ids are global: prefix them with the exam id.",
    sections: [
      {
        id: section,
        domains: [
          {
            id: domain,
            name: "Domain one",
            weight: 1,
            skills: [{ id: skill, name: "Skill one", prereqs: [] }],
          },
        ],
      },
    ],
  };

  const voice = {
    "//": "Socrates' exam-specific lines. persona_notes go into his system prompt; the app reads placement_intro and test_day_tips.",
    persona_notes: [`The ${id.toUpperCase()} has one section so far. Replace this with what a tutor should know about the test.`],
    terms: { spr: "student-produced response", sections: { [section]: "Section one" } },
    placement_intro: { [section]: "Already know some of this? Answer a few questions and I'll skip you past what you know." },
    test_day_tips: ["Answer every question if there's no penalty for guessing."],
  };

  const item = [
    {
      id: `${skill}-001`,
      skill_id: skill,
      difficulty: 1,
      type: "mc",
      stem: "Example question: what is 2 + 3?",
      choices: ["4", "5", "6", "23"],
      answer: "5",
      explanation: ["Add the two numbers.", "2 + 3 = 5."],
      hints: ["What does + ask you to do?"],
      wrong_reasons: { "4": "Counted one short", "6": "Counted one too many", "23": "Wrote the digits side by side" },
      check: "result = 2 + 3",
    },
  ];

  mkdirSync(join(dir, "items"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "exam.json"), json(exam));
  writeFileSync(join(dir, "skills.json"), json(skills));
  writeFileSync(join(dir, "voice.json"), json(voice));
  writeFileSync(join(dir, "items", `${skill}.json`), json(item));
  writeFileSync(join(dir, "docs", "README.md"), `# ${name}: format notes\n\nExam-specific rules for writers (passage lengths, item types, style). The format shared by every exam is in exams/ITEM_FORMAT.md and exams/FIGURE_FORMAT.md.\n`);
  return dir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--dir");
  const examsDir = i >= 0 ? args.splice(i, 2)[1] : "exams";
  try {
    const dir = scaffoldExam(args[0], args.slice(1).join(" "), examsDir);
    console.log(`Created ${dir}/ (enabled: false). Next steps: docs/ADDING_AN_EXAM.md`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
