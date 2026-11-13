// The calendar for a test date: today to two years out, one month at a time.
// Used by setup's "Another date" and when an exam has no official dates.
import React, { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { isoDay, monthName, parseDay, todayIso } from "../copy";
import { IconButton, usePop } from "../components/ui";
import { buzz } from "../motion/feedback";
import { BORDER, color, font, tabular, type, space } from "../theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DatePick({ value, onChange }: { value: string | null; onChange: (iso: string) => void }) {
  const today = todayIso();
  const start = parseDay(value ?? today);
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const max = (() => { const d = parseDay(today); d.setFullYear(d.getFullYear() + 2); return isoDay(d); })();
  const t = parseDay(today);
  const canBack = view.y > t.getFullYear() || (view.y === t.getFullYear() && view.m > t.getMonth());
  const mx = parseDay(max);
  const canFwd = view.y < mx.getFullYear() || (view.y === mx.getFullYear() && view.m < mx.getMonth());
  const shift = (k: number) => setView((v) => { const d = new Date(v.y, v.m + k, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <View>
      <View style={s.calHead}>
        <Text style={[type.heading, { flex: 1 }]} accessibilityRole="header" aria-live="polite">{monthName(view.m)} {view.y}</Text>
        <IconButton name="back" label="Previous month" onPress={() => canBack && shift(-1)} tone={canBack ? color.ink : color.ink3} />
        <IconButton name="chevron" label="Next month" onPress={() => canFwd && shift(1)} tone={canFwd ? color.ink : color.ink3} />
      </View>
      <View style={s.calRow} {...{ "aria-hidden": true }}>
        {WEEKDAYS.map((d, i) => <Text key={i} style={[type.small, s.calWeekday]}>{d}</Text>)}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={s.calRow}>
          {w.map((d, di) => {
            if (!d) return <View key={di} style={s.calCell} />;
            const iso = isoDay(new Date(view.y, view.m, d, 12));
            const ok = iso >= today && iso <= max;
            const on = iso === value;
            const isToday = iso === today;
            return (
              <View key={di} style={s.calCell}>
                <DayDot
                  day={d}
                  on={on}
                  ok={ok}
                  isToday={isToday}
                  label={`${WEEKDAY_NAMES[di]}, ${monthName(view.m)} ${d}`}
                  onPress={() => { if (ok) { buzz.tap(); onChange(iso); } }}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DayDot({ day, on, ok, isToday, label, onPress }: { day: number; on: boolean; ok: boolean; isToday: boolean; label: string; onPress: () => void }) {
  const pop = usePop(on, 1.15);
  return (
    <Pressable onPress={onPress} disabled={!ok} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, disabled: !ok }} hitSlop={2}>
      {({ pressed }) => (
        <Animated.View style={[s.day, on && s.dayOn, pressed && !on && { backgroundColor: color.well }, pop]}>
          <Text style={[s.dayText, tabular, !ok && { color: color.ink3, fontFamily: font.semibold }, on && { color: color.blueDark, fontFamily: font.black }, isToday && !on && { color: color.blueDark, fontFamily: font.black }]}>
            {day}
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const CELL = 44;

const s = StyleSheet.create({
  calHead: { flexDirection: "row", alignItems: "center", marginBottom: space(1) },
  calRow: { flexDirection: "row", justifyContent: "space-between" },
  calCell: { width: CELL, alignItems: "center", justifyContent: "center", minHeight: CELL },
  calWeekday: { width: CELL, minHeight: 24, textAlign: "center" },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  // The chosen day: the same blue wash and border as a chosen answer.
  dayOn: { backgroundColor: color.blueWash, borderWidth: BORDER, borderColor: color.blue },
  dayText: { fontFamily: font.extra, fontSize: 16, color: color.ink },
});
