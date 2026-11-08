import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { pickPlacementProbes, placementTestOut, skillDepths } from "../worker/engine.js";
import { loadPack, packSkills } from "../scripts/lib/packs.mjs";

const pack = loadPack(fileURLToPath(new URL("../exams/sat", import.meta.url)));
// Placement runs per section; these tests use SAT Math.
const map = pack.skills.sections.find((s) => s.id === "sat-math");
const skills = packSkills(pack, "sat-math");
const probes = pickPlacementProbes(skills, pack.exam.placement);
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

test("a missed probe is never tested out, even as a prerequisite", () => {
  const correct = all(true);
  const mid = probes.find((p) => p.domain_id === "alg" && p.level === 1);
  correct.set(mid.skill_id, false);
  const out = placementTestOut(probes, correct, skills);
  assert.ok(!out.includes(mid.skill_id));
  const hard = probes.find((p) => p.domain_id === "alg" && p.level === 2);
  assert.ok(out.includes(hard.skill_id), "the hard probe still counts (an easier one was right)");
});

test("Reading and Writing placement probes every domain, easy first", () => {
  const rw = pack.skills.sections.find((s) => s.id === "sat-rw");
  const rwSkills = packSkills(pack, "sat-rw");
  const rwProbes = pickPlacementProbes(rwSkills, pack.exam.placement);
  assert.deepEqual(new Set(rwProbes.map((x) => x.domain_id)), new Set(rw.domains.map((d) => d.id)));
  assert.equal(rwProbes.length, rw.domains.reduce((n, d) => n + Math.min(3, d.skills.length), 0));
  assert.ok(rwProbes.every((x, i) => i === 0 || rwProbes[i - 1].level <= x.level), "sorted easy to hard");
  // All right tests out every skill in the section.
  const out = placementTestOut(rwProbes, new Map(rwProbes.map((x) => [x.skill_id, true])), rwSkills);
  assert.equal(out.length, rwSkills.length);
});
