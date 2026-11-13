// After the test picker: Socrates says hello, the name, the picked test's
// line, and the one thing to press. Centered: one big thing is the point.
import React from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { getExam } from "../api";
import { Socrates } from "../socrates/Socrates";
import { Button, IconButton, Rise, Wordmark } from "../components/ui";
import { color, COLUMN, GUTTER, space, type } from "../theme";

export function Welcome({ onStart, onBack }: { onStart: () => void; onBack?: () => void }) {
  const exam = getExam();
  const short = useWindowDimensions().height < 720;
  const name = exam?.short_name ?? "test";

  return (
    <View style={{ flex: 1 }}>
      <View style={s.head}>
        {onBack && <IconButton name="back" label="Pick another test" onPress={onBack} style={{ marginLeft: -8 }} />}
      </View>
      <ScrollView contentContainerStyle={s.wrap}>
        <Rise style={s.center}>
          <Socrates size={short ? 104 : 140} mood="happy" />
        </Rise>
        <Rise delay={120} style={[s.center, { marginTop: space(short ? 2 : 3) }]}>
          <Wordmark size={34} />
          <Text style={[type.body, s.tagline]}>{exam?.tagline ?? `${name} practice in five minutes a day, with Socrates`}</Text>
        </Rise>
      </ScrollView>
      <View style={s.foot}>
        <Button title="Get started" onPress={onStart} testID="welcome-start" />
        <Text style={[type.small, s.note]}>No account needed. Your progress stays on this device.</Text>
        {exam?.publisher.disclaimer ? <Text style={[type.small, s.note, { marginTop: space(0.5) }]}>{exam.publisher.disclaimer}</Text> : null}
      </View>
    </View>
  );
}

const balance = Platform.OS === "web" ? ({ textWrap: "balance" } as object) : null;

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER, paddingTop: space(1), minHeight: 52, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  wrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: GUTTER, paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  center: { alignItems: "center" },
  tagline: { color: color.ink2, fontSize: 18, textAlign: "center", marginTop: space(1), maxWidth: 300, ...balance },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  note: { textAlign: "center", marginTop: space(1.5) },
});
