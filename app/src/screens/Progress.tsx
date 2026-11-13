// Progress: how far off the test is and whether the learner is on pace for it,
// the skills done in each section, this month's lesson days, then the plan
// week by week. Every number comes from the server: the countdown, the streak
// and the calendar from GET /api/path (the same response the top bar and the
// Learn tab read, so they always agree), the on-track check and the weeks from
// GET /api/plan. Skills done per section add up the Learn path's unit counts,
// so they follow the path's done rule.
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, LearnPath, Plan, PlanPhase } from "../api";
import { longDay, monthName, parseDay, plural, shortDay, shortMonth } from "../copy";
import { Icon } from "../components/icons";
import { useWide } from "../components/Shell";
import { Bone, decorative, ErrorState, ProgressBar, Rise, Skeleton, TextButton } from "../components/ui";
import { useLoad } from "../nav";
import { accentFor } from "../path/shared";
import { BORDER, color, font, GUTTER, inner, radius, space, tabular, type, COLUMN } from "../theme";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];

const PHASE_FALLBACK: Record<PlanPhase, string> = {
  learn: "Learn",
  strengthen: "Strengthen",
  test_ready: "Test ready",
  rest: "Rest",
  after: "After the test",
};

export function Progress({ onEditDate }: { onEditDate: () => void }) {
  const { data, error, reload } = useLoad(async () => {
    const [plan, path] = await Promise.all([api.plan(), api.path()]);
    return { plan, path };
  });
  const wide = useWide();
  const [all, setAll] = React.useState(false);

  if (error && !data) return <ErrorState message="I couldn't load your progress. Try again?" onRetry={reload} />;
  if (!data) return <ProgressSkeleton />;
  const { plan, path } = data;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(2) }]}>
        <Rise>
          <Countdown path={path} onEditDate={onEditDate} />
          <Track plan={plan} />
        </Rise>
        <Rise delay={60} style={{ marginTop: space(4) }}>
          <Sections path={path} />
        </Rise>
        <Rise delay={110} style={{ marginTop: space(4) }}>
          <Calendar path={path} />
        </Rise>
        {plan.weeks.length > 0 && (
          <Rise delay={160} style={{ marginTop: space(4) }}>
            <Weeks plan={plan} done={doneSkills(path)} all={all} onAll={() => setAll(true)} />
          </Rise>
        )}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </View>
  );
}

// ─── Countdown ───────────────────────────────────────────────────────────────
// The one big number on the page: the same days_left as the top bar.

function Countdown({ path, onEditDate }: { path: LearnPath; onEditDate: () => void }) {
  const name = getExam()?.short_name ?? "test";
  const d = path.days_left;
  if (path.phase === "after" || d < 0) {
    return (
      <View>
        <Text style={type.hero} accessibilityRole="header">How did the {name} go?</Text>
        <TextButton title="Set a new test date" align="left" onPress={onEditDate} style={s.link} />
      </View>
    );
  }
  if (path.exam_date_assumed) {
    return (
      <View>
        <Text style={type.hero} accessibilityRole="header">No test date yet</Text>
        <Text style={[type.body, { color: color.ink2, marginTop: space(0.5) }]}>
          Until you pick one, your plan assumes a test around {longDay(path.exam_date).replace(/ (\d+)$/, " $1")}.
        </Text>
        <TextButton title="Set your test date" align="left" onPress={onEditDate} style={s.link} accessibilityLabel={`Set your ${name} date`} />
      </View>
    );
  }
  if (d === 0) {
    return (
      <View>
        <Text style={type.hero} accessibilityRole="header">{name} day</Text>
        <Text style={[type.body, { color: color.ink2, marginTop: space(0.5) }]}>{longDay(path.exam_date)}</Text>
      </View>
    );
  }
  return (
    <View>
      <View style={s.bigRow} accessible accessibilityRole="header" accessibilityLabel={`${plural(d, "day")} to your ${name}`}>
        <Text style={s.big}>{d}</Text>
        <Text style={s.bigLabel}>{d === 1 ? "day" : "days"} to your {name}</Text>
      </View>
      <Text style={[type.body, { color: color.ink2, marginTop: space(0.5) }]}>{longDay(path.exam_date)}</Text>
    </View>
  );
}

// ─── On track ────────────────────────────────────────────────────────────────
// An honest check against the plan's even pace, and what to do about it.
// Counts are the plan's own (status.behind_by_lessons, ahead_by_lessons).

