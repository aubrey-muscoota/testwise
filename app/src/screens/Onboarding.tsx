// After the age question: test date, target score, daily time. Saved with
// POST /api/profile, then the plan is built backwards from the date. The same
// three steps open one at a time from Me to edit.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, Exam, getExam, Profile } from "../api";
import { daysBetween, isoDay, longDay, monthName, parseDay, plural, todayIso } from "../copy";
import { Icon } from "../components/icons";
import { SocratesLine } from "../components/SocratesLine";
import { Button, IconButton, Press3D, ProgressBar, Rise, TextButton, usePop } from "../components/ui";
import { buzz } from "../motion/feedback";
import { BORDER, color, font, GUTTER, radius, space, tabular, type, COLUMN } from "../theme";
import { Animated } from "react-native";

export type Field = "date" | "score" | "minutes";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function scoreRange(exam: Exam | null) {
  return exam?.score ?? { min: 400, max: 1600, step: 10 };
}
export function defaultScore(exam: Exam | null) {
  const r = scoreRange(exam);
  const v = r.min + ((r.max - r.min) * 2) / 3;
  return Math.round(v / 100) * 100;
}

// What a daily budget buys, in the plan's terms (lessons are about 6 minutes).
function minutesDetail(m: number) {
  if (m <= 10) return "One lesson, or a short set when there's nothing new";
  if (m <= 20) return "A new skill or two, plus a short mixed set";
  if (m <= 30) return "Two lessons, your reviews and a longer set";
  return "Room for a timed set at test pace most days";
}

// ─── Date ────────────────────────────────────────────────────────────────────

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

// ─── Score ───────────────────────────────────────────────────────────────────

export function ScoreStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const exam = getExam();
  const r = scoreRange(exam);
  const clamp = (n: number) => Math.min(r.max, Math.max(r.min, Math.round(n / r.step) * r.step));
  const cur = useRef(value);
  cur.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);
  // Tap: one step. Hold: keeps going, faster after a moment.
  const repeated = useRef(false);
  const stepBy = (dir: number, k = 1) => {
    const next = clamp(cur.current + dir * r.step * k);
    if (next !== cur.current) { cur.current = next; onChange(next); buzz.tap(); }
  };
  const hold = (dir: number) => {
    repeated.current = false;
    let n = 0;
    const tick = () => {
      repeated.current = true;
      stepBy(dir, n > 12 ? 5 : 1);
      n += 1;
      timer.current = setTimeout(tick, 90);
    };
    stop();
    timer.current = setTimeout(tick, 420);
  };
  const pop = usePop(Math.round(value / 100), 1.04);
  const btn = (dir: number, name: "minus" | "plus", label: string, disabled: boolean) => (
    <Pressable
      onPressIn={() => !disabled && hold(dir)}
      onPressOut={stop}
      onPress={() => { if (!repeated.current) stepBy(dir); repeated.current = false; }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.step, pressed && !disabled && { backgroundColor: color.blueWash, borderColor: color.blue }]}
    >
      <Icon name={name} size={26} color={disabled ? color.ink3 : color.blueDark} strokeWidth={3} />
    </Pressable>
  );
  return (
    <View>
      <View style={s.scoreRow}>
        {btn(-1, "minus", `Lower, ${r.step} points`, value <= r.min)}
        <Animated.Text
          style={[s.score, tabular, pop]}
          accessibilityRole="adjustable"
          accessibilityLabel="Target score"
          accessibilityValue={{ min: r.min, max: r.max, now: value }}
          {...(Platform.OS === "web" ? { "aria-live": "polite" as const } : {})}
        >
          {value}
        </Animated.Text>
        {btn(1, "plus", `Higher, ${r.step} points`, value >= r.max)}
      </View>
      <Text style={[type.small, tabular, { textAlign: "center", marginTop: space(1) }]}>
        {r.min}–{r.max}
      </Text>
    </View>
  );
}

// ─── Minutes ─────────────────────────────────────────────────────────────────

