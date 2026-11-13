// The last setup question: start from the basics (the first lesson on the
// path, straight away) or find my level (a short placement quiz over every
// section, then the first lesson the path still has). Either way the next
// screen is a question, not the Learn tab.
import React, { useState } from "react";
import type { Exam } from "../api";
import { OptionCard, Options } from "./OptionCard";
import { SetupFrame } from "./SetupFrame";
import { frameOf, setupLine, StepFrame } from "./shared";

export type Start = "basics" | "level";

/** The placement quiz's size, as the Worker picks it (engine.js placementPerDomain). */
export function placementSize(exam: Exam | null) {
  const domains = (exam?.sections ?? []).reduce((n, s) => n + s.domains.length, 0);
  const pl = exam?.placement;
  const per = pl?.per_domain ?? 3;
  const perDomain = pl?.max_questions && domains ? Math.min(per, Math.max(1, Math.floor(pl.max_questions / domains))) : per;
  const questions = domains * perDomain;
  const minutes = Math.max(1, Math.round((questions * (pl?.seconds_per_question ?? 25)) / 60));
  return { questions, minutes };
}

function levelDetail(exam: Exam | null) {
  const { questions, minutes } = placementSize(exam);
  const n = exam?.sections.length ?? 0;
  const where = n === 2 ? " from both sections" : n > 2 ? ` from all ${n} sections` : "";
  return `${questions} questions${where}, about ${minutes} minutes. I'll skip what you know`;
}

export function StartStep({ exam, onStart, ...frame }: StepFrame & { exam: Exam | null; onStart: (s: Start) => void }) {
  const [pick, setPick] = useState<Start | null>(null);
  const title = frame.busy ? frame.busyTitle ?? "Getting your lesson…" : pick === "level" ? "Start the quiz" : pick === "basics" ? "Start lesson" : frame.buttonTitle;
  return (
    <SetupFrame
      {...frameOf(frame)}
      line={setupLine(exam, "start")}
      button={{ title, disabled: !pick || !!frame.busy, onPress: () => pick && onStart(pick), testID: "start-go" }}
    >
      <Options label="Where to start">
        <OptionCard testID="start-basics" title="Start from the basics" detail="Begin with the first lesson on your path" selected={pick === "basics"} onPress={() => setPick("basics")} />
        <OptionCard testID="start-level" title="Find my level" detail={levelDetail(exam)} selected={pick === "level"} onPress={() => setPick("level")} />
      </Options>
    </SetupFrame>
  );
}
