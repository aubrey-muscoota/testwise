import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, ScrollView, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from "react-native";
import { Burst, Button, Card, CountUp, Mascot, Rise, Speech } from "../components/ui";
import { lines, pick } from "../copy";
import { feedback } from "../motion/feedback";
import { color, font, radius, space, type } from "../theme";
import type { LessonResult } from "./Lesson";

// Choreography (ms from mount). Everything lands well under 1.6s.
const T = { mascot: 0, title: 180, speech: 360, tiles: 520, tileStep: 140, badges: 1000, cta: 1150 };
const FLAME = "#F08A24";

// ─── Confetti ────────────────────────────────────────────────────────────────
// Pieces start just inside the top edge (so the first ones show with the title), fall with gravity (ease-in), sway side to
// side, spin, and flutter (scaleX flip) like paper.

const CONFETTI = ["#58A6FF", "#FFD66D", "#64BC5D", "#FF7E79", "#B9A7F1"];
const SHAPES = ["rect", "circle", "strip"] as const;

function Confetti({ count = 56 }: { count?: number }) {
  const { height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (i * 37 + (i % 7) * 5) % 100,
        delay: (i * 53) % 300,
        duration: 2200 + ((i * 71) % 1100),
        start: -10 - ((i * 29) % 30),
        sway: 14 + ((i * 13) % 26),
        spin: (i % 2 ? 1 : -1) * (360 + ((i * 41) % 360)),
        flutter: 2 + (i % 3),
        r: (i * 47) % 360,
        c: CONFETTI[i % CONFETTI.length],
        shape: SHAPES[i % SHAPES.length],
        fall: new Animated.Value(0),
        t: new Animated.Value(0),
      })),
    [count],
  );
  useEffect(() => {
    const anim = Animated.parallel(
      pieces.flatMap((p) => [
        Animated.timing(p.fall, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(p.t, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const shape: ViewStyle =
          p.shape === "circle" ? { width: 10, height: 10, borderRadius: 5 }
          : p.shape === "strip" ? { width: 6, height: 16, borderRadius: 3 }
          : { width: 10, height: 14, borderRadius: 2 };
        const flips = Array.from({ length: p.flutter * 2 + 1 }, (_, k) => k / (p.flutter * 2));
        return (
          <Animated.View
            key={i}
            style={[shape, {
              position: "absolute",
              left: `${p.x}%`,
              top: 0,
              backgroundColor: p.c,
              opacity: p.t.interpolate({ inputRange: [0, 0.02, 0.85, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateY: p.fall.interpolate({ inputRange: [0, 1], outputRange: [p.start, height + 40] }) },
                { translateX: p.t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, p.sway, 0, -p.sway, 0] }) },
                { rotate: p.t.interpolate({ inputRange: [0, 1], outputRange: [`${p.r}deg`, `${p.r + p.spin}deg`] }) },
                { scaleX: p.t.interpolate({ inputRange: flips, outputRange: flips.map((_, k) => (k % 2 ? 0.2 : 1)) }) },
              ],
            }]}
          />
        );
      })}
    </View>
  );
}

// ─── Local motion helpers ────────────────────────────────────────────────────

// Spring 0 → 1 after `delay` ms.
function useEnter(delay: number, speed = 14, bounciness = 12) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.spring(v, { toValue: 1, delay, speed, bounciness, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, delay, speed, bounciness]);
  return v;
}

// Mounts its children after `delay` ms (e.g. so a Burst fires when its badge lands).
function Later({ delay, children }: { delay: number; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on ? <>{children}</> : null;
}

// A stat tile rises and pops (scale overshoot) into place.
function Tile({ delay, tint, label, special, children }: { delay: number; tint: string; label: string; special?: boolean; children: React.ReactNode }) {
  const v = useEnter(delay, 13, 14);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
        ],
      }}
    >
      <Card style={[s.tile, { borderColor: tint }, special && s.tileSpecial]}>
        <Text style={[type.label, { color: tint }]}>{label}</Text>
        {children}
      </Card>
    </Animated.View>
  );
}

// A flame that flickers (scale + rotate wiggle) a few times, then settles.
function Flame({ delay, active }: { delay: number; active: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const flicker = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(v, { toValue: -1, duration: 140, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.6, duration: 120, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 110, useNativeDriver: true }),
    ]);
    const a = Animated.sequence([Animated.delay(delay), Animated.loop(flicker, { iterations: 4 })]);
    a.start();
    return () => a.stop();
  }, [v, delay, active]);
  return (
    <Animated.Text
      style={[s.flame, {
        transform: [
          { scale: v.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.12, 1, 1.22] }) },
          { rotate: v.interpolate({ inputRange: [-1, 1], outputRange: ["-10deg", "10deg"] }) },
        ],
      }]}
    >
      🔥
    </Animated.Text>
  );
}

// A badge that stamps in (big → settle) after `delay`.
function Stamp({ delay, style, children }: { delay: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useEnter(delay, 16, 16);
  return (
    <Animated.View
      style={[style, {
        opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["-8deg", "-2deg"] }) },
        ],
      }]}
    >
      {children}
    </Animated.View>
  );
}

