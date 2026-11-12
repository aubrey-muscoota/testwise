// Review page for the animated Socrates rig. Web only: open the app with
// ?lab=socrates. Optional params for screenshots:
//   solo=<mood>   one big rig instead of the sheet     size=<px>  its size
//   talking=1     start talking                        look=user|bubble|down|auto
//   still=1       static frames (animate={false})
import React, { useState } from "react";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from "@expo-google-fonts/nunito";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
// The lab keeps the old PNG, for comparing the rig against it.
const mascot = require("../../assets/socratesmascotmain.png");
import { MOODS, Socrates, SocratesMood, type LookAt } from "../socrates/Socrates";
import { color, font, radius, space } from "../theme";

const LOOKS: { label: string; v: LookAt | undefined }[] = [
  { label: "auto", v: undefined },
  { label: "user", v: "user" },
  { label: "bubble", v: "bubble" },
  { label: "down", v: "down" },
  { label: "up-left", v: { x: -0.8, y: -0.7 } },
];

const NOTES: Record<SocratesMood, string> = {
  idle: "question shown",
  happy: "correct",
  thinking: "Socrates hint",
  concerned: "wrong",
  celebrate: "lesson complete",
  listening: "waiting for you",
  sleepy: "streak lost",
};

function param(k: string) {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
}

export function SocratesLab() {
  useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  const [talking, setTalking] = useState(param("talking") === "1");
  const [still, setStill] = useState(param("still") === "1");
  const lp = param("look");
  const [look, setLook] = useState(Math.max(0, LOOKS.findIndex((l) => l.label === lp)));
  const [replay, setReplay] = useState(0);
  const [cmpMood, setCmpMood] = useState<SocratesMood>("idle");
  const solo = param("solo") as SocratesMood | null;
  const lookAt = LOOKS[look].v;

  if (solo && MOODS.includes(solo)) {
    const size = Number(param("size")) || 320;
    return (
      <View style={[st.page, { alignItems: "center", justifyContent: "center", padding: size * 0.2 }]} testID="solo">
        <Socrates size={size} mood={solo} talking={talking} lookAt={lookAt} animate={!still} />
      </View>
    );
  }

  const chip = (label: string, on: boolean, onPress: () => void, testID?: string) => (
    <Pressable key={label} onPress={onPress} testID={testID} accessibilityRole="button" style={[st.chip, on && st.chipOn]}>
      <Text style={[st.chipText, on && { color: color.white }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={st.page} contentContainerStyle={st.content}>
      <Text style={st.h1}>Socrates rig</Text>
      <Text style={st.sub}>Vector rig (react-native-svg + Animated) traced from the mascot PNG.</Text>

      <View style={st.row}>
        {chip(talking ? "talking: on" : "talking: off", talking, () => setTalking(!talking), "toggle-talking")}
        {chip(still ? "animate: off" : "animate: on", !still, () => setStill(!still), "toggle-animate")}
        {chip("replay entrances", false, () => setReplay(replay + 1), "replay")}
      </View>
      <View style={st.row}>
        <Text style={st.label}>lookAt</Text>
        {LOOKS.map((l, i) => chip(l.label, i === look, () => setLook(i), `look-${l.label}`))}
      </View>

      <View style={st.compare} testID="compare">
        <View style={st.cmpCell}>
          <Image source={mascot} style={{ width: 240, height: 240 }} resizeMode="contain" />
          <Text style={st.caption}>PNG</Text>
        </View>
        <View style={st.cmpCell}>
          <Socrates size={240} mood={cmpMood} talking={talking} lookAt={lookAt} animate={!still} moodKey={replay} />
          <Text style={st.caption}>rig: {cmpMood}</Text>
        </View>
      </View>
      <View style={[st.row, { justifyContent: "center" }]}>
        {MOODS.map((m) => chip(m, m === cmpMood, () => setCmpMood(m), `cmp-${m}`))}
      </View>

      <View style={st.grid}>
        {MOODS.map((m) => (
          <View key={m} style={st.cell} testID={`mood-${m}`}>
            <View style={st.cellArt}>
              <Socrates size={150} mood={m} talking={talking} lookAt={lookAt} animate={!still} moodKey={replay} />
              <Socrates size={56} mood={m} talking={talking} lookAt={lookAt} animate={!still} moodKey={replay} />
            </View>
            <Text style={st.label}>{m}</Text>
            <Text style={st.caption}>{NOTES[m]}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  content: { padding: space(3), paddingTop: space(4), maxWidth: 1100, width: "100%", alignSelf: "center" },
  h1: { fontFamily: font.black, fontSize: 28, color: color.ink },
  sub: { fontFamily: font.semibold, fontSize: 15, color: color.ink2, marginTop: 4, marginBottom: space(2) },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: space(1.5) },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: color.line, backgroundColor: color.bg },
  chipOn: { backgroundColor: color.blue, borderColor: color.blue },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 15, color: color.ink, marginRight: 4 },
  caption: { fontFamily: font.bold, fontSize: 12, color: color.ink2 },
  compare: { flexDirection: "row", justifyContent: "center", gap: space(4), paddingVertical: space(4), marginVertical: space(1), backgroundColor: color.well, borderRadius: radius.sheet },
  cmpCell: { alignItems: "center", gap: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(2) },
  cell: { width: 240, alignItems: "center", paddingVertical: space(3), paddingTop: space(5), backgroundColor: color.bg, borderRadius: radius.sheet, borderWidth: 2, borderColor: color.line },
  cellArt: { flexDirection: "row", alignItems: "flex-end", gap: space(1), marginBottom: space(1) },
});
