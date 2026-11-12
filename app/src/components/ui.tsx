// Shared pieces. Everything here uses the tokens in theme.ts (docs/DESIGN.md):
// chunky pressable buttons and cards on white, sentence case, no pills or badges.
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, Easing, LayoutChangeEvent, Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle,
} from "react-native";
import { buzz, isMuted, onMutedChange, play, setMuted } from "../motion/feedback";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { BORDER, color, EDGE, font, GUTTER, radius, scrim, shadow, space, tabular, type } from "../theme";
import { Icon, IconName } from "./icons";
import { Portal } from "./portal";

// ─── Reduced motion ──────────────────────────────────────────────────────────
// One shared subscription to the OS "reduce motion" setting. When it is on,
// movement becomes fades and Socrates holds a still frame.

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
export const decorative = {
  "aria-hidden": true,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

// ─── Press3D ─────────────────────────────────────────────────────────────────
// A face sitting on a darker edge; pressing pushes the face down onto the
// edge. Buttons are a filled face on a 4 px edge. Cards (answer choices) pass
// `border`: a 2 px border all round, sitting on 2 px of edge in the same
// color, so the bottom reads as one 4 px border that flattens when pressed.

export function Press3D({
  children, onPress, disabled, edge, face, style, depth = EDGE, radius: r = radius.button, sound = true, border,
  accessibilityLabel, accessibilityRole = "button", accessibilityState, haptic = true, testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  edge: string;
  face: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  depth?: number;
  border?: string;
  radius?: number;
  sound?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "radio";
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean };
  testID?: string;
}) {
  const y = useRef(new Animated.Value(0)).current;
  const to = (v: number) => Animated.spring(y, { toValue: v, useNativeDriver: Platform.OS !== "web", speed: 60, bounciness: v ? 0 : 8 }).start();
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
        // The web build only reads the aria form of a checked state.
        aria-checked={accessibilityState?.checked}
        style={{ borderRadius: r }}
      >
        <Animated.View style={[{ borderRadius: r, transform: [{ translateY: y }] }, border != null && { borderWidth: BORDER, borderColor: border }, face]}>{children}</Animated.View>
      </Pressable>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────
// One primary style: blue, a white label big enough to count as large text,
// sitting on a 4 px darker edge that it presses down onto. In the lesson's
// result panel the button takes the answer's color (`tone`). Every other
// action is a text button.

const BUTTON_TONES = {
  blue: { face: color.blue, edge: color.blueDark },
  // goodDark, not good: white on the brighter green is too faint to read.
  good: { face: color.goodDark, edge: color.goodInk },
  bad: { face: color.bad, edge: color.badDark },
};

export function Button({
  title, onPress, disabled, style, testID, icon, accessibilityLabel, tone = "blue",
}: {
  title: string; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string; icon?: IconName; accessibilityLabel?: string;
  tone?: keyof typeof BUTTON_TONES;
}) {
  const t = BUTTON_TONES[tone];
  // Disabled labels still carry state ("Check" before an answer, "Checking…"), so ink2: 4.8:1 on lock.
  const fg = disabled ? color.ink2 : color.white;
  return (
    <Press3D
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      edge={disabled ? color.lockDark : t.edge}
      style={style}
      accessibilityLabel={accessibilityLabel ?? title}
      face={[s.btn, { backgroundColor: disabled ? color.lock : t.face }]}
    >
      <Text style={[s.btnText, { color: fg }]} numberOfLines={2}>{title}</Text>
      {icon && <Icon name={icon} size={22} color={fg} strokeWidth={2.5} style={{ marginLeft: space(1) }} />}
    </Press3D>
  );
}

export function TextButton({
  title, onPress, tone = "blue", disabled, style, accessibilityLabel, icon, align = "center", testID, underline,
}: {
  title: string; onPress?: () => void; tone?: "blue" | "ink" | "soft" | "bad" | "good"; disabled?: boolean; style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string; icon?: IconName; align?: "center" | "left"; testID?: string; underline?: boolean;
}) {
  // ink2, not ink3: "Reported" and "Deleting…" are statuses the learner reads.
  const c = disabled ? color.ink2
    : tone === "blue" ? color.blueDark : tone === "bad" ? color.badInk : tone === "good" ? color.goodInk : tone === "soft" ? color.ink2 : color.ink;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [s.textBtn, align === "left" && { justifyContent: "flex-start" }, pressed && { backgroundColor: color.well, borderRadius: radius.small }, style]}
    >
      <Text style={[s.textBtnText, { color: c }, underline && s.underline]}>{title}</Text>
      {icon && <Icon name={icon} size={18} color={c} strokeWidth={2.5} style={{ marginLeft: 6 }} />}
    </Pressable>
  );
}

