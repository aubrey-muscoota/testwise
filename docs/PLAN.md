# Testwise build plan: release checklist

The full plan (exam formats, architecture, content pipeline, quality gates, business and risks) is the Claude Doc
"Testwise build plan: v0 to v5": https://claude.ai/artifact/EfYH3r2gBRBcNnUPTvGauJ

This file holds the release checklists. Tick an item in the pull request that finishes it.
To work on the plan: read this file and the doc, then do the next unchecked item in the current release.

## Releases
Five releases, each ending with real students using it. A release is done only when every acceptance criterion below passes and the next release's riskiest assumption has been tested. Timings assume one person directing Claude Code, with paid human reviewers for content.
Each release's "Acceptance" line is the gate that must pass before the next release starts. v1 is next.
### v1: Complete SAT (6 to 8 weeks)
Goal: a student can prepare for the whole digital SAT, not just Math, and their progress follows them across devices.
- [x] Refactor the Worker into route modules (Hono, zod) with no behavior change; all existing tests pass.
- [ ] Migrate to the multi-exam content model: sections, item types, stimuli. Existing SAT Math items convert by script.
- [ ] Math rendering (TeX subset) and figure support (SVG from code, stored in R2, with alt text).
- [ ] Regenerate figures for SAT Math skills that need them (geometry, graphs of functions, scatterplots), adding about 300 figure items.
- [ ] SAT Reading and Writing: all four domains and their skills, about 1,600 items, with passages of the right length and one question per passage.
- [ ] Accounts: Sign in with Apple, Google and email link; anonymous progress carries over; settings with data export and delete. Age gate at sign-up (no accounts under 13), the AI-consent screen before the first Socrates turn (existing learners see it once too), and privacy policy and terms pages. Acceptance: no account can be created under 13, and Socrates is unreachable before consent. (Done so far: age question, AI consent, delete-my-data, privacy and terms pages. Still to do: sign-in and cross-device progress.)
- [ ] Analytics (PostHog) and error tracking (Sentry); the event set in the Quality section.
- [ ] Placement quiz covers both SAT sections.
- [ ] Pilot with 20 to 50 students for two weeks.
Acceptance: every item-type renderer passes screenshot tests at iPhone SE, iPhone 15 and 1440px desktop widths; a student moves from web to a second browser and keeps all progress; the duplicate scan finds no pairs; day-7 retention among pilot students is measured, whatever it is.
### v2: iPhone app and practice tests (6 to 8 weeks)
Goal: Testwise is on the App Store with full SAT practice tests and an estimated score.
- [ ] iPhone app through EAS: TestFlight, then App Store review. App icon, launch screen, haptics already in place.
- [ ] Push reminders at a time the student picks; streak freeze; a weekly progress email.
- [ ] Full-length SAT practice tests with module-level adaptivity, real timing, the Desmos-style graphing calculator (Aubrey decides before v2 between licensing the Desmos API and a built-in graphing calculator; default to built-in), and a score report by skill.
- [ ] Score prediction on Home, with a range, updated after each lesson and test.
- [ ] Exam date and target score at onboarding; the daily plan adapts to them.
- [ ] Socrates remembers the student's recent mistakes within a session, and the tutor evaluation set runs weekly.
- [ ] Offline lessons: the next 3 lessons are cached and answers sync later.
Acceptance: App Store approval; predicted scores are shown as a range labelled an estimate, and accuracy against students' reported official scores is tracked on the dashboard (target: within 60 points for 70% of reporters, reviewed once 30 have reported; not a release gate); crash-free sessions above 99.5%.
### v3: Second exam, GRE (about 8 weeks)
Goal: the platform is proven multi-exam by adding the exam that reuses the most.
- [ ] Exam picker at onboarding and a switcher in settings; each exam has its own path, stats and streak.
- [ ] GRE Quant: reuse SAT Math skills where they match and add GRE-only skills and item types (quantitative comparison, multiple-answer, numeric entry with fractions, data interpretation sets).
- [ ] GRE Verbal: text completion, sentence equivalence, reading comprehension including select-in-passage; a vocabulary track in spaced review.
- [ ] Analytical Writing: timed Issue essay with Claude feedback on a published-style rubric, clearly labelled as an estimate.
- [ ] Full GRE practice tests with section-level adaptivity and the on-screen calculator.
Acceptance: a GRE student completes onboarding to a full practice test without hitting any SAT-specific text; essay feedback scores agree within one point with a paid human rater using the published ETS rubric on 80% of 50 pilot essays.
### v4: Business (about 8 weeks)
Goal: Testwise earns money, and adds GMAT.
- [ ] Paid plans through RevenueCat (Apple in-app purchase) and Stripe (web): a free tier with daily lessons and limited Socrates; Pro with unlimited practice, all tests and full Socrates. Prices start from the pricing table in the business section; Aubrey confirms final prices and product IDs before v4 starts.
- [ ] Paywall placement tested with feature flags; a 1-month free trial on annual plans and 7 days on monthly.
- [ ] GMAT (Focus format): Quant (problem solving only), Verbal (critical reasoning, reading comprehension), Data Insights (data sufficiency, table analysis, graphics interpretation, two-part analysis, multi-source reasoning) with question-level adaptivity and the review-and-edit feature in practice tests.
- [ ] Parent and tutor view: invite by link; read-only progress, streak and predicted score.
Acceptance: purchases, restores and cancellations work on iPhone and web; at least 2% of new users start a trial in the first month; a GMAT practice test reports a score on the official scale.
### v5: CFA, Android and scale (8 to 10 weeks)
Goal: four exams, Android, and content at full size.
- [ ] CFA Level I: all ten topic areas by curriculum weight, three-choice items, calculator guidance for the approved calculators, two full mock exams. A CFA charterholder reviews content.
- [ ] Polish pass: every screen passes the screenshot suite and the accessibility checks in the quality section; motion and sound for test mode; dark mode; iPad layout.
- [ ] Android release from the same codebase.
- [ ] Content at scale: item counts in the content section met, nightly calibration live, report rate under 0.5% of items per month.
- [ ] Launch: App Store page, a muscoota.com/testwise link to the app (only with Aubrey's approval), press kit.
Acceptance: all four exams pass their full flows in the scripted browser and simulator suites; crash-free sessions above 99.7%; the content dashboard shows no skill under its item target.
