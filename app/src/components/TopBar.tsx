// The top bar over every tab: days to the test, the streak and XP. Each count
// opens Progress; without a test date the first one sets it. Counts appear only
// once there is something to count (no "0 XP" before the first lesson).
import React from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { getExam, usePathSummary } from "../api";
import { plural } from "../copy";
import { color, COLUMN, font, GUTTER, space, tabular, topLine } from "../theme";
import { Icon, IconName } from "./icons";
import { usePop } from "./ui";

function Count({ icon, value, label, mark, ink, onPress, testID }: {
  icon: IconName; value: string | number; label: string; mark: string; ink: string; onPress: () => void; testID?: string;
}) {
  const pop = usePop(value, 1.2);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [s.count, pressed && { backgroundColor: color.well }]}
    >
      <Animated.View style={[s.countInner, pop]}>
        <Icon name={icon} size={24} color={mark} strokeWidth={2.5} />
        <Text style={[s.countText, tabular, { color: ink }]}>{value}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function TopBar({ onProgress, onEditDate, wide }: { onProgress: () => void; onEditDate: () => void; wide: boolean }) {
  const p = usePathSummary();
  const exam = getExam();
  const name = exam?.short_name ?? "test";
  // Until the first load, the bar keeps its height so nothing jumps.
  if (!p) return <View style={[s.bar, wide ? s.wide : s.phone]}><View style={s.row} /></View>;
  const { xp, streak } = p.stats;
  const booked = !p.exam_date_assumed;
  const days = p.days_left;
  return (
    <View style={[s.bar, wide ? s.wide : s.phone]} accessibilityRole="toolbar" aria-label="Your numbers">
      <View style={s.row}>
      {!booked ? (
        <Count icon="calendar" value="Set date" label={`Set your ${name} date`} mark={color.ink} ink={color.ink} onPress={onEditDate} testID="top-days" />
      ) : days >= 0 ? (
        <Count
          icon="calendar"
          value={days}
          label={days === 0 ? `Your ${name} is today` : `${plural(days, "day")} to your ${name}`}
          mark={color.ink}
          ink={color.ink}
          onPress={onProgress}
          testID="top-days"
        />
      ) : <View />}
      {xp > 0 && (
        <>
          <Count icon="streak" value={streak} label={`${plural(streak, "day")} in a row`} mark={color.goldDark} ink={color.goldInk} onPress={onProgress} testID="top-streak" />
          <Count icon="xp" value={xp} label={`${xp} XP`} mark={color.blue} ink={color.blueDark} onPress={onProgress} testID="top-xp" />
        </>
      )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: color.bg, borderBottomWidth: topLine.borderTopWidth, borderBottomColor: color.line, paddingBottom: space(0.5) },
  // Each count's touch area reaches 8 px past its icon, so the icons line up with the text below.
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, marginHorizontal: -space(1) },
  // A 2 px line under it, as the tab bar has over it. On phones it runs the full
  // width; on wide screens it heads the reading column, level with the rail's
  // wordmark.
  phone: { paddingHorizontal: GUTTER, paddingTop: space(0.75) },
  wide: { paddingTop: space(3), maxWidth: COLUMN - 2 * GUTTER, width: "100%", alignSelf: "center" },
  count: { minHeight: 44, minWidth: 44, paddingHorizontal: space(1), borderRadius: 10, justifyContent: "center" },
  countInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  countText: { fontFamily: font.black, fontSize: 16, lineHeight: 21 },
});
