import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type Item = {
  id: string;
  skill_id: string;
  difficulty: number;
  type: "mc" | "spr";
  stem: string;
  table: { headers: string[]; rows: string[][] } | null;
  choices: string[] | null;
  answer: string;
  accept: string[];
  explanation: string[];
  hints: string[];
  wrong_reasons: Record<string, string>;
  review: boolean;
};

export type Skill = {
  id: string;
  name: string;
  prereqs: string[];
  items: number;
  attempts: number;
  mastery: number;
  mastered: boolean;
  tested_out?: boolean;
  unlocked: boolean;
};

export type Domain = { id: string; name: string; skills: Skill[] };

export type Stats = { xp: number; streak: number; lessons_today: number; xp_today: number; reviews_due: number };

export type Consent = { age_confirmed: boolean; ai_consent: boolean };

export type Tree = { exam: { id: string; name: string }; domains: Domain[]; stats: Stats; learner?: Consent };

export type Lesson = { lesson_id: string; skill_id: string | null; placement?: boolean; items: Item[] };

export type Placement = { tested_out: { id: string; name: string }[]; next: { id: string; name: string }[]; total_skills: number };

export type TutorTurn = { role: "student" | "socrates"; content: string };

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
  startPlacement: () => call<Lesson>("/api/lessons", { method: "POST", body: { placement: true } }),
  finish: (lessonId: string) =>
    call<{ correct: number; total: number; xp: number; stats: Stats; placement?: Placement }>("/api/lessons/finish", { method: "POST", body: { lesson_id: lessonId } }),
  socrates: (b: { item_id: string; response: string; history: TutorTurn[] }) =>
    call<{ reply: string; offline?: boolean; done?: boolean; error?: string; remaining_today?: number }>("/api/socrates", { method: "POST", body: b }),
  report: (itemId: string, note: string) => call<{ ok: boolean }>("/api/reports", { method: "POST", body: { item_id: itemId, note } }),
};
