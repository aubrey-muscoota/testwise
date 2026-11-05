import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native";
import {
  useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { createLearner, forgetLearner, loadLearner, Skill } from "./src/api";
import { Welcome } from "./src/screens/Welcome";
import { Home } from "./src/screens/Home";
import { Lesson, LessonResult } from "./src/screens/Lesson";
import { Complete } from "./src/screens/Complete";
import { color } from "./src/theme";

type Screen =
  | { name: "boot" }
  | { name: "welcome" }
  | { name: "home"; key: number }
  | { name: "lesson"; skill: Skill | null }
  | { name: "complete"; result: LessonResult };

export default function App() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const [screen, setScreen] = useState<Screen>({ name: "boot" });

  useEffect(() => {
    loadLearner().then((id) => setScreen(id ? { name: "home", key: 0 } : { name: "welcome" }));
  }, []);

  const goHome = useCallback(() => setScreen({ name: "home", key: Math.random() }), []);
  const reset = useCallback(() => {
    forgetLearner().then(() => setScreen({ name: "welcome" }));
  }, []);

  let body: React.ReactNode;
  if (!fontsLoaded || screen.name === "boot") {
    body = (
      <View style={s.center}>
        <ActivityIndicator color={color.azure} />
      </View>
    );
  } else if (screen.name === "welcome") {
    body = <Welcome onStart={async () => { await createLearner(); goHome(); }} />;
  } else if (screen.name === "home") {
    body = <Home key={screen.key} onStartLesson={(skill) => setScreen({ name: "lesson", skill })} onReset={reset} />;
  } else if (screen.name === "lesson") {
    body = <Lesson skill={screen.skill} onQuit={goHome} onDone={(result) => setScreen({ name: "complete", result })} />;
  } else {
    body = <Complete result={screen.result} onContinue={goHome} />;
  }

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" />
      {body}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, ...(Platform.OS === "web" ? { minHeight: "100%" as unknown as number } : {}) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
