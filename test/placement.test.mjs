import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickPlacementProbes, placementTestOut, skillDepths } from "../worker/engine.js";

const map = JSON.parse(readFileSync(new URL("../content/skills.json", import.meta.url), "utf8"));
let pos = 0;
const skills = map.domains.flatMap((d) => d.skills.map((s) => ({ ...s, domain_id: d.id, position: pos++ })));
const probes = pickPlacementProbes(skills);
const all = (ok) => new Map(probes.map((p) => [p.skill_id, ok]));

test("depths follow the prerequisite chains", () => {
  const d = skillDepths(skills);
  assert.equal(d.get("alg-linear-eq-1var"), 0);
  assert.equal(d.get("alg-systems"), 2);
  assert.equal(d.get("adv-nonlinear-eq"), 3);
});

test("placement probes three skills per domain, easy questions first", () => {
  assert.equal(probes.length, map.domains.length * 3);
  assert.equal(new Set(probes.map((p) => p.skill_id)).size, probes.length);
  const levels = probes.map((p) => p.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  for (const d of map.domains) {
    const mine = probes.filter((p) => p.domain_id === d.id);
    assert.deepEqual(mine.map((p) => p.difficulty), [1, 2, 3]);
  }
  // Easy probes are root-level skills.
  const depth = skillDepths(skills);
  for (const p of probes.filter((p) => p.level === 0)) {
    const dom = skills.filter((s) => s.domain_id === p.domain_id);
    assert.equal(depth.get(p.skill_id), Math.min(...dom.map((s) => depth.get(s.id))));
  }
});

test("all wrong tests out nothing", () => {
  assert.deepEqual(placementTestOut(probes, all(false), skills), []);
});

test("all right tests out every probed skill and its prerequisites", () => {
  const out = new Set(placementTestOut(probes, all(true), skills));
  for (const p of probes) assert.ok(out.has(p.skill_id), p.skill_id);
  // Prerequisites come along, even across domains.
  for (const id of ["alg-linear-eq-1var", "alg-linear-eq-2var", "alg-systems", "adv-equiv-expr"]) assert.ok(out.has(id), id);
  // Unprobed skills that nothing passed depends on stay open to learn.
  assert.ok(out.size < skills.length);
});

test("a lucky hard guess alone doesn't skip a domain", () => {
  const hard = probes.find((p) => p.domain_id === "alg" && p.level === 2);
  const res = placementTestOut(probes, new Map([[hard.skill_id, true]]), skills);
  assert.deepEqual(res, []);
  const easy = probes.find((p) => p.domain_id === "alg" && p.level === 0);
  const res2 = placementTestOut(probes, new Map([[hard.skill_id, true], [easy.skill_id, true]]), skills);
  assert.ok(res2.includes(hard.skill_id) && res2.includes(easy.skill_id));
});

test("an easy pass tests out just that root skill", () => {
  const easy = probes.find((p) => p.domain_id === "geo" && p.level === 0);
  assert.deepEqual(placementTestOut(probes, new Map([[easy.skill_id, true]]), skills), [easy.skill_id]);
});
