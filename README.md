# Testwise

Short daily SAT practice (Math and Reading and Writing), built around a plan that works back from the student's test date. Lessons adapt to each learner, questions they miss come back as spaced review, and Socrates, an AI tutor, helps them reason through a wrong answer instead of just showing the solution.

Current status and handoff notes: `docs/HANDOFF.md`. The old prototype lives in `testwise-old` and is kept for reference only.

## What's here

| Path | What it is |
| --- | --- |
| `exams/<id>/` | One exam pack per exam (only `sat` so far): `exam.json` (sections, timing, scoring, placement, plan defaults, disclaimer), `skills.json` (sections → domains with weights → skills with prerequisites; SAT Math: 19 skills, Reading and Writing: 10), `voice.json` (Socrates' exam lines), `items/<skill>.json`, `docs/` and `reports/`. How to add one: `docs/ADDING_AN_EXAM.md` |
| `exams/ITEM_FORMAT.md`, `exams/FIGURE_FORMAT.md` | How questions and figures are written, for every exam (SAT passages: `exams/sat/docs/RW_FORMAT.md`) |
| `exams/sat/reports/*.json` | Notes from the independent review of each skill's questions |
| `scripts/new-exam.mjs` | `npm run new-exam -- <id> "<Name>"` scaffolds a disabled exam pack |
| `scripts/check_items.py` | Validates every question and re-computes its answer with code |
| `scripts/scan_duplicates.py` | Finds pairs of questions that are too alike (same question, same template with the same answer, passages on one subject); runs in `npm test` |
| `scripts/build-seed.mjs` | Validates every enabled exam pack and turns it into `seed/seed.sql` for the database |
| `migrations/` | D1 (SQLite) schema |
| `worker/engine.js` | Adaptive engine: ratings, lesson picking, spaced review, streaks, answer checking |
| `worker/socrates.js` | The tutor: prompt, Claude API call, and an offline fallback that walks through hints |
| `worker/plan.js` | Study plan: works back from the test date in phases and sizes today's tasks to the learner's daily time |
| `worker/practice.js` | Practice mode: which skills and questions a session gets (unseen, then missed, then oldest) |
| `worker/generate.js` | Fresh questions: Claude writes a batch, a blind second call must agree, code checks the shape |
| `docs/API.md` | Profile, plan and practice endpoints with request and response examples |
| `worker/index.js` | API entry point (Cloudflare Worker, Hono router) |
| `worker/lib/exam.js` | The learner's exam pack, read from D1 (`GET /api/exam`) |
| `worker/routes/` | One module per API area: tree, lessons and placement, answers, Socrates, reports |
| `worker/schemas.js` | Request body shapes (zod) |
| `docs/PLAN.md` | Release checklist for v1 to v5 |
| `app/src/figure/` | Draws question figures from their spec (react-native-svg) |
| `app/src/text/` | Passages (blanks, underlines, notes) and the TeX-subset math renderer |
| `app/` | Expo (React Native) app. Exports to web now; the same code builds for iOS later |
| `test/` | Unit tests for the engine and exam packs (with a test-only pack in `test/fixtures/exams/demo/`) and an end-to-end API check |
| `test/ui/` | Screenshot checks of every item type renderer at 390x844, 375x667 and 1440x900 (`npx playwright test`); the fixtures are `app/src/lab/items.json`, drawn by the app at `?lab=renderers` |

## How questions are made

Each exam's questions live in its pack, `exams/<id>/items/`. `docs/ADDING_AN_EXAM.md` has the full pipeline for a new exam.

1. A writer drafts questions per skill in even thirds of easy, medium and hard, each with a worked solution, Socratic hints and the misconception behind every wrong choice. Math questions (1,725: 75 per skill plus 300 with figures) also carry Python code that computes the answer independently. Reading and Writing has 1,600 (160 per skill), one question per passage.
2. `check_items.py` runs that code and rejects any Math question whose code doesn't reproduce the key. It also checks figure specs, passage lengths, markup and that every wrong choice has a reason, with the rules for each section (item types, choice count, passages) taken from the pack's `exam.json`.
3. A separate reviewer solves every question blind, without seeing the key, and fixes or removes any that are wrong, ambiguous, or off-level. The figure and Reading and Writing questions then got a second, adversarial review that looks for a defensible second answer, data that doesn't match, and factual errors. `balance_choices.py` then spreads the answer positions evenly, and `scan_duplicates.py` (part of `npm test`) fails on any two questions that are the same question twice.
4. In the app, students can report a question. Reports are stored in `item_checks`.

All questions are original. Testwise is not affiliated with College Board.

## How the adaptive part works

- Each learner has a rating per skill, and each question has a difficulty rating on the same scale (Elo/Rasch style). Every answer nudges both.
- A lesson is 8 questions: up to 3 due reviews first, then unseen questions near the level the learner gets right about 65% of the time, easiest first.
- A missed question comes back at the end of the lesson, then again tomorrow, then after 2.5, 6 and 16 days. After that it graduates.
- New learners can take a 12-question placement quiz: three per domain, from an early, a middle and a late skill, easy to hard. A passed question tests out that skill and everything it builds on (a medium or hard pass only counts if an easier one in the same domain was also right). Tested-out skills stay open to practice.
- A skill unlocks after 8 answers in each of its prerequisites. It counts as mastered after 12+ answers at 80%+ predicted accuracy on medium-hard questions.

## Socrates

`POST /api/socrates` sends the question, the verified answer, the worked solution, the student's answer and the likely misconception to Claude, with instructions to guide with one question at a time and never contradict the key. Each learner gets 5 conversations a day, up to 6 messages each. Every turn is logged in `tutor_turns` for review.

Without an `ANTHROPIC_API_KEY` secret, Socrates still works from the question's written hints and solution.

## Age question, AI consent and data deletion

- New learners answer a neutral "When were you born?" question first. Testwise only creates a learner for 13 or older and never stores the birthday. An under-13 answer closes the question on that device for a day. Learners from before this answer it once; if under 13, their data is deleted.
- Socrates sends the question and the student's messages to Anthropic, so the app asks for a one-time OK before the first chat (App Store Guideline 5.1.2(i)). `POST /api/socrates` returns 403 `consent_required` until `POST /api/consent {"ai": true}`. Home has a link to turn it off.
- "Download my data" in Me calls `GET /api/learner/export` and saves everything stored about the learner as one JSON file (`docs/API.md`, "Your data"). "Delete my data" calls `POST /api/learner/delete`, which removes the learner and all their progress and chats.
- The privacy policy and terms are static pages in `app/public/` (served at `/privacy` and `/terms`).

## Run it locally

```sh
npm install && (cd app && npm install)
npm run build:app        # web export into app/dist
npm run dev              # seeds a local D1 database and starts wrangler on :8787
npm test                 # unit tests + question checker (several minutes)
node test/e2e-api.mjs    # end-to-end API check against the dev server (or: node test/e2e-api.mjs http://localhost:8791)
npx playwright test      # every item type at three screen sizes, against test/ui/__screenshots__ (needs app/dist)
```

## Deploy (Cloudflare)

Testwise runs in two places, each with its own Worker and its own D1 database:

| | Address | Database | Updates when |
| --- | --- | --- | --- |
| Staging | `testwise-staging.<your-subdomain>.workers.dev` | `testwise-staging` | Every merge to `main` (`.github/workflows/deploy-staging.yml`) |
| Production | `testwise.<your-subdomain>.workers.dev` | `testwise` | A GitHub release is published, or the "Deploy production" workflow is run by hand (`.github/workflows/deploy-production.yml`) |

Production is what students use. Staging is where each change lands first, so it can be tried before students see it. The two never share data. Both workflows run the same steps (`.github/workflows/deploy-reusable.yml`): tests, web build, create the D1 database if missing, apply migrations, load the questions, deploy the Worker, and pass the API key to it as a Worker secret. In `wrangler.jsonc`, the top level is production and `env.staging` is staging; wrangler doesn't carry vars or databases into an env, so staging repeats them (a test checks the var names match).

One-time setup:

1. Cloudflare: My Profile, API Tokens, Create Custom Token, with Account permissions **Workers Scripts: Edit** and **D1: Edit**. Copy the token and your Account ID (shown on the Workers & Pages overview).
2. Anthropic Console: create an API key for Socrates and set a monthly spend limit. Staging and production share it.
3. This repo: Settings, Secrets and variables, Actions. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLAUDE_API_KEY` (your Claude API key; the deploy hands it to the Worker as `ANTHROPIC_API_KEY`).
4. Merge to `main`: staging deploys and creates its database the first time.

Releasing to production:

1. Try the change on staging.
2. On GitHub, open Releases, click "Draft a new release", create a new tag such as `v1.6.0` on `main`, and click "Publish release". The "Deploy production" workflow starts on its own. A release marked "Set as a pre-release" does not deploy.
3. To roll back, open Actions, pick "Deploy production", click "Run workflow" and enter the older release tag. Migrations only move forward, so a migration must keep working with the previous release's code (add columns and tables, don't drop or rename them in the same release that stops using them).

To require a second click before production deploys, open Settings, Environments, "production" (or create it with "New environment" before the first release) and add yourself under "Required reviewers". GitHub offers this on public repos and, for private repos, only on some paid plans. Without it, the gate is who can publish releases or run workflows, which is everyone with write access to the repo.

The app also works mounted at `muscoota.com/testwise`, but no route is configured until that's approved.

Socrates' model is the `TUTOR_MODEL` variable in `wrangler.jsonc`. Without `ANTHROPIC_API_KEY`, Socrates walks through each question's written hints instead.
