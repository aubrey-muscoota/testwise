import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Mascot, PopIn, Speech, logo } from "../components/ui";
import { color, space, type } from "../theme";

export function Welcome({ onStart }: { onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Image source={logo} style={s.logo} resizeMode="contain" accessibilityLabel="testwise" />
      <PopIn delay={100} style={s.hero}>
        <Mascot size={180} />
        <View style={{ marginTop: space(2), alignSelf: "stretch" }}>
          <Speech text="Shall we begin our journey? I'm Socrates. I'll be right here with you." />
        </View>
      </PopIn>
      <PopIn delay={250} style={{ alignSelf: "stretch" }}>
        <Text style={[type.h2, s.center]}>SAT Math practice, five minutes a day</Text>
        <View style={s.points}>
          {[
            ["🌱", "Short lessons that adapt to you"],
            ["🔁", "Missed questions come back until they stick"],
            ["🏛️", "Socrates helps you reason it out when you miss one"],
          ].map(([icon, text]) => (
            <View key={text} style={s.point}>
              <Text style={s.pointIcon}>{icon}</Text>
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </View>
        <Button
          title={busy ? "Getting ready…" : "Start practicing"}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await onStart();
            } catch {
              setError("Couldn't connect. Check your connection and try again.");
              setBusy(false);
            }
          }}
        />
        {error && <Text style={[type.body, s.center, { color: color.coral, marginTop: space(1) }]}>{error}</Text>}
        <Text style={[type.caption, s.center, { marginTop: space(3) }]}>
          No account needed. Your progress is saved on this device.
        </Text>
        <Text style={[type.caption, s.center, { marginTop: space(1) }]}>
          Testwise is not affiliated with College Board. SAT is a trademark of College Board.
        </Text>
      </PopIn>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(3), paddingTop: space(5), alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  logo: { width: 180, height: 40, marginBottom: space(3) },
  hero: { alignItems: "center", alignSelf: "stretch", marginBottom: space(3) },
  center: { textAlign: "center" },
  points: { marginVertical: space(3), gap: space(1.5) },
  point: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  pointIcon: { fontSize: 24, width: 32, textAlign: "center" },
});
