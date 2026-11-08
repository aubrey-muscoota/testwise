import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Mascot, PopIn, Rise, Speech, Stagger } from "../components/ui";
import { color, space, type } from "../theme";
import { getExam } from "../api";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// Shown once, right after Welcome: skip ahead with a short quiz, or start at the beginning.
// The quiz covers the exam's default section; its size and wording come from the exam pack.
export function PlacementIntro({ onQuiz, onSkip }: { onQuiz: () => void; onSkip: () => void }) {
  const exam = getExam();
  const sec = exam?.sections.find((x) => x.id === exam.default_section);
  const areas = sec?.domains.length ?? 0;
  const questions = areas * (exam?.placement.per_domain ?? 3);
  const minutes = Math.max(1, Math.round((questions * (exam?.placement.seconds_per_question ?? 25)) / 60));
  const speech = (sec && exam?.voice.placement_intro?.[sec.id]) || "Already know some of this? Answer a few questions and I'll skip you past what you know.";
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <PopIn from={0.6} style={{ alignItems: "center" }}>
        <Mascot size={120} mood="talk" />
      </PopIn>
      <Rise delay={160} style={s.speech}>
        <Speech tailSide="top" text={speech} />
      </Rise>
      <Rise delay={320} style={{ alignSelf: "stretch" }}>
        <Text style={[type.h2, s.center]}>Where should you start?</Text>
      </Rise>
      <Stagger delay={420} step={90} style={s.points}>
        {[
          ["⏱️", `${questions} questions, about ${minutes} minute${minutes === 1 ? "" : "s"}`],
          ["🧭", `Easy to hard, across all ${WORDS[areas] ?? areas} areas`],
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
