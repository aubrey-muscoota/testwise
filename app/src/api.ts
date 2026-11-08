import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { FigureSpec } from "./figure/Figure";

export type Item = {
  id: string;
  skill_id: string;
  difficulty: number;
  type: "mc" | "spr";
  stem: string;
  table: { title?: string; headers: string[]; rows: string[][] } | null;
  passage?: string | null;
  passage2?: string | null;
  figure?: FigureSpec | null;
  choices: string[] | null;
  answer: string;
  accept: string[];
  explanation: string[];
  hints: string[];
  wrong_reasons: Record<string, string>;
  review: boolean;
  // Practice only: "generated" when Socrates wrote it.
  source?: "bank" | "generated";
};

export type Skill = {
  id: string;
  name: string;
  prereqs: string[];
  items: number;
  attempts: number;
  // Questions really answered outside placement (attempts includes placement credit).
  answered?: number;
  mastery: number;
  mastered: boolean;
  tested_out?: boolean;
  unlocked: boolean;
};

export type Domain = { id: string; name: string; section_id?: string; weight?: number; skills: Skill[] };

export type Section = { id: string; name: string; domains: string[] };

export type Stats = { xp: number; streak: number; lessons_today: number; xp_today: number; reviews_due: number };

export type Consent = { age_confirmed: boolean; ai_consent: boolean };

export type Tree = { exam: { id: string; name: string }; sections?: Section[]; domains: Domain[]; stats: Stats; learner?: Consent; profile?: Profile };

export type PracticeMode = "weak" | "mixed" | "skill" | "timed" | "mistakes" | "fresh";

export type Lesson = {
  lesson_id: string;
  skill_id: string | null;
  placement?: boolean;
  items: Item[];
  // Practice sessions (POST /api/practice).
  practice?: boolean;
  mode?: PracticeMode;
  time_limit_seconds?: number;
  fresh?: boolean;
  generated?: number;
  note?: string;
};

// Test date and pacing (GET/POST /api/profile).
export type Profile = {
  onboarded: boolean;
  exam_date: string | null;
  not_booked: boolean;
  assumed_exam_date: string | null;
  target_score: number | null;
  daily_minutes: number | null;
  plan_started_at: string | null;
};

// The exact request that starts a plan task.
export type StartRequest = { method: "POST"; path: string; body: Record<string, unknown> };

export type PlanTask = {
  id: string;
  kind: "review" | "lesson" | "practice" | "rest";
  minutes: number;
  title: string;
  why: string;
  done: boolean;
  start: StartRequest | null;
  n?: number;
  skill_id?: string;
  mode?: PracticeMode;
  skill_ids?: string[];
};

export type PlanPhase = "learn" | "strengthen" | "test_ready" | "rest" | "after";

export type Plan = {
  profile: Profile;
  date: string;
  exam_date: string;
  exam_date_assumed: boolean;
  days_left: number;
  phase: PlanPhase;
  status: { on_track: boolean; behind_by_lessons: number; missed_yesterday: boolean; message: string };
  today_tasks_done: number;
  today: PlanTask[];
  minutes_planned: number;
  daily_minutes: number;
  skills_started: number;
  skills_total: number;
  learn_by: string;
  test_ready_from: string;
  // A week names its skills (focus_names) or, when there are none to name, its goal.
  weeks: { start: string; end: string; phase: PlanPhase; focus_skill_ids: string[]; focus_names: string[]; goal: string | null }[];
};

export type SkillSummary = {
  skill_id: string;
  name: string;
  section_id: string;
  bank: number;
  generated: number;
  seen: number;
  unseen: number;
  missed: number;
  started: boolean;
  unlocked: boolean;
  low: boolean;
};

export type PracticeSummary = {
  // fixable: misses "My mistakes" can serve (in open or started skills).
  totals: { bank: number; generated: number; seen: number; unseen: number; missed: number; fixable?: number };
  skills: SkillSummary[];
  fresh: { available: boolean; generated_today: number; daily_limit: number };
};

export type Placement = { tested_out: { id: string; name: string }[]; next: { id: string; name: string }[]; total_skills: number };

export type TutorTurn = { role: "student" | "socrates"; content: string };

// The exam pack (exams/<id>/exam.json + voice.json, with domain weights), from GET /api/exam.
export type Score = { min: number; max: number; step: number };
export type ExamSection = {
  id: string;
  name: string;
  minutes: number;
  questions: number;
  modules?: number;
  seconds_per_question: number;
  score: Score;
  item_types: ("mc" | "spr")[];
  choices: number;
  domains: { id: string; name: string; weight: number }[];
};
export type Exam = {
  id: string;
  name: string;
  short_name: string;
  tagline: string;
  audience: string;
  publisher: { name: string; disclaimer: string };
  score: Score;
  default_section: string;
  sections: ExamSection[];
  placement: { per_domain: number; difficulties: number[]; seconds_per_question?: number };
  plan: {
    default_weeks: number;
    daily_minutes: number[];
    default_daily_minutes: number;
    rest_days_per_week?: number;
    phases: { id: string; name: string; share: number }[];
  };
  voice: {
    persona_notes?: string[];
    terms?: { spr?: string; sections?: Record<string, string> };
    placement_intro?: Record<string, string>;
    skill_about?: Record<string, string>;
    test_day_tips?: string[];
  };
};

