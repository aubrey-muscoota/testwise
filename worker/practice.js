// Practice mode: picking skills and questions for a practice session. Pure
// functions (no I/O) so they're unit tested in test/practice.test.mjs.
//
// Modes:
//   weak      lowest weighted mastery among started skills (weight × (1 − mastery))
//   mixed     all started skills, evenly
//   skill     one skill (a drill)
//   timed     like mixed, weighted like the real test, with a time limit
//   mistakes  questions answered wrong and not answered right since
//   fresh     new questions written by Claude (see generate.js); topped up with bank questions
//   review    a review circle on the Learn path: due spaced-review items first
//             (the route picks those), then a mix like "mixed" over skill_ids
//
// Questions per skill: unseen first (near the learner's level), then ones
// they missed, then the ones seen longest ago. Never the same one twice in a
// session, and skills are interleaved.

import { TARGET_P } from "./engine.js";

export const MODES = ["weak", "mixed", "skill", "timed", "mistakes", "fresh", "review"];
export const DEFAULT_N = 10;
export const DEFAULT_FRESH_N = 5;
export const MAX_N = 30;
export const LOW_UNSEEN_SHARE = 0.1; // a skill with < 10% unseen gets fresh questions
const TARGET_OFFSET = Math.log(TARGET_P / (1 - TARGET_P));

/**
 * Which skills a session draws from, and in what proportion.
 * @param {object} o
 * @param {string} o.mode
 * @param {{id, section_id, weight, mastery (0–1), started, mistakes?}[]} o.skills  skills with questions
 * @param {string} [o.skill_id]       mode "skill" (and "fresh" if given)
 * @param {string[]} [o.skill_ids]    restrict to these (e.g. from a plan task)
 * @param {string} [o.section]        restrict to a section
 * @param {string} [o.current_section] fallback when nothing is started yet
 * @param {number} [o.n]
 * @returns {{id:string, share:number}[]}
 */
export function practiceSkills({ mode, skills, skill_id, skill_ids, section, current_section, n = DEFAULT_N }) {
  let pool = section ? skills.filter((s) => s.section_id === section) : skills;
  if (mode === "skill" || (mode === "fresh" && skill_id)) {
    const s = skills.find((x) => x.id === skill_id);
    return s ? [{ id: s.id, share: 1 }] : [];
  }
  if (skill_ids?.length) {
    const set = new Set(skill_ids);
    const chosen = pool.filter((s) => set.has(s.id));
    if (chosen.length) pool = chosen;
  }
  const started = pool.filter((s) => s.started);
  const fallback = () => {
    const sec = current_section && pool.some((s) => s.section_id === current_section) ? current_section : pool[0]?.section_id;
    return pool.filter((s) => s.section_id === sec);
  };
  if (mode === "mistakes") {
    const withMistakes = pool.filter((s) => (s.mistakes || 0) > 0);
    const total = withMistakes.reduce((a, s) => a + s.mistakes, 0);
    return withMistakes.map((s) => ({ id: s.id, share: s.mistakes / total }));
  }
  if (mode === "weak") {
    const from = started.length ? started : pool;
    const prio = (s) => (s.weight || 1e-6) * (1 - (s.mastery || 0));
    const k = Math.min(from.length, skill_ids?.length ? from.length : n >= 16 ? 4 : 3);
    const top = [...from].sort((a, b) => prio(b) - prio(a) || (a.mastery || 0) - (b.mastery || 0)).slice(0, k);
    const total = top.reduce((a, s) => a + prio(s), 0) || 1;
    return top.map((s) => ({ id: s.id, share: prio(s) / total }));
  }
  // mixed, review, timed, fresh without a skill
  const from = started.length ? started : fallback();
  if (!from.length) return [];
  if (mode === "timed") {
    const total = from.reduce((a, s) => a + (s.weight || 0), 0);
    return from.map((s) => ({ id: s.id, share: total > 0 ? (s.weight || 0) / total : 1 / from.length }));
  }
  return from.map((s) => ({ id: s.id, share: 1 / from.length }));
}

// Largest-remainder split of n over shares (every skill gets one before any gets two, when n allows).
export function allocate(n, plan) {
  if (!plan.length) return new Map();
  const out = new Map(plan.map((p) => [p.id, 0]));
  if (n <= plan.length) {
    [...plan].sort((a, b) => b.share - a.share).slice(0, n).forEach((p) => out.set(p.id, 1));
    return out;
  }
  const total = plan.reduce((a, p) => a + p.share, 0) || 1;
  const raw = plan.map((p) => ({ id: p.id, v: 1 + ((n - plan.length) * p.share) / total }));
  let used = 0;
  for (const r of raw) { out.set(r.id, Math.floor(r.v)); used += Math.floor(r.v); }
  raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; used < n; i++, used++) out.set(raw[i % raw.length].id, out.get(raw[i % raw.length].id) + 1);
  return out;
}

