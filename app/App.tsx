import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { createLearner, forgetLearner, loadLearner, Skill } from "./src/api";
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
    loadLearner().then((id) => setScreen(id ? { name: "home", key: 0 } : { name: "welcome" }));
  }, []);

  const goHome = useCallback(() => setScreen({ name: "home", key: Math.random() }), []);
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
    body = <Welcome onStart={async () => { await createLearner(); setScreen({ name: "placement" }); }} />;
  } else if (screen.name === "placement") {
    body = <PlacementIntro onQuiz={() => setScreen({ name: "lesson", skill: null, placement: true })} onSkip={goHome} />;
  } else if (screen.name === "home") {
    body = <Home key={screen.key} onStartLesson={(skill) => setScreen({ name: "lesson", skill })} onReset={reset} />;
  } else if (screen.name === "lesson") {
    body = <Lesson skill={screen.skill} placement={screen.placement} onQuit={goHome} onDone={(result) => setScreen({ name: "complete", result })} />;
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
