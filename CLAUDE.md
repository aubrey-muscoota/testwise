# Testwise: working notes for Claude Code

Start with `docs/HANDOFF.md` (status, architecture, what's waiting on Aubrey), then `docs/PLAN.md` (release
checklist; do the next unchecked item of the current release) and `docs/DESIGN.md` (design rules).

- Stack: Cloudflare Worker (Hono, zod) + D1 + Expo web app in `app/`. Exam specifics come from packs in `exams/<id>/`.
- Checks before every PR: `node --test test/*.test.mjs`, `npm test` when items or packs change,
  `(cd app && npx tsc --noEmit)`, and `node test/e2e-api.mjs` against `npm run dev`.
- UI changes: follow `docs/DESIGN.md` exactly and check screenshots at 390x844, 375x667 and 1440x900
  (`scripts/ui-tour.cjs`). Nothing that reads as AI-generated: no pills, eyebrows, bordered cards, emoji icons,
  all-caps, gradients, opacity tints, pep talk.
- Item checks run in CI with only sympy installed: never import numpy in item code.
- Merging to `main` deploys to the live preview. Aubrey allows merging Testwise PRs once CI is green.
- Never put secrets, API keys or model names in code comments, commits, PRs or docs. Model ids live only in
  `wrangler.jsonc` vars.
- No link or route from muscoota.com to the app, and no public launch, without Aubrey's OK.
- Names (Testwise, Socrates) are placeholders.
