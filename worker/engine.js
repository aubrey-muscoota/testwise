// Adaptive practice engine. Pure functions, no I/O, so they can be unit tested.
//
// Model: a one-parameter (Rasch / Elo-style) rating. Each learner has a rating
// per skill, each item has a difficulty rating on the same scale, and
// P(correct) = 1 / (1 + e^-(learner - item)).

export const DAY_MS = 86_400_000;

export const START_ITEM_RATING = { 1: -1, 2: 0, 3: 1 };

// Lessons aim for questions the learner gets right about 65% of the time.
export const TARGET_P = 0.65;
const TARGET_OFFSET = Math.log(TARGET_P / (1 - TARGET_P)); // ≈ 0.62

export const LESSON_SIZE = 8;
export const MAX_REVIEWS_PER_LESSON = 3;
export const UNLOCK_ATTEMPTS = 8; // practice on each prerequisite before a skill opens
export const MASTERED_PCT = 80;
export const MASTERED_MIN_ATTEMPTS = 12;
export const MAX_REVIEW_INTERVAL_DAYS = 30;

export const XP_CORRECT = 10;
export const XP_LESSON = 15;

export function pCorrect(learnerRating, itemRating) {
  return 1 / (1 + Math.exp(-(learnerRating - itemRating)));
}

// Big steps while we know little about the learner, smaller once we know more.
export function kFactor(attempts) {
  return Math.max(0.15, 0.6 / (1 + attempts / 10));
}

export function updateLearner(rating, attempts, itemRating, correct) {
  const p = pCorrect(rating, itemRating);
  return rating + kFactor(attempts) * ((correct ? 1 : 0) - p);
}

// Items drift slowly toward how hard learners actually find them.
export function updateItem(itemRating, learnerRating, correct) {
  const p = pCorrect(learnerRating, itemRating);
  const next = itemRating - 0.03 * ((correct ? 1 : 0) - p);
  return Math.min(3, Math.max(-3, next));
}

// Shown to the learner as a 0–100 bar: chance of getting a medium-hard item right.
export function masteryPct(rating, attempts) {
  if (!attempts) return 0;
  return Math.round(100 * pCorrect(rating, 0.5));
}

export function isMastered(rating, attempts) {
  return attempts >= MASTERED_MIN_ATTEMPTS && masteryPct(rating, attempts) >= MASTERED_PCT;
}

export function isUnlocked(skill, masteryBySkill) {
  return (skill.prereqs || []).every(
    (id) => (masteryBySkill[id]?.attempts || 0) >= UNLOCK_ATTEMPTS,
  );
}

// Deterministic shuffle so tests are stable; callers pass a seed.
export function seededRandom(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick the questions for one lesson.
 * @param {object} o
 * @param {Array<{id:string, rating:number}>} o.items   live items for the skill
 * @param {number} o.learnerRating
 * @param {Map<string, number>} o.lastSeen             item id -> last answered_at
 * @param {string[]} o.dueReviewIds                    due review items, most overdue first
 * @param {() => number} o.rand
 * @param {number} [o.size]
 * @returns {{id:string, review:boolean}[]}
 */
export function pickLesson({ items, learnerRating, lastSeen, dueReviewIds, rand, size = LESSON_SIZE }) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const picked = [];
  const used = new Set();

  for (const id of dueReviewIds) {
    if (picked.length >= Math.min(MAX_REVIEWS_PER_LESSON, size)) break;
    if (!byId.has(id) || used.has(id)) continue;
    picked.push({ id, review: true });
    used.add(id);
  }

  const target = learnerRating - TARGET_OFFSET;
  const unseen = items.filter((it) => !used.has(it.id) && !lastSeen.has(it.id));
  // A little noise so two lessons at the same rating aren't identical.
  const score = (it) => Math.abs(it.rating - target) + rand() * 1.0;
  unseen.sort((a, b) => score(a) - score(b));

  // Warm up: the lesson starts a bit easier and ends a bit harder.
  const fresh = unseen.slice(0, size - picked.length).sort((a, b) => a.rating - b.rating);
  for (const it of fresh) {
    picked.push({ id: it.id, review: false });
    used.add(it.id);
  }

  // Out of new questions: reuse the ones seen longest ago.
  if (picked.length < size) {
    const seen = items
      .filter((it) => !used.has(it.id))
      .sort((a, b) => (lastSeen.get(a.id) || 0) - (lastSeen.get(b.id) || 0));
    for (const it of seen.slice(0, size - picked.length)) {
      picked.push({ id: it.id, review: false });
      used.add(it.id);
    }
  }
  return picked;
}

/**
 * Spaced review: a miss comes back tomorrow; each later success spaces it out
 * further; after a month-long gap it graduates and leaves the queue.
 * Returns the new schedule, or null when the item should leave the queue.
 */
export function nextReview(existing, correct, now) {
  if (!correct) return { due_at: now + DAY_MS, interval_days: 1 };
  if (!existing) return null; // a first-time correct answer needs no review
  const interval = Math.max(1, existing.interval_days) * 2.5;
  if (interval > MAX_REVIEW_INTERVAL_DAYS) return null;
  return { due_at: now + interval * DAY_MS, interval_days: interval };
}

export function localDay(nowMs, tzOffsetMin) {
  // tzOffsetMin follows JS getTimezoneOffset(): minutes *behind* UTC (New York = 300 / 240).
  const d = new Date(nowMs - (tzOffsetMin || 0) * 60_000);
  return d.toISOString().slice(0, 10);
}

