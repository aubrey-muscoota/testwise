// Socrates says something: the rig, and his words in Fraunces beside or under
// him, typed out at a human pace (quick through words, a beat on commas and
// full stops). Tap the words to skip to the end. His mouth moves while they
// type. No bubble box: just a small hand-drawn tail stroke pointing at him.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { noOrphan } from "../copy";
import { color, space, type } from "../theme";
import { decorative, useReducedMotion } from "./ui";

// Delay after character `c` (ms).
function beat(c: string, next: string | undefined) {
  if (c === "." || c === "?" || c === "!") return next === undefined || next === " " ? 300 : 24;
  if (c === "," || c === ";" || c === ":") return 150;
  if (c === "—" || c === "–") return 160;
  if (c === " ") return 26;
  return 16;
}

// Types `text` out; returns how much is shown and whether it is still going.
export function useTypewriter(text: string, enabled = true) {
  const still = useReducedMotion();
  const on = enabled && !still;
  const [n, setN] = useState(on ? 0 : text.length);
  const skip = useRef(() => {});
  useEffect(() => {
    if (!on) { setN(text.length); return; }
    setN(0);
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      i += 1;
      setN(i);
      if (i < text.length) t = setTimeout(step, beat(text[i - 1], text[i]));
    };
    t = setTimeout(step, 180);
    skip.current = () => { clearTimeout(t); i = text.length; setN(text.length); };
    return () => clearTimeout(t);
  }, [text, on]);
  return { shown: text.slice(0, n), typing: n < text.length, skip: () => skip.current() };
}

// The tail: one ink stroke curving back toward Socrates.
function Tail({ side, x, lift }: { side: "left" | "top"; x?: number; lift?: boolean }) {
  return (
    <View {...decorative} pointerEvents="none" style={side === "left" ? [st.tailLeft, lift && { top: 40 }] : [st.tailTop, x != null && { left: x }]}>
      <Svg width={22} height={18} viewBox="0 0 22 18">
        {side === "left" ? (
          <Path d="M21 3.5C14.6 4.4 8.6 6.6 2.2 12.8C7.9 10.6 13.6 10.8 20.6 12.4" stroke={color.inkSoft} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <Path d="M4 17.4C6.6 12.6 8.4 7.6 8.8 1.8C11 7.2 13.6 11.8 17.8 16.6" stroke={color.inkSoft} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </Svg>
    </View>
  );
}

export function SocratesSays({
  text: raw, typewriter = true, style, textStyle, onTyping, tail = "left", tailX, tailLift,
}: {
  text: string; typewriter?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
  onTyping?: (typing: boolean) => void; tail?: "left" | "top" | "none"; tailX?: number; tailLift?: boolean;
}) {
  // No single word alone on the last line.
  const text = noOrphan(raw);
  const { shown, typing, skip } = useTypewriter(text, typewriter);
  const cb = useRef(onTyping);
  cb.current = onTyping;
  useEffect(() => { cb.current?.(typing); }, [typing]);
  const web = Platform.OS === "web";
  return (
    <Pressable
      onPress={skip}
      disabled={!typing}
      accessibilityRole="text"
      accessibilityLabel={web ? undefined : text}
      style={[{ flexShrink: 1 }, style]}
    >
      <View>
        {tail !== "none" && <Tail side={tail} x={tailX} lift={tailLift} />}
        {/* The whole line reserves its space so nothing reflows while it types.
            On web it is also the copy screen readers get, whole and once. */}
        <Text style={[type.socrates, textStyle, st.wrap, { opacity: 0 }]} {...(web ? { "aria-live": "polite" as const } : decorative)}>{text}</Text>
        <Text {...decorative} style={[type.socrates, textStyle, st.wrap, st.typed]}>{shown}</Text>
      </View>
    </Pressable>
  );
}

// The rig plus his line. `layout="beside"` puts the words to his right.
export function SocratesLine({
  text, mood = "idle", moodKey, size = 72, layout = "beside", typewriter = true, style, textStyle, talkingOverride,
}: {
  text: string; mood?: SocratesMood; moodKey?: unknown; size?: number; layout?: "beside" | "under";
  typewriter?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>; talkingOverride?: boolean;
}) {
  const [typing, setTyping] = useState(typewriter);
  const beside = layout === "beside";
  return (
    <View style={[beside ? st.beside : st.under, style]}>
      <Socrates size={size} mood={mood} moodKey={moodKey} talking={talkingOverride ?? typing} lookAt={typing ? (beside ? "bubble" : "user") : undefined} />
      <SocratesSays
        text={text}
        typewriter={typewriter}
        onTyping={setTyping}
        tail={beside ? "left" : "top"}
        tailX={beside ? undefined : Math.round(size * 0.4)}
        tailLift={mood === "celebrate"}
        textStyle={textStyle}
        style={beside ? { flex: 1, marginLeft: space(2), paddingTop: Math.max(0, size * 0.12) } : { marginTop: space(2), alignSelf: "stretch" }}
      />
    </View>
  );
}

const st = StyleSheet.create({
  beside: { flexDirection: "row", alignItems: "flex-start" },
  under: { alignItems: "flex-start" },
  typed: { position: "absolute", left: 0, right: 0, top: 0 },
  // Both layers wrap the same way, so the typed text never reflows.
  wrap: (Platform.OS === "web" ? { textWrap: "pretty" } : {}) as TextStyle,
  // The tail sits closer to him than to the words, with air before the first glyph.
  tailLeft: { position: "absolute", left: -30, top: 9 },
  tailTop: { position: "absolute", left: 40, top: -19 },
});
