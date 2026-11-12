// One unit's circles in a zigzag down the middle of the column, with Socrates
// beside the current one, on the roomier side. The open card sits in this
// layer, right under its circle.
import React from "react";
import { LayoutChangeEvent, View } from "react-native";
import type { PathNode } from "../api";
import { decorative } from "../components/ui";
import { Socrates } from "../socrates/Socrates";
import { space } from "../theme";
import { NodeButton } from "./Node";
import { Accent, NEXT_ROOM, NODE_EDGE, NODE_H, NODE_W, ROW, SOC, XS } from "./shared";

export type Point = { x: number; y: number };

// Each node's center (x from the column's middle, y from the track's top);
// the current one gets extra room above for its bubble.
export function layoutTrack(nodes: PathNode[], offset: number) {
  let y = space(3);
  const pts: Point[] = nodes.map((n, i) => {
    if (n.state === "current") y += NEXT_ROOM;
    const p = { x: XS[(i + offset) % XS.length], y: y + NODE_H / 2 };
    y += ROW;
    return p;
  });
  return { pts, height: y - ROW + NODE_H + NODE_EDGE + space(1) };
}

export function Track({
  nodes, offset, accent, selectedId, ring, popIds, onOpen, onLayout, children,
}: {
  nodes: PathNode[];
  offset: number;
  accent: Accent;
  selectedId: string | null;
  // Whether the current circle shows its ring and bubble (they fade in after an unlock).
  ring: boolean;
  popIds: Set<string>;
  onOpen: (n: PathNode, at: Point) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  children?: React.ReactNode;
}) {
  const { pts, height } = layoutTrack(nodes, offset);
  const ci = nodes.findIndex((n) => n.state === "current");
  const soc = ci >= 0
    ? { x: pts[ci].x <= 0 ? pts[ci].x + NODE_W / 2 + space(3) : pts[ci].x - NODE_W / 2 - space(3) - SOC, y: pts[ci].y - SOC / 2 }
    : null;
  // The open card hangs below the track when its circle is near the unit's
  // end; lifting the track keeps the card above the room made under it.
  const raised = !!selectedId && nodes.some((n) => n.id === selectedId);
  return (
    <View style={[{ height }, raised && { zIndex: 1 }]} onLayout={onLayout}>
      {soc && (
        <View {...decorative} pointerEvents="none" style={{ position: "absolute", left: "50%", marginLeft: soc.x, top: soc.y }}>
          <Socrates size={SOC} mood="idle" />
        </View>
      )}
      {nodes.map((n, i) => (
        <NodeButton
          key={n.id}
          node={n}
          x={pts[i].x}
          y={pts[i].y}
          accent={accent}
          ring={ring}
          pop={popIds.has(n.id)}
          selected={n.id === selectedId}
          onPress={() => onOpen(n, pts[i])}
        />
      ))}
      {children}
    </View>
  );
}