export const IconButton = React.forwardRef<React.ComponentRef<typeof View>, {
  name: IconName; onPress: () => void; label: string; size?: number; tone?: string; style?: StyleProp<ViewStyle>;
}>(function IconButton({ name, onPress, label, size = 24, tone = color.ink, style }, ref) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: color.well }, style]}
    >
      <Icon name={name} size={size} color={tone} strokeWidth={2.5} />
    </Pressable>
  );
});

// ─── ProgressBar ─────────────────────────────────────────────────────────────
// Thick and round, springs forward. Green in lessons and setup.

export function ProgressBar({ value, fill = color.good, height = 16, track = color.lock }: { value: number; fill?: string; height?: number; track?: string }) {
  const w = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.spring(w, { toValue: value, useNativeDriver: false, speed: 12, bounciness: 4 }).start();
  }, [value, w]);
  const width = w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" });
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, flex: 1, overflow: "hidden" }} {...decorative}>
      <Animated.View style={{ height, width, minWidth: value > 0 ? height : 0, borderRadius: height / 2, backgroundColor: fill }} />
    </View>
  );
}

// ─── Entrances ───────────────────────────────────────────────────────────────
// Springs with a small overshoot for arrivals. Under reduced motion they fade.

function useEntrance(delay: number, spring = true) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  useEffect(() => {
    const a = still || !spring
      ? Animated.timing(v, { toValue: 1, duration: 220, delay, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 14, bounciness: 6, delay });
    a.start();
    return () => a.stop();
  }, [v, delay, still, spring]);
  return { v, still };
}

