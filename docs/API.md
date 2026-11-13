# Testwise API: plan, path and practice

Endpoints for the test-date profile, the personalized plan, the Learn path and practice mode. All live under `/api/` on the Worker, like the rest of the API.

Every request needs the learner id in the `x-learner` header (or `?learner=` / a `learner` body field). Send `x-tz-offset` with the device's `new Date().getTimezoneOffset()` (minutes behind UTC, New York is `300`): "today", the test countdown and which tasks are done all use the learner's local day.

Errors are `{"error": "<reason>"}` with a 4xx status. The reason strings are written to be readable, but match on the status code.

## Setup

These three need no learner: they run before one exists.

### `GET /api/exams`

Every exam pack, for the test picker, in the packs' `order`:

```json
{ "exams": [
  { "id": "sat", "name": "SAT", "short_name": "SAT", "ready": true, "sections": ["Math", "Reading and Writing"] },
  { "id": "gre", "name": "GRE General Test", "short_name": "GRE", "ready": false }
] }
```

`ready` is `true` for a pack that is turned on (`enabled: true`) and seeded. A not-ready row carries only its id and names: a stub pack (`exams/<id>/exam.json` with `enabled: false`) or a pack that was turned off. Turning a pack on lists it as ready with no app change.

### `GET /api/exam?exam=<id>`

The exam pack (exam.json and voice.json, with domain weights). With a learner, always the learner's own exam. Without one, the ready exam named by `exam` (the one picked in setup), else the default exam. `sections[].kind` is `"numbers"` or `"words"` (the app's section colour: blue or teal). `test_dates` lists the official test days after the caller's local day (from `x-tz-offset`) and at most two years out, `[{ "date": "2026-12-05", "register_by": "2026-11-20" }, { "date": "2027-08-28", "anticipated": true }]`; `register_by` is dropped once it has passed. A pack without official days has no `test_dates`, and the app shows a calendar.

### `POST /api/learners`

```json
{ "age_13_plus": true, "exam_id": "sat",
  "profile": { "exam_date": "2026-12-05", "daily_minutes": 10, "target_score": 1400 } }
```

Creates the learner after the birthday question, with the picked exam and the setup answers in one call. `profile` takes the same fields and rules as `POST /api/profile` (`not_booked: true` in place of a date); `daily_minutes` defaults to the pack's `plan.default_daily_minutes`. `400 "exam_id is not available"` for an unknown or not-ready exam; a bad profile is a `400` too, and no learner is created. Older builds that send only `age_13_plus` still work (no exam, no profile yet). Returns `{ "id": "…" }`.

### Placement over every section

`POST /api/lessons` with `{ "placement": true, "all_sections": true }` (and the learner) starts setup's "Find my level": probes from every domain of every section, `min(per_domain, max(1, floor(max_questions / domains)))` a domain with difficulties spread over `placement.difficulties` (2 a domain gives the easiest and the hardest), sections taking turns. The finish (`POST /api/lessons/finish`) tests out skills across the whole exam, and its `placement.total_skills` counts the whole exam. `{ "placement": true, "section": "<id>" }` (one section, or the default section without one) still works for older builds.

## Profile

### `GET /api/profile`

```json
{
  "onboarded": true,
  "exam_date": "2027-03-13",
  "not_booked": false,
  "assumed_exam_date": null,
  "target_score": 1400,
  "daily_minutes": 20,
  "plan_started_at": "2026-11-08"
}
```

| Field | Meaning |
| --- | --- |
| `onboarded` | `false` until the learner has saved a profile once. Show the test-date question when `false`. |
| `exam_date` | `YYYY-MM-DD`, or `null` (not booked, or not onboarded). |
| `not_booked` | `true` when onboarded without a date. |
| `assumed_exam_date` | When not booked: the date the plan assumes (8 weeks after the plan started, never less than 4 weeks away). Otherwise `null`. |
| `target_score` | Integer or `null`. Stored and shown back; the plan doesn't use it yet. |
| `daily_minutes` | One of the exam's `plan.daily_minutes` (5, 10, 15 or 20 for the SAT); `null` before onboarding, when the plan uses the pack's `default_daily_minutes` (10). A time saved before these options (30 or 45) reads as the largest option at or below it (20); the stored value is unchanged, and the data export shows it as stored. |
| `plan_started_at` | Local day the current plan began. It resets to today whenever the exam date changes, so "behind" is measured from when the learner committed to that date. |

