import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, createLearner, forgetLearner, loadLearner, Skill } from "./src/api";
import { Welcome } from "./src/screens/Welcome";
import { Home } from "./src/screens/Home";
import { Lesson, LessonResult } from "./src/screens/Lesson";
import { Complete } from "./src/screens/Complete";
import { PlacementIntro } from "./src/screens/PlacementIntro";
import { initFeedback, preloadSounds } from "./src/motion/feedback";
import { color } from "./src/theme";

type Screen =
  | { name: "boot" }
  | { name: "welcome" }
  | { name: "home"; key: number }
  | { name: "placement" }
  | { name: "lesson"; skill: Skill | null; placement?: boolean }
  | { name: "complete"; result: LessonResult };

export default function App() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const [screen, setScreen] = useState<Screen>({ name: "boot" });

  // Sounds and haptics: restore the mute setting and warm up the players once.
  useEffect(() => {
    initFeedback();
    preloadSounds();
  }, []);

  useEffect(() => {
    loadLearner().then(async (id) => {
      if (!id) return setScreen({ name: "welcome" });
      // A new learner who left before choosing still gets the placement offer.
      if (!(await placementSettled(id))) {
        try {
          const t = await api.tree();
          if (t.stats.xp === 0) return setScreen({ name: "placement" });
          await settlePlacement();
        } catch {}
      }
      setScreen({ name: "home", key: 0 });
    });
  }, []);

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
    body = <Welcome onStart={async () => { currentLearner = await createLearner(); setScreen({ name: "placement" }); }} />;
  } else if (screen.name === "placement") {
    body = <PlacementIntro onQuiz={() => setScreen({ name: "lesson", skill: null, placement: true })} onSkip={skipPlacement} />;
  } else if (screen.name === "home") {
    body = <Home key={screen.key} onStartLesson={(skill) => setScreen({ name: "lesson", skill })} onReset={reset} />;
  } else if (screen.name === "lesson") {
    // Leaving the placement quiz goes back to its intro, where "Start from the beginning" is one tap.
    body = (
      <Lesson
        skill={screen.skill}
        placement={screen.placement}
        onQuit={screen.placement ? () => setScreen({ name: "placement" }) : goHome}
        onDone={(result) => {
          if (result.placement) settlePlacement();
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

// Remembers (per learner) that the placement offer was taken or declined.
let currentLearner: string | null = null;
const placementKey = (id: string | null) => `testwise.placementDone.${id ?? "anon"}`;
async function placementSettled(id: string) {
  currentLearner = id;
  try {
    return (await AsyncStorage.getItem(placementKey(id))) === "1";
  } catch {
    return false;
  }
}
async function settlePlacement() {
  try {
    const id = currentLearner ?? (await loadLearner());
    await AsyncStorage.setItem(placementKey(id), "1");
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
