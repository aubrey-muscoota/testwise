import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, Easing, Image, PixelRatio, Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle,
} from "react-native";
import { buzz, isMuted, onMutedChange, play, setMuted } from "../motion/feedback";
import { color, font, radius, shadow, space, type } from "../theme";

export const mascot = require("../../assets/socratesmascotmain.png");
export const logo = require("../../assets/logo_blue.png");

// ─── Reduced motion ──────────────────────────────────────────────────────────
// One shared subscription to the OS "reduce motion" setting. When it is on,
// looping and large motion is skipped; colour and badge feedback stay.

let reduceMotion = false;
const rmListeners = new Set<(v: boolean) => void>();
let rmStarted = false;
function startReduceMotion() {
  if (rmStarted) return;
  rmStarted = true;
  const set = (v: boolean) => {
    if (v === reduceMotion) return;
    reduceMotion = v;
    rmListeners.forEach((l) => l(v));
  };
  try {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => set(!!v)).catch(() => {});
    AccessibilityInfo.addEventListener("reduceMotionChanged", (v: boolean) => set(!!v));
  } catch {}
}

export function isReduceMotion() {
  startReduceMotion();
  return reduceMotion;
}

export function useReducedMotion() {
  startReduceMotion();
  const [v, setV] = useState(reduceMotion);
  useEffect(() => {
    setV(reduceMotion);
    rmListeners.add(setV);
    return () => { rmListeners.delete(setV); };
  }, []);
  return v;
}

// Props that hide decorative views from screen readers on iOS, Android and web.
const decorative = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

// ─── Press3D ─────────────────────────────────────────────────────────────────
// The chunky Duolingo-style press: a face sits on a darker edge, and pressing
// pushes the face down onto the edge. Used by buttons, answer choices and
// skill bubbles so everything tappable feels the same.

export function Press3D({
  children, onPress, disabled, edge, face, style, depth = 4, radius: r = radius.button, sound = true,
  accessibilityLabel, accessibilityRole = "button", accessibilityState, haptic = true, testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  edge: string;
  face: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  depth?: number;
  radius?: number;
  sound?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "radio";
  accessibilityState?: { selected?: boolean; disabled?: boolean };
  testID?: string;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.spring(y, { toValue: v, useNativeDriver: true, speed: 60, bounciness: v ? 0 : 10 }).start();
  return (
    <View style={[{ borderRadius: r, backgroundColor: edge, paddingBottom: depth }, style]}>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => {
          if (sound) play("tap");
          if (haptic) buzz.press();
          onPress?.();
        }}
        onPressIn={() => to(depth)}
        onPressOut={() => to(0)}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, ...accessibilityState }}
        style={{ borderRadius: r }}
      >
        <Animated.View style={[{ borderRadius: r, transform: [{ translateY: y }] }, face]}>{children}</Animated.View>
      </Pressable>
    </View>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonKind = "primary" | "secondary" | "success" | "danger" | "special" | "ghost";

const KIND: Record<ButtonKind, { bg: string; edge: string; fg: string; border?: string }> = {
  primary: { bg: color.azure, edge: color.azureDark, fg: "#fff" },
  secondary: { bg: "#fff", edge: color.line, fg: color.azure, border: color.line },
  success: { bg: color.green, edge: color.greenDark, fg: "#fff" },
  danger: { bg: color.coral, edge: "#E5605B", fg: "#fff" },
  special: { bg: color.yellow, edge: color.yellowDark, fg: color.text },
  ghost: { bg: "transparent", edge: "transparent", fg: color.azure },
};