const KEY = "testwise.learner";

function base() {
  const env = process.env.EXPO_PUBLIC_API_BASE;
  if (env) return env.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    // Works on workers.dev (/api) and when mounted at muscoota.com/testwise (/testwise/api).
    return window.location.pathname.startsWith("/testwise") ? "/testwise" : "";
  }
  return "https://testwise.muscoota.workers.dev";
}

let learnerId: string | null = null;

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-tz-offset": String(new Date().getTimezoneOffset()),
  };
  if (learnerId) headers["x-learner"] = learnerId;
  const res = await fetch(base() + path, {
    method: init.method || "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 429 && data?.reply)) {
    const err = new Error(data?.error || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function loadLearner(): Promise<string | null> {
  try {
    learnerId = await AsyncStorage.getItem(KEY);
  } catch {
    learnerId = null;
  }
  return learnerId;
}

// Only called after the age question says 13 or older.
export async function createLearner(): Promise<string> {
  const { id } = await call<{ id: string }>("/api/learners", { method: "POST", body: { age_13_plus: true } });
  consent = { age_confirmed: true, ai_consent: false };
  learnerId = id;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // Private browsing: progress lasts for this session only.
  }
  return id;
}

export async function forgetLearner() {
  learnerId = null;
  consent = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

// The learner's exam pack. Loaded once at boot (loadExam) and kept on the device,
// so screens can read it synchronously with getExam().
const EXAM_KEY = "testwise.exam";
let exam: Exam | null = null;
export const getExam = () => exam;
export async function loadExam(): Promise<Exam | null> {
  try {
    exam = await call<Exam>("/api/exam");
    AsyncStorage.setItem(EXAM_KEY, JSON.stringify(exam)).catch(() => {});
  } catch {
    try {
      const saved = await AsyncStorage.getItem(EXAM_KEY);
      if (saved) exam = JSON.parse(saved) as Exam;
    } catch {}
  }
  return exam;
}

// AsyncStorage key remembering that a learner took or declined a section's placement quiz.
// The exam's default section (offered at sign-up) keeps the original unsuffixed key,
// so existing learners aren't asked again. Once learners can switch exams, the key
// needs the exam id too.
export const placementKey = (id: string | null, section?: string) =>
  `testwise.placementDone.${id ?? "anon"}${!section || section === exam?.default_section ? "" : `.${section}`}`;
export const currentLearnerId = () => learnerId;

// Last known consent state, refreshed by every tree load.
let consent: Consent | null = null;
export const getConsent = () => consent;

export function legalUrl(page: "privacy" | "terms") {
  // On web the pages sit next to the app; native builds use the hosted copy.
  return `${Platform.OS === "web" ? base() : "https://testwise.aubrey-9f5.workers.dev"}/${page}.html`;
}

export const api = {
  tree: async () => {
    const t = await call<Tree>("/api/tree");
    if (t.learner) consent = t.learner;
    return t;
  },
  setConsent: async (b: { age_13_plus?: true; ai?: boolean }) => {
    consent = await call<Consent>("/api/consent", { method: "POST", body: b });
    return consent;
  },
  deleteMe: async () => {
    await call<{ ok: boolean }>("/api/learner/delete", { method: "POST", body: {} });
    await forgetLearner();
  },
  startLesson: (skillId: string | null) => call<Lesson>("/api/lessons", { method: "POST", body: { skill_id: skillId } }),
  answer: (b: { lesson_id: string; item_id: string; response: string; time_ms: number }) =>
    call<{ correct: boolean; answer: string; mastery: number; xp: number }>("/api/answers", { method: "POST", body: b }),
  // No section: the Worker uses the exam's default section.
  startPlacement: (section?: string) => call<Lesson>("/api/lessons", { method: "POST", body: { placement: true, section } }),
  finish: (lessonId: string) =>
    call<{ correct: number; total: number; xp: number; stats: Stats; placement?: Placement }>("/api/lessons/finish", { method: "POST", body: { lesson_id: lessonId } }),
  socrates: (b: { item_id: string; response: string; history: TutorTurn[] }) =>
    call<{ reply: string; offline?: boolean; done?: boolean; error?: string; remaining_today?: number }>("/api/socrates", { method: "POST", body: b }),
  profile: () => call<Profile>("/api/profile"),
  saveProfile: (b: { exam_date?: string | null; not_booked?: true; target_score?: number | null; daily_minutes?: number }) =>
    call<Profile>("/api/profile", { method: "POST", body: b }),
  plan: () => call<Plan>("/api/plan"),
  practiceSummary: () => call<PracticeSummary>("/api/practice/summary"),
  practice: (b: { mode: PracticeMode; n?: number; skill_id?: string; skill_ids?: string[]; section?: string }) =>
    call<Lesson>("/api/practice", { method: "POST", body: b }),
  // Starts a plan task with the request the plan gave. Only lesson and practice starts are allowed.
  start: (r: StartRequest) => {
    if (r.method !== "POST" || !/^\/api\/(lessons|practice)$/.test(r.path)) return Promise.reject(new Error("unknown task"));
    return call<Lesson>(r.path, { method: "POST", body: r.body });
  },
  report: (itemId: string, note: string) => call<{ ok: boolean }>("/api/reports", { method: "POST", body: { item_id: itemId, note } }),
};
