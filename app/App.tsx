import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
} from "@expo-google-fonts/nunito";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, createLearner, forgetLearner, getExam, loadExam, loadLearner, placementKey, Profile } from "./src/api";
import { Welcome } from "./src/screens/Welcome";
import { Today } from "./src/screens/Today";
import { PlanScreen } from "./src/screens/PlanScreen";
import { Practice } from "./src/screens/Practice";
import { PathScreen } from "./src/screens/Path";
import { Me } from "./src/screens/Me";
import { Field, Onboarding } from "./src/screens/Onboarding";
import { Lesson, LessonResult } from "./src/screens/Lesson";
import { Complete } from "./src/screens/Complete";
import { PlacementIntro } from "./src/screens/PlacementIntro";
import { AgeGate, TooYoung } from "./src/screens/AgeGate";
import { SocratesLab } from "./src/screens/SocratesLab";
import { RendererLab } from "./src/screens/RendererLab";
import { Shell } from "./src/components/Shell";
import { useReducedMotion } from "./src/components/ui";
import { Socrates } from "./src/socrates/Socrates";
import { initFeedback, preloadSounds } from "./src/motion/feedback";
import { LessonSource, Tab } from "./src/nav";
import { color } from "./src/theme";

type Screen =
  | { name: "boot" }
  | { name: "welcome" }
  | { name: "age"; existing: boolean }
  | { name: "tooYoung" }
  | { name: "onboarding"; then: "placement" | "home" }
  | { name: "placement" }
  | { name: "main"; tab: Tab; key: number }
  | { name: "plan" }
  | { name: "edit"; field: Field; profile: Profile }
  | { name: "lesson"; source: LessonSource; back: Tab | "placement" }
  | { name: "complete"; result: LessonResult };

// Review pages, web only: ?lab=socrates (the rig) and ?lab=renderers (every item type).
const LAB = Platform.OS === "web" && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("lab") : null;

