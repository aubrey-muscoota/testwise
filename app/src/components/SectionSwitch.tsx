// Math / Reading and Writing: two words side by side. The chosen one sits in
// a blue wash, the same mark as the current tab.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, space } from "../theme";
import { buzz } from "../motion/feedback";

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
            style={({ pressed }) => [s.tab, on && s.tabOn, pressed && !on && { backgroundColor: color.well }]}
          >
            <Text style={[s.text, on && s.on]}>{x.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // Pulled left by the tab's padding, so the first word lines up with the title.
  row: { flexDirection: "row", gap: space(0.5), marginLeft: -space(1.5) },
  tab: { minHeight: 44, justifyContent: "center", paddingHorizontal: space(1.5), borderRadius: radius.row },
  tabOn: { backgroundColor: color.blueWash },
  text: { fontFamily: font.extra, fontSize: 17, lineHeight: 22, color: color.ink2 },
  on: { color: color.blueDark },
});