function trackLines(plan: Plan): { head: string; body: string; good: boolean } | null {
  const st = plan.status;
  const ahead = st.ahead_by_lessons ?? 0;
  const day = (iso: string) => shortDay(iso).replace(" ", " ");
  if (plan.phase === "after") return null;
  if (plan.phase === "rest") {
    return plan.days_left === 1 ? { head: "Rest day", body: "A few review questions if you like, then rest. Tomorrow is the test.", good: true } : null;
  }
  if (st.behind_by_lessons > 0) {
    if (plan.phase === "learn") {
      return {
        head: `${plural(st.behind_by_lessons, "lesson")} behind`,
        body: "Start new skills on Learn first. Each one you start closes the gap.",
        good: false,
      };
    }
    return {
      head: `${plural(st.behind_by_lessons, "skill")} not started`,
      body: "There isn't time to learn them well now, so your plan sharpens the skills you know with timed sets.",
      good: false,
    };
  }
  if (!st.on_track) {
    return { head: "A little behind", body: "You've missed the last two days. A lesson today puts you back on pace.", good: false };
  }
  const next = plan.phase === "learn"
    ? `Start every skill by ${day(plan.learn_by)}, then timed sets from ${day(plan.test_ready_from)}.`
    : plan.phase === "strengthen"
      ? `Every skill is started. Now your weakest ones, then timed sets from ${day(plan.test_ready_from)}.`
      : "Timed sets now, so test pace feels normal on the day.";
  return {
    head: ahead > 0 ? `On track, ${plural(ahead, "lesson")} ahead` : "On track",
    body: next,
    good: true,
  };
}

function Track({ plan }: { plan: Plan }) {
  const t = trackLines(plan);
  if (!t) return null;
  return (
    <View style={{ marginTop: space(3) }} testID="progress-track">
      <Text style={[type.heading, { color: t.good ? color.goodInk : color.ink }]} accessibilityRole="header">{t.head}</Text>
      <Text style={[type.body, { marginTop: space(0.5) }]}>{t.body}</Text>
    </View>
  );
}

// ─── Skills done per section ─────────────────────────────────────────────────
// The path's unit counts summed by section, so they match the unit banners.

