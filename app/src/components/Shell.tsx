// The main frame: a bottom tab bar on phones, a left rail on wide screens
// (900 px and up), with the screen in a readable column.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Tab } from "../nav";
import { color, COLUMN, font, radius, space, topLine } from "../theme";
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
const RAIL = 232;
export function useWide() {
  return useWindowDimensions().width >= WIDE;
}

export function Shell({ tab, onTab, children }: { tab: Tab; onTab: (t: Tab) => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  // With room to spare, the screen's column sits in the middle of the page, as it
  // does in a lesson, so the left edge holds still between the two. On narrower
  // desktops the rail takes its share and the column centres in what is left.
  const symmetric = width >= RAIL * 2 + COLUMN;
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
                style={({ pressed }) => [s.railItem, on && s.railItemOn, pressed && !on && { backgroundColor: color.well }]}
              >
                <Icon name={t.icon} color={on ? color.blueDark : color.ink2} strokeWidth={2.25} />
                <Text style={[s.railLabel, on && { color: color.blueDark }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={[s.wideMain, symmetric && { paddingRight: RAIL }]}>{children}</View>
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
              {({ pressed }) => (
                <>
                  {/* The current tab's icon sits in a blue wash. */}
                  <View style={[s.barIcon, on && { backgroundColor: color.blueWash }, pressed && !on && { backgroundColor: color.well }]}>
                    <Icon name={t.icon} color={on ? color.blueDark : color.ink2} strokeWidth={2.25} />
                  </View>
                  <Text style={[s.barLabel, on && s.barLabelOn]}>{t.label}</Text>
                </>
              )}
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
    backgroundColor: color.bg,
    paddingTop: space(1),
    paddingBottom: Platform.OS === "ios" ? space(0.5) : space(1.25),
    paddingHorizontal: space(0.75),
    ...topLine,
  },
  barItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 3 },
  barIcon: { width: 48, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  barLabel: { fontFamily: font.extra, fontSize: 12, lineHeight: 16, color: color.ink2 },
  barLabelOn: { color: color.blueDark },
  wideRoot: { flex: 1, flexDirection: "row" },
  rail: { width: RAIL, paddingHorizontal: space(2), paddingTop: space(4), gap: space(0.5), borderRightWidth: 2, borderRightColor: color.line },
  railHead: { paddingHorizontal: space(1.5), marginBottom: space(3) },
  railItem: { flexDirection: "row", alignItems: "center", gap: space(1.5), paddingHorizontal: space(1.5), minHeight: 48, borderRadius: radius.row },
  railItemOn: { backgroundColor: color.blueWash },
  railLabel: { fontFamily: font.extra, fontSize: 16, color: color.ink2 },
  wideMain: { flex: 1 },
});
