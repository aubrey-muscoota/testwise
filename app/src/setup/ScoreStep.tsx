// The target score: the exam pack's choices (score.targets, shown by label
// when there is one) and "Not sure yet". A target saved earlier that isn't
// one of them (from the old stepper, say 1430) stays as a card at the top.
import React, { useState } from "react";
import type { Exam } from "../api";
import { OptionCard, Options } from "./OptionCard";
import { SetupFrame } from "./SetupFrame";
import { buttonOf, frameOf, setupLine, StepProps } from "./shared";

// undefined: nothing picked yet; null: "Not sure yet".
export function ScoreStep({ exam, initial, onSubmit, ...frame }: StepProps<number | null> & { exam: Exam | null; initial: number | null | undefined }) {
  const targets = exam?.score.targets ?? [];
  const known = initial == null || targets.some((t) => t.value === initial);
  const [score, setScore] = useState<number | null | undefined>(initial);
  const list = [...(known ? [] : [{ value: initial as number, label: undefined }]), ...targets];
  return (
    <SetupFrame {...frameOf(frame)} line={setupLine(exam, "score")} button={buttonOf(frame, score !== undefined, () => score !== undefined && onSubmit(score))}>
      <Options label="Target score">
        {list.map((t) => (
          <OptionCard key={t.value} testID={`score-${t.value}`} title={t.label ?? String(t.value)} selected={score === t.value} onPress={() => setScore(t.value)} />
        ))}
        <OptionCard testID="score-none" title="Not sure yet" selected={score === null} onPress={() => setScore(null)} />
      </Options>
    </SetupFrame>
  );
}