function Sections({ path }: { path: LearnPath }) {
  const rows: { id: string; name: string; kind: LearnPath["units"][number]["section_kind"]; index: number; done: number; total: number }[] = [];
  for (const u of path.units) {
    let r = rows.find((x) => x.id === u.section_id);
    if (!r) rows.push((r = { id: u.section_id, name: u.section_name, kind: u.section_kind, index: u.section_index, done: 0, total: 0 }));
    r.done += u.done;
    r.total += u.total;
  }
  rows.sort((a, b) => a.index - b.index);
  return (
    <View>
      <Text style={type.heading} accessibilityRole="header">Skills done</Text>
      {rows.map((r) => {
        const a = accentFor(r.kind);
        return (
          <View key={r.id} style={{ marginTop: space(2) }} accessible accessibilityLabel={`${r.name}, ${r.done} of ${r.total} skills done`} testID={`progress-section-${r.id}`}>
            <View style={s.meterRow}>
              <Text style={[type.label, { flex: 1 }]}>{r.name}</Text>
              <Text style={[type.label, tabular, { color: color.ink2 }]}>{r.done} of {r.total}</Text>
            </View>
            <View style={{ flexDirection: "row", marginTop: space(1) }}>
              <ProgressBar value={r.total ? r.done / r.total : 0} fill={a.fill} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Streak calendar ─────────────────────────────────────────────────────────
// This month, Sunday first: lesson days in gold, today ringed.

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Calendar({ path }: { path: LearnPath }) {
  const today = parseDay(path.date);
  const y = today.getFullYear();
  const m = today.getMonth();
  const on = new Set(path.stats.month_days ?? []);
  const first = new Date(y, m, 1, 12).getDay();
  const count = new Date(y, m + 1, 0, 12).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const streak = path.stats.streak;
  const doneToday = on.has(path.date);
  const line = streak > 0
    ? `${plural(streak, "day")} in a row${doneToday ? "" : ". A lesson today keeps it going"}`
    : on.size
      ? "A lesson today starts a new streak"
      : "Finish a lesson to mark today";
  return (
    <View testID="progress-calendar">
      <Text style={type.heading} accessibilityRole="header">{monthName(m)}</Text>
      <Text style={[type.label, { marginTop: 2, color: streak > 0 ? color.goldInk : color.ink2, fontFamily: font.bold }]}>{line}</Text>
      <View style={s.grid} accessibilityLabel={`${monthName(m)}: ${plural(on.size, "day")} with a lesson`}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={s.cell} {...decorative}>
            <Text style={[type.small, s.weekday]}>{w[0]}</Text>
          </View>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <View key={`x${i}`} style={s.cell} {...decorative} />;
          const day = iso(d);
          const done = on.has(day);
          const isToday = day === path.date;
          const future = day > path.date;
          const label = `${shortMonth(m)} ${d}${isToday ? ", today" : ""}${done ? ", lesson done" : ""}`;
          return (
            <View key={day} style={s.cell} accessible accessibilityLabel={label} testID={done ? "calendar-done" : undefined}>
              <View style={[s.day, done && s.dayDone, isToday && s.dayToday]}>
                <Text style={[s.dayText, tabular, { color: done ? color.ink : future ? color.ink3 : color.ink2 }]}>{d}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── The plan, week by week ──────────────────────────────────────────────────
// Each phase is a label over a cream well of weeks; this week sits in the blue
// "current" wash, and skills already done on the Learn path are ticked in gold.

function doneSkills(path: LearnPath) {
  return new Set(path.units.flatMap((u) => u.nodes).flatMap((n) => (n.kind === "skill" && n.state === "done" ? [n.skill_id] : [])));
}

function Weeks({ plan, done, all, onAll }: { plan: Plan; done: Set<string>; all: boolean; onAll: () => void }) {
  const exam = getExam();
  const phaseName = (p: PlanPhase) => exam?.plan.phases.find((x) => x.id === p)?.name ?? PHASE_FALLBACK[p];
  // Group the weeks into runs of the same phase, in order.
  const groups: { phase: PlanPhase; weeks: Plan["weeks"] }[] = [];
  for (const w of plan.weeks) {
    const g = groups[groups.length - 1];
    if (g && g.phase === w.phase) g.weeks.push(w);
    else groups.push({ phase: w.phase, weeks: [w] });
  }
  // The verb for each phase, said once under its name.
  const learnWeeks = plan.weeks.filter((w) => w.phase === "learn");
  const perWeek = learnWeeks.length ? Math.round(learnWeeks.reduce((a, w) => a + w.focus_names.length, 0) / learnWeeks.length) : 0;
  const phaseLine: Partial<Record<PlanPhase, string>> = {
    learn: perWeek >= 2 ? `About ${WORDS[perWeek] ?? perWeek} new skills a week` : "A new skill most weeks",
    strengthen: "Your weakest skills, plus mixed sets",
  };

  return (
    <View>
      <Text style={type.heading} accessibilityRole="header">Week by week</Text>
      {groups.map((g, gi) => (
        <View key={`${g.phase}-${gi}`} style={{ marginTop: gi ? space(3) : space(2) }}>
          <Text style={type.label}>{phaseName(g.phase)}</Text>
          {phaseLine[g.phase] && <Text style={[type.small, { marginTop: 2 }]}>{phaseLine[g.phase]}</Text>}
          <View style={s.well}>
            {g.weeks.map((w, wi) => {
              const now = gi === 0 && wi === 0;
              const idx = plan.weeks.indexOf(w);
              if (!all && idx >= SHOWN) {
                // The weeks past the next two fold into one line per phase.
                if (plan.weeks[idx - 1]?.phase === w.phase && idx - 1 >= SHOWN) return null;
                return <Summary key={w.start} phase={g.phase} weeks={g.weeks.slice(wi)} />;
              }
              return (
                <View key={w.start} style={[s.week, now && s.weekNow]}>
                  <View style={s.weekDate}>
                    <Text style={[type.label, tabular, now && { color: color.blueDark, fontFamily: font.black }]}>{now ? "This week" : shortDay(w.start)}</Text>
                  </View>
                  <View style={{ flex: 1, gap: space(1) }}>
                    {w.focus_names.length
                      ? w.focus_names.map((n, ni) => <SkillLine key={n} name={n} done={done.has(w.focus_skill_ids[ni])} />)
                      : <Text style={type.body}>{w.goal}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {!all && plan.weeks.length > SHOWN && (
        <TextButton title="Show every week" align="left" onPress={onAll} style={[s.link, { marginTop: space(1.5) }]} />
      )}

      {plan.phase !== "after" && (
        <View style={s.end}>
          <Icon name="flag" color={color.goldDark} />
          <Text style={[type.label, { marginLeft: space(1.5), flex: 1 }]}>
            {exam?.short_name ?? "Test"} day, {longDay(plan.exam_date)}
          </Text>
        </View>
      )}
    </View>
  );
}

// A skill in a week: a gold tick once it's done, an empty ring until then.
function SkillLine({ name, done }: { name: string; done: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }} accessibilityLabel={done ? `${name}, done` : name}>
      <View style={[s.mark, done && s.markDone]} {...decorative}>
        {done && <Icon name="check" size={14} color={color.white} strokeWidth={3.5} />}
      </View>
      <Text style={[type.body, { flex: 1 }]}>{name}</Text>
    </View>
  );
}

// This week and next are listed in full; the rest are summed up.
const SHOWN = 2;

// "Dec – Jan" or "Feb": the months a run of weeks covers.
function months(weeks: Plan["weeks"]) {
  const a = shortMonth(parseDay(weeks[0].start).getMonth());
  const b = shortMonth(parseDay(weeks[weeks.length - 1].start).getMonth());
  return a === b ? a : `${a} – ${b}`;
}

function Summary({ phase, weeks }: { phase: PlanPhase; weeks: Plan["weeks"] }) {
  const skills = new Set(weeks.flatMap((w) => w.focus_names)).size;
  const text = phase === "learn"
    ? skills ? `${plural(skills, "more skill")}` : "Review and practice"
    : phase === "strengthen"
      ? plural(weeks.length, "week")
      : weeks[weeks.length - 1].goal ?? "";
  return (
    <View style={s.week}>
      <View style={s.weekDate}><Text style={[type.label, tabular]}>{months(weeks)}</Text></View>
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

function ProgressSkeleton() {
  return (
    <Skeleton label="Loading your progress">
      <View style={s.scroll}>
        <Bone w={200} h={64} />
        <Bone w={180} h={16} style={{ marginTop: 10 }} />
        <Bone w={140} h={22} style={{ marginTop: 28 }} />
        <Bone w="85%" h={16} style={{ marginTop: 8 }} />
        <Bone w={130} h={22} style={{ marginTop: 36 }} />
        {[0, 1].map((i) => (
          <View key={i} style={{ marginTop: 18, gap: 10 }}>
            <Bone w="50%" h={16} />
            <Bone h={16} r={8} />
          </View>
        ))}
        <Bone w={120} h={22} style={{ marginTop: 36 }} />
        <Bone h={240} r={radius.well} style={{ marginTop: 16 }} />
      </View>
    </Skeleton>
  );
}

const DAY = 40;

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  link: { paddingHorizontal: 0, alignSelf: "flex-start" },
  // The countdown: the page's one big number, in the blue of "current".
  bigRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: space(1.25) } as object,
  big: { fontFamily: font.black, fontSize: 64, lineHeight: 70, color: color.blueDark, ...tabular },
  bigLabel: { fontFamily: font.black, fontSize: 20, lineHeight: 26, color: color.ink },
  meterRow: { flexDirection: "row", alignItems: "baseline" },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: space(1.5), marginHorizontal: -space(0.5) },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  weekday: { lineHeight: 28 },
  day: { width: DAY, height: DAY, borderRadius: DAY / 2, alignItems: "center", justifyContent: "center" },
  dayDone: { backgroundColor: color.gold },
  dayToday: { borderWidth: BORDER, borderColor: color.goldDark },
  dayText: { fontFamily: font.extra, fontSize: 15, lineHeight: 20 },
  // A sunken well holds a phase's weeks; rows inside follow its corner (16 − 6).
  well: { backgroundColor: color.well, borderRadius: radius.well, padding: space(0.75), marginTop: space(1.25) },
  week: { flexDirection: "row", paddingVertical: space(1.5), paddingHorizontal: space(1.5), borderRadius: inner(radius.well, space(0.75)) },
  // This week: the same blue wash as the current tab and the current node.
  weekNow: { backgroundColor: color.blueWash },
  // Nudged down so the label sits on the first body line's baseline.
  weekDate: { width: 92, paddingRight: space(1), paddingTop: 3 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: BORDER, borderColor: color.lockDark, marginTop: 2, marginRight: space(1.25), alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: color.gold, borderColor: color.goldDark },
  end: { flexDirection: "row", alignItems: "center", marginTop: space(3) },
});
