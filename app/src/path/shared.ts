// Sizes and colors shared by the Learn path's pieces.
import { color } from "../theme";

// Nodes are 70 x 62 ovals on a 7 px edge, one per row, swinging left and right
// of the column's center (the prototype's zigzag, then its mirror). The swing
// runs on across units, so the path reads as one road.
export const NODE_W = 70;
export const NODE_H = 62;
export const NODE_EDGE = 7;
export const ROW = 86;
// Extra room above the current node for its "Start" bubble.
export const NEXT_ROOM = 40;
export const XS = [0, -64, -32, 40, 0, 64, 32, -40];
export const SOC = 96;

// The first section is blue, the second teal, by the section's place in the
// exam (a third section would wrap to blue until it has its own color).
export type Accent = { fill: string; edge: string; wash: string; ink: string };
const ACCENTS: Accent[] = [
  { fill: color.blue, edge: color.blueDark, wash: color.blueWash, ink: color.blueDark },
  { fill: color.teal, edge: color.tealDark, wash: color.tealWash, ink: color.tealDark },
];
export const accentFor = (sectionIndex: number) => ACCENTS[Math.max(0, sectionIndex) % ACCENTS.length];
