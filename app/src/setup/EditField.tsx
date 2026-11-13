// Changing one setup answer from Me (or the test date from Progress): the
// same step as in setup, with a back arrow and Save instead of the progress
// bar and Continue. Saved with POST /api/profile.
import React, { useState } from "react";
import { api, getExam, Profile, ProfileAnswers } from "../api";
import { DateStep } from "./DateStep";
import { GoalStep } from "./GoalStep";
import { ScoreStep } from "./ScoreStep";

export type Field = "date" | "score" | "minutes";

export function EditField({ field, profile, onDone, onCancel }: {
  field: Field;
  profile: Profile;
  onDone: (p: Profile) => void;
  onCancel: () => void;
}) {
  const exam = getExam();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: ProfileAnswers) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.saveProfile(patch));
    } catch (e) {
      setError((e as { status?: number }).status === 400 ? (e as Error).message : "That didn't save. Check your connection and try again.");
      setBusy(false);
    }
  };
  const frame = { onBack: onCancel, buttonTitle: "Save", busy, error };
  if (field === "date") {
    return <DateStep {...frame} exam={exam} initial={{ exam_date: profile.exam_date, not_booked: profile.not_booked }} onSubmit={save} />;
  }
  if (field === "score") {
    return <ScoreStep {...frame} exam={exam} initial={profile.target_score} onSubmit={(v) => save({ target_score: v })} />;
  }
  return <GoalStep {...frame} exam={exam} initial={profile.daily_minutes} onSubmit={(m) => save({ daily_minutes: m })} />;
}
