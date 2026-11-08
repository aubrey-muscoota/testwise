// Math / Reading and Writing: two words, the chosen one underlined by hand.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { color, font, space } from "../theme";
import { buzz } from "../motion/feedback";
import { decorative } from "./ui";

export function SectionSwitch({
  sections, value, onChange,
}: { sections: { id: string; name: string }[]; value: string; onChange: (id: string) => void }) {
  if (sections.length < 2) return null;
  return (
    <View style={s.row} accessibilityRole="tablist">
      {sections.map((x) => {
        const on = x.id === value;
        return (
          <Pressable
            key={x.id}
            onPress={() => { if (!on) { buzz.tap(); onChange(x.id); } }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={x.name}
            style={s.tab}
          >
            {({ pressed }) => (
              // Sized to the word, so the hand-drawn underline is exactly as wide as it.
              // Absolutely placed, so the Svg can't widen the word's box.
              <View style={{ alignSelf: "flex-start", paddingBottom: 8 }}>
                <Text style={[s.text, (on || pressed) && s.on]}>{x.name}</Text>
                <View {...decorative} style={s.underline}>
                  {on && (
                    <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none">
                      <Path d="M1.5 5.2C20 3.4 46 2.6 70 3.6C82 4.1 91 4.6 98.5 3.2" stroke={color.azure} strokeWidth={2.6} fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </Svg>
                  )}
                </View>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: space(3) },
  tab: { paddingTop: space(1), minHeight: 44, justifyContent: "flex-end" },
  text: { fontFamily: font.bold, fontSize: 17, lineHeight: 22, color: color.inkSoft },
  on: { color: color.ink },
  underline: { position: "absolute", left: 0, right: 0, bottom: 0, height: 8 },
});
