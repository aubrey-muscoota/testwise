// Setup review page, web only, for the screenshot checks and for review:
//   ?lab=setup&step=<s>
// s = picker, welcome, date, calendar (an exam with no official dates), goal,
// score, age, start, or edit-date, edit-goal, edit-score (the Me screens).
// Fixtures: app/src/lab/setup.json (scripts/setup-lab-fixtures.mjs). The steps
// are the app's own; nothing is saved.
import React, { useMemo } from "react";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from "@expo-google-fonts/nunito";
import { StyleSheet, View } from "react-native";
import { Exam, ExamListing, Profile, primeExamForLab } from "../api";
import fixtures from "../lab/setup.json";
import { DateStep } from "../setup/DateStep";
import { GoalStep } from "../setup/GoalStep";
import { ScoreStep } from "../setup/ScoreStep";
import { StartStep } from "../setup/StartStep";
import { TestPicker } from "../setup/TestPicker";
import { EditField } from "../setup/EditField";
import { color } from "../theme";
import { AgeGate } from "./AgeGate";
import { Welcome } from "./Welcome";

const DATA = fixtures as unknown as { exam: Exam; exams: ExamListing[] };
const NONE = () => {};
const PROFILE: Profile = {
  onboarded: true, exam_date: "2027-03-06", not_booked: false, assumed_exam_date: null,
  target_score: 1430, daily_minutes: 10, plan_started_at: "2026-11-01",
};

function param(k: string) {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
}

export function SetupLab() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
  });
  const step = param("step") ?? "picker";
  const exam = useMemo(() => {
    const e = step === "calendar" ? { ...DATA.exam, test_dates: undefined } : DATA.exam;
    primeExamForLab(e);
    return e;
  }, [step]);
  if (!fontsLoaded) return <View style={s.root} />;
  const frame = { buttonTitle: "Continue", onBack: NONE };
  const progress = (k: number) => k / 5;
  let body: React.ReactNode;
  switch (step) {
    case "welcome": body = <Welcome onStart={NONE} onBack={NONE} />; break;
    case "date":
    case "calendar": body = <DateStep {...frame} progress={progress(1)} exam={exam} initial={null} onSubmit={NONE} />; break;
    case "goal": body = <GoalStep {...frame} progress={progress(2)} exam={exam} initial={null} onSubmit={NONE} />; break;
    case "score": body = <ScoreStep {...frame} progress={progress(3)} exam={exam} initial={undefined} onSubmit={NONE} />; break;
    case "age": body = <AgeGate progress={progress(4)} onBack={NONE} onAnswer={NONE} />; break;
    case "start": body = <StartStep {...frame} onBack={undefined} progress={progress(5)} exam={exam} onStart={NONE} />; break;
    case "edit-date": body = <EditField field="date" profile={PROFILE} onDone={NONE} onCancel={NONE} />; break;
    case "edit-goal": body = <EditField field="minutes" profile={PROFILE} onDone={NONE} onCancel={NONE} />; break;
    case "edit-score": body = <EditField field="score" profile={PROFILE} onDone={NONE} onCancel={NONE} />; break;
    default: body = <TestPicker exams={DATA.exams} onPick={async () => {}} />;
  }
  return <View style={s.root} testID="lab-ready">{body}</View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, minHeight: "100%" as unknown as number },
});
