// Renders a Reading and Writing passage: blanks (______), <u>underlined</u> text,
// "• " note lines, and $TeX$ math. Also used for stems and choices, where only
// the math and blanks normally appear.
import React from "react";
import { StyleProp, StyleSheet, Text, TextStyle, View } from "react-native";
import { renderMath } from "./tex";
import { color, font, space, type } from "../theme";

const BLANK = /_{4,}/;

function inline(line: string, keyBase: string) {
  // Split on <u>…</u> and blanks, keeping both as their own pieces.
  const parts = renderMath(line).split(/(<u>.*?<\/u>|_{4,})/g).filter((p) => p !== "");
  return parts.map((p, i) => {
    if (p.startsWith("<u>")) return <Text key={`${keyBase}-${i}`} style={st.u}>{p.slice(3, -4)}</Text>;
    if (BLANK.test(p)) return <Text key={`${keyBase}-${i}`} style={st.blank} accessibilityLabel="blank">{" ".repeat(8)}</Text>;
    return p;
  });
}

export function RichText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  return <Text style={style}>{inline(text, "r")}</Text>;
}

export function Passage({ text, label }: { text: string; label?: string }) {
  const lines = text.split("\n");
  return (
    <View style={st.box}>
      {label && <Text style={st.label}>{label}</Text>}
      {lines.map((ln, i) =>
        ln.startsWith("• ") ? (
          <View key={i} style={st.bullet}>
            <Text style={[type.body, st.text]}>•</Text>
            <Text style={[type.body, st.text, { flex: 1 }]}>{inline(ln.slice(2), `l${i}`)}</Text>
          </View>
        ) : ln.trim() === "" ? (
          <View key={i} style={{ height: space(1) }} />
        ) : (
          <Text key={i} style={[type.body, st.text]}>{inline(ln, `l${i}`)}</Text>
        ),
      )}
    </View>
  );
}

const st = StyleSheet.create({
  box: {
    backgroundColor: color.card, borderRadius: 16, borderWidth: 2, borderColor: color.line,
    padding: space(2), marginBottom: space(2), gap: space(0.75),
  },
  label: { fontFamily: font.black, fontSize: 12, letterSpacing: 1, color: color.textSoft, marginBottom: space(0.5) },
  text: { fontSize: 17, lineHeight: 26 },
  bullet: { flexDirection: "row", gap: space(1) },
  u: { textDecorationLine: "underline", textDecorationColor: color.azureDark, fontFamily: font.semibold },
  blank: { textDecorationLine: "underline", textDecorationColor: color.text, letterSpacing: 2 },
});
