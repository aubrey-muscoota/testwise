// Shown once after onboarding: skip ahead with a short quiz, or start at the beginning.
// The quiz covers the exam's default section; its size and wording come from the exam pack.
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getExam } from "../api";
import { noOrphan } from "../copy";
import { SocratesLine } from "../components/SocratesLine";
import { Button, Rise, TextButton } from "../components/ui";
import { color, GUTTER, space, type } from "../theme";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function PlacementIntro({ onQuiz, onSkip }: { onQuiz: () => void; onSkip: () => void }) {
  const exam = getExam();
  const sec = exam?.sections.find((x) => x.id === exam.default_section);
  const areas = sec?.domains.length ?? 0;
  const questions = areas * (exam?.placement.per_domain ?? 3);
  const minutes = Math.max(1, Math.round((questions * (exam?.placement.seconds_per_question ?? 25)) / 60));
  const speech = (sec && exam?.voice.placement_intro?.[sec.id]) || "Already know some of this? Answer a few questions and I'll skip you past what you know.";
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Rise>
          <SocratesLine text={speech} layout="under" size={128} mood="idle" />
        </Rise>
        <Rise delay={160} style={{ marginTop: space(4) }}>
          <Text style={type.title} accessibilityRole="header">{noOrphan(`Where should you start in ${sec?.name ?? "this section"}?`)}</Text>
          <Text style={[type.body, { marginTop: space(1.5) }]}>
            {questions} questions, about {minutes} minutes, easy to hard across all {WORDS[areas] ?? areas} areas. Guessing is fine.
          </Text>
          <Text style={[type.body, { color: color.inkSoft, marginTop: space(1) }]}>
            You can do the same for the other sections later, from Path.
          </Text>
        </Rise>
      </ScrollView>
      <View style={s.foot}>
        <Button title="Find my level" onPress={onQuiz} />
        <TextButton title="Start from the beginning" tone="soft" onPress={onSkip} style={{ marginTop: space(0.5) }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER, paddingTop: space(4), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
});
