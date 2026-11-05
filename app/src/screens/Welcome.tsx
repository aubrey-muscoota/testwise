import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button, Mascot, Mood, PopIn, Rise, Speech, Stagger, logo } from "../components/ui";
import { color, radius, space, type } from "../theme";

// Entrance timeline (ms).
const T = { logo: 0, hero: 120, speech: 260, headline: 480, points: 620, cta: 900, captions: 1000, attention: 2000 };

// Logo drops in from above with a little bounce.
function DropIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, speed: 12, bounciness: 14, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// After `delay`, the CTA gently breathes and sends out a soft ring every few
// seconds. Stops while `active` is false (e.g. while busy).
function Attention({ children, active, delay }: { children: React.ReactNode; active: boolean; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1600),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); v.setValue(0); };
  }, [active, delay, v]);
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[s.ring, {
          opacity: v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.45, 0] }),
          transform: [
            { scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
            { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
          ],
        }]}
      />
      <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.035, 1] }) }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

export function Welcome({ onStart }: { onStart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Short phones (e.g. iPhone 13 web, ~664px tall) get a tighter layout so the
  // Start button and its attention pulse are on screen at first glance.
  const compact = useWindowDimensions().height < 760;
  const mascotSize = compact ? 124 : 180;
  // Room above the mascot for his cheer hop (about 0.27 * size including the
  // stretch), so he never jumps into the logo.
  const hopRoom = Math.round(mascotSize * 0.27);
  // Socrates cheers hello once his pop-in has settled, then returns to idle.
  const [mood, setMood] = useState<Mood>("idle");
  useEffect(() => {
    const a = setTimeout(() => setMood("cheer"), T.hero + 420);
    const b = setTimeout(() => setMood("idle"), T.hero + 2100);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  return (
    <ScrollView contentContainerStyle={[s.wrap, compact && s.wrapCompact]}>
      <DropIn delay={T.logo}>
        <Image source={logo} style={s.logo} resizeMode="contain" accessibilityLabel="testwise" />
      </DropIn>
      <PopIn delay={T.hero} from={0.6} style={[s.hero, { paddingTop: hopRoom }]}>
        <Mascot size={mascotSize} mood={mood} />
      </PopIn>
      <Rise delay={T.speech} style={[s.speech, compact && s.speechCompact]}>
        <Speech tailSide="top" text="Shall we begin our journey? I'm Socrates. I'll be right here with you." />
      </Rise>
      <View style={{ alignSelf: "stretch" }}>
        <Rise delay={T.headline}>
          <Text style={[type.h2, s.center]}>SAT Math practice, five minutes a day</Text>
        </Rise>
        <Stagger delay={T.points} step={90} style={[s.points, compact && s.pointsCompact]}>
          {[
            ["🌱", "Short lessons that adapt to you"],
            ["🔁", "Missed questions come back until they stick"],
            ["🏛️", "Socrates helps you reason it out when you miss one"],
          ].map(([icon, text]) => (
            <View key={text} style={s.point}>
              <View style={s.pointIcon}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
              <Text style={[type.body, { flex: 1 }]}>{text}</Text>
            </View>
          ))}
        </Stagger>
        <Rise delay={T.cta}>
          <Attention active={!busy} delay={T.attention}>
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
          </Attention>
        </Rise>
        {error && (
          <PopIn>
            <Text style={[type.body, s.center, { color: color.coral, marginTop: space(1) }]}>{error}</Text>
          </PopIn>
        )}
        <Rise delay={T.captions}>
          <Text style={[type.caption, s.center, { marginTop: space(3) }]}>
            No account needed. Your progress is saved on this device.
          </Text>
          <Text style={[type.caption, s.center, { marginTop: space(1) }]}>
            Testwise is not affiliated with College Board. SAT is a trademark of College Board.
          </Text>
        </Rise>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: space(3), paddingTop: space(5), alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  wrapCompact: { paddingTop: space(2) },
  logo: { width: 180, height: 40, marginBottom: space(1) },
  hero: { alignItems: "center", alignSelf: "stretch" },
  speech: { marginTop: space(2), marginBottom: space(3), alignSelf: "stretch" },
  speechCompact: { marginTop: space(1.5), marginBottom: space(2) },
  center: { textAlign: "center" },
  points: { marginVertical: space(3), gap: space(1.5) },
  pointsCompact: { marginVertical: space(2), gap: space(1) },
  point: { flexDirection: "row", alignItems: "center", gap: space(1.5) },
  pointIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: color.azureSoft, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", left: 0, right: 0, top: 0, bottom: 4, borderRadius: radius.button, borderWidth: 3, borderColor: color.azure },
});
