import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { color, font, radius, shadow, space, type } from "../theme";

export const mascot = require("../../assets/socratesmascotmain.png");
export const logo = require("../../assets/logo_blue.png");

type ButtonKind = "primary" | "secondary" | "success" | "danger" | "special" | "ghost";

const KIND: Record<ButtonKind, { bg: string; edge: string; fg: string; border?: string }> = {
  primary: { bg: color.azure, edge: color.azureDark, fg: "#fff" },
  secondary: { bg: "#fff", edge: color.line, fg: color.azure, border: color.azure },
  success: { bg: color.green, edge: color.greenDark, fg: "#fff" },
  danger: { bg: color.coral, edge: "#E5605B", fg: "#fff" },
  special: { bg: color.yellow, edge: color.yellowDark, fg: color.text },
  ghost: { bg: "transparent", edge: "transparent", fg: color.azure },
};

export function Button({
  title, onPress, kind = "primary", disabled, style, small,
}: { title: string; onPress?: () => void; kind?: ButtonKind; disabled?: boolean; style?: ViewStyle; small?: boolean }) {
  const k = KIND[kind];
  const scale = useRef(new Animated.Value(1)).current;
  const bounce = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => bounce(0.96)}
        onPressOut={() => bounce(1)}
        style={[
          s.btn,
          small && s.btnSmall,
          {
            backgroundColor: disabled ? color.disabled : k.bg,
            borderBottomColor: disabled ? color.disabled : k.edge,
            borderColor: disabled ? color.disabled : k.border || k.bg,
          },
          kind === "ghost" && { borderBottomWidth: 0, borderWidth: 0 },
        ]}
      >
        <Text style={[s.btnText, small && { fontSize: 14 }, { color: disabled ? color.disabledText : k.fg }]}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ProgressBar({ value, fill = color.yellow, height = 14 }: { value: number; fill?: string; height?: number }) {
  const w = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: value, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, w]);
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: fill,
          width: w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"], extrapolate: "clamp" }),
        }}
      />
    </View>
  );
}

// Fade + scale from 0.9 to 1 (the guide's "pop-in").
export function PopIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Socrates gently bobbing (the guide's "mascot float").
export function Mascot({ size = 96, float = true }: { size?: number; float?: boolean }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!float) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -4, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y, float]);
  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <Image source={mascot} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Socrates" />
    </Animated.View>
  );
}

export function Speech({ text, tone = "plain" }: { text: string; tone?: "plain" | "good" | "bad" }) {
  const bg = tone === "good" ? color.greenSoft : tone === "bad" ? color.coralSoft : "#fff";
  return (
    <View style={[s.speech, { backgroundColor: bg }]}>
      <Text style={[type.body, { fontFamily: font.semibold }]}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[] }) {
  return <View style={[s.card, style as ViewStyle]}>{children}</View>;
}

export function Pill({ icon, text, tint }: { icon: string; text: string; tint: string }) {
  return (
    <View style={[s.pill, { borderColor: tint }]}>
      <Text style={{ fontSize: 16 }}>{icon}</Text>
      <Text style={[type.label, { color: tint, marginLeft: 4 }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.button,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { fontFamily: font.bold, fontSize: 16, letterSpacing: 0.6, textTransform: "uppercase" },
  bar: { backgroundColor: "#EAEAEA", overflow: "hidden", flex: 1 },
  speech: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: color.line,
    paddingVertical: space(1.5),
    paddingHorizontal: space(2),
    flexShrink: 1,
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
});