export function Button({
  title, onPress, kind = "primary", disabled, style, small, testID,
}: { title: string; onPress?: () => void; kind?: ButtonKind; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean; testID?: string }) {
  const k = KIND[kind];
  const ghost = kind === "ghost";
  return (
    <Press3D
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      depth={ghost ? 0 : 4}
      edge={disabled ? "#CFCFCF" : k.edge}
      style={style}
      accessibilityLabel={title}
      face={[
        s.btn,
        small && s.btnSmall,
        {
          backgroundColor: disabled ? color.disabled : k.bg,
          borderColor: disabled ? color.disabled : k.border || k.bg,
          borderWidth: ghost ? 0 : 2,
        },
      ]}
    >
      <Text style={[s.btnText, small && { fontSize: 14 }, { color: disabled ? color.disabledText : k.fg }]}>{title}</Text>
    </Press3D>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────
// Springs forward, with a glossy highlight strip and a little swell each time
// it grows.

export function ProgressBar({ value, fill = color.yellow, height = 14, glow = false }: { value: number; fill?: string; height?: number; glow?: boolean }) {
  const w = useRef(new Animated.Value(value)).current;
  const swell = useRef(new Animated.Value(1)).current;
  const last = useRef(value);
  useEffect(() => {
    const grew = value > last.current;
    last.current = value;
    Animated.spring(w, { toValue: value, useNativeDriver: false, speed: 10, bounciness: 6 }).start();
    if (grew) {
      Animated.sequence([
        Animated.timing(swell, { toValue: 1.25, duration: 120, useNativeDriver: false }),
        Animated.spring(swell, { toValue: 1, useNativeDriver: false, speed: 14, bounciness: 12 }),
      ]).start();
    }
  }, [value, w, swell]);
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
  // No overflow clipping on the track, so the swell and the glow can spill out.
  const glowStyle: ViewStyle | null = glow
    ? Platform.OS === "web"
      ? ({ boxShadow: `0 0 10px 2px ${fill}99` } as ViewStyle)
      : { shadowColor: fill, shadowOpacity: 0.7, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 }
    : null;
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[{
          height,
          width,
          minWidth: value > 0 ? height : 0,
          borderRadius: height / 2,
          backgroundColor: fill,
          transform: [{ scaleY: swell }],
        }, glowStyle]}
      >
        <View style={[s.barShine, { top: height * 0.22, height: Math.max(3, height * 0.22), borderRadius: height }]} />
      </Animated.View>
    </View>
  );
}

// ─── Entrances ───────────────────────────────────────────────────────────────

// Fade + scale from 0.9 to 1 (the guide's "pop-in").
export function PopIn({ children, delay = 0, style, from = 0.9 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Slides in from below with a spring (feedback banners, bottom sheets).
export function SlideUp({ children, style, distance = 120, delay = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; distance?: number; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7, delay }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[style, {
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// Content that slides in from the right whenever `id` changes (new question).
export function SlideIn({ id, children, style }: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
  }, [id, v]);
  return (
    <Animated.View
      style={[style, {
        opacity: v,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// Children appear one after another.
export function Stagger({ children, step = 70, delay = 0, style }: { children: React.ReactNode; step?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {React.Children.toArray(children).map((c, i) => (
        <Rise key={i} delay={delay + i * step}>{c}</Rise>
      ))}
    </View>
  );
}

export function Rise({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8, delay }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// ─── Attention ───────────────────────────────────────────────────────────────

export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const shake = () =>
    !isReduceMotion() && Animated.sequence([10, -10, 8, -8, 4, 0].map((v) => Animated.timing(x, { toValue: v, duration: 55, useNativeDriver: true }))).start();
  return { style: { transform: [{ translateX: x }] }, shake };
}

// A one-shot pop (scale up and settle) every time `trigger` changes.
// A boolean trigger only pops on entering true (not when it turns false).
export function usePop(trigger: unknown, amount = 1.2) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (trigger === false || isReduceMotion()) return;
    v.setValue(amount);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 14 }).start();
  }, [trigger, v, amount]);
  return { transform: [{ scale: v }] };
}

// Gentle breathing scale + an expanding ring, for "start here".
export function Pulse({ children, active = true, ring = color.azure, size = 76, style }: { children: React.ReactNode; active?: boolean; ring?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const on = active && !still;
  useEffect(() => {
    if (!on) return;
    // A sequence (not a lone timing) so the loop repeats on web too: a single
    // native-driver timing hands the repeat to the native module, which the
    // web fallback ignores, and the ring would play once and freeze.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); v.setValue(0); };
  }, [on, v]);
  return (
    <View style={[{ alignItems: "center", justifyContent: "center" }, style]}>
      {on && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 4,
            borderColor: ring,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
          }}
        />
      )}
      <Animated.View style={on ? { transform: [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.05, 1] }) }] } : undefined}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

