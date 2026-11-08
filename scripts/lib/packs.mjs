// Exam packs: one folder per exam under exams/<id>/ (see docs/ADDING_AN_EXAM.md).
//
//   exam.json    exam config (sections, timing, scoring, placement, plan defaults)
//   skills.json  sections → domains (with weights) → skills (with prerequisites)
//   voice.json   Socrates' exam-specific lines and persona notes
//   items/*.json questions, one file per skill
//
// loadPacks() reads every pack in a folder; validatePacks() returns readable
// problems instead of throwing, so the seed builder can list them all at once.
// Keys starting with "//" are comments and are dropped on load.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const ITEM_TYPES = ["mc", "spr"];

const stripComments = (v) => {
  if (Array.isArray(v)) return v.map(stripComments);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("//")).map(([k, x]) => [k, stripComments(x)]));
  }
  return v;
};

function readJson(path, problems) {
  try {
    return stripComments(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    problems.push(`${path}: ${existsSync(path) ? `not valid JSON (${err.message})` : "missing"}`);
    return null;
  }
}

/** Reads one pack folder. Never throws; problems go into pack.problems. */
export function loadPack(dir) {
  const problems = [];
  const exam = readJson(join(dir, "exam.json"), problems);
  const skills = readJson(join(dir, "skills.json"), problems);
  const voice = readJson(join(dir, "voice.json"), problems);
  const items = [];
  const itemsDir = join(dir, "items");
  const files = existsSync(itemsDir) ? readdirSync(itemsDir).filter((f) => f.endsWith(".json")).sort() : [];
  for (const f of files) {
    const list = readJson(join(itemsDir, f), problems);
    if (list && !Array.isArray(list)) problems.push(`${join(itemsDir, f)}: must be a JSON array of items`);
    else if (list) for (const it of list) items.push({ ...it, _file: f });
  }
  return { dir, exam, skills, voice, items, files, problems };
}

/** Every pack folder (a subfolder with an exam.json) under examsDir, sorted by id. */
export function loadPacks(examsDir = "exams", { enabledOnly = true } = {}) {
  const dirs = readdirSync(examsDir)
    .filter((d) => statSync(join(examsDir, d)).isDirectory() && existsSync(join(examsDir, d, "exam.json")))
    .sort();
  const packs = dirs.map((d) => ({ ...loadPack(join(examsDir, d)), folder: d }));
  return enabledOnly ? packs.filter((p) => p.exam?.enabled === true) : packs;
}

/**
 * Skills of a pack (optionally one section), flattened in path order with the
 * fields the engine expects: {id, name, domain_id, section_id, prereqs, position}.
 */
export function packSkills(pack, sectionId = null) {
  let pos = 0;
  const out = [];
  for (const sec of pack.skills?.sections || []) {
    for (const d of sec.domains || []) {
      for (const s of d.skills || []) {
        const row = { id: s.id, name: s.name, domain_id: d.id, section_id: sec.id, prereqs: s.prereqs || [], position: pos++ };
        if (!sectionId || sec.id === sectionId) out.push(row);
      }
    }
  }
  return out;
}

/** Section config from exam.json merged with its domains from skills.json. */
export function packSection(pack, sectionId) {
  const cfg = pack.exam?.sections?.find((s) => s.id === sectionId);
  const map = pack.skills?.sections?.find((s) => s.id === sectionId);
  return cfg ? { ...cfg, domains: map?.domains || [] } : null;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

function checkExam(exam, folder, p) {
  const need = (cond, msg) => cond || p.push(`exam.json: ${msg}`);
  if (!exam) return;
  need(exam.id === folder, `"id" must be "${folder}" (the folder name), got ${JSON.stringify(exam.id)}`);
  need(typeof exam.enabled === "boolean", `"enabled" must be true or false`);
  for (const k of ["name", "short_name", "tagline", "audience"]) need(isStr(exam[k]), `missing "${k}"`);
  need(isStr(exam.publisher?.name), `missing "publisher.name"`);
  need(isStr(exam.publisher?.disclaimer), `missing "publisher.disclaimer"`);
  const score = (s, where) => need(s && isNum(s.min) && isNum(s.max) && isNum(s.step) && s.min < s.max && s.step > 0, `${where} needs {min, max, step} with min < max`);
  score(exam.score, `"score"`);
  if (!Array.isArray(exam.sections) || !exam.sections.length) return p.push(`exam.json: "sections" must be a non-empty list`);
  exam.sections.forEach((s, i) => {
    const at = `sections[${i}]${s?.id ? ` (${s.id})` : ""}`;
    need(isStr(s.id), `${at}: missing "id"`);
    need(isStr(s.name), `${at}: missing "name"`);
    for (const k of ["minutes", "questions", "seconds_per_question"]) need(isNum(s[k]) && s[k] > 0, `${at}: "${k}" must be a positive number`);
    score(s.score, `${at}: "score"`);
    need(Array.isArray(s.item_types) && s.item_types.length && s.item_types.every((t) => ITEM_TYPES.includes(t)), `${at}: "item_types" must list some of ${ITEM_TYPES.join(", ")}`);
    need(Number.isInteger(s.choices) && s.choices >= 2 && s.choices <= 6, `${at}: "choices" must be a whole number from 2 to 6`);
    need(typeof s.code_checks === "boolean", `${at}: "code_checks" must be true or false`);
  });
  need(exam.sections.some((s) => s.id === exam.default_section), `"default_section" ${JSON.stringify(exam.default_section)} is not one of the sections`);
  const pl = exam.placement;
  need(pl && Number.isInteger(pl.per_domain) && pl.per_domain >= 1, `"placement.per_domain" must be a whole number, 1 or more`);
  need(pl && Array.isArray(pl.difficulties) && pl.difficulties.length && pl.difficulties.every((d) => [1, 2, 3].includes(d)), `"placement.difficulties" must list difficulties 1-3`);
  const plan = exam.plan;
  need(plan && Number.isInteger(plan.default_weeks) && plan.default_weeks > 0, `"plan.default_weeks" must be a positive whole number`);
  need(plan && Array.isArray(plan.daily_minutes) && plan.daily_minutes.length && plan.daily_minutes.every((m) => isNum(m) && m > 0), `"plan.daily_minutes" must list minutes`);
  need(plan && plan.daily_minutes?.includes(plan.default_daily_minutes), `"plan.default_daily_minutes" must be one of "plan.daily_minutes"`);
  const shares = (plan?.phases || []).map((ph) => ph.share);
  need(Array.isArray(plan?.phases) && plan.phases.length && plan.phases.every((ph) => isStr(ph.id) && isStr(ph.name) && isNum(ph.share)) && Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 0.001,
    `"plan.phases" must list {id, name, share} with shares adding up to 1`);
}

/**
 * Checks packs one by one and against each other (ids are global in the
 * database, so no two packs may share a section, domain, skill or item id).
 * @returns {string[]} problems, each prefixed with the pack folder
 */
export function validatePacks(packs) {
  const all = [];
  const owners = { exam: new Map(), section: new Map(), domain: new Map(), skill: new Map(), item: new Map() };
  const claim = (kind, id, folder, p) => {
    const prev = owners[kind].get(id);
    if (prev) p.push(`duplicate ${kind} id "${id}"${prev === folder ? "" : ` (also in exams/${prev})`}`);
    else owners[kind].set(id, folder);
  };
  for (const pack of packs) {
    const folder = pack.folder || pack.dir.split(/[\\/]/).pop();
    const p = [...pack.problems];
    const { exam, skills, voice } = pack;
    checkExam(exam, folder, p);
    if (exam?.id) claim("exam", exam.id, folder, p);
    if (voice && (typeof voice !== "object" || Array.isArray(voice))) p.push("voice.json: must be an object");
    if (voice?.persona_notes && !Array.isArray(voice.persona_notes)) p.push(`voice.json: "persona_notes" must be a list of sentences`);

    const examSections = new Map((exam?.sections || []).map((s) => [s.id, s]));
    const skillIds = new Set(packSkills(pack).map((s) => s.id));
    const skillSection = new Map();
    if (skills && !Array.isArray(skills.sections)) p.push(`skills.json: "sections" must be a list`);
    for (const sec of skills?.sections || []) {
      if (!examSections.has(sec.id)) p.push(`skills.json: section "${sec.id}" is not in exam.json sections`);
      claim("section", sec.id, folder, p);
      const doms = sec.domains || [];
      if (!doms.length) p.push(`skills.json: section "${sec.id}" has no domains`);
      for (const d of doms) {
        claim("domain", d.id, folder, p);
        if (!isStr(d.name)) p.push(`skills.json: domain "${d.id}" needs a "name"`);
        if (!isNum(d.weight) || d.weight <= 0 || d.weight > 1) p.push(`skills.json: domain "${d.id}" needs a "weight" between 0 and 1 (its share of the section's questions)`);
        if (!d.skills?.length) p.push(`skills.json: domain "${d.id}" has no skills`);
        for (const s of d.skills || []) {
          claim("skill", s.id, folder, p);
          skillSection.set(s.id, sec.id);
          if (!isStr(s.name)) p.push(`skills.json: skill "${s.id}" needs a "name"`);
          for (const pre of s.prereqs || []) {
            if (!skillIds.has(pre)) p.push(`skills.json: skill "${s.id}" has prerequisite "${pre}", which is not a skill in this exam`);
          }
        }
      }
      const total = doms.reduce((a, d) => a + (isNum(d.weight) ? d.weight : 0), 0);
      if (doms.length && Math.abs(total - 1) > 0.01) p.push(`skills.json: domain weights in section "${sec.id}" add up to ${+total.toFixed(3)}, not 1`);
    }
    for (const id of findCycle(packSkills(pack))) p.push(`skills.json: prerequisites loop back to "${id}"`);

    for (const it of pack.items) {
      const at = `items/${it._file}: ${it.id ? `"${it.id}"` : "an item without an id"}`;
      if (!isStr(it.id)) { p.push(`${at}: missing "id"`); continue; }
      claim("item", it.id, folder, p);
      if (!skillSection.has(it.skill_id)) { p.push(`${at}: unknown skill_id "${it.skill_id}"`); continue; }
      if (it._file !== `${it.skill_id}.json`) p.push(`${at}: skill "${it.skill_id}" belongs in items/${it.skill_id}.json`);
      const sec = examSections.get(skillSection.get(it.skill_id));
      if (![1, 2, 3].includes(it.difficulty)) p.push(`${at}: difficulty must be 1, 2 or 3`);
      if (sec && !sec.item_types?.includes(it.type)) p.push(`${at}: type "${it.type}" is not allowed in section "${sec.id}" (allowed: ${sec.item_types?.join(", ")})`);
      if (sec && it.type === "mc" && (!Array.isArray(it.choices) || it.choices.length !== sec.choices)) p.push(`${at}: needs ${sec.choices} choices`);
      for (const k of ["stem", "answer"]) if (!isStr(String(it[k] ?? ""))) p.push(`${at}: missing "${k}"`);
      for (const k of ["explanation", "hints"]) if (!Array.isArray(it[k]) || !it[k].length) p.push(`${at}: "${k}" must be a non-empty list`);
    }
    all.push(...p.map((m) => `exams/${folder}: ${m}`));
  }
  return all;
}

// Skill ids on a prerequisite cycle (empty when the map is a proper DAG).
function findCycle(skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const state = new Map();
  const bad = new Set();
  const visit = (id) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { bad.add(id); return; }
    state.set(id, 1);
    for (const pre of byId.get(id)?.prereqs || []) if (byId.has(pre)) visit(pre);
    state.set(id, 2);
  };
  skills.forEach((s) => visit(s.id));
  return [...bad];
}
