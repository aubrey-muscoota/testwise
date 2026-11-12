// Socrates says something: the rig, and his words in a speech bubble beside
// or under him (white, a 2 px line border, a tail pointing at him, no shadow),
// typed out at a human pace (quick through words, a beat on commas and full
// stops). Tap the words to skip to the end. His mouth moves while they type.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { noOrphan } from "../copy";
import { BORDER, color, radius, space, type } from "../theme";
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

// The tail: a square turned 45 degrees, bordered on the two sides that face
// Socrates, overlapping the bubble's border so the two read as one outline.
function Tail({ side, x }: { side: "left" | "top"; x?: number | "center" }) {
  return (
    <View
      {...decorative}
      pointerEvents="none"
      style={side === "left" ? st.tailLeft : [st.tailTop, x === "center" ? { left: "50%", marginLeft: -TAIL / 2 } : x != null && { left: x }]}
    />
  );
}

export function SocratesSays({
  text: raw, typewriter = true, style, textStyle, onTyping, tail = "left", tailX,
}: {
  text: string; typewriter?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
  // "none": the words without a bubble, for places that already frame them
  // (the result panel, the tutor chat).
  // tailX "center": the tail points up from the middle, for a bubble centered under him.
  onTyping?: (typing: boolean) => void; tail?: "left" | "top" | "none"; tailX?: number | "center";
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
      <View style={tail !== "none" && st.bubble}>
        {tail !== "none" && <Tail side={tail} x={tailX} />}
        {/* The whole line reserves its space so nothing reflows while it types.
            On web it is also the copy screen readers get, whole and once. */}
        <View>
          <Text style={[type.socrates, textStyle, st.wrap, { opacity: 0 }]} {...(web ? { "aria-live": "polite" as const } : decorative)}>{text}</Text>
          <Text {...decorative} style={[type.socrates, textStyle, st.wrap, st.typed]}>{shown}</Text>
        </View>
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
        tailX={beside ? undefined : Math.max(12, Math.round(size * 0.4) - 7)}
        textStyle={textStyle}
        style={beside ? { flex: 1, marginLeft: space(1.75) } : { marginTop: space(2), alignSelf: "stretch" }}
      />
    </View>
  );
}

const TAIL = 14;

const st = StyleSheet.create({
  // Beside: the bubble centers on him, so the tail points at his middle.
  beside: { flexDirection: "row", alignItems: "center" },
  under: { alignItems: "flex-start" },
  bubble: {
    backgroundColor: color.bg,
    borderWidth: BORDER,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: space(1.25),
    paddingHorizontal: space(1.75),
    alignSelf: "flex-start",
  },
  typed: { position: "absolute", left: 0, right: 0, top: 0 },
  // Both layers wrap the same way, so the typed text never reflows.
  wrap: (Platform.OS === "web" ? { textWrap: "pretty" } : {}) as TextStyle,
  tailLeft: {
    position: "absolute", left: -TAIL / 2 - BORDER, top: "50%", marginTop: -TAIL / 2, width: TAIL, height: TAIL,
    backgroundColor: color.bg, borderLeftWidth: BORDER, borderBottomWidth: BORDER, borderColor: color.line, transform: [{ rotate: "45deg" }],
  },
  tailTop: {
    position: "absolute", top: -TAIL / 2 - BORDER, left: 24, width: TAIL, height: TAIL,
    backgroundColor: color.bg, borderLeftWidth: BORDER, borderTopWidth: BORDER, borderColor: color.line, transform: [{ rotate: "45deg" }],
  },
});
