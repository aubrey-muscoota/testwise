import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
} from "@expo-google-fonts/nunito";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, createLearner, forgetLearner, LearnPath, loadExam, loadLearner, PathNode, placementKey, placementKeys, Profile, refreshPathSummary } from "./src/api";
import { Learn } from "./src/screens/Learn";
import { Progress } from "./src/screens/Progress";
import { Practice } from "./src/screens/Practice";
import { Me } from "./src/screens/Me";
import { EditField, Field } from "./src/setup/EditField";
import { profileOf, Setup, SetupStep } from "./src/setup/Setup";
import { Lesson, LessonResult } from "./src/screens/Lesson";
import { Complete } from "./src/screens/Complete";
import { AgeGate, TooYoung } from "./src/screens/AgeGate";
import { SocratesLab } from "./src/screens/SocratesLab";
import { RendererLab } from "./src/screens/RendererLab";
import { PathLab } from "./src/screens/PathLab";
import { SetupLab } from "./src/screens/SetupLab";
import { Shell } from "./src/components/Shell";
import { useReducedMotion } from "./src/components/ui";
import { Socrates } from "./src/socrates/Socrates";
import { initFeedback, preloadSounds } from "./src/motion/feedback";
import { LessonSource, nodeSource, Tab } from "./src/nav";
import { color } from "./src/theme";

type Screen =
  | { name: "boot" }
  // Setup (src/setup/Setup.tsx): every step on a fresh install, fewer for a returning learner.
  | { name: "setup"; steps: SetupStep[] }
  // Learners from before the age question answer it once.
  | { name: "age" }
  | { name: "tooYoung" }
  | { name: "main"; tab: Tab; key: number }
  | { name: "edit"; field: Field; profile: Profile; back: Tab }
  | { name: "lesson"; source: LessonSource; back: Tab }
  // Continue goes back to the tab the lesson started from (Learn after setup).
  | { name: "complete"; result: LessonResult; back: Tab };

const FRESH: SetupStep[] = ["picker", "welcome", "date", "goal", "score", "age", "start"];

// Review pages, web only: ?lab=socrates (the rig), ?lab=renderers (every item
// type), ?lab=path (the Learn path from fixtures) and ?lab=setup (each setup step).
const LAB = Platform.OS === "web" && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lab") : null;

export default function App() {
  if (LAB === "socrates") return <SocratesLab />;
  if (LAB === "renderers") return <RendererLab />;
  if (LAB === "path") return <PathLab />;
  if (LAB === "setup") return <SetupLab />;
  return <TestwiseApp />;
}

