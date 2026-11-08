# Item format

This format applies to every exam pack. Each file `exams/<exam>/items/<skill-id>.json` is a JSON array of items (exam-specific additions, such as SAT Reading and Writing passages, are in `exams/<exam>/docs/`):

```json
{
  "id": "alg-systems-007",
  "skill_id": "alg-systems",
  "difficulty": 2,
  "type": "mc",
  "stem": "If 3x + 2y = 12 and x − y = 1, what is the value of x?",
  "choices": ["1", "2", "14/5", "3"],
  "answer": "14/5",
  "explanation": ["Step 1 …", "Step 2 …", "So x = 14/5."],
  "hints": ["What could you do so that y disappears?", "…"],
  "wrong_reasons": { "2": "Solved for y instead of x", "3": "…" },
  "check": "from sympy import *\nx,y=symbols('x y')\nresult=solve([3*x+2*y-12,x-y-1],[x,y])[x]"
}
```

Rules:
- `difficulty`: 1 easy, 2 medium, 3 hard (relative to the real exam).
- `type`: `mc` (as many choices as the section's `choices` in `exam.json`, e.g. 4 on the SAT; `answer` is the exact text of one choice) or `spr` (student-produced response; `answer` is the canonical value; `accept` lists other accepted forms such as "0.5" for "1/2").
- Plain text with Unicode math (x², √, π, ≤, −, ·). A small TeX subset is also allowed inside `$…$` (`\frac`, `\sqrt`, `^`, `_`, `\le`, `\pi`, `\overline`, …; see `app/src/text/tex.ts`); the app renders it as Unicode text. Write a literal dollar sign as `\$` in TeX-bearing text. Tables may use a `table` field: `{"title": "…", "headers": [...], "rows": [[...]]}`.
- Figures: an optional `figure` spec that the app draws (see `FIGURE_FORMAT.md`).
- Passage-based items add `passage` (and `passage2` for paired texts); for the SAT see `sat/docs/RW_FORMAT.md`. A section that sets `passage` in `exam.json` requires it.
- Each section's `item_types` in `exam.json` lists which of `mc` and `spr` it allows. Where `code_checks` is false (e.g. SAT Reading and Writing), `check` must be `null`.
- `check`: Python (standard library and sympy only; CI installs nothing else, so never numpy) that computes the answer independently and stores it in `result`. Required whenever the answer is computable. Use `null` for purely conceptual items (e.g. study design), and explain why in `check_note`.
- `explanation`: 2–6 short steps. `hints`: 2–3 Socratic questions that guide without giving the answer. `wrong_reasons`: for each wrong `mc` choice, the misconception that leads to it.
- All content original. Never copy or paraphrase official questions from the exam's publisher (for the SAT, College Board).
