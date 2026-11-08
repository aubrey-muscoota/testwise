// The main frame: a bottom tab bar on phones, a left rail on wide screens
// (900 px and up), with the screen in a readable column.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Tab } from "../nav";
import { color, font, radius, shadow, space } from "../theme";
import { Icon, IconName } from "./icons";
import { Wordmark } from "./ui";
import { buzz } from "../motion/feedback";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "practice", label: "Practice", icon: "practice" },
  { id: "path", label: "Path", icon: "path" },
  { id: "me", label: "Me", icon: "me" },
];

export const WIDE = 900;
export function useWide() {
  return useWindowDimensions().width >= WIDE;
}

export function Shell({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: React.ReactNode }) {
  const wide = useWide();
  if (wide) {
    return (
      <View style={s.wideRoot}>
        <View style={s.rail} accessibilityRole="tablist" aria-label="Sections">
          <View style={s.railHead}><Wordmark size={24} /></View>
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <Pressable
                key={t.id}
                onPress={() => { buzz.tap(); onTab(t.id); }}
                accessibilityRole="tab"
                accessibilityLabel={t.label}
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.railItem, on && s.railItemOn, pressed && !on && { backgroundColor: color.paperDeep }]}
              >
                <Icon name={t.icon} color={on ? color.azureInk : color.inkSoft} />
                <Text style={[s.railLabel, on && { color: color.ink }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.wideMain}>{children}</View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={s.bar} accessibilityRole="tablist" aria-label="Sections">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              onPress={() => { buzz.tap(); onTab(t.id); }}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              style={s.barItem}
            >
              <Icon name={t.icon} color={on ? color.azureInk : color.inkSoft} strokeWidth={on ? 2 : 1.75} />
              <Text style={[s.barLabel, on && s.barLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.sheet,
    paddingTop: space(1),
    paddingBottom: Platform.OS === "ios" ? space(0.5) : space(1),
    ...shadow.bar,
  },
  barItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 2 },
  barLabel: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: color.inkSoft },
  barLabelOn: { fontFamily: font.bold, color: color.azureInk },
  wideRoot: { flex: 1, flexDirection: "row" },
  rail: { width: 232, paddingHorizontal: space(2), paddingTop: space(4), gap: space(0.5) },
  railHead: { paddingHorizontal: space(1.5), marginBottom: space(3) },
  railItem: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingHorizontal: space(1.5), minHeight: 48, borderRadius: radius.row },
  railItemOn: { backgroundColor: color.azureWash },
  railLabel: { fontFamily: font.bold, fontSize: 16, color: color.inkSoft },
  wideMain: { flex: 1 },
});