export function PopIn({ children, delay = 0, style, from = 0.92 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const { v, still } = useEntrance(delay);
  return (
    <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: still ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function Rise({ children, delay = 0, style, distance = 14, onLayout }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; distance?: number; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { v, still } = useEntrance(delay);
  return (
    <Animated.View onLayout={onLayout} style={[style, { opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }), transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function SlideUp({ children, style, distance = 120, delay = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; distance?: number; delay?: number }) {
  return <Rise style={style} distance={distance} delay={delay}>{children}</Rise>;
}

// Content that slides in from the right whenever `id` changes (a new question).
export function SlideIn({ id, children, style }: { id: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  useEffect(() => {
    v.setValue(0);
    (still
      ? Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 16, bounciness: 3 })
    ).start();
  }, [id, v, still]);
  return (
    <Animated.View style={[style, { opacity: v, transform: still ? [] : [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Children appear one after another, 40 ms apart.
export function Stagger({ children, step = 40, delay = 0, style }: { children: React.ReactNode; step?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {React.Children.toArray(children).map((c, i) => (
        <Rise key={i} delay={delay + i * step}>{c}</Rise>
      ))}
    </View>
  );
}

// ─── Attention ───────────────────────────────────────────────────────────────

export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const shake = () =>
    !isReduceMotion() && Animated.sequence([9, -8, 6, -4, 2, 0].map((v) => Animated.timing(x, { toValue: v, duration: 50, useNativeDriver: Platform.OS !== "web" }))).start();
  return { style: { transform: [{ translateX: x }] }, shake };
}

// A one-shot pop (scale up and settle) every time `trigger` changes.
// A boolean trigger only pops on entering true.
export function usePop(trigger: unknown, amount = 1.15) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (trigger === false || isReduceMotion()) return;
    v.setValue(amount);
    Animated.spring(v, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 14, bounciness: 12 }).start();
  }, [trigger, v, amount]);
  return { transform: [{ scale: v }] };
}

// ─── Numbers ─────────────────────────────────────────────────────────────────

// Counts up from `from` to `value`, in tabular figures.
export function CountUp({ value, from = 0, duration = 800, delay = 0, style, prefix = "", suffix = "", format }: {
  value: number; from?: number; duration?: number; delay?: number; style?: StyleProp<TextStyle>; prefix?: string; suffix?: string; format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(isReduceMotion() ? value : from);
  useEffect(() => {
    if (isReduceMotion()) { setShown(value); return; }
    const v = new Animated.Value(from);
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    const a = Animated.timing(v, { toValue: value, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => { a.stop(); v.removeListener(id); };
  }, [value, from, duration, delay]);
  return <Text style={[tabular, style]}>{prefix}{format ? format(shown) : shown}{suffix}</Text>;
}

// A short label that floats up and fades ("+10 XP").
export function FloatUp({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[style, {
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, -28] }) }],
      }]}
    >
      {children}
    </Animated.View>
  );
}

// ─── Sheet ───────────────────────────────────────────────────────────────────
// A raised surface that slides up over a scrim. Escape and the scrim close it.

export function Sheet({
  children, onClose, label, style, maxHeight,
}: { children: React.ReactNode; onClose?: () => void; label: string; style?: StyleProp<ViewStyle>; maxHeight?: number | `${number}%` }) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    (still
      ? Animated.timing(v, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 16, bounciness: 4 })
    ).start();
  }, [v, still]);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => (ref.current as unknown as { focus?: () => void } | null)?.focus?.(), 40);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [onClose]);
  return (
    <Portal>
      <View style={[s.overlay, Platform.OS === "web" && ({ position: "fixed" } as unknown as ViewStyle)]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          ref={ref}
          role="dialog"
          aria-modal
          aria-label={label}
          accessibilityViewIsModal
          focusable={Platform.OS === "web"}
          style={[s.sheet, maxHeight != null && { maxHeight }, {
            transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [420, 0], extrapolateRight: "clamp" }) }],
            opacity: still ? v : 1,
          }, style]}
        >
          {children}
        </Animated.View>
      </View>
    </Portal>
  );
}

// ─── Loading and errors ──────────────────────────────────────────────────────

// A block in the shape of what is loading.
export function Bone({ w = "100%", h = 16, r = radius.small, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  return <View {...decorative} style={[{ width: w, height: h, borderRadius: r, backgroundColor: color.well }, style]} />;
}

// While a screen loads: its skeleton fades in gently, so quick loads don't flash.
export function Skeleton({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <Rise delay={120} distance={0} style={{ flex: 1 }}>
      <View accessible accessibilityLabel={label} aria-busy style={{ flex: 1 }}>
        {children}
      </View>
    </Rise>
  );
}

export function ErrorState({ message, onRetry, mood = "concerned" }: { message: string; onRetry?: () => void; mood?: SocratesMood }) {
  return (
    <View style={s.center}>
      <Socrates size={104} mood={mood} />
      <Text style={[type.socrates, { marginTop: space(2), maxWidth: 360 }]} accessibilityRole="alert">{message}</Text>
      {onRetry && <Button title="Try again" onPress={onRetry} style={{ marginTop: space(3), alignSelf: "stretch", maxWidth: 360 }} />}
    </View>
  );
}

// ─── Rows, toggles ───────────────────────────────────────────────────────────

export function Row({
  icon, iconTint = color.blueDark, title, detail, value, onPress, accessory = "chevron", disabled, accessibilityLabel, testID,
}: {
  icon?: IconName; iconTint?: string; title: string; detail?: string; value?: string; onPress?: () => void;
  accessory?: "chevron" | "none" | React.ReactNode; disabled?: boolean; accessibilityLabel?: string; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, detail, value].filter(Boolean).join(", ")}
      accessibilityState={{ disabled: disabled || !onPress }}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: color.well }]}
    >
      {/* The icon sits in a round blue wash, so a list of modes scans by shape. */}
      {icon && (
        <View style={[s.rowIcon, disabled && { backgroundColor: color.lock }]}>
          <Icon name={icon} color={disabled ? color.ink2 : iconTint} strokeWidth={2.25} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, disabled && { color: color.ink2 }]}>{title}</Text>
        {detail ? <Text style={[type.small, tabular, { marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[type.label, { color: color.ink2, fontFamily: font.bold, marginLeft: space(1) }, tabular]}>{value}</Text> : null}
      {accessory === "chevron" ? (
        onPress && !disabled ? <Icon name="chevron" size={20} color={color.ink2} strokeWidth={2.5} style={{ marginLeft: space(1) }} /> : null
      ) : accessory === "none" ? null : accessory}
    </Pressable>
  );
}