export function MinutesChoice({ value, onChange }: { value: number; onChange: (m: number) => void }) {
  const exam = getExam();
  const opts = exam?.plan.daily_minutes ?? [10, 20, 30, 45];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Minutes a day" style={{ gap: space(1.25) }}>
      {opts.map((m) => {
        const on = m === value;
        return (
          <Press3D
            key={m}
            onPress={() => { buzz.tap(); onChange(m); }}
            sound={false}
            haptic={false}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            accessibilityLabel={`${m} minutes. ${minutesDetail(m)}`}
            edge={on ? color.blue : color.line}
            border={on ? color.blue : color.line}
            depth={BORDER}
            radius={radius.card}
            face={[s.minRow, { backgroundColor: on ? color.blueWash : color.bg }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.minTitle, tabular, on && { color: color.blueDark }]}>{m} minutes</Text>
              <Text style={[type.small, { marginTop: 2 }, on && { color: color.blueDark }]}>{minutesDetail(m)}</Text>
            </View>
            <View style={{ width: 24 }}>{on && <Icon name="check" color={color.blueDark} strokeWidth={3} />}</View>
          </Press3D>
        );
      })}
    </View>
  );
}

// ─── Flow ────────────────────────────────────────────────────────────────────

// Socrates' question is the screen's question: no form-label title under it.
const LINES: Record<Field, string> = {
  date: "When's your test? I'll plan backwards from it.",
  score: "Do you have a score in mind?",
  minutes: "How long can you study on a normal school day?",
};

