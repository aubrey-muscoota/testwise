import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Mascot, PopIn, Rise, Speech, Stagger } from "../components/ui";
import { color, space, type } from "../theme";

// Shown once, right after Welcome: skip ahead with a short quiz, or start at the beginning.
export function PlacementIntro({ onQuiz, onSkip }: { onQuiz: () => void; onSkip: () => void }) {
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <PopIn from={0.6} style={{ alignItems: "center" }}>
        <Mascot size={120} mood="talk" />
      </PopIn>
      <Rise delay={160} style={s.speech}>
        <Speech tailSide="top" text="Already know some math? Answer a few questions and I'll skip you past what you know." />
      </Rise>
      <Rise delay={320} style={{ alignSelf: "stretch" }}>
        <Text style={[type.h2, s.center]}>Where should you start?</Text>
      </Rise>
      <Stagger delay={420} step={90} style={s.points}>
        {[
          ["⏱️", "12 questions, about 5 minutes"],
          ["🧭", "Easy to hard, across all four areas"],
          ["🤷", "Guessing is fine. Skip ahead only where you're ready"],
        ].map(([icon, text]) => (
          <View key={text} style={s.point}>
            <View style={s.pointIcon}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
            <Text style={[type.body, { flex: 1 }]}>{text}</Text>
          </View>
        ))}
      </Stagger>
      <Rise delay={700} style={{ alignSelf: "stretch", gap: space(1.5) }}>
        <Button title="Find my level" onPress={onQuiz} />
        <Button title="Start from the beginning" kind="secondary" onPress={onSkip} />
      </Rise>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: space(3), alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  speech: { marginTop: space(2), marginBottom: space(3), alignSelf: "stretch" },
  center: { textAlign: "center" },
  points: { marginVertical: space(3), gap: space(1.5), alignSelf: "stretch" },
  point: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  pointIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.azureSoft, alignItems: "center", justifyContent: "center" },
});
