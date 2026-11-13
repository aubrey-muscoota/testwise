// What every setup step takes, and Socrates' setup questions.
// The questions come from the exam pack (voice.json "setup"), because they
// can name the test or its audience ("on a normal school day"); these plain
// fallbacks fit any exam.
import type { Exam } from "../api";

export type SetupQuestion = "date" | "goal" | "score" | "start";

const FALLBACK: Record<SetupQuestion, (name: string) => string> = {
  date: (name) => `When's your ${name}?`,
  goal: () => "How much time can you give it on a normal day?",
  score: () => "What score are you aiming for?",
  start: () => "Where do you want to start?",
};

export function setupLine(exam: Exam | null, q: SetupQuestion) {
  return exam?.voice.setup?.[q] || FALLBACK[q](exam?.short_name ?? "test");
}

// The frame a step is shown in: in setup (a progress bar and Continue) or
// on its own from Me (Save, no bar).
export type StepFrame = {
  progress?: number;
  onBack?: () => void;
  backLabel?: string;
  buttonTitle: string;
  // The button's label while saving ("Saving…").
  busyTitle?: string;
  busy?: boolean;
  error?: string | null;
};

export type StepProps<T> = StepFrame & { onSubmit: (value: T) => void };

/** The SetupFrame props a step passes through. */
export const frameOf = (f: StepFrame) => ({ progress: f.progress, onBack: f.onBack, backLabel: f.backLabel, error: f.error });

/** The step's one button: its label, "Saving…" while busy, and disabled until there's an answer. */
export const buttonOf = (f: StepFrame, ready: boolean, onPress: () => void, testID?: string) => ({
  title: f.busy ? f.busyTitle ?? "Saving…" : f.buttonTitle,
  disabled: !ready || !!f.busy,
  onPress,
  testID,
});
