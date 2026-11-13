// Learn path review page, web only, for the screenshot checks and for review:
//   ?lab=path&state=<s>[&open=<node id>]
// s = fresh, mid, teal or done (app/src/lab/path.json, written by
// scripts/path-lab-fixtures.mjs from the real worker/path.js); open names a
// circle whose card is shown open. The tabs and top bar are the app's own.
import React, { useMemo } from "react";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from "@expo-google-fonts/nunito";
import { StyleSheet, View } from "react-native";
import { Exam, LearnPath, primeForLab } from "../api";
import { Shell } from "../components/Shell";
import fixtures from "../lab/path.json";
import { color } from "../theme";
import { Learn } from "./Learn";

const DATA = fixtures as unknown as { exam: Exam; states: Record<string, LearnPath> };

function param(k: string) {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
}

export function PathLab() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black,
  });
  const path = DATA.states[param("state") ?? ""] ?? DATA.states.fresh;
  const open = param("open") ?? undefined;
  useMemo(() => primeForLab(path, DATA.exam), [path]);
  if (!fontsLoaded) return <View style={s.root} />;
  return (
    <View style={s.root} testID="lab-ready">
      <Shell tab="learn" onTab={() => {}} onEditDate={() => {}}>
        <Learn fixture={path} openId={open} onStart={() => {}} />
      </Shell>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, minHeight: "100%" as unknown as number },
});
