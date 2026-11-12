// One circle on the Learn path. Nodes are chunky ovals on a darker edge, like
// the primary button: open and current ones in the section's color, finished
// ones gold, locked ones grey. The mark says what the circle is: play for a
// lesson, redo for a review, a chest for the unit check, a flag at the end; a
// finished lesson gets a check, a locked one a lock. The current circle wears a
// ring in the section's wash and a "Start" bubble. Names, status and mastery
// live in the card a node opens.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { PathNode } from "../api";
import { Icon, IconName } from "../components/icons";
import { decorative, usePop } from "../components/ui";
import { BORDER, color, font } from "../theme";
import { Accent, NODE_EDGE, NODE_H, NODE_W } from "./shared";

const KIND_MARK: Record<PathNode["kind"], IconName> = { skill: "play", review: "redo", check: "chest", end: "flag" };

// Fades a value in when `on` turns true (instantly when it starts true).
function useFade(on: boolean) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : 0, duration: 260, useNativeDriver: Platform.OS !== "web" }).start();
  }, [on, v]);
  return v;
}

export function nodeLabel(n: PathNode) {
  const kind = n.kind === "skill" ? "Lesson" : n.kind === "review" ? "Review" : n.kind === "check" ? "Unit check" : "";
  const what = n.kind === "skill" || n.kind === "end" ? n.title : kind;
  const state = n.state === "done" ? "finished" : n.state === "current" ? "start here" : n.state === "locked" ? "locked" : "open";
  return `${what}, ${state}`;
}

export function NodeButton({ node, x, y, accent, ring, pop, selected, onPress }: {
  node: PathNode; x: number; y: number; accent: Accent; ring: boolean; pop: boolean; selected: boolean; onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const current = node.state === "current";
  return (
    <>
      {current && <StartBubble x={x} y={y} ink={accent.ink} on={ring} />}
      <Pressable
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={nodeLabel(node)}
        accessibilityState={{ expanded: selected }}
        testID={`node-${node.id}`}
        style={{ position: "absolute", left: "50%", marginLeft: x - NODE_W / 2, top: y - NODE_H / 2, width: NODE_W, height: NODE_H + NODE_EDGE }}
      >
        <NodeArt node={node} accent={accent} down={down} ring={current && ring} pop={pop} />
      </Pressable>
    </>
  );
}

export function NodeArt({ node, accent, down, ring, pop }: { node: PathNode; accent: Accent; down: boolean; ring: boolean; pop: boolean }) {
  const popStyle = usePop(pop, 1.18);
  const ringV = useFade(ring);
  const st = node.state;
  const look =
    st === "done" ? { face: color.gold, edge: color.goldDark }
    : st === "locked" ? { face: color.lock, edge: color.lockDark }
    : { face: accent.fill, edge: accent.edge };
  const markColor = st === "locked" ? color.ink2 : color.white;
  const name: IconName = st === "done" && node.kind === "skill" ? "check" : st === "locked" && node.kind === "skill" ? "lock" : KIND_MARK[node.kind];
  // The play triangle is nudged right: its visual center sits left of its box's.
  const mark = <Icon name={name} size={name === "play" ? 28 : 30} color={markColor} strokeWidth={name === "check" ? 3.5 : 3} style={name === "play" ? { marginLeft: 3 } : undefined} />;
  return (
    <Animated.View style={popStyle}>
      <Animated.View {...decorative} pointerEvents="none" style={[s.halo, { borderColor: accent.wash, opacity: ringV }]} />
      <View style={{ width: NODE_W, height: NODE_H + NODE_EDGE, borderRadius: NODE_W / 2, backgroundColor: look.edge }}>
        <View
          style={{
            width: NODE_W, height: NODE_H, borderRadius: NODE_W / 2, backgroundColor: look.face, alignItems: "center", justifyContent: "center",
            transform: [{ translateY: down ? NODE_EDGE - 2 : 0 }],
          }}
        >
          {mark}
        </View>
      </View>
    </Animated.View>
  );
}

// "Start" over the current circle: a small bubble whose tail points down at it.
function StartBubble({ x, y, ink, on }: { x: number; y: number; ink: string; on: boolean }) {
  const v = useFade(on);
  return (
    <Animated.View {...decorative} pointerEvents="none" style={[s.start, { left: "50%", marginLeft: x - 40, top: y - NODE_H / 2 - 52, opacity: v }]}>
      <View style={s.startTail} />
      <Text style={[s.startText, { color: ink }]}>Start</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  halo: { position: "absolute", left: -10, top: -10, width: NODE_W + 20, height: NODE_H + NODE_EDGE + 20, borderRadius: (NODE_W + 20) / 2, borderWidth: 6 },
  // The "Start" bubble: the speech-bubble look (white, 2 px line border), small.
  start: {
    position: "absolute", width: 80, height: 38, alignItems: "center", justifyContent: "center",
    backgroundColor: color.bg, borderWidth: BORDER, borderColor: color.line, borderRadius: 12,
  },
  startTail: {
    position: "absolute", bottom: -7 - BORDER, left: 40 - 7 - BORDER, width: 14, height: 14, backgroundColor: color.bg,
    borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: color.line, transform: [{ rotate: "45deg" }],
  },
  startText: { fontFamily: font.black, fontSize: 16, lineHeight: 21 },
});
