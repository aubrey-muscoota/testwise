// The daily goal: minutes on a normal day, from the exam pack's options
// (5, 10, 15 or 20 for the SAT), the pack's default picked to start with.
// Each says what the plan actually gives on a learning day (test/plan.test.mjs
// checks the lesson counts against worker/plan.js).
import React, { useState } from "react";
import type { Exam } from "../api";
import { OptionCard, Options } from "./OptionCard";
import { SetupFrame } from "./SetupFrame";
import { buttonOf, frameOf, setupLine, StepProps } from "./shared";
import { goalDetail } from "./goal-copy";

const FALLBACK_OPTIONS = [5, 10, 15, 20];

export function minutesOptions(exam: Exam | null) {
  const options = exam?.plan.daily_minutes?.length ? exam.plan.daily_minutes : FALLBACK_OPTIONS;
  const dflt = exam?.plan.default_daily_minutes && options.includes(exam.plan.default_daily_minutes) ? exam.plan.default_daily_minutes : options[Math.min(1, options.length - 1)];
  return { options, default: dflt };
}

export function GoalStep({ exam, initial, onSubmit, ...frame }: StepProps<number> & { exam: Exam | null; initial: number | null }) {
  const { options, default: dflt } = minutesOptions(exam);
  const [mins, setMins] = useState<number>(initial != null && options.includes(initial) ? initial : dflt);
  return (
    <SetupFrame {...frameOf(frame)} line={setupLine(exam, "goal")} button={buttonOf(frame, true, () => onSubmit(mins))}>
      <Options label="Minutes a day">
        {options.map((m) => (
          <OptionCard key={m} testID={`goal-${m}`} title={`${m} minutes`} detail={goalDetail(m)} selected={m === mins} onPress={() => setMins(m)} />
        ))}
      </Options>
    </SetupFrame>
  );
}
