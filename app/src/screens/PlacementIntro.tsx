// Shown once after onboarding: skip ahead with a short quiz, or start at the beginning.
// The quiz covers the exam's default section; its size and wording come from the exam pack.
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getExam } from "../api";
import { noOrphan } from "../copy";
import { SocratesLine } from "../components/SocratesLine";
import { Button, Rise, TextButton } from "../components/ui";
import { GUTTER, space, type, COLUMN } from "../theme";

export function PlacementIntro({ onQuiz, onSkip }: { onQuiz: () => void; onSkip: () => void }) {
  const exam = getExam();
  const sec = exam?.sections.find((x) => x.id === exam.default_section);
  const areas = sec?.domains.length ?? 0;
  const questions = areas * (exam?.placement.per_domain ?? 3);
  const minutes = Math.max(1, Math.round((questions * (exam?.placement.seconds_per_question ?? 25)) / 60));
  const speech = (sec && exam?.voice.placement_intro?.[sec.id]) || "Answer what you can and I'll skip what you already know.";
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Rise>
          <SocratesLine text={speech} size={104} mood="idle" />
        </Rise>
        <Rise delay={160} style={{ marginTop: space(4) }}>
          <Text style={type.title} accessibilityRole="header">{noOrphan(`Where should you start in ${sec ? sec.name.toLowerCase() : "this section"}?`)}</Text>
          <Text style={[type.body, { marginTop: space(1.5) }]}>
            {questions} questions, about {minutes} minutes. Guess if you're unsure.
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
  wrap: { paddingHorizontal: GUTTER, paddingTop: space(4), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});
