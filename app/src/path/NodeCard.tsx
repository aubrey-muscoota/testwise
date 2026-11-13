// The card a circle opens, right under it: what it is, how far along the
// learner is, and one button. A locked circle says what opens it instead.
//
// The prototype's card is a blue face with white 15 px text, which is under
// the 19 px needed for white on blue (3.9:1). This one takes the speech-bubble
// look instead (white, 2 px line border, a tail pointing up at its circle),
// so the text is ink and the one blue thing is the button.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, LayoutChangeEvent, Platform, StyleSheet, Text, View } from "react-native";
import { getExam, type PathNode, type PracticeMode } from "../api";
import { Button, ProgressBar, useReducedMotion } from "../components/ui";
import { noOrphan } from "../copy";
import { BORDER, color, font, space, tabular, type } from "../theme";
import { NODE_EDGE, NODE_H } from "./shared";
import type { Point } from "./Track";

const MODE_VERB: Partial<Record<PracticeMode, string>> = {
  weak: "Practice weak spots",
  mixed: "Start mixed practice",
  timed: "Start timed set",
  mistakes: "Fix my mistakes",
  review: "Start review",
};

export function startLabel(n: PathNode) {
  if (n.state === "done") return "Practice again";
  if (n.kind === "skill") return "Start lesson";
  if (n.kind === "review") return "Start review";
  if (n.kind === "check") return "Start unit check";
  const mode = (n.start?.body as { mode?: PracticeMode } | undefined)?.mode;
  return (mode && MODE_VERB[mode]) ?? "Start review";
}

// A skill's name on the publisher's side, so a learner can match it to the
// test's own materials: "College Board calls it Boundaries". Only when it
// differs from the name on the card.
export function officialLine(n: PathNode) {
  if (n.kind !== "skill" || !n.official_name || n.official_name === n.title) return null;
  const publisher = getExam()?.publisher?.name;
  return publisher ? `${publisher} calls it ${n.official_name}` : `Official name: ${n.official_name}`;
}

// Where the card sits in its track: under the circle, across the column.
// Clear of the current circle's ring (10 px past its edge) and the tail.
export const cardTop = (at: Point) => at.y + NODE_H / 2 + NODE_EDGE + space(3);

export function NodeCard({ node, at, onStart, onLayout }: {
  node: PathNode; at: Point; onStart: () => void; onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }).start();
    // Focus moves into the card, so a keyboard or screen reader lands on it.
    const t = setTimeout(() => (ref.current as unknown as { focus?: () => void } | null)?.focus?.(), 30);
    return () => clearTimeout(t);
  }, [v]);
  const locked = node.state === "locked";
  const skill = node.kind === "skill" ? node : null;
  const showBar = !!skill && (skill.state === "done" || skill.mastery > 0);
  const official = officialLine(node);
  return (
    <Animated.View
      ref={ref}
      role="dialog"
      aria-label={node.title}
      focusable={Platform.OS === "web"}
      onLayout={onLayout}
      testID="node-card"
      style={[s.card, { top: cardTop(at), opacity: v, transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}
    >
      <View style={[s.tail, { left: "50%", marginLeft: at.x - 9 }]} />
      <Text style={s.title} accessibilityRole="header">{node.title}</Text>
      {official && <Text style={[type.small, s.official]}>{official}</Text>}
      {showBar && (
        <View style={s.bar} accessibilityLabel={`${skill!.mastery}% mastered`}>
          <ProgressBar value={skill!.mastery / 100} fill={skill!.state === "done" && skill!.mastery >= 80 ? color.gold : color.good} />
          <Text style={[type.label, tabular, s.pct]}>{skill!.mastery}%</Text>
        </View>
      )}
      <Text style={[type.body, { color: color.ink2, marginTop: space(0.75) }]}>{noOrphan(locked && node.locked_reason ? `${node.locked_reason}.` : node.why)}</Text>
      {!locked && node.start && (
        <Button title={startLabel(node)} onPress={onStart} style={{ marginTop: space(2) }} testID="node-start" />
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    position: "absolute", left: 0, right: 0, zIndex: 20,
    backgroundColor: color.bg, borderWidth: BORDER, borderColor: color.line, borderRadius: 18,
    paddingHorizontal: space(2) - BORDER, paddingTop: space(2) - BORDER, paddingBottom: space(2) - BORDER,
    outlineStyle: "none",
  } as object,
  // The tail: a small square turned 45°, its two outer edges bordered, poking up at the circle.
  tail: {
    position: "absolute", top: -9 - BORDER, width: 16, height: 16, backgroundColor: color.bg,
    borderLeftWidth: BORDER, borderTopWidth: BORDER, borderColor: color.line, transform: [{ rotate: "45deg" }], borderTopLeftRadius: 3,
  },
  title: { fontFamily: font.black, fontSize: 19, lineHeight: 24, color: color.ink },
  official: { marginTop: space(0.25) },
  bar: { flexDirection: "row", alignItems: "center", marginTop: space(1.25) },
  pct: { marginLeft: space(1.5), minWidth: 44, textAlign: "right" },
});