// Counts up from `from` to `value`.
export function CountUp({ value, from = 0, duration = 900, delay = 0, style, prefix = "", suffix = "" }: { value: number; from?: number; duration?: number; delay?: number; style?: StyleProp<TextStyle>; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(from);
  useEffect(() => {
    const v = new Animated.Value(from);
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    Animated.timing(v, { toValue: value, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [value, from, duration, delay]);
  return <Text style={style}>{prefix}{shown}{suffix}</Text>;
}

// A label that floats up and fades ("+10 XP").
export function FloatUp({ text, color: c = color.yellowDark, style }: { text: string; color?: string; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[style, {
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, -36] }) },
          { scale: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1.15, 1] }) },
        ],
      }]}
    >
      <Text style={{ fontFamily: font.black, fontSize: 18, color: c }}>{text}</Text>
    </Animated.View>
  );
}

// ─── Particles ───────────────────────────────────────────────────────────────

const BURST = ["#58A6FF", "#FFD66D", "#64BC5D", "#FF7E79", "#B9A7F1"];

// Sparks flying out from the center. Render with a fresh `key` to replay.
export function Burst({ count = 12, radius: R = 70, colors = BURST, size = 8, style }: { count?: number; radius?: number; colors?: string[]; size?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  const parts = useMemo(
    () => Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
      const d = R * (0.7 + ((i * 37) % 30) / 100);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, c: colors[i % colors.length], star: i % 3 === 0 };
    }),
    [count, R, colors],
  );
  const still = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  if (still) return null;
  return (
    <View {...decorative} pointerEvents="none" style={[{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0 }, style]}>
      {parts.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: -size / 2,
            top: -size / 2,
            opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
              { scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1.2, 0.6] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.star ? 180 : 90}deg`] }) },
            ],
          }}
        >
          {p.star ? (
            <Text style={{ fontSize: size * 2, lineHeight: size * 2.2, color: p.c }}>★</Text>
          ) : (
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: p.c }} />
          )}
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Socrates ────────────────────────────────────────────────────────────────
// One illustration, many moods: he floats, blinks, hops when you're right,
// droops when you're wrong, sways while thinking and bobs while talking.

export type Mood = "idle" | "happy" | "cheer" | "sad" | "think" | "talk";

// Eyelids over the eye whites in the 1024px source image (center x, center y,
// width, height). The whites measure about 93x111 and 100x112; the lids are
// larger so the anti-aliased rim of the whites falls under them at small sizes.
const EYES = [
  [391, 279, 112, 134],
  [563, 286, 116, 136],
] as const;
// Sampled from the face around the eyes.
const SKIN = "#FDB16B";
const LASH = "#7A4A2A";
const SAD_LID = 0.45;
const px = (n: number) => PixelRatio.roundToNearestPixel(n);

export function Mascot({ size = 96, float = true, mood = "idle", moodKey }: { size?: number; float?: boolean; mood?: Mood; moodKey?: unknown }) {
  const bob = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const sx = useRef(new Animated.Value(1)).current;
  const sy = useRef(new Animated.Value(1)).current;
  const lid = useRef(new Animated.Value(0)).current;
  // Where the lid rests between blinks (half-closed while sad).
  const restLid = useRef(0);
  const still = useReducedMotion();

  // Idle float.
  useEffect(() => {
    if (!float || still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); bob.setValue(0); };
  }, [bob, float, still]);

  // Blinks every few seconds (a double blink now and then).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let alive = true;
    const blink = (n: number) =>
      Animated.sequence(
        Array.from({ length: n }, () => [
          Animated.timing(lid, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(lid, { toValue: restLid.current, duration: 110, useNativeDriver: true }),
        ]).flat(),
      ).start();
    const schedule = (i: number) => {
      t = setTimeout(() => {
        if (!alive) return;
        blink(i % 4 === 3 ? 2 : 1);
        schedule(i + 1);
      }, 2400 + ((i * 1373) % 2600));
    };
    schedule(0);
    return () => { alive = false; clearTimeout(t); };
  }, [lid]);

  // Reactions.
  useEffect(() => {
    const spring = (v: Animated.Value, to: number, o: Partial<Animated.SpringAnimationConfig> = {}) =>
      Animated.spring(v, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 10, ...o });
    const tim = (v: Animated.Value, to: number, d: number) => Animated.timing(v, { toValue: to, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const squash = () => Animated.parallel([tim(sy, 0.86, 90), tim(sx, 1.1, 90)]);
    const stretchUp = (h: number) => Animated.parallel([tim(y, -h, 180), tim(sy, 1.08, 140), tim(sx, 0.94, 140)]);
    const land = () => Animated.parallel([spring(y, 0, { bounciness: 4 }), Animated.sequence([Animated.parallel([tim(sy, 0.9, 80), tim(sx, 1.08, 80)]), Animated.parallel([spring(sy, 1), spring(sx, 1)])])]);
    const wiggle = (a: number) => Animated.sequence([tim(rot, a, 90), tim(rot, -a, 120), tim(rot, a * 0.6, 110), spring(rot, 0)]);

    let anim: Animated.CompositeAnimation | null = null;
    let loop: Animated.CompositeAnimation | null = null;
    const h = size * 0.16;
    restLid.current = mood === "sad" ? SAD_LID : 0;
    if (still) {
      // No hops, sways or bobs; keep only the droopy lids for "sad".
      anim = Animated.parallel([spring(y, 0), spring(rot, 0), spring(sx, 1), spring(sy, 1), tim(lid, restLid.current, 150)]);
    } else if (mood === "happy") {
      anim = Animated.sequence([squash(), stretchUp(h), land(), wiggle(6)]);
    } else if (mood === "cheer") {
      anim = Animated.sequence([squash(), stretchUp(h * 1.4), land(), squash(), stretchUp(h), land(), wiggle(8)]);
    } else if (mood === "sad") {
      anim = Animated.parallel([spring(y, size * 0.05), spring(rot, -5), spring(sy, 0.95), spring(sx, 1.02), tim(lid, SAD_LID, 200)]);
    } else if (mood === "think") {
      loop = Animated.loop(Animated.sequence([tim(rot, 4, 700), tim(rot, -4, 1400), tim(rot, 0, 700)]));
    } else if (mood === "talk") {
      loop = Animated.loop(Animated.sequence([tim(y, -3, 140), tim(y, 0, 160), tim(sy, 1.03, 120), tim(sy, 1, 140)]));
    } else {
      anim = Animated.parallel([spring(y, 0), spring(rot, 0), spring(sx, 1), spring(sy, 1), tim(lid, 0, 150)]);
    }
    anim?.start();
    loop?.start();
    return () => {
      anim?.stop();
      loop?.stop();
      if (mood === "sad") { restLid.current = 0; lid.setValue(0); }
    };
  }, [mood, moodKey, size, y, rot, sx, sy, lid, still]);

  // Squash and stretch from the feet, not the middle.
  const footY = Animated.add(Animated.add(y, bob), Animated.multiply(Animated.subtract(1, sy), size / 2));
  const k = size / 1024;
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        transform: [
          { translateY: footY },
          { rotate: rot.interpolate({ inputRange: [-30, 30], outputRange: ["-30deg", "30deg"] }) },
          { scaleX: sx },
          { scaleY: sy },
        ],
      }}
    >
      <Image source={mascot} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Socrates" />
      {EYES.map(([cx, cy, w, h], i) => {
        const box = { position: "absolute" as const, left: px((cx - w / 2) * k), top: px((cy - h / 2) * k), width: px(w * k), height: px(h * k), borderRadius: px(w * k) / 2 };
        return (
          <React.Fragment key={i}>
            <Animated.View
              pointerEvents="none"
              style={{
                ...box,
                backgroundColor: SKIN,
                opacity: lid.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { translateY: lid.interpolate({ inputRange: [0, 1], outputRange: [-box.height / 2, 0] }) },
                  { scaleY: lid },
                ],
              }}
            />
            {/* Lash line so a closed eye reads as shut, not as a blank face. */}
            <Animated.View
              pointerEvents="none"
              style={{
                ...box,
                borderBottomWidth: Math.max(1.2, 16 * k),
                borderColor: "transparent",
                borderBottomColor: LASH,
                opacity: lid.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0, 0, 1], extrapolate: "clamp" }),
              }}
            />
          </React.Fragment>
        );
      })}
    </Animated.View>
  );
}

// ─── Speech ──────────────────────────────────────────────────────────────────
// Bubble with a tail toward Socrates; text types itself out.

export function Speech({ text, tone = "plain", typewriter = true, tailSide = "left" }: { text: string; tone?: "plain" | "good" | "bad"; typewriter?: boolean; tailSide?: "left" | "top" }) {
  const bg = tone === "good" ? color.greenSoft : tone === "bad" ? color.coralSoft : "#fff";
  const border = tone === "good" ? "#BFE3C0" : tone === "bad" ? "#FFC9C6" : color.line;
  const [n, setN] = useState(typewriter ? 0 : text.length);
  const pop = usePop(text, 1.04);
  useEffect(() => {
    if (!typewriter) { setN(text.length); return; }
    setN(0);
    let i = 0;
    const step = Math.max(1, Math.round(text.length / 40));
    const id = setInterval(() => {
      i += step;
      setN(Math.min(i, text.length));
      if (i >= text.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [text, typewriter]);
  const top = tailSide === "top";
  const web = Platform.OS === "web";
  return (
    <Animated.View style={[top ? { flexShrink: 1, alignItems: "center" } : { flexShrink: 1, flexDirection: "row", alignItems: "center" }, pop]}>
      {top ? (
        <>
          <View {...decorative} style={[s.tailTop, { borderBottomColor: border }]} />
          <View {...decorative} style={[s.tailTopInner, { borderBottomColor: bg }]} />
        </>
      ) : (
        <>
          <View {...decorative} style={[s.tail, { borderRightColor: border }]} />
          <View {...decorative} style={[s.tailInner, { borderRightColor: bg }]} />
        </>
      )}
      <View
        style={[s.speech, top ? { marginLeft: 0, marginTop: -2, flexShrink: 0 } : null, { backgroundColor: bg, borderColor: border }]}
        {...(web ? null : { accessible: true, accessibilityRole: "text" as const, accessibilityLabel: text, accessibilityLiveRegion: "polite" as const })}
      >
        {/* Full text reserves the space so the bubble doesn't grow while typing.
            On web it is also the one copy screen readers get, whole and once;
            on native the bubble itself carries the label. */}
        <Text style={[type.body, { fontFamily: font.semibold, opacity: 0 }]} {...(web ? { "aria-live": "polite" as const } : decorative)}>{text}</Text>
        <Text {...decorative} style={[type.body, s.speechText]}>{text.slice(0, n)}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Pill({ icon, text, tint, bump }: { icon: string; text: string; tint: string; bump?: unknown }) {
  const pop = usePop(bump ?? text, 1.25);
  return (
    <Animated.View style={[s.pill, { borderColor: tint }, pop]}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={[type.label, { color: tint, marginLeft: 4 }]}>{text}</Text>
    </Animated.View>
  );
}

export function MuteToggle() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMutedChange(setM), []);
  return (
    <Pressable
      onPress={() => setMuted(!m)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={m ? "Turn sound on" : "Turn sound off"}
      style={s.mute}
    >
      <Text style={{ fontSize: 18 }}>{m ? "🔇" : "🔊"}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { fontFamily: font.black, fontSize: 16, letterSpacing: 0.8, textTransform: "uppercase" },
  bar: { backgroundColor: "#E9EDF2", flex: 1 },
  barShine: { position: "absolute", left: 8, right: 8, backgroundColor: "rgba(255,255,255,0.4)" },
  speech: {
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: space(1.5),
    paddingHorizontal: space(2),
    flexShrink: 1,
    marginLeft: -2,
  },
  speechText: { fontFamily: font.semibold, position: "absolute", left: space(2), right: space(2), top: space(1.5) },
  tail: {
    width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderRightWidth: 12,
    borderTopColor: "transparent", borderBottomColor: "transparent",
  },
  tailInner: {
    position: "absolute", left: 3, width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 10,
    borderTopColor: "transparent", borderBottomColor: "transparent", zIndex: 1,
  },
  tailTop: {
    width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 12,
    borderLeftColor: "transparent", borderRightColor: "transparent",
  },
  tailTopInner: {
    position: "absolute", top: 3, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 10,
    borderLeftColor: "transparent", borderRightColor: "transparent", zIndex: 1,
  },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(3), ...shadow.md },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  mute: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