`GET /api/tree` also returns this object as `profile`.

### `POST /api/profile`

Every field is optional; fields you leave out keep their value.

```json
{ "exam_date": "2027-03-13", "target_score": 1400, "daily_minutes": 20 }
{ "not_booked": true }
{ "daily_minutes": 15 }
```

| Field | Rules |
| --- | --- |
| `exam_date` | `YYYY-MM-DD` or `null`. Not in the past (learner's local day), at most 2 years out. |
| `not_booked` | `true` clears the date; the plan assumes a test 8 weeks from today. |
| `target_score` | Whole number or `null`. Validate the exam's range in the app (SAT: 400–1600 in steps of 10). |
| `daily_minutes` | One of the exam's `plan.daily_minutes` (5, 10, 15, 20). |

Returns the profile (same shape as `GET`). `400` with a reason for a bad field: `exam_date must be YYYY-MM-DD`, `exam_date is in the past`, `exam_date is more than 2 years away`, `target_score must be a whole number`, `daily_minutes must be one of 5, 10, 15, 20`.

## Plan

### `GET /api/plan`

Recomputed on every call from the learner's progress. Nothing needs to be written to mark a task done: finishing a lesson, review or practice session through the normal endpoints marks the matching task done on the next `GET /api/plan`. Missed days move work forward (and show in `status`).

Works before onboarding too (as "not booked", 20 minutes a day), so Home can show a plan right away.

```json
{
  "profile": { "onboarded": true, "exam_date": "2027-03-13", "not_booked": false, "assumed_exam_date": null, "target_score": 1400, "daily_minutes": 20, "plan_started_at": "2026-11-08" },
  "date": "2026-11-08",
  "exam_date": "2027-03-13",
  "exam_date_assumed": false,
  "days_left": 125,
  "phase": "learn",
  "status": {
    "on_track": true,
    "behind_by_lessons": 0,
    "ahead_by_lessons": 0,
    "short_runway": false,
    "missed_yesterday": false,
    "message": "On track: 1 of 29 skills started. 28 skills to go by Jan 21."
  },
  "today_tasks_done": 1,
  "today": [
    {
      "id": "lesson-rw-boundaries",
      "kind": "lesson",
      "skill_id": "rw-boundaries",
      "minutes": 6,
      "title": "Learn: Boundaries",
      "why": "You started Boundaries today. It opens up Form, structure and sense.",
      "done": true,
      "start": { "method": "POST", "path": "/api/lessons", "body": { "skill_id": "rw-boundaries" } }
    },
    {
      "id": "lesson-alg-linear-eq-1var",
      "kind": "lesson",
      "skill_id": "alg-linear-eq-1var",
      "minutes": 6,
      "title": "Learn: Linear equations in one variable",
      "why": "You haven't started Linear equations in one variable yet. It opens up Linear functions and Linear equations in two variables. 28 skills left to start by Jan 21.",
      "done": false,
      "start": { "method": "POST", "path": "/api/lessons", "body": { "skill_id": "alg-linear-eq-1var" } }
    },
    {
      "id": "practice-mixed",
      "kind": "practice",
      "mode": "mixed",
      "n": 7,
      "minutes": 7.7,
      "title": "Mixed practice",
      "why": "A mix from the 1 skill you've started, so the early ones don't fade while you learn new ones.",
      "done": false,
      "start": { "method": "POST", "path": "/api/practice", "body": { "mode": "mixed", "n": 7 } }
    }
  ],
  "minutes_planned": 19.7,
  "daily_minutes": 20,
  "skills_started": 1,
  "skills_total": 29,
  "learn_by": "2027-01-21",
  "test_ready_from": "2027-03-02",
  "weeks": [
    { "start": "2026-11-08", "end": "2026-11-14", "phase": "learn", "focus_skill_ids": ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var", "alg-systems", "alg-inequalities"], "goal": null },
    { "start": "2027-01-24", "end": "2027-01-30", "phase": "strengthen", "focus_skill_ids": ["rw-form-structure", "adv-equiv-expr", "adv-nonlinear-eq"], "goal": "Raise Form, structure and sense, Equivalent expressions, Nonlinear equations and systems, plus mixed sets." },
    { "start": "2027-03-02", "end": "2027-03-08", "phase": "test_ready", "focus_skill_ids": ["rw-form-structure", "adv-equiv-expr", "adv-nonlinear-eq"], "goal": "Timed mixed sets at test pace, and a last pass on your weakest skills." },
    { "start": "2027-03-12", "end": "2027-03-13", "phase": "rest", "focus_skill_ids": [], "goal": "Rest, then the test." }
  ]
}
```

Top-level fields:

| Field | Meaning |
| --- | --- |
| `profile` | The profile, as in `GET /api/profile`. |
| `date` | The learner's local day the plan is for. |
| `exam_date` | The date the plan works toward (the real one, or the assumed one). |
| `exam_date_assumed` | `true` when not booked (or not onboarded): label the countdown "about". |
| `days_left` | Days from `date` to `exam_date`. 0 on test day, negative after it. |
| `phase` | `learn` (starting every skill), `strengthen` (fixing weak spots), `test_ready` (timed sets, the final ~15% or 7–10 days), `rest` (the day before the test, and test day), `after` (the date has passed). |
| `status.on_track` | `false` when behind on new skills, or when the learner missed the last two days and hasn't finished a lesson today. |
| `status.behind_by_lessons` | Learn phase: new-skill lessons behind an even pace from `plan_started_at` to `learn_by` (the pace as of the start of today, against skills started so far, so each lesson done today lowers it at once). Test-ready and rest: skills not started. Otherwise 0. |
| `status.ahead_by_lessons` | Learn phase, when not behind and not on a short runway: lessons (skills tested out by placement don't count, on either side) past the even pace by the end of today, rounded up, and no more than the learner was ahead this morning plus new skills started today beyond today's plan. So doing exactly today's plan is 0. Otherwise 0. Progress shows "On track, 2 lessons ahead". |
| `status.short_runway` | Learn phase: too few days left to start every skill, so the plan starts the ones worth the most points. Progress then says "Not enough days for every skill" instead of measuring ahead. |
| `status.missed_yesterday` | No finished lesson or session yesterday (only once the plan is a day old). |
| `status.message` | One line for the top of Home, written from the learner's numbers. |
| `today_tasks_done` | How many of `today` are done. |
| `today` | Today's tasks, in suggested order (see below). |
| `minutes_planned` | Sum of the tasks' `minutes`; within about ±25% of `daily_minutes`, except on rest days. |
| `daily_minutes` | The time budget used (the profile value read as above, or the pack's default, 10). |
| `skills_started` / `skills_total` | Skills with any practice or tested out, and all skills with questions. |
| `learn_by` | The day every skill should be started by (about 60% into the runway). |
| `test_ready_from` | First test-ready day. |
| `weeks` | The road ahead, from today to the test, assuming the learner follows the plan. Each block is up to 7 days and never spans two phases, so a block can be shorter than a week. `[]` in phase `after`. |
| `weeks[].start` / `end` | Inclusive `YYYY-MM-DD`. |
| `weeks[].phase` | As above. |
| `weeks[].focus_skill_ids` | Learn: the skills to start that block. Strengthen: three weak skills (they rotate block to block). Test-ready: the three weakest. Rest: `[]`. |
| `weeks[].goal` | One line for the block. |

Task fields (every task has `id`, `kind`, `minutes`, `title`, `why`, `done`, `start`):

| Field | Meaning |
| --- | --- |
| `id` | Stable for the day: `review-1`, `review-2`, `lesson-<skill_id>`, `practice-<mode>`, `rest`. Use it as the list key. |
| `kind` | `review`, `lesson`, `practice` or `rest`. |
| `minutes` | Estimate: lesson 6, review 0.6 a question, practice about 1 (Math) or 1.2 (Reading and Writing) a question, timed at test pace. |
| `title` | Short label for the row. |
| `why` | One or two plain sentences about the learner's own data ("You got 3 of your last 8 right on Systems of two linear equations."). Show it under the title. |
| `done` | Derived from today's finished lessons and sessions. |
| `start` | The exact request that starts the task: `POST start.path` with `start.body`. The response is a lesson (see below). `null` for `rest`. |
| `n` | Review and practice: number of questions. |
| `skill_id` | Lesson: the skill. |
| `mode` | Practice: `weak`, `mixed`, `timed` or `mistakes`. |
| `skill_ids` | Practice `weak`: the skills it targets (already in `start.body`). |

How tasks are marked done: a lesson task is done when a lesson on that skill finished today; review tasks are done one per finished review lesson (`POST /api/lessons` with `skill_id: null`) or review circle on the path (practice `mode: "review"`), or when nothing is due any more; a practice task is done when a practice session of the same mode finished today. Unfinished sessions don't count. A lesson the learner started today stays on the list as done, so the list doesn't reshuffle while they work through it.

What each phase puts in `today`:

- learn: new-skill lessons (spread so every skill is started by `learn_by`), due reviews, then a mixed set (or weak spots once a started skill is under 60%).
- strengthen: reviews, weak spots (by weight × (1 − mastery)), then a mixed set, or "My mistakes" every other day when 5+ are waiting.
- test_ready: a little review, a timed set at test pace, then weak spots or mistakes.
- rest: the day before, up to 5 reviews and a `rest` task; test day, just the `rest` task.
- after: reviews and a mixed set, with a gentle message.

New skills follow the path (`GET /api/path`): the next ones not yet started, in path order, each one's prerequisites started or earlier in today's list (one lesson opens what depends on it, so a day can chain them). The week-by-week `focus_skill_ids` follow the same order. The path interleaves the sections unit by unit, not skill by skill, so a week can stay in one unit.

Short runways compress (5 days: start the skills worth the most points, 2 test-ready days, then rest). A runway that was already too short to start every skill when the plan began orders the units by points per lesson; that order is fixed from the plan's start, so the path doesn't reshuffle when a learner falls behind. Long runways (5+ months) start at most one new skill a day, spaced every few days, and lean on review.

## Path

### `GET /api/path`

The Learn tab: one path through the whole test, built from the plan. One unit per domain, in the order the plan starts them (sections interleaved unit by unit, a section's units heaviest first, prerequisites always earlier), each with its skills, a review circle after every 3 skills (not at a unit's end) and a unit check at the end. One `end` circle follows the last unit.

```json
{
  "date": "2026-11-12",
  "exam_date": "2027-03-13",
  "exam_date_assumed": false,
  "days_left": 121,
  "phase": "learn",
  "stats": { "xp": 75, "streak": 1, "xp_today": 75, "reviews_due": 2, "month_days": ["2026-11-12"] },
  "current": "skill:alg-linear-func",
  "units": [
    {
      "id": "alg", "name": "Algebra", "section_id": "sat-math", "section_name": "Math", "section_index": 0, "section_kind": "numbers",
      "number": 1, "of": 8, "done": 1, "total": 5,
      "nodes": [
        { "id": "skill:alg-linear-eq-1var", "kind": "skill", "state": "done", "title": "Linear equations in one variable",
          "why": "Solving for x when it shows up on both sides. 8 questions, about 6 minutes.",
          "skill_id": "alg-linear-eq-1var", "mastery": 41, "tested_out": false, "questions": 8, "minutes": 6,
          "start": { "method": "POST", "path": "/api/lessons", "body": { "skill_id": "alg-linear-eq-1var", "node": "skill:alg-linear-eq-1var" } } },
        { "id": "skill:alg-linear-func", "kind": "skill", "state": "current", "…": "…" },
        { "id": "skill:alg-linear-eq-2var", "kind": "skill", "state": "open", "…": "…" },
        { "id": "review:alg:1", "kind": "review", "state": "locked", "title": "Review",
          "why": "2 questions you missed are due, then a mix of the 3 skills above.",
          "skill_ids": ["alg-linear-eq-1var", "alg-linear-func", "alg-linear-eq-2var"], "due": 2, "questions": 8, "minutes": 8,
          "locked_reason": "Opens after Linear equations in two variables", "start": null },
        { "id": "skill:alg-systems", "kind": "skill", "state": "locked", "locked_reason": "Opens after Linear equations in two variables", "start": null, "…": "…" },
        { "id": "skill:alg-inequalities", "kind": "skill", "state": "locked", "…": "…" },
        { "id": "check:alg", "kind": "check", "state": "locked", "title": "Unit check",
          "why": "10 questions across Algebra. Finish it to close the unit.",
          "skill_ids": ["alg-linear-eq-1var", "…"], "questions": 10, "minutes": 10,
          "locked_reason": "Opens when you finish the 4 lessons above", "start": null }
      ]
    }
  ],
  "end": { "id": "end", "kind": "end", "state": "locked", "title": "Test-day practice",
           "why": "Timed sets, mixed practice and your weak spots, once every unit is done.",
           "task_title": "Mixed practice", "locked_reason": "Opens when every unit is done", "start": null }
}
```

| Field | Meaning |
| --- | --- |
| `stats` | The top bar's numbers: `xp`, `streak`, `xp_today`, `reviews_due`, and `month_days`, the learner's local days this month (up to today) with a finished lesson, oldest first. The streak calendar on Progress marks them; placement days count, as they do for the streak. |
| `current` | The id of the one circle in `state: "current"`: the first open circle in path order, or `due` on a day with reviews due. There is always exactly one. |
| `units[]` | In path order. `section_kind` is the section's `kind` from the pack (`numbers` or `words`), which the app colours units by (blue or teal); `section_index` is the section's place in the exam, kept for older builds; `done` / `total` count the unit's finished skills. |
| `nodes[].id` | Stable: `skill:<skill id>`, `review:<domain id>:<k>`, `check:<domain id>`, `due` and `end`. |
| `nodes[].kind` | `skill` (a lesson), `review` (practice `mode: "review"` over the skills since the last review), `check` (practice `mode: "mixed"` over the unit's skills, 8–12 questions). The `due` circle is also `kind: "review"`, but starts a review lesson (`POST /api/lessons` with `skill_id: null`) over every due question. |
| `nodes[].state` | `done`, `current`, `open` or `locked`. |
| `nodes[].start` | The request that starts it (post it as is; the body carries `node`). `null` when locked. Done circles keep theirs, for practicing again. |
| `nodes[].why`, `locked_reason` | What it is, and for a locked circle what opens it. Written from the exam pack's names and `skill_about`. |
| `end` | Opens once every circle is done and starts the plan's first unfinished practice or review task (weak spots when there is none). On a rest day it can have no `start`. `task_title` names what it starts. |

States, in path order:

- A skill is `done` once it is tested out, mastered, or has 8+ answers (one lesson, which is also what opens the skills that depend on it). It is `open` when its prerequisites have 8+ answers each and its unit is at or before the first unit with an unfinished skill; otherwise `locked`. So later units wait for the ones before them, even when the engine would allow a lesson there (the Practice tab can still drill those).
- A review is `done` once a session started from it finished, when every skill it covers was tested out (placement skipped them), or when every skill it covers is done and a later skill in the same unit was learned (not just tested out), so learners who moved on aren't sent back. Work in another unit or from the Practice tab doesn't close it. It is `open` once every skill it covers is done.
- A unit check is `done` only once a session started from it finished, or every skill in the unit was tested out. Lessons in the next unit don't close it.
- The first open circle becomes `current`. If nothing can open (a broken prerequisite chain in a pack), the `end` circle is current.
- When spaced-review questions are due (`stats.reviews_due > 0`, not on a rest day), a `due` circle is placed right before that circle and takes `current`; the circle after it is `open`. It is gone once nothing is due.

A start's `node` is recorded only when the path offers that exact start: the circle exists and isn't locked, the endpoint and every body field match its `start` (`n` may be larger). Otherwise the node is dropped and the session runs as a plain lesson or practice set, without the unit-check bonus.

A finished unit check pays 20 bonus XP, once per unit. It counts as mixed practice for the day's plan.

## Practice

A practice session is a lesson with `kind = 'practice'`. The response has the same shape as `POST /api/lessons`, so the lesson screen runs it unchanged: answers go to `POST /api/answers` with the `lesson_id`, and `POST /api/lessons/finish` ends it. Ratings, the review queue, XP and the streak update exactly as for a lesson. The `stats` that `POST /api/lessons/finish` returns carry `streak`, `lessons_today`, `lessons_today_no_placement` (the same count without the placement quiz, so the streak screen follows the first real lesson of the day), `recent_days` (the learner's local days among the last seven, today included, with a finished lesson, oldest first), which the streak screen uses to mark the week, and `month_days` (the same for this month so far, as in the path's `stats`).

### `POST /api/practice`

```json
{ "mode": "weak", "n": 10 }
{ "mode": "mixed", "section": "sat-rw" }
{ "mode": "skill", "skill_id": "alg-systems", "n": 8 }
{ "mode": "timed", "n": 12 }
{ "mode": "mistakes" }
{ "mode": "fresh", "skill_id": "geo-circles" }
```

| Field | Meaning |
| --- | --- |
| `mode` | `weak` (lowest weighted mastery among started skills), `mixed` (all started skills), `skill` (one skill drill, needs `skill_id`), `timed` (mixed, weighted like the test, with a time limit), `mistakes` (questions answered wrong and not answered right since), `fresh` (new questions written by Socrates), `review` (a review circle on the path: due spaced-review questions in its skills first, oldest due first, flagged `review: true`, then a mix like `mixed`; never "nothing due"). Default `mixed`. |
| `n` | Questions, 3–30. Default 10 (`fresh`: 5). |
| `skill_id` | Required for `skill`; optional for `fresh` (otherwise the skill whose unseen questions are running out). |
| `skill_ids` | Optional: limit `weak`/`mixed`/`timed`/`review` to these skills (plan tasks and path circles pass it). |
| `node` | Optional: the path circle it was started from (path starts pass it). `POST /api/lessons` takes it too. |
| `section` | Optional: limit to one section, e.g. `sat-math`. |

Before the learner has started anything, `weak`/`mixed`/`timed` fall back to the open skills of their current section.

Question order: unseen questions first (near the learner's level), then ones they missed, then the ones seen longest ago; never the same question twice in a session; skills are interleaved; a `skill` drill runs easy to hard.

Response:

```json
{
  "lesson_id": "b53c37d5-8d28-401f-9949-622cfe330313",
  "skill_id": null,
  "practice": true,
  "mode": "timed",
  "time_limit_seconds": 1020,
  "items": [
    { "id": "rw-boundaries-108", "skill_id": "rw-boundaries", "difficulty": 1, "type": "mc", "stem": "…", "choices": ["…"], "passage": "…", "answer": "…", "explanation": ["…"], "hints": ["…"], "wrong_reasons": {}, "review": false, "source": "bank" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `lesson_id`, `items` | As in `POST /api/lessons`. Each item also has `source`: `"bank"` or `"generated"`. Label generated ones ("New from Socrates"). |
| `skill_id` | The skill when the session covers one skill, else `null`. |
| `practice`, `mode` | `true`, and the mode. |
| `time_limit_seconds` | `timed` only: the whole set at test pace (SAT: about 95 s a Math question, 71 s a Reading and Writing question). Show a countdown; when it runs out, finish the session. |
| `fresh`, `generated`, `note` | `fresh` only. `fresh: true` when Socrates wrote new questions (`generated` of them, first in `items`); `fresh: false` when it fell back to bank questions. `note` is a sentence to show either way, e.g. "Socrates can't write new questions right now, so here are questions from the bank on Boundaries." |

Errors: `400` bad mode or a `skill` drill without `skill_id`; `403 skill locked`; `404 unknown skill`, `unknown section`, `no mistakes to fix` (mistakes mode with nothing missed), `no skills to practice yet`.

### `GET /api/practice/summary`

For the practice screen ("3,317 questions you haven't seen").

```json
{
  "totals": { "bank": 3325, "generated": 0, "seen": 8, "unseen": 3317, "missed": 3 },
  "skills": [
    { "skill_id": "alg-linear-eq-1var", "name": "Linear equations in one variable", "section_id": "sat-math", "bank": 75, "generated": 0, "seen": 0, "unseen": 75, "missed": 0, "started": false, "unlocked": true, "low": false }
  ],
  "fresh": { "available": false, "generated_today": 0, "daily_limit": 20 }
}
```

| Field | Meaning |
| --- | --- |
| `bank` | Questions available for practice in the skill (written bank plus live generated ones). |
| `generated` | How many of those Socrates wrote. |
| `seen` / `unseen` | Answered at least once / never. |
| `missed` | Latest answer was wrong (what "My mistakes" serves). |
| `started`, `unlocked` | As in the tree. A `skill` drill needs `unlocked` or `started`. |
| `low` | Under 10% unseen: practice on this skill quietly asks Socrates for more in the background. |
| `fresh.available` | Whether Socrates can write questions on this server (API key and model configured). Hide or soften the "Fresh questions" button when `false`; it still works, with bank questions. |
| `fresh.generated_today`, `fresh.daily_limit` | Per-learner daily count and cap. |

## Fresh questions

When a learner asks (`mode: "fresh"`), or a skill they practice has under 10% unseen questions left, the Worker asks Claude for a small batch (up to 5) on that skill, at a difficulty near the learner's level, with two bank questions as examples. Only text and table questions, no figures. A second, separate call solves each question without the key; a question is kept only if the solver picks the same answer (numerically equal for grid-ins) and the question passes the shape checks in code (4 distinct choices, the key among them, a reason for every wrong choice, 2–6 steps, 2–3 hints, passage length for Reading and Writing). Kept questions are stored as items with `source = 'generated'` and served by practice only (never in lessons). One learner report pulls a generated question.

Caps: 20 per learner per day, and `GENERATOR_DAILY_CAP` (default 200) across everyone per UTC day. The model is `GENERATOR_MODEL` (falls back to `TUTOR_MODEL`) in `wrangler.jsonc`. Without `ANTHROPIC_API_KEY`, or when a call fails or nothing passes, `fresh` returns bank questions with `fresh: false` and a `note`.

## Your data

### `GET /api/learner/export`

Everything stored about the learner, as one JSON document ("Download my data" in Me). Questions are referred to by id; their text is content, not the learner's data.

```json
{
  "exported_at": "2026-11-09T04:00:00.000Z",
  "about": "Your Testwise data. …",
  "learner": { "id": "…", "created_at": 1762650000000, "age_confirmed_at": 1762650000000, "ai_consent_at": null, "exam_id": null, "exam_date": "2027-03-13", "target_score": 1400, "daily_minutes": 20, "plan_started_at": "2026-11-08" },
  "skills": [{ "skill_id": "alg-linear-eq-1var", "rating": 0.42, "attempts": 16, "correct": 13, "tested_out": 0, "updated_at": 1762650000000 }],
  "lessons": [{ "id": "…", "kind": "skill", "mode": null, "node": "skill:alg-linear-eq-1var", "skill_id": "alg-linear-eq-1var", "section_id": null, "started_at": 1762650000000, "completed_at": 1762650300000, "correct": 6, "total": 8, "xp": 75, "local_day": "2026-11-08" }],
  "attempts": [{ "item_id": "alg-linear-eq-1var-012", "skill_id": "alg-linear-eq-1var", "lesson_id": "…", "correct": 1, "response": "7", "time_ms": 21000, "is_review": 0, "answered_at": 1762650010000, "local_day": "2026-11-08" }],
  "reviews": [{ "item_id": "…", "skill_id": "…", "due_at": 1762736400000, "interval_days": 1 }],
  "tutor_turns": [{ "item_id": "…", "local_day": "2026-11-08", "role": "student", "content": "I think I mixed up the sign", "created_at": 1762650020000 }],
  "generated_items": [{ "id": "gen-…", "skill_id": "…", "created_at": 1762650030000 }]
}
```

`POST /api/learner/delete` removes all of it.
