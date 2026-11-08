// Design tokens, from docs/DESIGN.md. This is the whole palette: no extra
// shades, opacities or gradients. Paper, ink and one bright blue.
import { Platform, TextStyle, ViewStyle } from "react-native";

export const color = {
  paper: "#FBF7F0", // screen background
  paperDeep: "#F3ECDF", // sunken: passages, the path's ground, input wells
  sheet: "#FFFDF9", // raised surfaces that hold work
  ink: "#22252B", // body text, icons
  inkSoft: "#5E6470", // secondary text
  rule: "#E6DDCF", // the rare hairline
  azure: "#58A6FF", // primary action, selection, progress
  azureInk: "#2D6FC2", // azure text on paper (links, small labels)
  azureWash: "#E6F0FC", // selected answer background
  terracotta: "#D9774B", // Socrates' warmth: streak, highlights
  olive: "#5E8F4C", // correct
  oliveWash: "#EAF1E3",
  brick: "#C0553F", // incorrect
  brickWash: "#F8E7E2",
  ochre: "#D99A2B", // XP
};

export const font = {
  // Nunito: UI and question text.
  regular: "Nunito_400Regular",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  black: "Nunito_800ExtraBold",
  // Fraunces: Socrates' speech, screen titles, big numbers.
  serif: "Fraunces_400Regular",
  serifSemi: "Fraunces_600SemiBold",
};

export const space = (n: number) => n * 8;

// Side gutter for left-aligned text.
export const GUTTER = 20;
// One reading column for every screen, so the left edge holds still between them.
export const COLUMN = 640;

// Corners. Nested surfaces use outer − padding (see `inner`).
export const radius = { sheet: 20, row: 14, button: 14, input: 12, well: 12, small: 8 };
export const inner = (outer: number, padding: number) => Math.max(2, outer - padding);

// Only things that float (sheets, the bottom bar) get a shadow, and a soft one.
export const shadow: { float: ViewStyle; bar: ViewStyle } = {
  float:
    Platform.OS === "web"
      ? ({ boxShadow: "0 -6px 24px rgba(34,37,43,0.10)" } as ViewStyle)
      : { shadowColor: color.ink, shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  bar:
    Platform.OS === "web"
      ? ({ boxShadow: "0 -1px 12px rgba(34,37,43,0.06)" } as ViewStyle)
      : { shadowColor: color.ink, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: -2 }, elevation: 4 },
};

// Scrim behind sheets: ink, softened. The one place a palette color takes an alpha.
export const scrim = "rgba(34,37,43,0.32)";

const tab: TextStyle = { fontVariant: ["tabular-nums"] };

export const type = {
  // Sizes from DESIGN.md: title 28/34, Socrates 19/27, body 17/25, label 15/20, small 13/18.
  hero: { fontFamily: font.serifSemi, fontSize: 36, lineHeight: 42, color: color.ink },
  title: { fontFamily: font.serifSemi, fontSize: 28, lineHeight: 34, color: color.ink },
  heading: { fontFamily: font.serifSemi, fontSize: 21, lineHeight: 27, color: color.ink },
  socrates: { fontFamily: font.serif, fontSize: 19, lineHeight: 27, color: color.ink },
  // Socrates in tight places: the lesson's opener and the feedback panel.
  socratesSmall: { fontFamily: font.serif, fontSize: 17, lineHeight: 24, color: color.ink },
  question: { fontFamily: font.semibold, fontSize: 19, lineHeight: 28, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 17, lineHeight: 25, color: color.ink },
  label: { fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: color.ink },
  small: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: color.inkSoft },
  number: { fontFamily: font.serifSemi, fontSize: 28, lineHeight: 34, color: color.ink, ...tab },
} satisfies Record<string, TextStyle>;

export const tabular = tab;