/**
 * Orders one skill's questions for this learner.
 * @param {{id, rating}[]} items
 * @param {Map<string, {last_at:number, last_correct:boolean}>} history
 * @param {number} learnerRating
 * @param {() => number} rand
 * @param {{mistakesOnly?: boolean}} [opts]
 */
export function orderItems(items, history, learnerRating, rand, { mistakesOnly = false } = {}) {
  const target = learnerRating - TARGET_OFFSET;
  const unseen = [];
  const missed = [];
  const seen = [];
  for (const it of items) {
    const h = history.get(it.id);
    if (!h) unseen.push(it);
    else if (!h.last_correct) missed.push(it);
    else seen.push(it);
  }
  if (mistakesOnly) return missed.sort((a, b) => history.get(a.id).last_at - history.get(b.id).last_at);
  const noise = new Map(items.map((it) => [it.id, rand() * 0.8]));
  unseen.sort((a, b) => Math.abs(a.rating - target) + noise.get(a.id) - (Math.abs(b.rating - target) + noise.get(b.id)));
  const byAge = (a, b) => history.get(a.id).last_at - history.get(b.id).last_at;
  missed.sort(byAge);
  seen.sort(byAge);
  return [...unseen, ...missed, ...seen];
}

/**
 * Picks a session.
 * @param {object} o
 * @param {string} o.mode
 * @param {{id:string, share:number}[]} o.plan      from practiceSkills
 * @param {{id, skill_id, rating}[]} o.items        candidate questions (any skills)
 * @param {Map<string, {last_at, last_correct}>} o.history  latest answer per item
 * @param {Object<string, number>} o.ratings        learner rating per skill
 * @param {number} o.n
 * @param {() => number} o.rand
 * @param {Set<string>} [o.exclude]                 already in the session (e.g. fresh items)
 * @returns {{id:string, skill_id:string, seen:boolean}[]}
 */
export function pickPractice({ mode, plan, items, history, ratings, n, rand, exclude = new Set() }) {
  const quota = allocate(n, plan);
  const bySkill = new Map(plan.map((p) => [p.id, []]));
  for (const it of items) if (bySkill.has(it.skill_id) && !exclude.has(it.id)) bySkill.get(it.skill_id).push(it);
  const queues = new Map();
  for (const [id, list] of bySkill) {
    queues.set(id, orderItems(list, history, ratings[id] || 0, rand, { mistakesOnly: mode === "mistakes" }));
  }
  // Take each skill's quota; a skill that runs dry hands its share to the others.
  const taken = new Map(plan.map((p) => [p.id, []]));
  let short = 0;
  for (const p of plan) {
    const q = queues.get(p.id);
    const k = quota.get(p.id) || 0;
    taken.get(p.id).push(...q.splice(0, k));
    short += k - taken.get(p.id).length;
  }
  while (short > 0) {
    const open = plan.filter((p) => queues.get(p.id).length);
    if (!open.length) break;
    for (const p of open.sort((a, b) => b.share - a.share)) {
      if (short <= 0) break;
      taken.get(p.id).push(queues.get(p.id).shift());
      short--;
    }
  }
  // Interleave: spread each skill's questions evenly through the session.
  const slots = [];
  for (const [id, list] of taken) {
    list.forEach((it, i) => slots.push({ it, key: (i + 0.5) / list.length + rand() * 1e-3, skill: id }));
  }
  slots.sort((a, b) => a.key - b.key);
  let out = slots.map((s) => s.it);
  if (mode === "skill") out = out.sort((a, b) => a.rating - b.rating); // a drill warms up: easy to hard
  return out.map((it) => ({ id: it.id, skill_id: it.skill_id, seen: history.has(it.id) }));
}

/** Per-skill counts for the summary endpoint. */
export function bankSummary(items, history) {
  const by = new Map();
  for (const it of items) {
    if (!by.has(it.skill_id)) by.set(it.skill_id, { bank: 0, generated: 0, seen: 0, unseen: 0, missed: 0 });
    const r = by.get(it.skill_id);
    r.bank++;
    if (it.source === "generated") r.generated++;
    const h = history.get(it.id);
    if (!h) r.unseen++;
    else {
      r.seen++;
      if (!h.last_correct) r.missed++;
    }
  }
  return by;
}

export const lowUnseen = (row) => row.bank > 0 && row.unseen / row.bank < LOW_UNSEEN_SHARE;
