import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, createLearner, forgetLearner, getExam, loadExam, loadLearner, placementKey, Skill } from "./src/api";
import { Welcome } from "./src/screens/Welcome";
import { Home } from "./src/screens/Home";
import { Lesson, LessonResult } from "./src/screens/Lesson";
import { Complete } from "./src/screens/Complete";
import { PlacementIntro } from "./src/screens/PlacementIntro";
import { AgeGate, TooYoung } from "./src/screens/AgeGate";
import { initFeedback, preloadSounds } from "./src/motion/feedback";
import { color } from "./src/theme";

type Screen =
  | { name: "boot" }
  | { name: "welcome" }
  | { name: "age"; existing: boolean }
  | { name: "tooYoung" }
  | { name: "home"; key: number }
  | { name: "placement" }
  | { name: "lesson"; skill: Skill | null; placement?: string }
  | { name: "complete"; result: LessonResult };

export default function App() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const [screen, setScreen] = useState<Screen>({ name: "boot" });

  // Sounds and haptics: restore the mute setting and warm up the players once.
  useEffect(() => {
    initFeedback();
    preloadSounds();
  }, []);

  // Where a returning learner lands: the placement offer if they never chose, else Home.
  const resume = useCallback(async (id: string) => {
    if (!(await placementSettled(id))) {
      try {
        const t = await api.tree();
        if (t.stats.xp === 0) return setScreen({ name: "placement" });
        await settlePlacement();
      } catch {}
    }
    setScreen({ name: "home", key: 0 });
  }, []);

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
    setScreen({ name: "placement" });
  }, [resume]);

  const goHome = useCallback(() => setScreen({ name: "home", key: Math.random() }), []);
  const skipPlacement = useCallback(() => { settlePlacement(); goHome(); }, [goHome]);
  const reset = useCallback(() => {
    forgetLearner().then(() => setScreen({ name: "welcome" }));
  }, []);

  let body: React.ReactNode;
  const booting = !fontsLoaded || screen.name === "boot";
  // Changes whenever the visible screen changes, so the transition replays.
  const screenId = booting ? "boot" : screen.name === "home" ? `home-${screen.key}` : screen.name;
  if (booting) {
    body = (
      <View style={s.center}>
        <ActivityIndicator color={color.azure} />
      </View>
    );
  } else if (screen.name === "welcome") {
    body = <Welcome onStart={async () => setScreen({ name: "age", existing: false })} />;
  } else if (screen.name === "age") {
    const existing = screen.existing;
    body = <AgeGate onAnswer={(ok) => answerAge(existing, ok)} />;
  } else if (screen.name === "tooYoung") {
    body = <TooYoung />;
  } else if (screen.name === "placement") {
    const section = getExam()?.default_section ?? "";
    body = <PlacementIntro onQuiz={() => setScreen({ name: "lesson", skill: null, placement: section })} onSkip={skipPlacement} />;
  } else if (screen.name === "home") {
    body = (
      <Home
        key={screen.key}
        onStartLesson={(skill) => setScreen({ name: "lesson", skill })}
        onStartPlacement={(section) => setScreen({ name: "lesson", skill: null, placement: section })}
        onReset={reset}
      />
    );
  } else if (screen.name === "lesson") {
    // Leaving the placement quiz goes back to its intro, where "Start from the beginning" is one tap.
    body = (
      <Lesson
        skill={screen.skill}
        placementSection={screen.placement}
        onQuit={screen.placement !== undefined && screen.placement === (getExam()?.default_section ?? "") ? () => setScreen({ name: "placement" }) : goHome}
        onDone={(result) => {
          if (result.placement) settlePlacement(screen.placement);
          setScreen({ name: "complete", result });
        }}
      />
    );
  } else {
    body = <Complete result={screen.result} onContinue={goHome} />;
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

// Each screen fades in while sliding up 16px. Remounted per screen via `key`.
function ScreenTransition({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      style={[s.screen, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, ...(Platform.OS === "web" ? { minHeight: "100%" as unknown as number } : {}) },
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
