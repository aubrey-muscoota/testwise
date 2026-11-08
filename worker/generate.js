// Fresh questions from Socrates: Claude writes a small batch live, a separate
// blind call solves each one without the key, and only questions where the
// solver lands on the same answer (and that pass the shape checks below) are
// kept. Text and table questions only: no figures.
//
// The Anthropic client is passed in, so tests run offline with a fake one
// (anything with `messages.create(params)` that returns a Messages response).
// The model comes from config (GENERATOR_MODEL, else TUTOR_MODEL); there is
// no model id in code.

import Anthropic from "@anthropic-ai/sdk";
import { isCorrect } from "./engine.js";

export const BATCH_SIZE = 5;
export const PER_LEARNER_DAILY = 20;
export const DEFAULT_GLOBAL_DAILY = 200;
export const PASSAGE_WORDS = { single: [25, 150], cross: [25, 110] };

export function makeClient(env) {
  // Tests inject a fake client object (Worker vars are always strings).
  if (env.GENERATOR_CLIENT && typeof env.GENERATOR_CLIENT === "object") return env.GENERATOR_CLIENT;
  return env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
}
export const generatorModel = (env) => env.GENERATOR_MODEL || env.TUTOR_MODEL || null;
export function globalDailyCap(env) {
  const n = Number(env.GENERATOR_DAILY_CAP);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_GLOBAL_DAILY;
}

