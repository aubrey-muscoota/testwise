// Sound and haptics for answer feedback. Both fail silently: a missing
// speaker or vibration motor never blocks a lesson.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const SOURCES = {
  correct: require("../../assets/sounds/correct.wav"),
  wrong: require("../../assets/sounds/wrong.wav"),
  tap: require("../../assets/sounds/tap.wav"),
  complete: require("../../assets/sounds/complete.wav"),
  combo: require("../../assets/sounds/combo.wav"),
  unlock: require("../../assets/sounds/unlock.wav"),
} as const;

export type SoundName = keyof typeof SOURCES;

const VOLUME: Record<SoundName, number> = { correct: 0.7, wrong: 0.6, tap: 0.35, complete: 0.7, combo: 0.5, unlock: 0.6 };
const MUTE_KEY = "testwise.muted";

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let muted = false;
let ready = false;
const listeners = new Set<(m: boolean) => void>();

export async function initFeedback() {
  if (ready) return;
  ready = true;
  try {
    muted = (await AsyncStorage.getItem(MUTE_KEY)) === "1";
    listeners.forEach((l) => l(muted));
  } catch {}
  try {
    await setAudioModeAsync({ playsInSilentMode: false });
  } catch {}
}

function player(name: SoundName) {
  if (!players[name]) {
    const p = createAudioPlayer(SOURCES[name]);
    p.volume = VOLUME[name];
    players[name] = p;
  }
  return players[name]!;
}

// Load the players up front so the first "correct" isn't late.
export function preloadSounds() {
  try {
    (Object.keys(SOURCES) as SoundName[]).forEach(player);
  } catch {}
}

export function play(name: SoundName) {
  if (muted) return;
  try {
    const p = player(name);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {}
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  listeners.forEach((l) => l(m));
  AsyncStorage.setItem(MUTE_KEY, m ? "1" : "0").catch(() => {});
}

export function onMutedChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const native = Platform.OS === "ios" || Platform.OS === "android";

export const buzz = {
  tap: () => native && Haptics.selectionAsync().catch(() => {}),
  press: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => native && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  heavy: () => native && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
};

// One call per moment, so screens stay simple.
export const feedback = {
  correct: () => { play("correct"); buzz.success(); },
  wrong: () => { play("wrong"); buzz.error(); },
  combo: () => { play("combo"); buzz.heavy(); },
  complete: () => { play("complete"); buzz.success(); },
  unlock: () => { play("unlock"); buzz.success(); },
  select: () => { play("tap"); buzz.tap(); },
};