function TestwiseApp() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
  });
  const [screen, setScreen] = useState<Screen>({ name: "boot" });

  // Sounds and haptics: restore the mute setting and warm up the players once.
  useEffect(() => {
    initFeedback();
    preloadSounds();
  }, []);

  // Learn loads the path itself; any other tab refreshes the top bar's numbers,
  // which a saved test date, a lesson or a quit may have changed.
  const home = useCallback((tab: Tab = "learn") => {
    if (tab !== "learn") refreshPathSummary();
    setScreen({ name: "main", tab, key: Math.random() });
  }, []);

  // Where a returning learner lands: the setup questions they haven't
  // answered (test date, goal, score once; where to start if they never
  // chose and have no XP), else Learn.
  const resume = useCallback(async (id: string) => {
    let needsStart = false;
    if (!(await placementSettled(id))) {
      try {
        const t = await api.tree();
        if (t.stats.xp === 0) needsStart = true;
        // Answered something already (a quiz left halfway): the start is behind them.
        else await settleAllPlacement();
      } catch {}
    }
    try {
      const p = await api.profile();
      if (!p.onboarded) return setScreen({ name: "setup", steps: ["date", "goal", "score", ...(needsStart ? ["start" as const] : [])] });
    } catch {}
    if (needsStart) return setScreen({ name: "setup", steps: ["start"] });
    home();
  }, [home]);

  useEffect(() => {
    (async () => {
      if (await ageBlocked()) return setScreen({ name: "tooYoung" });
      const id = await loadLearner();
      // A fresh install starts at the test picker, which loads the list itself.
      if (!id) return setScreen({ name: "setup", steps: FRESH });
      // Exam name, sections and disclaimer come from the learner's exam pack (GET /api/exam).
      await loadExam();
      try {
        const t = await api.tree();
        if (t.learner && !t.learner.age_confirmed) return setScreen({ name: "age" });
      } catch {}
      await resume(id);
    })();
  }, [resume]);

  // A learner from before the age question.
  const answerOldAge = useCallback(async (ok: boolean) => {
    if (!ok) {
      await blockAge();
      await api.deleteMe().catch(() => forgetLearner());
      return setScreen({ name: "tooYoung" });
    }
    await api.setConsent({ age_13_plus: true }).catch(() => {});
    const id = await loadLearner();
    return id ? resume(id) : setScreen({ name: "setup", steps: FRESH });
  }, [resume]);

  const reset = useCallback(() => {
    forgetLearner().then(() => setScreen({ name: "setup", steps: FRESH }));
  }, []);
  const startFrom = (back: Tab) => (source: LessonSource) => setScreen({ name: "lesson", source, back });

  // "Where to start": the first lesson on the path, or the placement quiz over
  // every section. Either way a question is next, not the Learn tab.
  const startFirst = useCallback(async (choice: "basics" | "level") => {
    if (choice === "level") {
      setScreen({ name: "lesson", source: { kind: "placement", all: true, name: "" }, back: "learn" });
      return;
    }
    await settleAllPlacement();
    const p: LearnPath = await api.path();
    const n = [...p.units.flatMap((u) => u.nodes), p.end as PathNode].find((x) => x.id === p.current);
    const src = n ? nodeSource(n) : null;
    if (src) setScreen({ name: "lesson", source: src, back: "learn" });
    else home();
  }, [home]);

  let body: React.ReactNode;
  const booting = !fontsLoaded || screen.name === "boot";
  // Changes whenever the visible screen changes, so the transition replays.
  const inShell = screen.name === "main" || screen.name === "edit";
  const screenId = booting ? "boot" : inShell ? "shell" : screen.name;
  if (booting) {
    body = (
      <View style={s.center} accessibilityLabel="Loading" aria-busy>
        <Socrates size={96} mood="thinking" />
      </View>
    );
  } else if (screen.name === "setup") {
    body = (
      <Setup
        steps={screen.steps}
        remember={screen.steps[0] === "picker"}
        onPickExam={async (examId) => {
          const e = await loadExam(examId);
          if (e?.id !== examId) throw new Error("exam not loaded");
        }}
        onAge={async (ok, answers) => {
          if (!ok) {
            await blockAge();
            setScreen({ name: "tooYoung" });
            return;
          }
          currentLearner = await createLearner({ ...(answers.examId ? { exam_id: answers.examId } : {}), profile: profileOf(answers) });
        }}
        onSaveProfile={async (answers) => { await api.saveProfile(profileOf(answers)); }}
        onStart={startFirst}
        onDone={() => home()}
      />
    );
  } else if (screen.name === "age") {
    body = <AgeGate onAnswer={answerOldAge} />;
  } else if (screen.name === "tooYoung") {
    body = <TooYoung />;
  } else if (screen.name === "main" || screen.name === "edit") {
    const tab: Tab = screen.name === "main" ? screen.tab : screen.back;
    let inner: React.ReactNode;
    if (screen.name === "edit") {
      const back = screen.back;
      inner = <EditField field={screen.field} profile={screen.profile} onDone={() => home(back)} onCancel={() => home(back)} />;
    } else if (tab === "learn") {
      inner = (
        <Learn
          key={screen.key}
          onStart={startFrom("learn")}
          onUnauthorized={reset}
        />
      );
    } else if (tab === "practice") {
      inner = <Practice key={screen.key} onStart={startFrom("practice")} />;
    } else if (tab === "progress") {
      inner = <Progress key={screen.key} onEditDate={() => editField("date", "progress")} />;
    } else {
      inner = <Me key={screen.key} onEdit={(field, profile) => setScreen({ name: "edit", field, profile, back: "me" })} onDeleted={reset} />;
    }
    const innerId = screen.name === "main" ? `${screen.tab}-${screen.key}` : `edit-${screen.field}`;
    body = (
      <Shell tab={tab} onTab={(t) => home(t)} onEditDate={() => editField("date", tab)}>
        <ScreenTransition key={innerId}>{inner}</ScreenTransition>
      </Shell>
    );
  } else if (screen.name === "lesson") {
    const { source, back } = screen;
    body = (
      <Lesson
        source={source}
        onQuit={() => {
          // Quitting the quiz from setup means starting from the basics.
          if (source.kind === "placement" && source.all) settleAllPlacement();
          home(back);
        }}
        onDone={(result) => {
          if (result.placement) settleAllPlacement();
          setScreen({ name: "complete", result, back });
        }}
      />
    );
  } else {
    const back = screen.back;
    body = <Complete result={screen.result} onContinue={() => home(back)} onStart={startFrom(back)} />;
  }

  function editField(field: Field, back: Tab) {
    api.profile().then((p) => setScreen({ name: "edit", field, profile: p, back }), () => {});
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />
      <ScreenTransition key={screenId}>{body}</ScreenTransition>
    </SafeAreaView>
  );
}

// Remembers (per learner and section) that placement was taken or declined.
// The exam's default section keeps the original key so existing learners aren't asked again.
let currentLearner: string | null = null;

async function placementSettled(id: string) {
  currentLearner = id;
  try {
    return (await AsyncStorage.getItem(placementKey(id))) === "1";
  } catch {
    return false;
  }
}
// Setup's choice covers every section, so no section offers placement again.
async function settleAllPlacement() {
  try {
    const id = currentLearner ?? (await loadLearner());
    await AsyncStorage.multiSet(placementKeys(id).map((k) => [k, "1"]));
  } catch {}
}

// After an under-13 answer, the age question stays closed on this device for a day,
// so it can't simply be retried with a different year.
const AGE_BLOCK_KEY = "testwise.ageBlockedAt";
async function ageBlocked() {
  try {
    const t = Number(await AsyncStorage.getItem(AGE_BLOCK_KEY));
    return t > 0 && Date.now() - t < 24 * 3600 * 1000;
  } catch {
    return false;
  }
}
async function blockAge() {
  try {
    await AsyncStorage.setItem(AGE_BLOCK_KEY, String(Date.now()));
  } catch {}
}

// Each screen fades in while rising 12px (a plain fade under reduced motion).
function ScreenTransition({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [v]);
  return (
    <Animated.View style={[s.screen, { opacity: v, transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, ...(Platform.OS === "web" ? { minHeight: "100%" as unknown as number } : {}) },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