export const newItemId = (skillId) => `gen-${skillId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const words = (s) => String(s || "").replace(/<\/?u>/g, "").split(/\s+/).filter(Boolean).length;

// What kind of question this skill gets, read from its bank examples.
export function itemStyle(examples) {
  const passage = examples.some((e) => e.passage);
  return {
    passage,
    cross: passage && examples.length > 0 && examples.every((e) => e.passage2),
    spr: examples.some((e) => e.type === "spr"),
    table: examples.some((e) => e.table),
  };
}

// ─── Structured output schemas ──────────────────────────────────────────────
// Dynamic-key objects aren't allowed in strict schemas, so wrong_reasons come
// back as a list and are turned into the bank's {choice: reason} map.
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
export const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "passage", "passage2", "stem", "table", "choices", "answer", "accept", "explanation", "hints", "wrong_reasons"],
        properties: {
          type: { type: "string", enum: ["mc", "spr"] },
          passage: nullableString,
          passage2: nullableString,
          stem: { type: "string" },
          table: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["title", "headers", "rows"],
                properties: {
                  title: nullableString,
                  headers: { type: "array", items: { type: "string" } },
                  rows: { type: "array", items: { type: "array", items: { type: "string" } } },
                },
              },
            ],
          },
          choices: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          accept: { type: "array", items: { type: "string" } },
          explanation: { type: "array", items: { type: "string" } },
          hints: { type: "array", items: { type: "string" } },
          wrong_reasons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["choice", "reason"],
              properties: { choice: { type: "string" }, reason: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

export const SOLVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "answer"],
        properties: { number: { type: "integer" }, answer: { type: "string" } },
      },
    },
  },
};

// ─── Prompts ────────────────────────────────────────────────────────────────
const exampleJson = (it) => JSON.stringify({
  type: it.type,
  passage: it.passage ?? null,
  passage2: it.passage2 ?? null,
  stem: it.stem,
  table: it.table ?? null,
  choices: it.choices ?? [],
  answer: it.answer,
  accept: it.accept ?? [],
  explanation: it.explanation,
  hints: it.hints,
  wrong_reasons: Object.entries(it.wrong_reasons || {}).map(([choice, reason]) => ({ choice, reason })),
});

const DIFFICULTY = { 1: "easy", 2: "medium", 3: "hard" };

export function writerPrompt({ exam, section, domain, skill, difficulty, examples, n }) {
  const style = itemStyle(examples);
  const rules = [
    `Write ${n} new, original practice questions for the ${exam} ${section} section, skill "${skill.name}" (domain: ${domain}).`,
    `Target difficulty: ${DIFFICULTY[difficulty] || "medium"} for the real test (harder means more steps, subtler wrong choices, denser text).`,
    "Each question must have exactly one defensibly correct answer. Check your own answer carefully; a separate solver will answer each question blind and any disagreement is thrown out.",
    "Never copy or paraphrase official test questions or passages. Use fictional people, places and studies, or widely established facts. Never put invented claims or quotes in the mouth of a real, named person or institution.",
    "No figures, graphs or diagrams: text only, with an optional small table.",
    "Plain text with Unicode math (x², √, π, ≤, −, ·). A small TeX subset is allowed inside $…$ (\\frac, \\sqrt, ^, _, \\le, \\pi); write a literal dollar sign as \\$.",
    'type "mc": exactly 4 distinct choices, and "answer" is the exact text of one of them. "accept" is [].',
    'For each wrong choice, give in wrong_reasons the specific misconception that leads a student to pick it (one entry per wrong choice, choice text copied exactly).',
    '"explanation": 2–6 short worked steps. "hints": 2–3 Socratic questions that guide without giving the answer away.',
  ];
  if (style.spr) rules.push('Some questions may be type "spr" (the student types the answer): then "choices" and "wrong_reasons" are [], "answer" is the canonical value (an integer, decimal or fraction like 7/2), and "accept" lists other accepted forms (e.g. "3.5").');
  else rules.push('All questions are type "mc".');
  if (style.passage && style.cross) rules.push(`Every question has two short texts: "passage" is Text 1 and "passage2" is Text 2, each ${PASSAGE_WORDS.cross[0]}–${PASSAGE_WORDS.cross[1]} words.`);
  else if (style.passage) rules.push(`Every question has a "passage" of ${PASSAGE_WORDS.single[0]}–${PASSAGE_WORDS.single[1]} words (one question per passage) and "passage2": null. A blank is written ______ (six underscores). The only markup allowed is <u>…</u> for underlined text. Notes for rhetorical synthesis are lines starting with "• " separated by \\n.`);
  else rules.push('"passage" and "passage2" are null.');
  rules.push('"table" is null unless the question needs one: {"title", "headers": [...], "rows": [[...]]} with every cell a string.');
  const system = "You write practice questions for Testwise, an app where high school students prepare for standardized tests. Your questions are as accurate and carefully worded as the best published prep material.";
  const user = `${rules.map((r) => `- ${r}`).join("\n")}\n\nTwo questions from our bank for this skill, to match in format, style and level (write different ones):\n${examples.map(exampleJson).join("\n")}\n\nReturn {"items": [...]} with ${n} questions.`;
  return { system, user };
}

export function solverPrompt(items) {
  const blocks = items.map((it, i) => {
    const lines = [`Question ${i + 1}`];
    if (it.passage) lines.push(it.passage2 ? `Text 1: ${it.passage}\nText 2: ${it.passage2}` : `Passage: ${it.passage}`);
    lines.push(it.stem);
    if (it.table) {
      lines.push(`Table${it.table.title ? ` (${it.table.title})` : ""}: ${it.table.headers.join(" | ")}`);
      for (const r of it.table.rows) lines.push(`  ${r.join(" | ")}`);
    }
    if (it.type === "mc") lines.push(it.choices.map((c, j) => `${"ABCD"[j]}) ${c}`).join("\n"));
    else lines.push("(Student-produced response: give the numeric answer.)");
    return lines.join("\n");
  });
  return {
    system: "You are an expert test taker. Solve each question carefully and independently.",
    user: `${blocks.join("\n\n")}\n\nFor each question, return its number and your answer: the letter (A, B, C or D) for multiple choice, or the value for a student-produced response. Return {"answers": [{"number": 1, "answer": "..."}, ...]}.`,
  };
}

// ─── Shape checks and agreement ─────────────────────────────────────────────

/** Turns one writer output entry into the bank's item format. */
export function toItem(raw, { skill_id, difficulty }) {
  const wr = {};
  for (const w of raw.wrong_reasons || []) if (w && typeof w.choice === "string") wr[w.choice] = String(w.reason || "");
  const item = {
    skill_id,
    difficulty,
    type: raw.type,
    stem: String(raw.stem || "").trim(),
    choices: raw.type === "mc" ? (raw.choices || []).map((c) => String(c).trim()) : null,
    answer: String(raw.answer ?? "").trim(),
    accept: raw.type === "spr" ? (raw.accept || []).map(String) : [],
    explanation: (raw.explanation || []).map(String),
    hints: (raw.hints || []).map(String),
    wrong_reasons: raw.type === "mc" ? wr : {},
    table: raw.table && Array.isArray(raw.table.headers) ? raw.table : null,
    passage: raw.passage ? String(raw.passage).trim() : null,
    passage2: raw.passage2 ? String(raw.passage2).trim() : null,
  };
  if (item.table && !item.table.title) delete item.table.title;
  return item;
}

/** Returns a list of problems; empty means the item is well formed. */
export function validateItem(item, style) {
  const errs = [];
  if (!["mc", "spr"].includes(item.type)) errs.push("bad type");
  if (!item.stem || item.stem.length < 8) errs.push("missing stem");
  if (item.stem.length > 1200) errs.push("stem too long");
  if (item.type === "spr" && !style.spr) errs.push("grid-in not used for this skill");
  if (item.type === "mc") {
    const c = item.choices || [];
    if (c.length !== 4) errs.push("needs 4 choices");
    if (new Set(c.map((x) => x.toLowerCase())).size !== c.length) errs.push("choices not distinct");
    if (c.some((x) => !x)) errs.push("empty choice");
    if (!c.includes(item.answer)) errs.push("answer not among choices");
    const wrong = c.filter((x) => x !== item.answer);
    const keys = Object.keys(item.wrong_reasons || {});
    if (wrong.some((x) => !item.wrong_reasons[x])) errs.push("wrong_reasons missing a wrong choice");
    if (keys.some((k) => !wrong.includes(k))) errs.push("wrong_reasons key isn't a wrong choice");
  } else if (item.type === "spr") {
    if (!item.answer) errs.push("missing answer");
    if (!isCorrect(item, item.answer)) errs.push("answer doesn't check against itself");
    else if (!/^-?(\d+(\.\d+)?|\.\d+)(\/\d+(\.\d+)?)?$/.test(item.answer.replace(/\s/g, ""))) errs.push("grid-in answer must be a number");
  }
  if (item.explanation.length < 2 || item.explanation.length > 6) errs.push("explanation needs 2–6 steps");
  if (item.hints.length < 2 || item.hints.length > 3) errs.push("needs 2–3 hints");
  if (style.passage) {
    const [lo, hi] = style.cross ? PASSAGE_WORDS.cross : PASSAGE_WORDS.single;
    if (!item.passage) errs.push("missing passage");
    else if (words(item.passage) < lo || words(item.passage) > hi) errs.push(`passage must be ${lo}–${hi} words`);
    if (style.cross) {
      if (!item.passage2) errs.push("missing second text");
      else if (words(item.passage2) < lo || words(item.passage2) > hi) errs.push(`second text must be ${lo}–${hi} words`);
    } else if (item.passage2) errs.push("unexpected second text");
    const markup = `${item.passage || ""} ${item.passage2 || ""}`.replace(/<\/?u>/g, "");
    if (/<[^>]+>/.test(markup)) errs.push("only <u> markup allowed");
  } else if (item.passage || item.passage2) errs.push("unexpected passage");
  if (item.table) {
    const w = item.table.headers.length;
    if (!w || !item.table.rows.length || item.table.rows.some((r) => !Array.isArray(r) || r.length !== w)) errs.push("ragged table");
  }
  return errs;
}

/** Did the blind solver land on the key? MC by letter or exact text; grid-in numerically. */
export function agrees(item, solverAnswer) {
  const a = String(solverAnswer ?? "").trim();
  if (!a) return false;
  if (item.type === "mc") {
    if (item.choices.includes(a)) return a === item.answer;
    const m = a.match(/^\(?([A-D])\)?(?:[).:\s]|$)/i);
    const chosen = m ? item.choices["ABCD".indexOf(m[1].toUpperCase())] : a;
    return chosen === item.answer;
  }
  return isCorrect(item, a.replace(/^[a-z]\s*=\s*/i, ""));
}

function parseJsonText(res) {
  if (!res || res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

/**
 * Writes, checks and blind-solves a batch.
 * @param {object} o
 * @param {{messages:{create:Function}}} o.client
 * @param {string} o.model
 * @param {string} o.exam, o.section, o.domain   names, for the prompt
 * @param {{id:string, name:string}} o.skill
 * @param {number} o.difficulty                  1–3
 * @param {object[]} o.examples                  2 parsed bank items (no figures)
 * @param {number} [o.n]
 * @returns {Promise<{accepted: object[], rejected: {stem:string, reason:string}[], model:string|null}>}
 */
export async function generateBatch({ client, model, exam, section, domain, skill, difficulty, examples, n = BATCH_SIZE }) {
  const style = itemStyle(examples);
  const w = writerPrompt({ exam, section, domain, skill, difficulty, examples, n });
  const written = await client.messages.create({
    model,
    max_tokens: 16000,
    system: w.system,
    output_config: { effort: "medium", format: { type: "json_schema", schema: WRITER_SCHEMA } },
    messages: [{ role: "user", content: w.user }],
  });
  const out = parseJsonText(written);
  const raws = Array.isArray(out?.items) ? out.items.slice(0, n) : [];
  const rejected = [];
  const shaped = [];
  for (const raw of raws) {
    const item = toItem(raw, { skill_id: skill.id, difficulty });
    const errs = validateItem(item, style);
    if (errs.length) rejected.push({ stem: item.stem.slice(0, 80), reason: errs.join("; ") });
    else shaped.push(item);
  }
  if (!shaped.length) return { accepted: [], rejected, model: written?.model || model };

  const s = solverPrompt(shaped);
  const solved = await client.messages.create({
    model,
    max_tokens: 16000,
    system: s.system,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SOLVER_SCHEMA } },
    messages: [{ role: "user", content: s.user }],
  });
  const answers = new Map((parseJsonText(solved)?.answers || []).map((a) => [Number(a.number), a.answer]));
  const accepted = [];
  shaped.forEach((item, i) => {
    if (agrees(item, answers.get(i + 1))) accepted.push(item);
    else rejected.push({ stem: item.stem.slice(0, 80), reason: `solver answered ${JSON.stringify(answers.get(i + 1) ?? null)}, key ${JSON.stringify(item.answer)}` });
  });
  return { accepted, rejected, model: written?.model || model };
}