export function Toggle({ value, onChange, label, testID, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; testID?: string; disabled?: boolean }) {
  const v = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 20, bounciness: 6 }).start();
  }, [value, v]);
  return (
    <Pressable
      testID={testID}
      onPress={() => { buzz.tap(); onChange(!value); }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      hitSlop={8}
    >
      <Animated.View style={[s.track, { backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: [color.lockDark, color.good] }) }]}>
        <Animated.View style={[s.knob, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export function useMuted() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMutedChange(setM), []);
  return [m, setMuted] as const;
}

export function MuteToggle() {
  const [m, set] = useMuted();
  return <IconButton name={m ? "soundOff" : "soundOn"} label={m ? "Turn sound on" : "Turn sound off"} onPress={() => set(!m)} tone={color.ink2} />;
}

// The name, set in type rather than the old raster logo, so it sits in the palette.
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" aria-level={1} style={{ fontFamily: font.black, fontSize: size, lineHeight: size * 1.2, color: color.blueDark }}>
      testwise
    </Text>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

// A count with its mark, in its color: the streak in gold, XP in blue. Only
// shown once the learner has activity.
const STAT_TONES = {
  gold: { mark: color.goldDark, text: color.goldInk },
  blue: { mark: color.blue, text: color.blueDark },
};
export function Stat({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone: keyof typeof STAT_TONES }) {
  const pop = usePop(value, 1.2);
  const t = STAT_TONES[tone];
  return (
    <Animated.View style={[s.stat, pop]} accessible accessibilityLabel={`${value} ${label}`}>
      <Icon name={icon} size={22} color={t.mark} strokeWidth={2.5} />
      <Text style={[s.statText, tabular, { color: t.text }]}>{value}</Text>
    </Animated.View>
  );
}

const BTN_R = radius.button;

const s = StyleSheet.create({
  btn: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: space(2.5),
    borderRadius: BTN_R,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnText: { ...type.button, textAlign: "center", flexShrink: 1 },
  textBtn: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: space(1) },
  textBtnText: { fontFamily: font.extra, fontSize: 16, lineHeight: 21 },
  underline: { textDecorationLine: "underline" },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end", zIndex: 30 },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: GUTTER,
    paddingTop: space(3),
    paddingBottom: space(2.5),
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
    outlineStyle: "none",
    ...shadow.float,
  } as ViewStyle,
  center: { flex: 1, alignItems: "flex-start", justifyContent: "center", padding: GUTTER, maxWidth: 520, width: "100%", alignSelf: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space(1.5), paddingHorizontal: space(1), marginHorizontal: -space(1), borderRadius: radius.row },
  rowIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.blueWash, alignItems: "center", justifyContent: "center", marginRight: space(1.75) },
  rowTitle: { fontFamily: font.black, fontSize: 17, lineHeight: 23, color: color.ink },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.white },
  stat: { flexDirection: "row", alignItems: "center" },
  statText: { fontFamily: font.black, fontSize: 17, lineHeight: 22, marginLeft: 4 },
});
