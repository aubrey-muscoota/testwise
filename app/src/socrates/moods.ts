// Socrates' moods: the public vocabulary of the rig, and the pose each one
// settles into. A mood is a resting pose plus a little "life" that Socrates.tsx
// plays on top (hops, nods, chin strokes, yawns). Keep this file free of
// animation code so a different renderer (a Rive or Lottie rig, say) can
// reuse the same names and event mapping.

export type SocratesMood =
  | "idle" // default; a question is on screen
  | "happy" // a correct answer
  | "thinking" // Socrates is working out a hint
  | "concerned" // a wrong answer
  | "celebrate" // lesson complete, new skill, streak milestone
  | "listening" // waiting for the learner to type or choose
  | "sleepy"; // streak lost, or the learner has been away

export const MOODS: readonly SocratesMood[] = ["idle", "happy", "thinking", "concerned", "celebrate", "listening", "sleepy"];

// App events, and the mood each one should show.
export const MOOD_FOR = {
  questionShown: "idle",
  correct: "happy",
  wrong: "concerned",
  hint: "thinking",
  lessonComplete: "celebrate",
  waiting: "listening",
  streakLost: "sleepy",
} as const satisfies Record<string, SocratesMood>;

// Where he looks. Points are in -1..1 (x right, y down) relative to looking
// straight out of the screen.
export type LookAt = { x: number; y: number } | "user" | "bubble" | "down";

export function lookTarget(l: LookAt | undefined): { x: number; y: number } | null {
  if (l == null) return null;
  if (l === "user") return { x: 0, y: 0 };
  // Speech bubbles sit to his right (our right) and a little above.
  if (l === "bubble") return { x: 0.85, y: -0.25 };
  if (l === "down") return { x: 0.1, y: 0.85 };
  return { x: clamp(l.x), y: clamp(l.y) };
}

const clamp = (n: number) => Math.max(-1, Math.min(1, n || 0));

export type MouthShape = "smile" | "grin" | "flat" | "frown" | "o";

// A resting pose. Angles in degrees, distances in canvas units (the 1024 box),
// except `slump`, which is a fraction of the rendered size.
export type Pose = {
  head: number; // tilt; + leans toward our right
  headY: number; // + drops the head
  browL: [y: number, rot: number]; // brow on our left: - y raises, - rot lifts its inner end
  browR: [y: number, rot: number]; // brow on our right: + rot lifts its inner end
  lid: number; // 0 open .. 1 shut
  squint: [l: number, r: number]; // extra lid per eye
  arm: number; // forearm angle at the elbow; + toward the face, - out and up
  back: number; // far arm at the shoulder; 0 hangs, -140 raised
  palm: number; // 0 thumb at the beard (as in the art), 1 open palm
  mouth: MouthShape;
  gaze: { x: number; y: number }; // where the eyes rest when lookAt is not set
  slump: number;
  breath: number; // seconds per breath
};

const base: Pose = {
  head: 0,
  headY: 0,
  browL: [0, 0],
  browR: [0, 0],
  lid: 0,
  squint: [0, 0],
  arm: 0,
  back: 0,
  palm: 0,
  mouth: "smile",
  gaze: { x: 0, y: 0 },
  slump: 0,
  breath: 4,
};

export const POSES: Record<SocratesMood, Pose> = {
  idle: base,
  happy: { ...base, head: 3, headY: -4, browL: [-16, 4], browR: [-16, -4], lid: 0.08, arm: -7, mouth: "grin", breath: 3.4 },
  thinking: {
    ...base, head: -6, headY: 2, browL: [6, 6], browR: [-22, -6], lid: 0.1, squint: [0.14, 0], arm: 8, mouth: "flat",
    gaze: { x: 0.6, y: -0.75 }, breath: 4.4,
  },
  concerned: {
    ...base, head: 3, headY: 10, browL: [-4, -13], browR: [-4, 13], lid: 0.2, arm: 4, mouth: "frown",
    gaze: { x: -0.1, y: 0.4 }, slump: 0.025, breath: 4.6,
  },
  celebrate: { ...base, head: -3, headY: -6, browL: [-20, 4], browR: [-20, -4], lid: 0.06, arm: -16, back: -140, mouth: "grin", gaze: { x: 0, y: -0.2 }, breath: 3 },
  listening: { ...base, head: 6, headY: 0, browL: [-9, 0], browR: [-11, 0], arm: -10, palm: 1, mouth: "smile", breath: 4 },
  sleepy: { ...base, head: 4, headY: 12, browL: [8, -3], browR: [8, 3], lid: 0.56, arm: 3, mouth: "flat", gaze: { x: 0, y: 0.45 }, slump: 0.02, breath: 6 },
};