function accuracyLine(correct: number, total: number) {
  const pct = total ? correct / total : 0;
  if (total && correct === total) return { text: "Perfect!", tint: color.green, bg: color.greenSoft };
  if (pct >= 0.8) return { text: "Great job!", tint: color.azureDark, bg: color.azureSoft };
  if (pct >= 0.5) return { text: "Solid work!", tint: color.azureDark, bg: color.azureSoft };
  return { text: "Wisdom grows from error", tint: "#8A6FE0", bg: "#F1EDFC" };
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export function Complete({ result, onContinue }: { result: LessonResult; onContinue: () => void }) {
  const { streak, lessons_today } = result.stats;
  const streakExtended = lessons_today === 1 && streak >= 1;
  const perfect = result.total > 0 && result.correct === result.total;
  const acc = accuracyLine(result.correct, result.total);
  const speech = useMemo(() => (lessons_today === 1 && streak > 1 ? pick(lines.streak) : pick(lines.lessonComplete)), [lessons_today, streak]);

  useEffect(() => {
    feedback.complete();
  }, []);

  const hero = useEnter(T.mascot, 10, 14);
  const title = useEnter(T.title, 12, 16);
  const tileDelay = (i: number) => T.tiles + i * T.tileStep;
  // Shrink the hero on short screens so everything fits without scrolling.
  const { height } = useWindowDimensions();
  const mascotSize = Math.round(Math.max(96, Math.min(160, height * 0.2)));
  const haloSize = mascotSize + 40;
  // Pop in idle, then jump for joy once the scale-in has landed.
  const [cheer, setCheer] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setCheer(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={s.root}>
      <Confetti />
      <ScrollView style={s.scroll} contentContainerStyle={s.wrap}>

      {/* Socrates scales in big, with a sunny halo behind him. */}
      <Animated.View
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: hero.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ scale: hero.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
        }}
      >
        <View style={[s.halo, { width: haloSize, height: haloSize, borderRadius: haloSize / 2 }]} />
        <Later delay={140}><Burst count={14} radius={Math.round(haloSize * 0.55)} size={9} /></Later>
        <Mascot size={mascotSize} mood={cheer ? "cheer" : "idle"} />
      </Animated.View>

      {/* Title drops in from above with a bounce. */}
      <Animated.View
        style={{
          alignItems: "center",
          opacity: title.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
          transform: [{ translateY: title.interpolate({ inputRange: [0, 1], outputRange: [-48, 0] }) }],
        }}
      >
        <Text style={[type.h1, s.title]}>Lesson complete!</Text>
        {result.skillName && <Text style={[type.body, { color: color.textSoft, marginTop: 4 }]}>{result.skillName}</Text>}
      </Animated.View>

      <Rise delay={T.speech} style={{ marginVertical: space(3), alignSelf: "center", maxWidth: "100%" }}>
        <Speech text={speech} tailSide="top" />
      </Rise>

      <View style={s.row}>
        <Tile delay={tileDelay(0)} tint={color.yellowDark} label="XP">
          <CountUp value={result.xp} delay={tileDelay(0) + 120} duration={700} prefix="+" style={s.tileValue} />
        </Tile>
        <Tile delay={tileDelay(1)} tint={color.green} label="CORRECT">
          <CountUp value={result.correct} delay={tileDelay(1) + 120} duration={600} suffix={`/${result.total}`} style={s.tileValue} />
        </Tile>
        <Tile delay={tileDelay(2)} tint={FLAME} label="STREAK" special={streakExtended}>
          <View style={s.streakValue}>
            <Flame delay={tileDelay(2) + 200} active={streakExtended} />
            <CountUp value={streak} from={streakExtended ? Math.max(0, streak - 1) : streak} delay={tileDelay(2) + 250} duration={300} style={s.tileValue} />
          </View>
        </Tile>
      </View>

      <View style={s.badges}>
        <Stamp delay={T.badges} style={[s.badge, { backgroundColor: acc.bg, borderColor: acc.tint }]}>
          {perfect && <Later delay={T.badges + 120}><Burst count={10} radius={56} size={7} /></Later>}
          <Text style={[s.badgeText, { color: acc.tint }]}>{perfect ? "★ " : ""}{acc.text}</Text>
        </Stamp>
        {streakExtended && (
          <Stamp delay={T.badges + 120} style={[s.badge, s.ribbon]}>
            <Text style={[s.badgeText, { color: "#fff" }]}>🔥 {streak === 1 ? "Streak started!" : "Streak extended!"}</Text>
          </Stamp>
        )}
      </View>

      <Rise delay={T.cta} style={{ alignSelf: "stretch", marginTop: space(3) }}>
        <Button title="Continue" onPress={onContinue} />
      </Rise>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  wrap: { flexGrow: 1, padding: space(3), alignItems: "center", justifyContent: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  halo: { position: "absolute", backgroundColor: color.cream, borderWidth: 6, borderColor: "#FFF1C9" },
  title: { textAlign: "center", marginTop: space(2), color: color.yellowDark, fontFamily: font.black },
  row: { flexDirection: "row", gap: space(1.5), alignSelf: "stretch" },
  tile: { alignItems: "center", padding: space(2), borderWidth: 2, borderBottomWidth: 5 },
  tileSpecial: { backgroundColor: "#FFF4E8" },
  tileValue: { fontFamily: font.black, fontSize: 24, color: color.text, marginTop: 4 },
  streakValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  flame: { fontSize: 22, marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space(1), marginTop: space(2), minHeight: 36 },
  badge: { borderWidth: 2, borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 6 },
  badgeText: { fontFamily: font.black, fontSize: 14, letterSpacing: 0.4 },
  ribbon: { backgroundColor: FLAME, borderColor: "#D9741A" },
});
