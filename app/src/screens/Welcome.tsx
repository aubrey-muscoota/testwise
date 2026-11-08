// First open: Socrates introduces himself and the one thing to press.
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { getExam } from "../api";
import { noOrphan } from "../copy";
import { SocratesLine } from "../components/SocratesLine";
import { Button, Rise, Wordmark } from "../components/ui";
import { color, GUTTER, space, type } from "../theme";

export function Welcome({ onStart }: { onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exam = getExam();
  const short = useWindowDimensions().height < 720;
  const name = exam?.short_name ?? "test";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.wrap, short && { paddingTop: space(2) }]}>
        <Wordmark size={26} />
        <Rise delay={80} style={{ marginTop: short ? space(3) : space(6) }}>
          <SocratesLine
            layout="under"
            size={short ? 128 : 168}
            mood="happy"
            text={`I'm Socrates. Tell me when your ${name} is and I'll plan every day until then.`}
          />
        </Rise>
        <Rise delay={240} style={{ marginTop: space(4) }}>
          <Text style={type.title} accessibilityRole="header">{noOrphan(exam?.tagline ?? "Test prep, a few minutes a day")}</Text>
          <Text style={[type.body, { color: color.inkSoft, marginTop: space(1) }]}>
            No account needed. Your progress stays on this device.
          </Text>
        </Rise>
        {error && <Text style={[type.body, { color: color.brick, marginTop: space(2) }]} accessibilityRole="alert">{error}</Text>}
      </ScrollView>
      <View style={s.foot}>
        <Button
          title={busy ? "Getting ready…" : "Start"}
          disabled={busy}
          accessibilityLabel="Start practicing"
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onStart();
            } catch {
              setError("I couldn't connect. Check your connection and try again.");
              setBusy(false);
            }
          }}
        />
        <Text style={[type.small, { marginTop: space(1.5) }]}>{exam?.publisher.disclaimer}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: GUTTER, paddingTop: space(5), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
});
