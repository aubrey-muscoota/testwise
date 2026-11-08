// Socrates: the tutor that helps after a wrong answer.
// It always sees the verified answer and worked solution, so it coaches toward
// a known-correct result instead of solving from scratch.

import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_TUTOR_MODEL = "claude-opus-5-5";
export const DAILY_CONVERSATIONS = 5;
export const MAX_STUDENT_TURNS = 6;

// "Math, and Reading and Writing": section names can contain "and" themselves,
// so the list always uses a comma before its last "and".
const listOf = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`);

/**
 * The system prompt. Everything exam-specific comes from the exam pack
 * (worker/lib/exam.js): exam.json for the name, audience and sections, and
 * voice.json for what Socrates calls the sections and his persona notes.
 */
export function buildPersona(exam) {
  const voice = exam.voice || {};
  const names = exam.sections.map((s) => voice.terms?.sections?.[s.id] || s.name);
  const notes = (voice.persona_notes || []).map((n) => `- ${n}`).join("\n");
  return PERSONA
    .replace("{audience}", exam.audience)
    .replace("{exam}", `the ${exam.short_name || exam.name}${names.length ? ` (${listOf(names)})` : ""}`)
    .replace("{notes}", notes ? `\n\nAbout this exam:\n${notes}` : "");
}

const PERSONA = `You are Socrates, the tutor in Testwise, an app where {audience} practice for {exam} in short daily lessons.

A student just answered a practice question wrong. Your job is to guide them to the right answer themselves, the way a great one-on-one tutor would.

How you talk:
- Warm, encouraging, plainspoken. A little playful, never preachy. You may add a light philosopher touch now and then ("Wisdom grows from error"), but don't overdo it.
- Short: one to three sentences per message, then end with exactly one question for the student.
- Plain text with Unicode math (x², √, π, ≤, −). No LaTeX, no markdown headings, no bullet lists.

How you teach:
- Start from what the student chose. If you know the likely misconception behind their choice, gently probe it.
- Ask one guiding question at a time. Don't reveal the final answer in your first two messages.
- If the student is stuck after a couple of tries, or asks directly for the answer, walk through the solution step by step and give the answer.
- When the student reaches the right answer, confirm it briefly and celebrate.
- The answer key and worked solution below are verified. Trust them over your own arithmetic. Never tell the student a different answer is correct.
- Stay on this question. If the student goes off topic or asks for something unrelated, kindly steer back to the problem.
- Never ask for personal information.{notes}`;

export function itemBrief(item, response, voice = {}) {
  const lines = [];
  if (item.passage) lines.push(item.passage2 ? `Text 1: ${item.passage}\nText 2: ${item.passage2}` : `Passage: ${item.passage}`);
  if (item.figure?.alt) lines.push(`Figure (the student sees a drawing of this): ${item.figure.alt}`);
  lines.push(`Question: ${item.stem}`);
  if (item.table) {
    lines.push(`Table${item.table.title ? ` (${item.table.title})` : ""}: ${item.table.headers.join(" | ")}`);
    for (const r of item.table.rows) lines.push(`  ${r.join(" | ")}`);
  }
  if (item.type === "mc") lines.push(`Choices: ${item.choices.map((c, i) => `${"ABCDEFGH"[i]}) ${c}`).join("   ")}`);
  else lines.push(`This is a ${voice.terms?.spr || "student-produced response"} question (the student types the answer).`);
  lines.push(`Correct answer (verified): ${item.answer}`);
  lines.push(`Worked solution (verified): ${item.explanation.join(" ")}`);
  lines.push(`The student answered: ${response}`);
  const why = item.wrong_reasons?.[response];
  if (why) lines.push(`Likely misconception behind that answer: ${why}`);
  if (item.hints?.length) lines.push(`Hint ideas you can use: ${item.hints.join(" / ")}`);
  return lines.join("\n");
}

// Without an API key, Socrates still helps by walking through the item's
// pre-written hints, then the worked solution.
export function offlineReply(item, studentTurns) {
  const hints = item.hints || [];
  if (studentTurns === 0) {
    return "Hmm, not quite. Let's think it through together. " + (hints[0] || "What is the question really asking for?");
  }
  if (studentTurns < hints.length) return hints[studentTurns];
  return "Let's walk through it: " + item.explanation.join(" ") + ` So the answer is ${item.answer}. Mistakes are the path to mastery!`;
}

/**
 * @param {object} o
 * @param {string} o.apiKey
 * @param {string} [o.model]
 * @param {object} o.item       parsed item
 * @param {string} o.response   the student's wrong answer
 * @param {{role:'student'|'socrates', content:string}[]} o.history
 * @param {object} o.exam       the learner's exam pack (worker/lib/exam.js)
 */
export async function socratesReply({ apiKey, model, item, response, history, exam }) {
  const client = new Anthropic({ apiKey });
  const messages = [
    {
      role: "user",
      content:
        `${itemBrief(item, response, exam.voice)}\n\nThe student just tapped "Ask Socrates". Open the conversation.`,
    },
  ];
  for (const turn of history) {
    messages.push({ role: turn.role === "socrates" ? "assistant" : "user", content: turn.content });
  }

  const res = await client.beta.messages.create({
    model: model || DEFAULT_TUTOR_MODEL,
    max_tokens: 16000,
    system: buildPersona(exam),
    // A short chat: low effort keeps replies quick.
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  });

  if (res.stop_reason === "refusal") return { text: null, model: res.model };
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text: text || null, model: res.model };
}