export function Onboarding({ initial, onDone, only, onCancel }: {
  initial?: Profile | null;
  onDone: (p: Profile) => void;
  // Edit a single field (from Me).
  only?: Field;
  onCancel?: () => void;
}) {
  const exam = getExam();
  // Short phones: a smaller Socrates, so the whole calendar fits above the button.
  const shortScreen = useWindowDimensions().height < 720;
  const steps: Field[] = only ? [only] : ["date", "score", "minutes"];
  const [i, setI] = useState(0);
  const step = steps[i];
  const [date, setDate] = useState<string | null>(initial?.exam_date ?? null);
  const [score, setScore] = useState<number | null>(initial?.target_score ?? null);
  const [scoreShown, setScoreShown] = useState<number>(initial?.target_score ?? defaultScore(exam));
  const [mins, setMins] = useState<number>(initial?.daily_minutes ?? exam?.plan.default_daily_minutes ?? 20);
  const [notBooked, setNotBooked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Parameters<typeof api.saveProfile>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.saveProfile(patch);
      onDone(p);
    } catch (e) {
      setError((e as Error).message && (e as { status?: number }).status === 400 ? (e as Error).message : "That didn't save. Check your connection and try again.");
      setBusy(false);
    }
  };

  const full = (): Parameters<typeof api.saveProfile>[0] => ({
    ...(notBooked || !date ? { not_booked: true as const } : { exam_date: date }),
    target_score: score,
    daily_minutes: mins,
  });

  const nextStep = (override?: Partial<{ notBooked: boolean; score: number | null }>) => {
    if (only) {
      if (only === "date") return save(override?.notBooked ? { not_booked: true } : { exam_date: date });
      if (only === "score") return save({ target_score: override && "score" in override ? override.score ?? null : score ?? scoreShown });
      return save({ daily_minutes: mins });
    }
    if (i < steps.length - 1) { setI(i + 1); return; }
    return save(full());
  };

  const days = date ? daysBetween(todayIso(), date) : null;
  const short = exam?.short_name ?? "test";

  let body: React.ReactNode;
  let primary: { title: string; disabled?: boolean; onPress: () => void };
  let secondary: { title: string; onPress: () => void } | null = null;
  if (step === "date") {
    body = (
      <>
        <DatePick value={date} onChange={(d) => { setDate(d); setNotBooked(false); }} />
        <Text style={[type.body, { marginTop: space(2), minHeight: 25 }]} aria-live="polite">
          {date && days != null ? `${longDay(date)}. That's ${plural(days, "day")} from today.` : " "}
        </Text>
      </>
    );
    primary = { title: only ? "Save" : "Next", disabled: !date, onPress: () => nextStep() };
    secondary = {
      title: "I haven't booked it yet",
      onPress: () => {
        setNotBooked(true);
        setDate(null);
        if (only) nextStep({ notBooked: true });
        else setI(i + 1);
      },
    };
  } else if (step === "score") {
    body = <ScoreStepper value={scoreShown} onChange={(n) => { setScoreShown(n); setScore(n); }} />;
    primary = { title: only ? "Save" : "Next", onPress: () => { setScore(scoreShown); if (only) save({ target_score: scoreShown }); else setI(i + 1); } };
    secondary = only
      ? { title: "Clear my target", onPress: () => nextStep({ score: null }) }
      : { title: "Skip", onPress: () => { setScore(null); setI(i + 1); } };
  } else {
    body = <MinutesChoice value={mins} onChange={setMins} />;
    primary = { title: only ? "Save" : busy ? "Building your plan…" : "Build my plan", disabled: busy, onPress: () => nextStep() };
  }

  const line = step === "date" ? LINES.date.replace("your test", `your ${short}`) : LINES[step];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.head}>
        {only ? (
          <IconButton name="back" label="Back" onPress={() => onCancel?.()} style={{ marginLeft: -8 }} />
        ) : (
          <>
            {i > 0 && <IconButton name="back" label="Previous step" onPress={() => setI(i - 1)} style={{ marginLeft: -8 }} />}
            <View style={{ flex: 1, flexDirection: "row", marginLeft: i > 0 ? space(1.5) : 0, marginRight: space(1.5) }}>
              <ProgressBar value={(i + 1) / steps.length} />
            </View>
            <Text style={[type.small, tabular, { width: 40, textAlign: "right" }]}>{i + 1} of {steps.length}</Text>
          </>
        )}
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Rise key={step}>
          <View accessibilityRole="header">
            <SocratesLine text={line} size={shortScreen ? 56 : 72} mood="listening" />
          </View>
          <View style={{ height: shortScreen ? space(2) : space(3) }} />
          {body}
          {error && <Text style={[type.body, { color: color.badInk, marginTop: space(2) }]} accessibilityRole="alert">{error}</Text>}
        </Rise>
      </ScrollView>
      <View style={s.foot}>
        <Button title={primary.title} disabled={primary.disabled || busy} onPress={primary.onPress} testID="onboarding-next" />
        {secondary && <TextButton title={secondary.title} onPress={secondary.onPress} disabled={busy} style={{ marginTop: space(0.5) }} />}
      </View>
    </View>
  );
}

const CELL = 44;

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER, paddingTop: space(1), minHeight: 52, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(2), paddingBottom: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  calHead: { flexDirection: "row", alignItems: "center", marginBottom: space(1) },
  calRow: { flexDirection: "row", justifyContent: "space-between" },
  calCell: { width: CELL, alignItems: "center", justifyContent: "center", minHeight: CELL },
  calWeekday: { width: CELL, minHeight: 24, textAlign: "center" },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  // The chosen day: the same blue wash and border as a chosen answer.
  dayOn: { backgroundColor: color.blueWash, borderWidth: BORDER, borderColor: color.blue },
  dayText: { fontFamily: font.extra, fontSize: 16, color: color.ink },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space(2) },
  score: { fontFamily: font.black, fontSize: 64, lineHeight: 74, color: color.blue, textAlign: "center", flex: 1 },
  // Chunky round steppers: a 2 px border, thicker at the bottom.
  step: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: color.bg, alignItems: "center", justifyContent: "center",
    borderWidth: BORDER, borderBottomWidth: BORDER * 2, borderColor: color.line,
  },
  minRow: { flexDirection: "row", alignItems: "center", paddingVertical: space(1.5) - BORDER, paddingHorizontal: space(2) - BORDER },
  minTitle: { fontFamily: font.black, fontSize: 17, lineHeight: 23, color: color.ink },
});
