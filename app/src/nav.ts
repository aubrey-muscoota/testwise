// What the lesson screen runs, and the tabs of the main shell.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PracticeMode, StartRequest } from "./api";

export type LessonSource =
  | { kind: "skill"; skillId: string; name: string }
  | { kind: "review" }
  | { kind: "placement"; section: string; name: string }
  // A plan task or a practice mode: the request that starts it.
  | { kind: "task"; start: StartRequest; title: string; why?: string; mode?: PracticeMode };

export type Tab = "today" | "practice" | "path" | "me";

export const MODE_TITLE: Record<PracticeMode, string> = {
  weak: "Weak spots",
  mixed: "Mixed practice",
  skill: "One skill",
  timed: "Timed set",
  mistakes: "My mistakes",
  fresh: "New from Socrates",
};

export function practiceSource(
  body: { mode: PracticeMode; n?: number; skill_id?: string; section?: string },
  title?: string,
  why?: string,
): LessonSource {
  return { kind: "task", start: { method: "POST", path: "/api/practice", body }, title: title ?? MODE_TITLE[body.mode], why, mode: body.mode };
}

// Loads data for a screen, with an error and a retry.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<(Error & { status?: number }) | null>(null);
  const alive = useRef(true);
  const run = useCallback(async () => {
    setError(null);
    try {
      const d = await fn();
      if (alive.current) setData(d);
    } catch (e) {
      if (alive.current) setError(e as Error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    alive.current = true;
    run();
    return () => { alive.current = false; };
  }, [run]);
  return { data, error, reload: run, setData };
}
