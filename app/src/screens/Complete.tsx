import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Button, Card, Mascot, PopIn, Speech } from "../components/ui";
import { lines, pick } from "../copy";
import { color, font, space, type } from "../theme";
import type { LessonResult } from "./Lesson";

const CONFETTI = ["#58A6FF", "#FFD66D", "#64BC5D", "#FF7E79", "#B9A7F1"];

function Confetti() {
  const pieces = useRef(
    Array.from({ length: 28 }, (_, i) => ({
      x: (i * 37) % 100,
      delay: (i * 53) % 500,
      v: new Animated.Value(0),
      c: CONFETTI[i % CONFETTI.length],
      r: (i * 47) % 360,
    })),
  ).current;
  useEffect(() => {
    Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.v, { toValue: 1, duration: 1500, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: 0,
            width: 10,
            height: 14,
            borderRadius: 2,
            backgroundColor: p.c,
            opacity: p.v.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [-20, 520] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: [`${p.r}deg`, `${p.r + 360}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export function Complete({ result, onContinue }: { result: LessonResult; onContinue: () => void }) {
  return (
    <View style={s.wrap}>
      <Confetti />
      <PopIn style={{ alignItems: "center" }}>
        <Mascot size={160} />
        <Text style={[type.h1, { textAlign: "center", marginTop: space(2), color: color.yellowDark }]}>Lesson complete!</Text>
        {result.skillName && <Text style={[type.body, { color: color.textSoft, marginTop: 4 }]}>{result.skillName}</Text>}
      </PopIn>
      <View style={{ marginVertical: space(3), alignSelf: "stretch" }}>
        <Speech text={result.stats.lessons_today === 1 && result.stats.streak > 1 ? pick(lines.streak) : pick(lines.lessonComplete)} />
      </View>
      <View style={s.row}>
        {[
          { label: "XP", value: `+${result.xp}`, tint: color.yellowDark, delay: 150 },
          { label: "CORRECT", value: `${result.correct}/${result.total}`, tint: color.green, delay: 300 },
          { label: "STREAK", value: `🔥 ${result.stats.streak}`, tint: "#F08A24", delay: 450 },
        ].map((t) => (
          <PopIn key={t.label} delay={t.delay} style={{ flex: 1 }}>
            <Card style={[s.tile, { borderColor: t.tint }]}>
              <Text style={[type.label, { color: t.tint }]}>{t.label}</Text>
              <Text style={s.tileValue}>{t.value}</Text>
            </Card>
          </PopIn>
        ))}
      </View>
      <Button title="Continue" onPress={onContinue} style={{ alignSelf: "stretch", marginTop: space(4) }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: space(3), alignItems: "center", justifyContent: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", gap: space(1.5), alignSelf: "stretch" },
  tile: { alignItems: "center", padding: space(2), borderWidth: 2 },
  tileValue: { fontFamily: font.black, fontSize: 24, color: "#1E2C3B", marginTop: 4 },
});