function prevDay(day) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Days in a row with at least one completed lesson. Today counts if done;
// if today isn't done yet, the streak through yesterday is still alive.
export function streak(daysWithLessons, today) {
  const set = new Set(daysWithLessons);
  let day = set.has(today) ? today : prevDay(today);
  let n = 0;
  while (set.has(day)) {
    n += 1;
    day = prevDay(day);
  }
  return n;
}

// Answer checking. Multiple choice: exact choice. Grid-in: numeric equivalence
// (so "0.5", ".5" and "1/2" all match "1/2"), or one of the accepted forms.
export function parseNumber(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/−/g, "-").replace(/,/g, "").replace(/^\$/, "").replace(/[%°]$/, "");
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t);
  return null;
}

export function isCorrect(item, response) {
  if (response == null) return false;
  if (item.type === "mc") return String(response) === String(item.answer);
  const forms = [item.answer, ...(item.accept || [])];
  const norm = (x) => String(x).trim().toLowerCase().replace(/\s+/g, "").replace(/−/g, "-");
  if (forms.some((f) => norm(f) === norm(response))) return true;
  const r = parseNumber(response);
  if (r == null) return false;
  return forms.some((f) => {
    const v = parseNumber(f);
    return v != null && Math.abs(v - r) <= 1e-4 * Math.max(1, Math.abs(v));
  });
}

// ─── Placement quiz ──────────────────────────────────────────────────────────
// A short quiz for new learners: three questions per domain (the exam pack's
// "placement": per_domain, difficulties), from an early, a middle and a late
// skill, at easy, medium and hard difficulty. A passed
// question "tests out" that skill and everything it builds on, so the learner
// skips ahead instead of starting at the very first skill.

export const PLACEMENT_PER_DOMAIN = 3; // defaults when the exam pack doesn't say
export const PLACEMENT_DIFFICULTIES = [1, 2, 3];
export const PLACEMENT_RATING = 1.0; // starting rating for a tested-out skill

// Longest prerequisite chain under each skill (roots are 0).
export function skillDepths(skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const depth = new Map();
  const visit = (id, stack = new Set()) => {
    if (depth.has(id)) return depth.get(id);
    if (stack.has(id)) return 0; // a cycle would be a content bug; don't loop forever
    stack.add(id);
    const pre = (byId.get(id)?.prereqs || []).filter((p) => byId.has(p));
    const d = pre.length ? 1 + Math.max(...pre.map((p) => visit(p, stack))) : 0;
    depth.set(id, d);
    return d;
  };
  skills.forEach((s) => visit(s.id));
  return depth;
}

/**
 * Which skills to probe. Skills carry {id, domain_id, prereqs, position}.
 * Returns probes ordered easy → hard (all easy ones first), so the quiz warms up.
 * @param {{per_domain?: number, difficulties?: number[]}} [opts]  exam.json "placement"
 * @returns {{skill_id:string, domain_id:string, difficulty:number, level:number}[]}
 */
export function pickPlacementProbes(skills, opts = {}) {
  const perDomain = opts.per_domain || PLACEMENT_PER_DOMAIN;
  const diffs = opts.difficulties?.length ? opts.difficulties : PLACEMENT_DIFFICULTIES;
  const depth = skillDepths(skills);
  const domains = new Map();
  for (const s of skills) {
    if (!domains.has(s.domain_id)) domains.set(s.domain_id, []);
    domains.get(s.domain_id).push(s);
  }
  const probes = [];
  for (const [domainId, list] of domains) {
    const sorted = [...list].sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.position - b.position);
    const n = Math.min(perDomain, sorted.length);
    const picks = n === 1 ? [0] : Array.from({ length: n }, (_, k) => Math.round((k * (sorted.length - 1)) / (n - 1)));
    picks.forEach((idx, level) => {
      probes.push({ skill_id: sorted[idx].id, domain_id: domainId, difficulty: diffs[Math.min(level, diffs.length - 1)], level });
    });
  }
  return probes.sort((a, b) => a.level - b.level);
}

/**
 * Score a placement quiz. A probe counts as passed when it was answered
 * correctly and, for the medium and hard probes, the learner also got an easier
 * probe in the same domain right (one lucky guess shouldn't skip a domain).
 * Passed skills and their prerequisites are tested out, except probes that
 * were missed (and prerequisites reached only through them).
 * @param {ReturnType<typeof pickPlacementProbes>} probes
 * @param {Map<string, boolean>} correctBySkill  first-try result per probed skill
 * @param {{id:string, prereqs:string[]}[]} skills
 * @returns {string[]} skill ids to test out, in the order given by `skills`
 */
export function placementTestOut(probes, correctBySkill, skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const passed = [];
  const byDomain = new Map();
  for (const p of probes) {
    if (!byDomain.has(p.domain_id)) byDomain.set(p.domain_id, []);
    byDomain.get(p.domain_id).push(p);
  }
  for (const list of byDomain.values()) {
    list.sort((a, b) => a.level - b.level);
    list.forEach((p, i) => {
      if (!correctBySkill.get(p.skill_id)) return;
      if (i === 0 || list.slice(0, i).some((e) => correctBySkill.get(e.skill_id))) passed.push(p.skill_id);
    });
  }
  // A probe the learner missed is never tested out, and neither is anything
  // reached only through it.
  const missed = new Set(probes.filter((p) => correctBySkill.has(p.skill_id) && !correctBySkill.get(p.skill_id)).map((p) => p.skill_id));
  const out = new Set();
  const add = (id) => {
    if (out.has(id) || !byId.has(id) || missed.has(id)) return;
    out.add(id);
    (byId.get(id).prereqs || []).forEach(add);
  };
  passed.forEach(add);
  return skills.filter((s) => out.has(s.id)).map((s) => s.id);
}
