// The full plan: phases from today to the test, week by week, with the skills
// each week focuses on and whether the learner is on track. Each phase is a
// heavy heading over a cream well of weeks; this week sits in the blue "current"
// wash, and skills already finished (mastered or tested out) are ticked in gold.
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, Plan, PlanPhase } from "../api";
import { longDay, parseDay, plural, shortDay, shortMonth } from "../copy";
import { Icon } from "../components/icons";
import { useWide } from "../components/Shell";
import { Bone, decorative, ErrorState, IconButton, Rise, Skeleton, TextButton } from "../components/ui";
import { useLoad } from "../nav";
import { BORDER, color, font, GUTTER, inner, radius, space, tabular, type, COLUMN } from "../theme";

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];

const PHASE_FALLBACK: Record<PlanPhase, string> = {
  learn: "Learn",
  strengthen: "Strengthen",
  test_ready: "Test ready",
  rest: "Rest",
  after: "After the test",
};

export function PlanScreen({ onBack }: { onBack: () => void }) {
  const { data, error, reload } = useLoad(async () => {
    const [plan, tree] = await Promise.all([api.plan(), api.tree().catch(() => null)]);
    const done = new Set((tree?.domains ?? []).flatMap((d) => d.skills).filter((sk) => sk.mastered || sk.tested_out).map((sk) => sk.id));
    return { plan, done };
  });
  const wide = useWide();
  const exam = getExam();
  const [all, setAll] = React.useState(false);

  const header = (
    <View style={s.head}>
      <IconButton name="back" label="Back to Today" onPress={onBack} style={{ marginLeft: -8 }} />
    </View>
  );

  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState message="I couldn't load your plan. Try again?" onRetry={reload} /></View>;
  if (!data) return <View style={{ flex: 1 }}>{header}<PlanSkeleton /></View>;

  const { plan, done } = data;
  const phaseName = (p: PlanPhase) => exam?.plan.phases.find((x) => x.id === p)?.name ?? PHASE_FALLBACK[p];

  // Group the weeks into runs of the same phase, in order.
  const groups: { phase: PlanPhase; weeks: Plan["weeks"] }[] = [];
  for (const w of plan.weeks) {
    const g = groups[groups.length - 1];
    if (g && g.phase === w.phase) g.weeks.push(w);
    else groups.push({ phase: w.phase, weeks: [w] });
  }

  const date = shortDay(plan.exam_date);
  const title = plan.phase === "after" ? "Your plan is done" : `${plan.exam_date_assumed ? "About " : ""}${plural(plan.days_left, "day")} to ${date}`;
  // Dates never break across lines ("Mar" / "2").
  const day = (iso: string) => shortDay(iso).replace(" ", "\u00a0");
  // One sentence owns the count, the learn-by date and the timed-sets date.
  const allStarted = plan.skills_started >= plan.skills_total;
  const count = allStarted ? `All ${plan.skills_total} skills started.` : `You've started ${plan.skills_started} of ${plan.skills_total} skills.`;
  const track = plan.phase === "after"
    ? count
    : !plan.status.on_track
      ? `${count} ${plan.status.behind_by_lessons > 0 ? `${plural(plan.status.behind_by_lessons, "lesson")} behind, so today's list leans on new skills to catch up.` : "A little behind. A few days in a row will fix it."}`
      : allStarted
        ? `${count} Timed sets from ${day(plan.test_ready_from)}.`
        : `${count} All of them by ${day(plan.learn_by)}, then timed sets from ${day(plan.test_ready_from)}.`;
  const assumed = plan.exam_date_assumed ? `Assuming a test on ${longDay(plan.exam_date)}.` : null;

  // The verb for each phase, said once under its heading.
  const learnWeeks = plan.weeks.filter((w) => w.phase === "learn");
  const perWeek = learnWeeks.length ? Math.round(learnWeeks.reduce((a, w) => a + w.focus_names.length, 0) / learnWeeks.length) : 0;
  const phaseLine: Partial<Record<PlanPhase, string>> = {
    learn: perWeek >= 2 ? `About ${WORDS[perWeek] ?? perWeek} new skills a week` : "A new skill most weeks",
    strengthen: "Your weakest skills, plus mixed sets",
  };

  return (
    <View style={{ flex: 1 }}>
      {header}
      <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(2) }]}>
        <Rise>
          <Text style={type.title} accessibilityRole="header">{title}</Text>
          <Text style={[type.body, { marginTop: space(1) }]}>{track}{assumed ? ` ${assumed}` : ""}</Text>
        </Rise>

        {groups.map((g, gi) => (
          <Rise key={`${g.phase}-${gi}`} delay={60 + gi * 50} style={{ marginTop: space(4) }}>
            <Text style={type.heading} accessibilityRole="header">{phaseName(g.phase)}</Text>
            {phaseLine[g.phase] && <Text style={[type.small, { marginTop: 2 }]}>{phaseLine[g.phase]}</Text>}
            <View style={s.well}>
              {g.weeks.map((w, wi) => {
                const now = gi === 0 && wi === 0;
                const idx = plan.weeks.indexOf(w);
                if (!all && idx >= SHOWN) {
                  // The weeks past the next two fold into one line per phase.
                  if (plan.weeks[idx - 1]?.phase === w.phase && idx - 1 >= SHOWN) return null;
                  const rest = g.weeks.slice(wi);
                  return <Summary key={w.start} phase={g.phase} weeks={rest} />;
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
          </Rise>
        ))}

        {!all && plan.weeks.length > SHOWN && (
          <TextButton title="Show every week" align="left" onPress={() => setAll(true)} style={{ alignSelf: "flex-start", paddingHorizontal: 0, marginTop: space(2) }} />
        )}

        {plan.phase !== "after" && (
          <View style={s.end}>
            <Icon name="flag" color={color.goldDark} />
            <Text style={[type.label, { marginLeft: space(1.5), flex: 1 }]}>
              {exam?.short_name ?? "Test"} day, {longDay(plan.exam_date)}
            </Text>
          </View>
        )}
        <View style={{ height: space(4) }} />
      </ScrollView>
    </View>
  );
}

// A skill in a week: a gold tick once it's finished, an empty ring until then.
function SkillLine({ name, done }: { name: string; done: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }} accessibilityLabel={done ? `${name}, finished` : name}>
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

function PlanSkeleton() {
  return (
    <Skeleton label="Loading your plan">
      <View style={s.scroll}>
        <Bone w={240} h={30} />
        <Bone h={16} style={{ marginTop: 14 }} />
        <Bone w="70%" h={16} style={{ marginTop: 8 }} />
        {[0, 1].map((g) => (
          <View key={g} style={{ marginTop: space(4), gap: 10 }}>
            <Bone w={120} h={22} />
            <Bone h={120} r={radius.well} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: GUTTER, paddingTop: space(1), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(1), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  // A sunken well holds a phase's weeks; rows inside follow its corner (16 − 6).
  well: { backgroundColor: color.well, borderRadius: radius.well, padding: space(0.75), marginTop: space(1.5) },
  week: { flexDirection: "row", paddingVertical: space(1.5), paddingHorizontal: space(1.5), borderRadius: inner(radius.well, space(0.75)) },
  // This week: the same blue wash as the current tab and the current node.
  weekNow: { backgroundColor: color.blueWash },
  // Nudged down so the label sits on the first body line's baseline.
  weekDate: { width: 92, paddingRight: space(1), paddingTop: 3 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: BORDER, borderColor: color.lockDark, marginTop: 2, marginRight: space(1.25), alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: color.gold, borderColor: color.goldDark },
  end: { flexDirection: "row", alignItems: "center", marginTop: space(4) },
});
