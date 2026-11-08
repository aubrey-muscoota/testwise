import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateBatch, validateItem, agrees, toItem, itemStyle, writerPrompt, solverPrompt, generatorModel, makeClient, newItemId, globalDailyCap,
} from "../worker/generate.js";

const mathExamples = [
  { type: "mc", stem: "If 2x + 3 = 11, what is x?", choices: ["3", "4", "5", "7"], answer: "4", accept: [], explanation: ["Subtract 3.", "Divide by 2."], hints: ["What undoes +3?", "Then?"], wrong_reasons: { "3": "a", "5": "b", "7": "c" } },
  { type: "spr", stem: "What is 3/4 of 10?", choices: null, answer: "15/2", accept: ["7.5"], explanation: ["Multiply.", "Simplify."], hints: ["Of means?", "Then?"], wrong_reasons: {} },
];
const rwExamples = [0, 1].map(() => ({ type: "mc", passage: "x ".repeat(60), stem: "Which choice completes the text?", choices: ["a", "b", "c", "d"], answer: "a", explanation: ["1", "2"], hints: ["?", "?"], wrong_reasons: { b: "1", c: "2", d: "3" } }));

const rawMc = (over = {}) => ({
  type: "mc", passage: null, passage2: null, stem: "If 3x − 6 = 9, what is the value of x?", table: null,
  choices: ["1", "3", "5", "15"], answer: "5", accept: [],
  explanation: ["Add 6 to both sides: 3x = 15.", "Divide by 3: x = 5."],
  hints: ["What can you do to get 3x by itself?", "What undoes multiplying by 3?"],
  wrong_reasons: [{ choice: "1", reason: "Subtracted 6 instead of adding." }, { choice: "3", reason: "Divided 9 by 3." }, { choice: "15", reason: "Stopped at 3x." }],
  ...over,
});
const rawSpr = (over = {}) => ({
  type: "spr", passage: null, passage2: null, stem: "A recipe uses 3 cups of flour for 4 loaves. How many cups for 6 loaves?", table: null,
  choices: [], answer: "9/2", accept: ["4.5"], explanation: ["3/4 cup per loaf.", "6 × 3/4 = 9/2."], hints: ["Per loaf?", "Times 6?"], wrong_reasons: [],
  ...over,
});
const style = itemStyle(mathExamples);
const ctx = { skill_id: "alg-x", difficulty: 2 };

test("well-formed items pass shape checks; broken ones don't", () => {
  assert.deepEqual(validateItem(toItem(rawMc(), ctx), style), []);
  assert.deepEqual(validateItem(toItem(rawSpr(), ctx), style), []);
  const bad = (over, re) => {
    const errs = validateItem(toItem(rawMc(over), ctx), style);
    assert.ok(errs.some((e) => re.test(e)), `${JSON.stringify(over)} → ${errs}`);
  };
  bad({ choices: ["1", "3", "5"] }, /4 choices/);
  bad({ choices: ["1", "3", "5", "5"] }, /distinct/);
  bad({ answer: "6" }, /answer not among choices/);
  bad({ wrong_reasons: [{ choice: "1", reason: "x" }] }, /missing a wrong choice/);
  bad({ wrong_reasons: [...rawMc().wrong_reasons, { choice: "5", reason: "the key" }] }, /isn't a wrong choice/);
  bad({ hints: ["only one"] }, /hints/);
  bad({ explanation: ["one"] }, /explanation/);
  bad({ passage: "A passage on a math item." }, /unexpected passage/);
  bad({ table: { title: null, headers: ["a", "b"], rows: [["1"]] } }, /ragged/);
  const sprErrs = validateItem(toItem(rawSpr({ answer: "about four" }), ctx), style);
  assert.ok(sprErrs.length);
  // A skill with no grid-ins in its bank doesn't get generated grid-ins.
  assert.ok(validateItem(toItem(rawSpr(), ctx), itemStyle(rwExamples)).some((e) => /grid-in/.test(e)));
});

test("passage length rules for reading items", () => {
  const rw = itemStyle(rwExamples);
  assert.ok(rw.passage && !rw.cross);
  const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
  const ok = toItem(rawMc({ passage: words(80) }), ctx);
  assert.deepEqual(validateItem(ok, rw), []);
  assert.ok(validateItem(toItem(rawMc({ passage: words(10) }), ctx), rw).some((e) => /25–150/.test(e)));
  assert.ok(validateItem(toItem(rawMc({ passage: words(151) }), ctx), rw).some((e) => /25–150/.test(e)));
  assert.ok(validateItem(toItem(rawMc({ passage: null }), ctx), rw).some((e) => /missing passage/.test(e)));
  assert.ok(validateItem(toItem(rawMc({ passage: words(40) + " <b>bold</b>" }), ctx), rw).some((e) => /markup/.test(e)));
  assert.deepEqual(validateItem(toItem(rawMc({ passage: words(40) + " <u>this</u> end" }), ctx), rw), []);
  const cross = itemStyle(rwExamples.map((e) => ({ ...e, passage2: "y ".repeat(40) })));
  assert.ok(cross.cross);
  assert.ok(validateItem(toItem(rawMc({ passage: words(120), passage2: words(50) }), ctx), cross).some((e) => /25–110/.test(e)));
  assert.deepEqual(validateItem(toItem(rawMc({ passage: words(60), passage2: words(50) }), ctx), cross), []);
});

test("agreement: letter or exact text for multiple choice, numeric for grid-ins", () => {
  const mc = toItem(rawMc(), ctx);
  assert.ok(agrees(mc, "C"));
  assert.ok(agrees(mc, "c)"));
  assert.ok(agrees(mc, "5"));
  assert.ok(!agrees(mc, "B"));
  assert.ok(!agrees(mc, ""));
  const spr = toItem(rawSpr(), ctx);
  assert.ok(agrees(spr, "4.5"));
  assert.ok(agrees(spr, "9/2"));
  assert.ok(agrees(spr, "x = 4.5"));
  assert.ok(!agrees(spr, "4.6"));
});

test("prompts carry the skill, the level, the format and two examples but never a model id", () => {
  const w = writerPrompt({ exam: "SAT", section: "Math", domain: "Algebra", skill: { id: "alg-x", name: "Linear equations" }, difficulty: 3, examples: mathExamples, n: 5 });
  assert.match(w.user, /Linear equations/);
  assert.match(w.user, /hard/);
  assert.match(w.user, /No figures/);
  assert.match(w.user, /"spr"/);
  assert.equal((w.user.match(/"stem"/g) || []).length, 2);
  const s = solverPrompt([toItem(rawMc(), ctx)]);
  assert.ok(!s.user.includes("Subtracted 6"), "solver never sees wrong reasons");
  assert.ok(!/answer"?:\s*"5"/.test(s.user));
  assert.match(s.user, /C\) 5/);
});

// A fake Anthropic client: the first call is the writer, the second the solver.
function fakeClient({ items, answers, refuse = false, throws = false }) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        if (throws) throw Object.assign(new Error("overloaded"), { status: 529 });
        if (refuse) return { stop_reason: "refusal", content: [], model: params.model };
        const body = calls.length === 1 ? { items } : { answers };
        return { stop_reason: "end_turn", model: params.model, content: [{ type: "text", text: JSON.stringify(body) }] };
      },
    },
  };
}
const args = (client) => ({ client, model: "configured-model", exam: "SAT", section: "Math", domain: "Algebra", skill: { id: "alg-x", name: "Linear equations" }, difficulty: 2, examples: mathExamples, n: 4 });

