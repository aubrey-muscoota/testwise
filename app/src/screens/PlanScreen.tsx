// The full plan: phases from today to the test, week by week, with the skills
// each week focuses on and whether the learner is on track.
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, Plan, PlanPhase } from "../api";
import { dayRange, longDay, plural, shortDay } from "../copy";
import { Icon } from "../components/icons";
import { useWide } from "../components/Shell";
import { Bone, ErrorState, IconButton, Rise, Skeleton } from "../components/ui";
import { useLoad } from "../nav";
import { color, GUTTER, space, tabular, type } from "../theme";

const PHASE_FALLBACK: Record<PlanPhase, string> = {
  learn: "Learn",
  strengthen: "Strengthen",
  test_ready: "Test ready",
  rest: "Rest",
  after: "After the test",
};

export function PlanScreen({ onBack }: { onBack: () => void }) {
  const { data, error, reload } = useLoad(async () => ({ plan: await api.plan() }));
  const wide = useWide();
  const exam = getExam();

  const header = (
    <View style={s.head}>
      <IconButton name="back" label="Back to Today" onPress={onBack} style={{ marginLeft: -8 }} />
    </View>
  );

  if (error && !data) return <View style={{ flex: 1 }}>{header}<ErrorState message="I couldn't load your plan. Try again?" onRetry={reload} /></View>;
  if (!data) return <View style={{ flex: 1 }}>{header}<PlanSkeleton /></View>;

  const { plan }: { plan: Plan } = data;
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
  const track = plan.status.on_track
    ? `On track. Every skill started by ${shortDay(plan.learn_by)}, test-pace sets from ${shortDay(plan.test_ready_from)}.`
    : plan.status.behind_by_lessons > 0
      ? `${plural(plan.status.behind_by_lessons, "lesson")} behind. Today's list leans on new skills to catch up.`
      : "A little behind. A few days in a row will fix it.";

  return (
    <View style={{ flex: 1 }}>
      {header}
      <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(2) }]}>
        <Rise>
          <Text style={type.title} accessibilityRole="header">{title}</Text>
          <Text style={[type.body, { marginTop: space(1) }]}>{track}</Text>
          <Text style={[type.small, tabular, { marginTop: space(1) }]}>
            {plan.skills_started} of {plan.skills_total} skills started
            {plan.exam_date_assumed ? ` · assuming a test on ${longDay(plan.exam_date)}` : ""}
          </Text>
        </Rise>

        {groups.map((g, gi) => (
          <Rise key={`${g.phase}-${gi}`} delay={60 + gi * 50} style={{ marginTop: space(5) }}>
            <Text style={type.heading} accessibilityRole="header">{phaseName(g.phase)}</Text>
            <Text style={[type.small, tabular, { marginTop: 2 }]}>
              {dayRange(g.weeks[0].start, g.weeks[g.weeks.length - 1].end)}
            </Text>
            <View style={{ marginTop: space(1.5) }}>
              {g.weeks.map((w, wi) => {
                const now = gi === 0 && wi === 0;
                return (
                  <View key={w.start} style={[s.week, now && s.weekNow]}>
                    <View style={s.weekDate}>
                      <Text style={[type.label, tabular, now && { color: color.azureInk }]}>{now ? "This week" : dayRange(w.start, w.end).replace(" \u2013 ", " \u2013\n").replace(/\n(\d+)$/, " $1")}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={type.body}>{w.goal}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Rise>
        ))}

        {plan.phase !== "after" && (
          <View style={s.end}>
            <Icon name="flag" color={color.terracotta} />
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

function PlanSkeleton() {
  return (
    <Skeleton label="Loading your plan">
      <View style={s.scroll}>
        <Bone w={240} h={30} />
        <Bone h={16} style={{ marginTop: 14 }} />
        <Bone w="70%" h={16} style={{ marginTop: 8 }} />
        {[0, 1].map((g) => (
          <View key={g} style={{ marginTop: space(5), gap: 14 }}>
            <Bone w={120} h={22} />
            {[0, 1, 2].map((i) => <View key={i} style={{ flexDirection: "row", gap: 16 }}><Bone w={80} h={16} /><Bone w="60%" h={16} /></View>)}
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: GUTTER, paddingTop: space(1), maxWidth: 640, width: "100%", alignSelf: "center" },
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(1), maxWidth: 640, width: "100%", alignSelf: "center" },
  week: { flexDirection: "row", paddingVertical: space(1.25) },
  weekNow: {},
  weekDate: { width: 96, paddingRight: space(1) },
  end: { flexDirection: "row", alignItems: "center", marginTop: space(4) },
});
