# Testwise handoff (Nov 9, 2026, evening)

This is the current status of Testwise and everything a new Claude Code session needs to keep building it. Read this
first, then `docs/PLAN.md` (release checklist) and `docs/DESIGN.md` (design rules). `CLAUDE.md` at the repo root holds
the working rules in short form.

## What Testwise is

"Duolingo for standardized tests." Short daily sessions, an adaptive engine, and Socrates, an AI tutor that helps a
student reason through a wrong answer instead of just showing the solution. SAT first (Math and Reading and Writing),
then GRE, GMAT and CFA Level I. Owner: Aubrey Perona (Muscoota Ventures). All names, including "Testwise" and
"Socrates", are placeholders.

The app is a rebuild of an unfinished 2024 prototype (repo `aubrey-muscoota/testwise-old`, kept for reference only;
Aubrey's original brand docs are on Google Drive: Nunito, Azure #58A6FF, Socrates as the differentiator).

## Where things are

| What | Where |
| --- | --- |
| Repo | `aubrey-muscoota/testwise`, default branch `main` |
| Production | https://testwise.aubrey-9f5.workers.dev (Cloudflare Workers + D1 + static assets), database `testwise` |
| Staging | https://testwise-staging.aubrey-9f5.workers.dev, database `testwise-staging` (its own data, never shared) |
| Deploys | Every merge to `main` deploys staging (`deploy-staging.yml`). Production deploys when Aubrey publishes a GitHub release (`deploy-production.yml`; run it by hand with an older tag to roll back). Both call `deploy-reusable.yml`: tests, web build, D1 migrations, seed, `wrangler deploy`, API key to Worker secret. README, "Deploy" |
| CI on PRs | `.github/workflows/test.yml`: job `test` (`npm test`, `tsc`, web build, `wrangler deploy --dry-run` for production and staging) and job `ui` (renderer screenshots) |
| Full build plan (v0 to v5, architecture, content pipeline, quality gates, business, risks) | Claude Doc "Testwise build plan: v0 to v5": https://claude.ai/artifact/EfYH3r2gBRBcNnUPTvGauJ |
| Release checklist | `docs/PLAN.md` (tick items in the PR that finishes them) |
| Design rules | `docs/DESIGN.md` (palette, type, layout, voice, motion, Do list, Never checklist) |
| API | `docs/API.md` (profile, plan, path, practice endpoints) |
| Adding an exam | `docs/ADDING_AN_EXAM.md` |
| Screenshots of the current UI | Project files `testwise/v15-ui/` (390x844, 375x667, 1440x900) |
| Renderer screenshot checks | `test/ui/renderers.spec.mjs` and its baselines in `test/ui/__screenshots__/` (CI job `ui`); fixtures `app/src/lab/items.json`; the page is `?lab=renderers` |
| Path screenshot checks | `test/ui/path.spec.mjs` (fresh; mid-path with the current, a locked and a review card open; the second section; the end); fixtures `app/src/lab/path.json` from `scripts/path-lab-fixtures.mjs`; the page is `?lab=path` |
| muscoota.com/testwise | A static info page on the Muscoota site (separate repo `aubrey-muscoota/muscoota-site`). There is no link or route from muscoota.com to the app, on purpose |

Secrets (GitHub repo secrets, never in code or chat): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`CLAUDE_API_KEY` (handed to the Worker as `ANTHROPIC_API_KEY`). Model ids live only in `wrangler.jsonc` vars
(`TUTOR_MODEL`, `GENERATOR_MODEL`).

## Architecture in one screen

- **Worker** (`worker/`): Hono router, zod request schemas, one module per API area in `worker/routes/`.
  - `engine.js`: Elo/Rasch-style ratings per learner-skill and per item, lesson picking (reviews first, then unseen
    items near 65% predicted success), spaced review (end of lesson, 1, 2.5, 6, 16 days), unlocks (8 answers in each
    prerequisite) and mastery (12+ answers at 80%+ predicted on medium-hard).
  - `plan.js`: pure `buildPlan`. Works back from the test date in the pack's phases (Learn 50%, Strengthen 30%,
    Test-ready 20%, a rest day a week) and sizes today's tasks to the learner's daily minutes. New skills come in
    path order (`unitOrder`: one unit per domain, the sections interleaved).
  - `path.js`: pure `buildPath`, the Learn tab's nodes (lessons, a review every three, a unit check, the end) and
    their states (done, current, open, locked; exactly one current).
  - `practice.js`: practice sessions. Modes: weak spots, my mistakes, timed set, mixed, review (due reviews first, for path review nodes), one skill, fresh. Serves
    unseen, then missed, then oldest seen.
  - `generate.js`: fresh questions. Claude writes a batch, a blind second call must reach the same key, code checks
    the shape. Stored in `items` with `source='generated'` (a trigger keeps them through reseeds). Caps: 20 per learner
    per day, `GENERATOR_DAILY_CAP` (200) overall. Falls back to recycled questions when it can't generate.
  - `socrates.js`: the tutor. 5 chats a day, 6 messages each, every turn logged in `tutor_turns`. Without an API key
    it walks through the item's written hints.
  - `lib/exam.js`: reads the learner's exam pack from D1 (60 s cache). `GET /api/exam` works without a learner.
