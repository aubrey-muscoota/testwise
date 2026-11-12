// A unit's banner: the unit's name with how many of its skills are finished,
// and under it where it sits ("Math, unit 1 of 8"), on a face in the section's
// color, on its darker edge like a button. Every line is 19 px black, so white passes
// on blue and teal as large text.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { PathUnit } from "../api";
import { decorative } from "../components/ui";
import { color, EDGE, font, space, tabular } from "../theme";
import { Accent } from "./shared";

export function UnitBanner({ unit, accent }: { unit: PathUnit; accent: Accent }) {
  const where = unit.section_name ? `${unit.section_name}, unit ${unit.number} of ${unit.of}` : `Unit ${unit.number} of ${unit.of}`;
  return (
    <View
      style={[s.edge, { backgroundColor: accent.edge }]}
      accessibilityRole="header"
      accessibilityLabel={`${unit.name}. ${where}. ${unit.done} of ${unit.total} skills finished`}
    >
      <View style={[s.face, { backgroundColor: accent.fill }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Text style={[s.text, { flex: 1 }]}>{unit.name}</Text>
          <Text style={[s.text, tabular, { marginLeft: space(1.5) }]} {...decorative}>{unit.done} of {unit.total}</Text>
        </View>
        <Text style={[s.text, s.sub]} {...decorative}>{where}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  edge: { borderRadius: 18, paddingBottom: EDGE },
  face: { borderRadius: 18, paddingVertical: space(1.75), paddingHorizontal: space(2) },
  text: { fontFamily: font.black, fontSize: 19, lineHeight: 24, color: color.white },
  // The second line steps back by weight, not by size or a tint: a smaller or
  // paler white would fail contrast on the section color.
  sub: { fontFamily: font.extra, marginTop: 2 },
});