export default function App() {
  if (LAB === "socrates") return <SocratesLab />;
  if (LAB === "renderers") return <RendererLab />;
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

  const home = useCallback((tab: Tab = "today") => setScreen({ name: "main", tab, key: Math.random() }), []);

  // Where a returning learner lands: the test-date questions once, then the
  // placement offer if they never chose, else Today.
  const resume = useCallback(async (id: string) => {
    let needsPlacement = false;
    if (!(await placementSettled(id))) {
      try {
        const t = await api.tree();
        if (t.stats.xp === 0) needsPlacement = true;
        else await settlePlacement();
      } catch {}
    }
    try {
      const p = await api.profile();
      if (!p.onboarded) return setScreen({ name: "onboarding", then: needsPlacement ? "placement" : "home" });
    } catch {}
    if (needsPlacement) return setScreen({ name: "placement" });
    home();
  }, [home]);

  useEffect(() => {
    (async () => {
      if (await ageBlocked()) return setScreen({ name: "tooYoung" });
      const id = await loadLearner();
      // Exam name, sections and disclaimer come from the exam pack (GET /api/exam).
      await loadExam();
      if (!id) return setScreen({ name: "welcome" });
      // Learners from before the age question answer it once.
      try {
        const t = await api.tree();
        if (t.learner && !t.learner.age_confirmed) return setScreen({ name: "age", existing: true });
      } catch {}
      await resume(id);
    })();
  }, [resume]);

  const answerAge = useCallback(async (existing: boolean, ok: boolean) => {
    if (!ok) {
      await blockAge();
      if (existing) await api.deleteMe().catch(() => forgetLearner());
      return setScreen({ name: "tooYoung" });
    }
    if (existing) {
      await api.setConsent({ age_13_plus: true }).catch(() => {});
      const id = await loadLearner();
      return id ? resume(id) : setScreen({ name: "welcome" });
    }
    currentLearner = await createLearner();
    setScreen({ name: "onboarding", then: "placement" });
  }, [resume]);

  const skipPlacement = useCallback(() => { settlePlacement(); home(); }, [home]);
  const reset = useCallback(() => {
    forgetLearner().then(() => setScreen({ name: "welcome" }));
  }, []);
  const startFrom = (back: Tab | "placement") => (source: LessonSource) => setScreen({ name: "lesson", source, back });

  let body: React.ReactNode;
  const booting = !fontsLoaded || screen.name === "boot";
  // Changes whenever the visible screen changes, so the transition replays.
  const inShell = screen.name === "main" || screen.name === "plan" || screen.name === "edit";
  const screenId = booting ? "boot" : inShell ? "shell" : screen.name;
  if (booting) {
    body = (
      <View style={s.center} accessibilityLabel="Loading" aria-busy>
        <Socrates size={96} mood="thinking" />
      </View>
    );
  } else if (screen.name === "welcome") {
    body = <Welcome onStart={async () => setScreen({ name: "age", existing: false })} />;
  } else if (screen.name === "age") {
    const existing = screen.existing;
    body = <AgeGate onAnswer={(ok) => answerAge(existing, ok)} />;
  } else if (screen.name === "tooYoung") {
    body = <TooYoung />;
  } else if (screen.name === "onboarding") {
    const then = screen.then;
    body = <Onboarding onDone={() => (then === "placement" ? setScreen({ name: "placement" }) : home())} />;
  } else if (screen.name === "placement") {
    const exam = getExam();
    const section = exam?.default_section ?? "";
    const name = exam?.sections.find((x) => x.id === section)?.name ?? "";
    body = <PlacementIntro onQuiz={() => setScreen({ name: "lesson", source: { kind: "placement", section, name }, back: "placement" })} onSkip={skipPlacement} />;
  } else if (screen.name === "main" || screen.name === "plan" || screen.name === "edit") {
    const tab: Tab = screen.name === "main" ? screen.tab : screen.name === "plan" ? "today" : "me";
    let inner: React.ReactNode;
    if (screen.name === "plan") inner = <PlanScreen onBack={() => home("today")} />;
    else if (screen.name === "edit") {
      inner = <Onboarding only={screen.field} initial={screen.profile} onDone={() => home("me")} onCancel={() => home("me")} />;
    } else if (tab === "today") {
      inner = <Today key={screen.key} onStart={startFrom("today")} onOpenPlan={() => setScreen({ name: "plan" })} onEditDate={() => editField("date")} onUnauthorized={reset} />;
    } else if (tab === "practice") {
      inner = <Practice key={screen.key} onStart={startFrom("practice")} />;
    } else if (tab === "path") {
      inner = (
        <PathScreen
          key={screen.key}
          onStart={startFrom("path")}
          onStartPlacement={(section, name) => setScreen({ name: "lesson", source: { kind: "placement", section, name }, back: "path" })}
        />
      );
    } else {
      inner = <Me key={screen.key} onEdit={(field, profile) => setScreen({ name: "edit", field, profile })} onDeleted={reset} />;
    }
    const innerId = screen.name === "main" ? `${screen.tab}-${screen.key}` : screen.name === "edit" ? `edit-${screen.field}` : "plan";
    body = (
      <Shell tab={tab} onTab={(t) => home(t)}>
        <ScreenTransition key={innerId}>{inner}</ScreenTransition>
      </Shell>
    );
  } else if (screen.name === "lesson") {
    const { source, back } = screen;
    body = (
      <Lesson
        source={source}
        onQuit={() => (back === "placement" ? setScreen({ name: "placement" }) : home(back))}
        onDone={(result) => {
          if (result.placement && source.kind === "placement") settlePlacement(source.section);
          setScreen({ name: "complete", result });
        }}
      />
    );
  } else {
    body = <Complete result={screen.result} onContinue={() => home("today")} onStart={startFrom("today")} />;
  }

  function editField(field: Field) {
    api.profile().then((p) => setScreen({ name: "edit", field, profile: p }), () => {});
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />
      <ScreenTransition key={screenId}>{body}</ScreenTransition>
    </SafeAreaView>
  );
}

// Remembers (per learner and section) that the placement offer was taken or declined.
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
async function settlePlacement(section?: string) {
  try {
    const id = currentLearner ?? (await loadLearner());
    await AsyncStorage.setItem(placementKey(id, section), "1");
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
