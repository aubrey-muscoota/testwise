// Setup in under a minute: the test picker, Welcome, then one question a
// screen (test date, daily goal, target score, birthday, where to start),
// each asked by Socrates, with a back arrow and the progress bar. Answers are
// held here until the birthday is answered, so nothing is stored about
// someone who turns out to be under 13. Back keeps every answer.
//
// A fresh install walks every step. A returning learner without a profile
// gets the date, goal and score (saved with POST /api/profile), and the start
// question if they never chose; App decides which steps to show.
import React, { useEffect, useState } from "react";
import { api, getExam, ProfileAnswers } from "../api";
import { AgeGate } from "../screens/AgeGate";
import { Welcome } from "../screens/Welcome";
import { DateStep } from "./DateStep";
import { GoalStep } from "./GoalStep";
import { ScoreStep } from "./ScoreStep";
import { Start, StartStep } from "./StartStep";
import { TestPicker } from "./TestPicker";

export type SetupStep = "picker" | "welcome" | "date" | "goal" | "score" | "age" | "start";
// The steps the progress bar counts.
const COUNTED: SetupStep[] = ["date", "goal", "score", "age", "start"];

export type SetupAnswers = {
  examId: string | null;
  date: { exam_date: string | null; not_booked: boolean } | null;
  minutes: number | null;
  // undefined: not answered; null: "Not sure yet".
  score: number | null | undefined;
};

/** The profile the answers make, for POST /api/learners or /api/profile. */
export function profileOf(a: SetupAnswers): ProfileAnswers {
  return {
    ...(a.date?.exam_date ? { exam_date: a.date.exam_date } : { not_booked: true as const }),
    ...(a.minutes != null ? { daily_minutes: a.minutes } : {}),
    target_score: a.score ?? null,
  };
}

export function Setup({ steps, onPickExam, onAge, onSaveProfile, onStart }: {
  steps: SetupStep[];
  // Loads the picked exam's pack (getExam() then returns it).
  onPickExam: (examId: string) => Promise<void>;
  // The birthday's answer, with everything before it. Resolves once the learner is made.
  onAge: (age13Plus: boolean, answers: SetupAnswers) => Promise<void>;
  // A returning learner's answers, saved after the score when there's no birthday step.
  onSaveProfile: (answers: SetupAnswers) => Promise<void>;
  // Resolves once the first lesson or the quiz is on its way.
  onStart: (choice: Start) => Promise<void>;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<SetupAnswers>({ examId: null, date: null, minutes: null, score: undefined });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = steps[i];
  const exam = getExam();
  const counted = steps.filter((x) => COUNTED.includes(x));
  const k = counted.indexOf(step);
  const progress = k >= 0 ? (k + 1) / counted.length : undefined;
  const back = i > 0 ? () => { setError(null); setI(i - 1); } : undefined;
  const next = () => { setError(null); setI((n) => Math.min(n + 1, steps.length - 1)); };

  // The path is ready by the time "Where to start" is answered.
  useEffect(() => {
    if (step === "start") api.path().catch(() => {});
  }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = (e as { status?: number; message?: string }).status === 400 ? (e as Error).message : null;
      setError(msg ?? "That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  // The last answer before the birthday (or before "start" when there's no birthday).
  const lastProfileStep = steps.includes("age") ? null : (["score", "goal", "date"] as SetupStep[]).find((x) => steps.includes(x));
  const answered = (patch: Partial<SetupAnswers>) => {
    const a = { ...answers, ...patch };
    setAnswers(a);
    if (step === lastProfileStep) {
      run(async () => {
        await onSaveProfile(a);
        if (i < steps.length - 1) next();
      });
    } else next();
  };
  const frame = { progress, onBack: back, buttonTitle: "Continue", busy, error };

  switch (step) {
    case "picker":
      return <TestPicker initial={answers.examId} onPick={async (id) => { await onPickExam(id); setAnswers((a) => ({ ...a, examId: id })); next(); }} />;
    case "welcome":
      return <Welcome onStart={next} onBack={back} />;
    case "date":
      return (
        <DateStep
          key={answers.examId ?? "date"}
          {...frame}
          exam={exam}
          initial={answers.date}
          onSubmit={(v) => answered({ date: { exam_date: v.exam_date ?? null, not_booked: !!v.not_booked } })}
        />
      );
    case "goal":
      return <GoalStep {...frame} exam={exam} initial={answers.minutes} onSubmit={(m) => answered({ minutes: m })} />;
    case "score":
      return <ScoreStep {...frame} exam={exam} initial={answers.score} onSubmit={(v) => answered({ score: v })} />;
    case "age":
      return (
        <AgeGate
          progress={progress}
          onBack={back}
          busy={busy}
          error={error}
          onAnswer={(ok) => run(async () => { await onAge(ok, answers); if (ok) next(); })}
        />
      );
    case "start":
      return <StartStep {...frame} onBack={steps[i - 1] === "age" ? undefined : back} buttonTitle="Continue" busyTitle="Getting it ready…" exam={exam} onStart={(c) => run(() => onStart(c))} />;
    default:
      return null;
  }
}
