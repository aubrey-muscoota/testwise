# Adding an exam

Every exam is a folder in `exams/`. The Worker, the app, the seed and the checker read everything exam-specific from it, so a new exam is content work, not code work. `exams/sat/` is the reference pack; `test/fixtures/exams/demo/` is the smallest pack that works (the tests load it to prove that).

```
exams/
  ITEM_FORMAT.md        question format shared by every exam
  FIGURE_FORMAT.md      figure specs shared by every exam
  <id>/
    exam.json           sections, timing, scoring, placement, plan defaults, disclaimer
    skills.json         sections → domains (with weights) → skills (with prerequisites)
    voice.json          Socrates' exam-specific lines and persona notes
    items/<skill>.json  questions, one file per skill
    docs/               exam-specific format notes (SAT: RW_FORMAT.md)
    reports/            notes from each review pass, one file per skill and batch
```

## Steps

1. **Scaffold.** `npm run new-exam -- gre "GRE General Test"` writes `exams/gre/` with every file filled with a working example and `"enabled": false`. Keys starting with `//` are comments; the seed drops them.
2. **Fill `exam.json`** from the publisher's public test specs (fields below). Ids for sections, domains, skills and items are global in the database, so prefix them with the exam id (`gre-quant`, `gre-qc-compare`).
3. **Write the skill map** in `skills.json`: the publisher's content domains, each with its `weight` (share of the section's questions; a section's weights add up to 1), and 3 to 8 skills per domain with `prereqs`. Order skills the way they should be learned; the first skill of a domain should need nothing outside it. Placement picks its probes from early, middle and late skills, so the prerequisite chains matter.
4. **Write format notes** in `docs/` for anything ITEM_FORMAT.md doesn't cover (passage lengths, new stem patterns, style). If a section needs a passage per question, set its `passage` rules in `exam.json` so `check_items.py` enforces them.
5. **Write `voice.json`**: what Socrates should know about the test (`persona_notes`, 2 to 4 sentences, they go into his system prompt), what he calls the sections and the typed-answer type (`terms`), the line he says before each section's placement quiz (`placement_intro`), and `test_day_tips`.
6. **Write and check items** with the pipeline below.
7. **Check it:** `npm run seed` (validates every enabled pack and lists all problems), `npm test`, then load it locally (README, "Run it locally") and walk through it in the app.
8. **Enable it** (`"enabled": true`) once it meets the definition of ready. Until learners can pick an exam (v3), the app shows the exam named by `DEFAULT_EXAM` in `wrangler.jsonc`.

## How questions are made

This is the pipeline the SAT's 3,325 questions went through. Run it per skill.

1. **Draft.** A writer drafts the skill's questions in even thirds of easy, medium and hard. Each has a worked `explanation` (2 to 6 steps), 2 or 3 Socratic `hints` that don't give the answer away, and a `wrong_reasons` entry for every wrong choice naming the misconception behind it. Computable answers carry `check` code (Python with sympy; never numpy, CI installs only sympy).
2. **Code check.** `python3 -I scripts/check_items.py exams/<id>/items/*.json` runs every `check` and rejects any question whose code doesn't reproduce the key. It also checks the schema, the choice count and item types from `exam.json`, figure specs, passage rules and that every wrong choice has a reason.
3. **Blind solve.** A separate reviewer solves every question without seeing the key and fixes or removes any that are wrong, ambiguous or off-level. Their notes go in `reports/<skill>.json`.
4. **Adversarial review.** A second reviewer looks for a defensible second answer, data or figures that don't match the stem, factual errors in passages and questions that are too close to each other. Notes in `reports/<skill>-batch2.json`.
5. **Balance answer positions.** `python3 -I scripts/balance_choices.py exams/<id>/items/*.json` spreads the keys evenly across the letters (numeric choices are sorted ascending) and restores any question whose `check` depends on the order. Run `check_items.py` again afterwards.
6. **Duplicate scan.** Compare every pair of stems within the exam (and against other exams for shared skills) after normalizing numbers and names; rewrite any near-duplicates. There is no script for this in the repo yet; record what was compared in `reports/`.

## exam.json fields

| Field | What it's for |
| --- | --- |
| `id` | Folder name; prefix for every other id in the pack |
| `enabled` | `false` keeps the pack out of the seed and the app |
| `name`, `short_name` | "GRE General Test", "GRE". Socrates says "the {short_name}" |
| `tagline` | Welcome screen headline |
| `audience` | Who studies for it, as Socrates pictures them ("high school students") |
| `publisher.name`, `publisher.disclaimer` | Trademark owner and the line shown on Welcome and Home |
| `score` | Total score scale `{min, max, step}` |
| `default_section` | Section of the sign-up placement quiz and the path Home opens on |
| `sections[]` | `id`, `name`, `minutes`, `questions`, `modules`, `seconds_per_question` (pacing for timed sets), `score`, `item_types` (`mc`, `spr`), `choices` (per `mc` question), `code_checks`, optional `passage` rules (`required`, `min_words`, `max_words`, `paired_max_words`) |
| `placement` | `per_domain` probes per domain, `difficulties` (one per probe level, 1 to 3), `seconds_per_question` (for the "about N minutes" estimate) |
| `plan` | `default_weeks` without a test date, `daily_minutes` options, `default_daily_minutes`, `rest_days_per_week`, `phases[]` (`id`, `name`, `share`; shares add up to 1) |

Domain weights live on each domain in `skills.json`, so there is one source. The seed writes them to `domains.weight`, and `GET /api/exam` returns them under `sections[].domains`.

## Where it ends up

- `npm run seed` writes `exam.json` and `voice.json` into the exam's row in D1 (`exams.config`, `exams.voice`), next to its sections, domains, skills and items.
- The Worker reads the pack through `worker/lib/exam.js` (`learnerExam`, `sectionOf`) and serves it at `GET /api/exam`. Socrates' prompt is built from it (`buildPersona` in `worker/socrates.js`); placement uses its default section and placement config.
- The app loads `/api/exam` at boot (`loadExam`, `getExam` in `app/src/api.ts`) for the tagline, disclaimer, placement copy and sections.

## Definition of ready

- [ ] `npm run seed` lists no problems and `npm test` passes with the pack enabled.
- [ ] Every skill has at least 75 live questions in even thirds of difficulty (passage-based skills: 160, one question per passage), and every `mc` question has a reason for each wrong choice.
- [ ] Every question passed the code check (where computable), the blind solve and the adversarial review, with notes in `reports/`; answer positions are balanced; the duplicate scan found no pairs.
- [ ] Domain weights match the publisher's published section breakdown.
- [ ] Placement works for every section: the quiz starts, has `per_domain` questions per domain, easy to hard, and finishing it tests out skills.
- [ ] The plan engine has what it needs: weights on every domain, section timing, `plan` defaults.
- [ ] Socrates' persona reads right for the exam (check `buildPersona` output) and the offline hints work.
- [ ] Screenshots of Welcome, placement, Home, a lesson with each item type the exam uses, and the Complete screen, at iPhone SE, iPhone 15 and 1440px widths, with no text from another exam.
