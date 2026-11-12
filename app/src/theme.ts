// Design tokens, from docs/DESIGN.md ("Pop, built around Socrates"). White
// pages, Socrates' ink for text, his toga cream for sunken wells, one blue for
// the thing to press, his orange (gold) for what's finished and the streak,
// green and red only for right and wrong. No other shades, no gradients.
// Text colors are picked to pass 4.5:1 on the backgrounds they sit on; the
// bright fills (blue, gold, good, bad, teal) only carry large text or icons.
import { Platform, TextStyle, ViewStyle } from "react-native";

export const color = {
  bg: "#FFFFFF", // every screen
  well: "#FEF9E7", // sunken: passages, inputs, skeletons, pressed rows (Socrates' toga cream)
  ink: "#2D2A23", // text and icons (Socrates' outline)
  ink2: "#6B6558", // secondary text, inactive tabs (5.8:1 on bg)
  ink3: "#A39E92", // quiet marks only (disabled icons, past days), never readable text (2.7:1)
  line: "#E9E6DF", // card borders, the tab bar's top edge, speech bubbles
  white: "#FFFFFF", // labels and marks on a filled color

  blue: "#2E7BFF", // primary action, selection, current
  blueDark: "#1C5FD6", // the primary button's edge; blue text on white or blueWash
  blueWash: "#E3EEFF", // selected answer, current tab

  gold: "#FEB16C", // finished skills, the streak (Socrates' skin)
  goldDark: "#E68133", // gold's edge and marks (his outline orange)
  goldInk: "#A9560F", // gold text on white or well (5.2:1)

  good: "#1FB46B", // right: borders, bars, fills
  goodDark: "#168A52", // good's edge; filled good buttons
  goodWash: "#DFF6EA", // right answer and right panel background
  goodInk: "#0F7A45", // text on goodWash or white

  bad: "#F0524F", // wrong: borders, fills
  badDark: "#C93A37", // bad's edge
  badWash: "#FDE6E5", // wrong answer and wrong panel background
  badInk: "#B02F2C", // text on badWash or white

  lock: "#ECEAE4", // locked and disabled faces, empty progress track
  lockDark: "#D3D0C7", // their edge; a switched-off toggle

  teal: "#12A08F", // the second section (Reading and Writing)
  tealDark: "#0B7A6D", // teal's edge; teal text on white (5.2:1)
  tealWash: "#D7F3EE", // the ring around the current Reading and Writing node
};

export const font = {
  // Nunito, the brand font, is the only family.
  regular: "Nunito_400Regular",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extra: "Nunito_800ExtraBold",
  black: "Nunito_900Black",
};

export const space = (n: number) => n * 8;

// Side gutter for left-aligned text.
export const GUTTER = 20;
// One reading column for every screen, so the left edge holds still between them.
export const COLUMN = 640;

// Corners. Nested surfaces use outer − padding (see `inner`).
export const radius = { sheet: 24, card: 16, button: 16, row: 14, input: 14, well: 16, small: 10 };
export const inner = (outer: number, padding: number) => Math.max(2, outer - padding);

// The chunky edge under pressable things: the darker bottom a button sits on.
export const EDGE = 4;
// Card borders: 2 px all round, the bottom thickened by the edge.
export const BORDER = 2;

// Only things that float (sheets) get a shadow, tinted toward ink. Bars and
// footers are separated by a 2 px line instead (`topLine`).
export const shadow: { float: ViewStyle } = {
  float:
    Platform.OS === "web"
      ? ({ boxShadow: "0 -6px 24px rgba(45,42,35,0.12)" } as ViewStyle)
      : { shadowColor: color.ink, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
};
export const topLine: ViewStyle = { borderTopWidth: BORDER, borderTopColor: color.line };

// Scrim behind sheets: ink, softened. The one place a palette color takes an alpha.
export const scrim = "rgba(45,42,35,0.4)";

const tab: TextStyle = { fontVariant: ["tabular-nums"] };

export const type = {
  // Heavy, rounded titles; body at 600 so it holds up next to them.
  hero: { fontFamily: font.black, fontSize: 34, lineHeight: 40, color: color.ink },
  title: { fontFamily: font.black, fontSize: 26, lineHeight: 32, color: color.ink },
  heading: { fontFamily: font.black, fontSize: 20, lineHeight: 26, color: color.ink },
  // Socrates speaks in the app's font, in a bubble.
  socrates: { fontFamily: font.extra, fontSize: 18, lineHeight: 25, color: color.ink },
  // Socrates in tight places: the lesson's opener and the feedback panel.
  socratesSmall: { fontFamily: font.extra, fontSize: 16, lineHeight: 22, color: color.ink },
  question: { fontFamily: font.bold, fontSize: 19, lineHeight: 28, color: color.ink },
  body: { fontFamily: font.semibold, fontSize: 17, lineHeight: 25, color: color.ink },
  label: { fontFamily: font.extra, fontSize: 16, lineHeight: 21, color: color.ink },
  small: { fontFamily: font.bold, fontSize: 14, lineHeight: 19, color: color.ink2 },
  number: { fontFamily: font.black, fontSize: 30, lineHeight: 36, color: color.ink, ...tab },
  // Button labels: 19 px black counts as large text, so white on blue passes.
  button: { fontFamily: font.black, fontSize: 19, lineHeight: 24 },
} satisfies Record<string, TextStyle>;

export const tabular = tab;
