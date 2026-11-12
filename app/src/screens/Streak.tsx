// After the first lesson of the learner's day: the streak goes up. Socrates
// celebrates, the count rolls up in gold and this week's days fill in order.
import React, { useEffect } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Stats } from "../api";
import { Icon } from "../components/icons";
import { Button, CountUp, Rise } from "../components/ui";
import { feedback } from "../motion/feedback";
import { Socrates } from "../socrates/Socrates";
import { color, COLUMN, font, GUTTER, space, tabular, type } from "../theme";

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const FULL_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The learner's local calendar day, the same day the server files lessons under.
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// This week, Sunday first, with each day's lesson status. The server lists the
// lesson days of the last seven; without that list only the current run is known.
export function weekDays(stats: Pick<Stats, "streak" | "recent_days">, now = new Date()) {
  const today = isoDay(now);
  const run = new Set<string>();
  for (let i = 0; i < stats.streak; i++) run.add(isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const done = stats.recent_days ? new Set([...stats.recent_days, today]) : run;
  return DAY_NAMES.map((name, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i);
    const day = isoDay(d);
    return { name, full: FULL_NAMES[i], done: done.has(day), today: day === today, future: day > today };
  });
}

export function Streak({ stats, onContinue }: { stats: Stats; onContinue: () => void }) {
  const short = useWindowDimensions().height < 720;
  const n = stats.streak;
  const week = weekDays(stats);
  useEffect(() => { feedback.unlock(); }, []);
  return (
    <View style={{ flex: 1 }}>
      <View style={s.wrap}>
        <Rise style={{ alignItems: "center" }}>
          <Socrates size={short ? 96 : 128} mood="celebrate" />
        </Rise>
        <Rise delay={120} style={{ alignItems: "center", marginTop: space(1) }}>
          <View accessible accessibilityRole="header" accessibilityLabel={n === 1 ? "1 day streak" : `${n} day streak`} style={{ alignItems: "center" }}>
            <CountUp value={n} from={Math.max(0, n - 1)} delay={300} duration={500} style={[s.count, short && s.countShort]} />
            <Text style={s.title}>day streak</Text>
          </View>
        </Rise>
        <View style={s.week} accessible accessibilityLabel={`This week: ${week.filter((d) => d.done).map((d) => d.full).join(", ")} done`}>
          {week.map((d, i) => (
            <Rise key={d.name} delay={500 + i * 50} style={s.day}>
              <View style={[s.dot, d.done && s.dotDone]}>
                {d.done && <Icon name="check" size={18} color={color.white} strokeWidth={3} />}
              </View>
              <Text style={[s.dayName, d.done && { color: color.goldInk }, d.today && { fontFamily: font.black }]}>{d.name}</Text>
            </Rise>
          ))}
        </View>
        <Rise delay={900}>
          <Text style={[type.body, s.sub]}>Do one lesson tomorrow to make it {n + 1}</Text>
        </Rise>
      </View>
      <Rise delay={700} style={s.foot}>
        <Button title="Continue" onPress={onContinue} testID="streak-continue" />
      </Rise>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: GUTTER, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  // A large number: goldInk keeps it readable on white, as gold text always is.
  count: { fontFamily: font.black, fontSize: 96, lineHeight: 100, color: color.goldInk, ...tabular },
  countShort: { fontSize: 80, lineHeight: 84 },
  title: { ...type.title, textAlign: "center" },
  week: { flexDirection: "row", gap: space(1), marginTop: space(3), marginBottom: space(2) },
  day: { alignItems: "center", gap: space(0.75) },
  dot: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.lock, alignItems: "center", justifyContent: "center" },
  dotDone: { backgroundColor: color.gold },
  dayName: { fontFamily: font.extra, fontSize: 14, lineHeight: 19, color: color.ink2 },
  sub: { color: color.ink2, textAlign: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});
