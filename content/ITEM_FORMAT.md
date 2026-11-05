# Item format

Each file `content/items/<skill-id>.json` is a JSON array of items:

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
- `difficulty`: 1 easy, 2 medium, 3 hard (relative to the SAT).
- `type`: `mc` (4 choices, `answer` is the exact text of one choice) or `spr` (student-produced response; `answer` is the canonical value; `accept` lists other accepted forms such as "0.5" for "1/2").
- Plain text with Unicode math (x², √, π, ≤, −, ·). No LaTeX, no figures. Describe any geometry in words. Tables may use a `table` field: `{"headers": [...], "rows": [[...]]}`.
- `check`: Python (sympy allowed) that computes the answer independently and stores it in `result`. Required whenever the answer is computable. Use `null` for purely conceptual items (e.g. study design), and explain why in `check_note`.
- `explanation`: 2–6 short steps. `hints`: 2–3 Socratic questions that guide without giving the answer. `wrong_reasons`: for each wrong `mc` choice, the misconception that leads to it.
- All content original. Never copy or paraphrase official College Board questions.
