# SAT Reading and Writing items

Same file layout as Math (`exams/sat/items/<skill-id>.json`, see `exams/ITEM_FORMAT.md`), with these fields. The passage word limits that `check_items.py` enforces are the `passage` rules of the `sat-rw` section in `exams/sat/exam.json`.

```json
{
  "id": "rw-transitions-007",
  "skill_id": "rw-transitions",
  "difficulty": 2,
  "type": "mc",
  "passage": "Most bats find insects by echolocation. ______ the fringe-lipped bat of Central America also listens for the mating calls of frogs, homing in on the sound to catch its prey.",
  "stem": "Which choice completes the text with the most logical transition?",
  "choices": ["However,", "In addition,", "For example,", "As a result,"],
  "answer": "In addition,",
  "explanation": ["…", "…"],
  "hints": ["…", "…"],
  "wrong_reasons": { "However,": "…", "For example,": "…", "As a result,": "…" },
  "check": null,
  "check_note": "verbal item: verified by blind solve"
}
```

- `passage`: the text, 25–150 words, one question per passage (as on the digital SAT). A blank is written `______` (six underscores). Underlined text is wrapped as `<u>…</u>` (the only markup allowed). Notes for rhetorical synthesis are lines starting with "• ", separated by `\n`.
- `passage2`: only for cross-text items. Then `passage` is Text 1 and `passage2` is Text 2, each 25–110 words.
- `table`: optional, for quantitative command-of-evidence items (`{"title": "…", "headers": [...], "rows": [[...]]}`).
- `type` is always `mc`, with 4 distinct choices and `answer` the exact text of one choice.
- `check` is `null`; `check_note` says "verbal item: verified by blind solve".
- `explanation`: 2–5 short steps that point to the words in the passage that decide it. `hints`: 2–3 Socratic questions. `wrong_reasons`: for each wrong choice, why a student picks it and why it's wrong.

Content rules:
- All passages and questions original. Never copy or paraphrase College Board questions or passages.
- Subjects rotate across literature (original fiction, poetry-like prose, drama), history and social studies, the humanities and arts, and science, as on the SAT.
- Use fictional people, places and studies, or facts that are widely established. Never put invented claims, quotes or findings in the mouth of a real, named person or institution.
- No real living authors or copyrighted works quoted. Fictional works and authors are fine ("In the novel *The Salt Road* by Mara Ellis…" is fine when both are invented and nothing suggests they are real; prefer plainly generic framing).
- Exactly one choice is defensibly best. Wrong choices are tempting for a specific, nameable reason.
- difficulty 1, 2, 3 = easy, medium, hard for the SAT: harder means denser passages, subtler distractors, less common vocabulary, longer sentences.
