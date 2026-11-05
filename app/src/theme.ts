// From the testwise brand identity guide: Azure #58A6FF is the anchor,
// with Sky Scholar / Meadow Mentor accents, Nunito, an 8pt grid.
export const color = {
  azure: "#58A6FF",
  azureDark: "#3E8AE6",
  azureSoft: "#E3F2FD",
  lavender: "#B9A7F1",
  coral: "#FF7E79",
  coralSoft: "#FFECEB",
  green: "#64BC5D",
  greenDark: "#4CA046",
  greenSoft: "#E9F5EB",
  yellow: "#FFD66D",
  yellowDark: "#E8B93A",
  cream: "#FFF9EB",
  bg: "#FAFCFF",
  card: "#FFFFFF",
  text: "#1E2C3B",
  textSoft: "#5B6B7C",
  line: "#E4EAF1",
  locked: "#F2F2F2",
  lockedLine: "#CCCCCC",
  disabled: "#E0E0E0",
  disabledText: "#9E9E9E",
};

export const font = {
  regular: "Nunito_400Regular",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  black: "Nunito_800ExtraBold",
};

export const space = (n: number) => n * 8;

export const radius = { button: 16, card: 24, input: 12, pill: 9999 };

export const shadow = {
  sm: { shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
};

export const type = {
  h1: { fontFamily: font.bold, fontSize: 32, lineHeight: 38, color: color.text, letterSpacing: -0.3 },
  h2: { fontFamily: font.semibold, fontSize: 24, lineHeight: 29, color: color.text },
  h3: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, color: color.text },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23, color: color.text },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, letterSpacing: 0.3, color: color.text },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 15, color: color.textSoft },
} as const;
