// Line icons, one family: 24 px grid, 1.75 px stroke, round caps and joins.
// Drawn by hand with small irregularities on purpose (lines a touch off-axis,
// curves not quite symmetric), so they sit with Socrates and the inked path
// instead of looking like a stock set. No emoji anywhere in the interface.
import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { color } from "../theme";

type Shape = (c: string) => React.ReactNode;

const P = (d: string) => (c: string) => <Path d={d} stroke={c} fill="none" />;

const ICONS = {
  // Sunrise over a line: today.
  today: (c: string) => (
    <>
      <Path d="M3.2 17.6L20.8 17.3" stroke={c} fill="none" />
      <Path d="M7.4 17.4C7.5 14.8 9.5 12.8 12.1 12.8C14.6 12.8 16.6 14.9 16.6 17.4" stroke={c} fill="none" />
      <Path d="M12 5.9V8.7M5.2 10.3L6.9 11.9M18.9 10.1L17.2 11.8M7.4 20.7H16.8" stroke={c} fill="none" />
    </>
  ),
  // A pencil: practice.
  practice: P("M4.3 19.7L5.1 15.7L15.7 5C16.5 4.2 17.6 4.2 18.4 5L19.1 5.7C19.9 6.5 19.9 7.6 19.1 8.4L8.4 19L4.3 19.7ZM13.8 6.9L17.1 10.2"),
  // A winding path between two stops.
  path: (c: string) => (
    <>
      <Path d="M6.1 18.3C6.4 14.6 17.7 15.6 17.9 11.6C18.1 7.9 9.4 9.2 8.8 6.2" stroke={c} fill="none" />
      <Circle cx={6} cy={20.2} r={1.7} stroke={c} fill="none" />
      <Circle cx={8.5} cy={4.2} r={1.7} stroke={c} fill="none" />
    </>
  ),
  me: (c: string) => (
    <>
      <Circle cx={12} cy={8.3} r={3.7} stroke={c} fill="none" />
      <Path d="M4.8 20.1C5.4 16 8.3 13.9 12 13.9C15.8 13.9 18.6 16.1 19.2 20.2" stroke={c} fill="none" />
    </>
  ),
  clock: (c: string) => (
    <>
      <Circle cx={12} cy={12.4} r={8.3} stroke={c} fill="none" />
      <Path d="M12 7.9V12.6L15.1 14.4" stroke={c} fill="none" />
    </>
  ),
  check: P("M5 12.9L9.6 17.2L19.1 7.1"),
  close: P("M6.2 6L18 17.9M17.8 6.2L6 18"),
  back: P("M14.8 5.4L8.2 12L14.9 18.6"),
  chevron: P("M9.3 5.5L15.8 12.1L9.2 18.5"),
  arrow: P("M4.5 12.2H19M13.6 6.6L19.3 12.2L13.5 17.7"),
  send: P("M12 19.2V5.5M6.3 11L12 5.3L17.7 11"),
  plus: P("M12 5.2V18.8M5.2 12.1H18.8"),
  minus: P("M5.2 12.1H18.8"),
  soundOn: (c: string) => (
    <>
      <Path d="M4 9.4H7.6L12.3 5.3V18.8L7.6 14.6H4V9.4Z" stroke={c} fill="none" />
      <Path d="M15.6 9.3C16.8 11 16.8 13.1 15.6 14.8M18.2 6.8C20.9 9.9 20.9 14.2 18.3 17.3" stroke={c} fill="none" />
    </>
  ),
  soundOff: (c: string) => (
    <>
      <Path d="M4 9.4H7.6L12.3 5.3V18.8L7.6 14.6H4V9.4Z" stroke={c} fill="none" />
      <Path d="M16 9.6L20.8 14.4M20.8 9.6L16 14.4" stroke={c} fill="none" />
    </>
  ),
  // Days in a row: a calendar page with today ticked off.
  streak: (c: string) => (
    <>
      <Rect x={4} y={5.6} width={16} height={14.6} rx={2.6} stroke={c} fill="none" />
      <Path d="M8.3 3.6V7.1M15.7 3.7V7.1M8.6 13.9L11 16.2L15.6 11.2" stroke={c} fill="none" />
    </>
  ),
  // XP: a small stacked block.
  xp: P("M12 3.9L19 8V16L12 20.1L5 16V8L12 3.9ZM5.2 8.1L12 12.2L18.8 8.1M12 12.2V19.9"),
  calendar: (c: string) => (
    <>
      <Rect x={4} y={5.6} width={16} height={14.6} rx={2.6} stroke={c} fill="none" />
      <Path d="M4.2 10.1H19.8M8.3 3.6V7.1M15.7 3.7V7.1" stroke={c} fill="none" />
    </>
  ),
  target: (c: string) => (
    <>
      <Circle cx={12} cy={12} r={8.4} stroke={c} fill="none" />
      <Circle cx={12} cy={12} r={4.6} stroke={c} fill="none" />
      <Circle cx={12} cy={12} r={1.1} fill={c} stroke={c} />
    </>
  ),
  lock: (c: string) => (
    <>
      <Rect x={5.5} y={10.6} width={13} height={9.6} rx={2.2} stroke={c} fill="none" />
      <Path d="M8.4 10.5V8C8.4 5.8 10 4.2 12 4.2C14 4.2 15.6 5.8 15.6 8V10.5" stroke={c} fill="none" />
    </>
  ),
  // Centroid sits on 12, so it reads centered in a circle.
  play: P("M8.7 5.9L18.3 12L8.7 18.2V5.9Z"),
  // "New": a single dot. Filled, so it reads at small sizes.
  dot: (c: string) => <Circle cx={12} cy={12} r={3.4} fill={c} stroke={c} />,
  // Mistakes: try again.
  redo: P("M5.4 12.4C5.4 16.3 8.4 19.3 12.2 19.3C16 19.3 19 16.2 19 12.3C19 8.4 16 5.4 12.1 5.4C9.8 5.4 7.8 6.5 6.5 8.1M5.9 4.4L6.4 8.3L10.2 7.6"),
  // Mixed: crossing lines.
  shuffle: P("M4 7.6H7.4C11.1 7.6 12.4 16.4 16.6 16.4H19.8M4 16.4H7.4C9.2 16.4 10.3 14.6 11.2 12.7M12.9 11.1C13.8 9.2 14.8 7.6 16.6 7.6H19.8M17.5 5.2L19.9 7.6L17.5 10M17.5 14L19.9 16.4L17.5 18.8"),
  // One skill: an open book.
  book: P("M12 6.7C10 5.2 7.4 4.8 4 5.3V18.4C7.4 18 10 18.4 12 19.8C14 18.4 16.6 18 20 18.4V5.3C16.6 4.8 14 5.2 12 6.7ZM12 6.7V19.6"),
  // Socrates writes: a quill.
  quill: P("M19.6 4.4C13.1 4.9 8.2 9.7 6.9 16.3L5 19.7M6.9 16.3C12.6 15.8 16.9 11.6 19.6 4.4M9.6 12.8H13.5"),
  flag: P("M5.6 20.4V4.6M5.8 5.1C9.2 3.4 11.2 6.6 14.6 5.4C16 4.9 17.2 4.6 18.6 4.9V13.1C17.2 12.8 16 13.1 14.6 13.6C11.2 14.8 9.2 11.6 5.8 13.3"),
} satisfies Record<string, Shape>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name, size = 24, color: c = color.ink, strokeWidth = 1.75, style,
}: { name: IconName; size?: number; color?: string; strokeWidth?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      aria-hidden
      focusable={false}
      pointerEvents="none"
    >
      <G strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name](c)}
      </G>
    </Svg>
  );
}