- **Database**: D1 (SQLite). Migrations `0001` to `0007` (`0007` adds `lessons.node`, the path node a lesson or practice set was started from). `seed/seed.sql` is generated by `npm run seed` from the
  exam packs and never edited by hand.
- **Exam packs** (`exams/<id>/`): `exam.json` (sections, timing, score scale, item types, placement, plan phases and
  daily-minute options, publisher disclaimer, `enabled`), `skills.json` (sections, domains with weights, skills with
  prerequisites), `voice.json` (Socrates' exam-specific lines and skill descriptions), `items/<skill>.json`, `docs/`,
  `reports/`. Config is stored in D1, so a new exam needs no code change. A test-only pack in
  `test/fixtures/exams/demo/` proves it.
- **App** (`app/`): Expo SDK 58 (React Native 0.88, react-native-web), exported to web into `app/dist` and served by
  the Worker as static assets. The same code is meant to build for iOS through EAS in v2.
  - Screens (`app/src/screens/`): Welcome, AgeGate, Onboarding (test date, target score, daily minutes),
    PlacementIntro, Learn (the path, `app/src/path/` for its banner, nodes, track and card), Progress (countdown,
    on-track check, skills done per section, this month's streak calendar, the plan's weeks), Practice ("Fix my
    mistakes" on top, the other sets as rows), Me (settings only), Lesson, Complete. `components/TopBar.tsx` is the days/streak/XP bar. The lesson's parts live in
    `app/src/lesson/`: `Question` (passage, figure, table, stem, choices, typed answer, solution), `ResultPanel`,
    `Tutor` (the chat) and the consent and quit sheets. Dev-only pages: `?lab=socrates` (the rig) and
    `?lab=renderers` (every item type, used by the screenshot checks) and `?lab=path&state=fresh|mid|teal|done&open=<node>`
    (the Learn tab from `app/src/lab/path.json`, made by `node scripts/path-lab-fixtures.mjs`; used by
    `test/ui/path.spec.mjs`).
  - Navigation: bottom tabs (Learn, Practice, Progress, Me) on phones, a left rail at 900 px and wider. The top bar
    sits over every tab. Today and the old Path tab are gone: the path (`GET /api/path`, built by `worker/path.js`
    from the plan's unit order) is the home screen.
  - `app/src/socrates/`: the animated Socrates rig in react-native-svg (7 moods, breathing, blinking, glances,
    talking mouth). `SocratesAvatar` everywhere; `components/SocratesLine.tsx` types his words out.
  - `theme.ts`: every color, size and radius token. `components/icons.tsx`: the one line-icon family. `copy.ts`:
    shared app copy.
  - `figure/` draws question figures from JSON specs; `text/` renders passages and a TeX subset as text.

## Content

3,331 items in the SAT pack: SAT Math 1,725 (19 skills x 75, plus 300 figure items) and Reading and Writing 1,600
(10 skills x 160, one question per passage). Pipeline for every batch:

1. Writer drafts per skill in even thirds easy/medium/hard, each with solution, Socratic hints and a reason for every
   wrong choice. Math items carry Python that recomputes the key.
2. `scripts/check_items.py` runs the code and the format rules from `exam.json` (CI installs only sympy: never import
   numpy in item checks).
3. A separate reviewer solves every item blind and fixes or drops bad ones; figure and R&W items also got an
   adversarial audit (about 40 fixes, nothing dropped).
4. `scripts/balance_choices.py` spreads answer positions (items whose explanation names a choice by letter keep their
   order).
5. `scripts/scan_duplicates.py` (in `npm test`) fails on two items that are the same question (same answer, same
   wording or template) and lists pairs that share a template or a passage subject. Reviewed pairs that are fine go in
   `exams/sat/reports/duplicates-allowed.json`; the first pass (Nov 2026) is written up in `exams/sat/reports/duplicates-2026-11.json`.
6. In the app, learners can report a question (`item_checks` table).

Templated wrong-answer reasons ("Picked because...") were stripped by `scripts/strip-reason-templates.mjs`; a test
guards against them coming back.

## Release history

| PR | Merged | What |
| --- | --- | --- |
| #1 | Nov 5 | v0: SAT Math skill map, adaptive engine, Socrates tutor, Expo web app, deploy workflow |
| #2 | Nov 5 | Read the API key from `CLAUDE_API_KEY` |
| #3 | Nov 5 | Motion, sound and haptics |
| #4 | Nov 5 | 75 questions per Math skill (1,425) and a placement quiz |
| #5 | Nov 6 | Worker split into route modules (Hono, zod) |
| #6 | Nov 6 | Age question (13+), AI consent before Socrates, delete-my-data, privacy and terms drafts |
| #7 | Nov 6 | Multi-exam content model: sections, passages, figure specs, TeX subset |
| #8 | Nov 6 | 1,600 R&W items, 300 Math figure items, placement per section |
| #9 | Nov 8 | v1.5 "Depth and craft": exam packs, test-date plan, practice modes, fresh questions, animated Socrates, full redesign to `docs/DESIGN.md` after a strict review (95 findings, 57 fixed, then 18 more) |
| #10 | Nov 9 | Handoff doc and `CLAUDE.md` |
| #11 | Nov 9 | Lesson screen split into `app/src/lesson/`; renderer screenshot checks (15 fixtures, 3 widths) in CI; two renderer fixes they found |
| #12 | Nov 9 | "Download my data" export; one left edge on wide desktops; a lower result panel on 375x667; the duplicate scan script |
| #13 | Nov 9 | 20 items replaced after the duplicate scan (6 duplicates, 1 reused story, 13 passages on shared subjects), each through write, code check, blind solve and adversarial review; the scan joins `npm test` |
| #14 | Nov 10 | Staging and production split: merges deploy `testwise-staging`, production deploys on a published release |

## Where the plan stands

- **v1 (complete SAT)**: content, rendering, figures, placement, age gate, consent, delete and data export are done,
  and the renderer screenshot checks run in CI. Open: accounts (sign-in and cross-device progress), analytics and
  error tracking, the pilot. See `docs/PLAN.md`.
- **v1.5 (depth and craft)**: done Nov 8.
- **Redesign (Pop, Duolingo layout), six steps**: 1 to 3 merged (#17, #19, #20). Step 4, "Setup in under a minute",
  adds the test picker (every pack in `exams/`, with GRE, GMAT and CFA as stubs listed "Not ready yet"), Welcome, then
  test date (the pack's official dates, `test_dates`), daily goal (5, 10, 15 or 20 minutes; 30 and 45 read as 20),
  target score, birthday and "Start from the basics" or "Find my level" (placement over every section), straight into
  the first lesson. Section colour comes from `sections[].kind` (blue for numbers, teal for words). Migration 0008
  adds `exams.short_name` and `exams.enabled`. Time to the first question: `node scripts/setup-timer.cjs`.
  SAT test dates go stale: `npm run seed` reminds when fewer than two are ahead (source and day read are in the pack).
  Step 5, "Progress, Practice and Me": Progress shows the days to the test, an on-track check from the plan
  (`status.ahead_by_lessons` and `status.short_runway` are new; behind counts today's lessons at once, ahead
  counts only lessons past today's plan, a lesson today clears the missed-days state; behind and missed days say
  what to do), skills done per section from the path's
  unit counts, and a streak calendar for this month (`stats.month_days` is new on the path and the lesson finish),
  then the weeks. Practice puts "Fix N mistakes" on top, with Socrates in its place when there is nothing to fix.
  Me is settings only. The tour checks these screens; there are no committed screenshot baselines for them yet.
- **v2 to v5**: not started. v2 iPhone app (EAS) and full practice tests; v3 GRE; v4 paid plans and GMAT; v5 CFA
  Level I, Android, scale. Note that v2's "exam date and target score at onboarding" item already shipped in v1.5.

## Waiting on Aubrey

These block the rest of v1. Don't build around them with throwaway work; ask.

1. Google OAuth client and an email sender (e.g. Resend) for sign-in. Sign in with Apple waits on Apple Developer
   enrollment.
2. PostHog and Sentry accounts (keys go in GitHub secrets).
3. Review the privacy and terms drafts in `app/public/` and give a contact email (they say "via muscoota.com" now).
4. Pilot students: 5 to 10 first, then 20 to 50.
5. Decide whether muscoota.com gets a "Try it" link to the app (no link until approved).
6. Desmos API license vs a built-in graphing calculator before v2 (default: built-in).
7. Final prices and product ids before v4.
8. Try "New questions from Socrates" once on the live site. It is tested offline with a stand-in writer but has not
   run with the real key yet (cloud sandboxes can't reach workers.dev).
9. Setup calls to confirm (step 4 took the recommended option for each): placement over both sections is capped at
   16 questions (about 7 minutes); "Where to start" is select then Continue, not tap-to-go; not-ready tests can't be
   tapped (no "tell me when" sign-up, there is no email sender); learners who had 30 or 45 minutes a day now plan
   for 20; existing learners who placed only Math no longer see a Reading and Writing placement offer on Learn.

## Known rough edges

- On a 375x667 phone the result band is about a quarter of the screen after a right answer and about a third after a
  wrong one (two-line reason: 32%; a four-line reason, the most it shows there, about 38%; a tap shows the rest). The
  question behind it scrolls so the picked and the right tile stay in view; when both can't fit, the right one does.
- The recording in project files `testwise/v15-ui/today-to-lesson.webm` predates the review fixes.
- `scripts/trace_socrates.py` (used once to trace the art) needs numpy and OpenCV; it is not part of CI.

## How to work on it

```sh
npm install && (cd app && npm install)
npm run build:app                 # web export into app/dist (restart wrangler after each build)
npm run dev                       # seeds local D1 and starts wrangler on :8787
node --test test/*.test.mjs       # unit tests (fast, 75 tests)
npm test                          # unit tests + item checker (slow)
BASE=http://localhost:8787 node test/e2e-api.mjs
(cd app && npx tsc --noEmit)
npx playwright test               # every item type at 390x844, 375x667 and 1440x900 against test/ui/__screenshots__ (needs app/dist)
npx playwright test --update-snapshots   # accept a change you have looked at (the diff images are in test/ui/results)
BASE=http://localhost:8787 node scripts/ui-tour.cjs shots 390 844 2   # Playwright tour, ~38 screenshots, prints ERRORS [...]
```

Reseed after changing items or packs:
`npm run seed && npx wrangler d1 migrations apply testwise --local && npx wrangler d1 execute testwise --local --file seed/seed.sql`.

Rules that have held so far:

- Work on a branch, open a PR, let CI pass, squash-merge. Aubrey gave standing permission (Nov 5) to merge and deploy
  Testwise PRs once CI is green. A merge to `main` deploys to staging; production updates only on a GitHub release,
  which Aubrey publishes (or OKs). Keep migrations backward-compatible with the previous release so a rollback works.
- Never put secrets, API keys or model names in code comments, commits, PRs or docs (model ids only in
  `wrangler.jsonc` vars).
- Every UI change is checked against `docs/DESIGN.md` (both the Do list and the Never checklist) with screenshots at
  390x844, 375x667 and 1440x900 before merge. Aubrey is sensitive to anything that looks generated.
- New content goes through the full pipeline (code check, blind solve, adversarial audit, balance).
- No muscoota.com route or link to the app without Aubrey's OK. Public launch (v2) needs Aubrey's OK.
- Tick `docs/PLAN.md` items in the PR that finishes them, and keep the Claude Doc build plan in step.

## Suggested next steps

1. Once Aubrey supplies the Google client and email sender: accounts (email link and Google first, Apple after
   enrollment), anonymous progress carried over. Migration 0008.
2. PostHog events from the Quality section of the build plan, and Sentry for app and Worker.
3. Then v2: EAS build and TestFlight (the `aubrey-muscoota/ersatz-arcade` repo already has a working Expo/EAS
   pipeline to copy), reminders, full practice tests.
