# Testwise

Short daily SAT Math practice. Lessons adapt to each learner, questions they miss come back as spaced review, and Socrates, an AI tutor, helps them reason through a wrong answer instead of just showing the solution.

This is the v0 rebuild. The old version lives in `testwise-old` and is kept for reference only.

## What's here

| Path | What it is |
| --- | --- |
| `content/skills.json` | Skill map: exams → sections → domains → skills, with prerequisites (SAT Math: 19 skills; SAT Reading and Writing: 10) |
| `content/ITEM_FORMAT.md`, `RW_FORMAT.md`, `FIGURE_FORMAT.md` | How questions, passages and figures are written |
| `content/items/*.json` | Practice questions, one file per skill (format in `content/ITEM_FORMAT.md`) |
| `content/reports/*.json` | Notes from the independent review of each skill's questions |
| `scripts/check_items.py` | Validates every question and re-computes its answer with code |
| `scripts/build-seed.mjs` | Turns the content files into `seed/seed.sql` for the database |
| `migrations/` | D1 (SQLite) schema |
| `worker/engine.js` | Adaptive engine: ratings, lesson picking, spaced review, streaks, answer checking |
| `worker/socrates.js` | The tutor: prompt, Claude API call, and an offline fallback that walks through hints |
| `worker/index.js` | API entry point (Cloudflare Worker, Hono router) |
| `worker/routes/` | One module per API area: tree, lessons and placement, answers, Socrates, reports |
| `worker/schemas.js` | Request body shapes (zod) |
| `docs/PLAN.md` | Release checklist for v1 to v5 |
| `app/src/figure/` | Draws question figures from their spec (react-native-svg) |
| `app/src/text/` | Passages (blanks, underlines, notes) and the TeX-subset math renderer |
| `app/` | Expo (React Native) app. Exports to web now; the same code builds for iOS later |
| `test/` | Unit tests for the engine and an end-to-end API check |

## How questions are made

1. A writer drafts questions per skill in even thirds of easy, medium and hard, each with a worked solution, Socratic hints and the misconception behind every wrong choice. Math questions (1,725: 75 per skill plus 300 with figures) also carry Python code that computes the answer independently. Reading and Writing has 1,600 (160 per skill), one question per passage.
2. `check_items.py` runs that code and rejects any Math question whose code doesn't reproduce the key. It also checks figure specs, passage lengths, markup and that every wrong choice has a reason.
3. A separate reviewer solves every question blind, without seeing the key, and fixes or removes any that are wrong, ambiguous, or off-level. The figure and Reading and Writing questions then got a second, adversarial review that looks for a defensible second answer, data that doesn't match, and factual errors.
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
- "Delete my data" on Home calls `POST /api/learner/delete`, which removes the learner and all their progress and chats.
- The privacy policy and terms are static pages in `app/public/` (served at `/privacy` and `/terms`).

## Run it locally

```sh
npm install && (cd app && npm install)
npm run build:app        # web export into app/dist
npm run dev              # seeds a local D1 database and starts wrangler on :8787
npm test                 # engine unit tests + question checker
node test/e2e-api.mjs    # end-to-end API check against the dev server
```

## Deploy (Cloudflare)

Deploys run from GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`), the same way Reed does.

One-time setup:

1. Cloudflare: My Profile, API Tokens, Create Custom Token, with Account permissions **Workers Scripts: Edit** and **D1: Edit**. Copy the token and your Account ID (shown on the Workers & Pages overview).
2. Anthropic Console: create an API key for Socrates and set a monthly spend limit.
3. This repo: Settings, Secrets and variables, Actions. Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLAUDE_API_KEY` (your Claude API key; the deploy hands it to the Worker as `ANTHROPIC_API_KEY`).
4. Merge to `main`, or run the Deploy workflow by hand. It runs the tests, builds the web app, creates the D1 database if missing, applies migrations, loads the questions, deploys the Worker, and passes the API key to it as a Worker secret.

The preview runs on `testwise.<your-subdomain>.workers.dev`. The deploy log prints the exact URL. The app also works mounted at `muscoota.com/testwise`, but no route is configured until that's approved.

Socrates' model is the `TUTOR_MODEL` variable in `wrangler.jsonc`. Without `ANTHROPIC_API_KEY`, Socrates walks through each question's written hints instead.