test("generateBatch keeps only well-formed items the blind solver agrees with", async () => {
  const client = fakeClient({
    items: [rawMc(), rawSpr(), rawMc({ stem: "If 2x = 10, what is the value of x?", answer: "5" }), rawMc({ choices: ["1", "1", "5", "15"] })],
    answers: [{ number: 1, answer: "C" }, { number: 2, answer: "4.5" }, { number: 3, answer: "B" }],
  });
  const res = await generateBatch(args(client));
  assert.equal(res.accepted.length, 2, JSON.stringify(res.rejected));
  assert.deepEqual(res.accepted.map((i) => i.type), ["mc", "spr"]);
  assert.equal(res.rejected.length, 2);
  assert.ok(res.rejected.some((r) => /distinct/.test(r.reason)));
  assert.ok(res.rejected.some((r) => /solver answered/.test(r.reason)));
  assert.equal(client.calls.length, 2);
  // The solver call is separate and never sees the key.
  const solverText = client.calls[1].messages[0].content;
  assert.ok(!solverText.includes("Divide by 3"));
  assert.equal(client.calls[1].output_config.format.type, "json_schema");
  assert.equal(client.calls[0].model, "configured-model");
  assert.equal(res.accepted[0].skill_id, "alg-x");
  assert.deepEqual(res.accepted[0].wrong_reasons, { "1": "Subtracted 6 instead of adding.", "3": "Divided 9 by 3.", "15": "Stopped at 3x." });
});

test("refusals, errors and nothing valid all come back empty (the route then falls back)", async () => {
  assert.equal((await generateBatch(args(fakeClient({ refuse: true })))).accepted.length, 0);
  await assert.rejects(generateBatch(args(fakeClient({ throws: true }))));
  const none = fakeClient({ items: [rawMc({ answer: "nope" })], answers: [] });
  assert.equal((await generateBatch(args(none))).accepted.length, 0);
  assert.equal(none.calls.length, 1, "no solver call when nothing is well formed");
  const missing = fakeClient({ items: [rawMc()], answers: [] });
  assert.equal((await generateBatch(args(missing))).accepted.length, 0, "no solver answer, no item");
});

test("config: no key or no model means offline; ids and caps", () => {
  assert.equal(makeClient({}), null);
  assert.equal(generatorModel({}), null);
  assert.equal(generatorModel({ TUTOR_MODEL: "t" }), "t");
  assert.equal(generatorModel({ TUTOR_MODEL: "t", GENERATOR_MODEL: "g" }), "g");
  assert.match(newItemId("rw-transitions"), /^gen-rw-transitions-[a-f0-9]{10}$/);
  assert.equal(globalDailyCap({}), 200);
  assert.equal(globalDailyCap({ GENERATOR_DAILY_CAP: "5" }), 5);
});
