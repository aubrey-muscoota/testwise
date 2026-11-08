// The inline math renderer leaves dollar amounts alone: the SAT bank writes
// currency as plain "$2.50 … $9.75", and only spans with a TeX signal are math.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderMath, texToText } from "../app/src/text/tex.ts";

const ITEMS = fileURLToPath(new URL("../exams/sat/items/", import.meta.url));
const items = readdirSync(ITEMS).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(ITEMS + f, "utf8")));
const strings = (it) => [it.passage, it.stem, ...(it.choices ?? []), ...(it.explanation ?? []), ...Object.values(it.wrong_reasons ?? {})].filter((s) => typeof s === "string");
const dollars = (s) => (s.match(/\$/g) || []).length;

test("renderMath keeps every dollar sign in the SAT bank", () => {
  for (const it of items) for (const s of strings(it)) assert.equal(dollars(renderMath(s)), dollars(s), `${it.id}: ${s}`);
});

test("currency pairs read exactly as written", () => {
  const all = items.flatMap(strings).map(renderMath).join("\n");
  assert.ok(all.includes("pays $2.50 toward the delivery tip. If each friend paid a total of $9.75"));
  assert.ok(all.includes("a one-time $200 fee for a T-shirt design and $5 to print"));
});

test("TeX spans still render, with operators glued to their operands", () => {
  assert.equal(renderMath("Solve $x^2 = 4$."), "Solve x² = 4.");
  assert.equal(renderMath("$\\frac{1}{2}$ of \\$10"), "1/2 of $10");
  assert.equal(texToText("a+b"), "a + b");
});
