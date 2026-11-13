// One choice in setup: the chunky answer card (white, 2 px line border on a
// 4 px bottom edge; selected is blue with a check). The same card as an
// answer choice, used for the test, the date, the daily goal, the score and
// where to start.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../components/icons";
import { Press3D } from "../components/ui";
import { buzz } from "../motion/feedback";
import { BORDER, color, font, radius, space, tabular, type } from "../theme";

export function OptionCard({ title, detail, selected, onPress, lead, testID, accessibilityLabel }: {
  title: string;
  detail?: string | null;
  selected: boolean;
  onPress: () => void;
  // Something before the title (the test picker's short-name tile).
  lead?: React.ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Press3D
      testID={testID}
      onPress={() => { buzz.tap(); onPress(); }}
      sound={false}
      haptic={false}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={accessibilityLabel ?? [title, detail].filter(Boolean).join(". ")}
      edge={selected ? color.blue : color.line}
      border={selected ? color.blue : color.line}
      depth={BORDER}
      radius={radius.card}
      face={[s.face, { backgroundColor: selected ? color.blueWash : color.bg }]}
    >
      {lead}
      <View style={{ flex: 1 }}>
        <Text style={[s.title, tabular, selected && { color: color.blueDark }]}>{title}</Text>
        {detail ? <Text style={[type.small, tabular, { marginTop: 2 }, selected && { color: color.blueDark }]}>{detail}</Text> : null}
      </View>
      <View style={s.mark}>{selected && <Icon name="check" color={color.blueDark} strokeWidth={3} />}</View>
    </Press3D>
  );
}

// A list of option cards, spaced like answer choices.
export function Options({ label, children }: { label: string; children: React.ReactNode }) {
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: space(1.25) }}>{children}</View>;
}

const s = StyleSheet.create({
  face: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingVertical: space(1.5) - BORDER, paddingHorizontal: space(2) - BORDER, gap: space(1.5) },
  title: { fontFamily: font.black, fontSize: 17, lineHeight: 23, color: color.ink },
  mark: { width: 24, marginLeft: -space(0.5) },
});
