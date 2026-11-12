// Today: the countdown, one line from Socrates about where the learner stands,
// today's tasks from the plan with the next one emphasized, and one button
// that starts it.
import React from "react";
import { Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { api, Exam, getExam, Plan, PlanTask, Tree } from "../api";
import { longDay, minutes, taskName } from "../copy";
import { Icon } from "../components/icons";
import { SocratesLine } from "../components/SocratesLine";
import { useWide } from "../components/Shell";
import { Bone, Button, ErrorState, Rise, Skeleton, Stat, TextButton, Wordmark, decorative, usePop } from "../components/ui";
import { LessonSource, practiceSource, useLoad } from "../nav";
import { BORDER, color, font, GUTTER, radius, space, tabular, type, COLUMN } from "../theme";

export function taskSource(t: PlanTask): LessonSource | null {
  if (!t.start) return null;
  return { kind: "task", start: t.start, title: t.kind === "review" ? "Review" : taskName(t.title), why: t.why, mode: t.mode };
}

export function startLabel(t: PlanTask) {
  if (t.kind === "review") return "Start review";
  if (t.kind === "lesson") return `Start ${taskName(t.title)}`;
  return `Start ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`;
}

// "Both done." for two tasks, "All 3 done." for more.
const allDoneWords = (n: number) => (n === 1 ? "Done for today." : n === 2 ? "Both done." : `All ${n} done.`);

// The big line at the top.
export function countdown(plan: Plan, exam: Exam | null, narrow: boolean): { title: string; sub: string | null } {
  const name = exam?.short_name ?? "test";
  const d = plan.days_left;
  const br = narrow ? "\n" : " ";
  if (plan.phase === "after" || d < 0) return { title: `How did the${br}${name} go?`, sub: "Taking it again? Set a new date in Me." };
  if (d === 0) return { title: "Test day", sub: longDay(plan.exam_date) };
  if (d === 1) return { title: `Your ${name} is${br}tomorrow`, sub: longDay(plan.exam_date) };
  if (plan.exam_date_assumed) {
    return { title: d >= 14 ? `About ${Math.round(d / 7)} weeks${br}to go` : `About ${d} days${br}to go`, sub: null };
  }
  return { title: `${d} days${br}to your ${name}`, sub: longDay(plan.exam_date) };
}

type Data = { plan: Plan; tree: Tree };

export function Today({
  onStart, onOpenPlan, onEditDate, onUnauthorized,
}: { onStart: (s: LessonSource) => void; onOpenPlan: () => void; onEditDate: () => void; onUnauthorized: () => void }) {
  const { data, error, reload } = useLoad<Data>(async () => {
    const [plan, tree] = await Promise.all([api.plan(), api.tree()]);
    return { plan, tree };
  });
  const [refreshing, setRefreshing] = React.useState(false);
  const wide = useWide();
  const narrow = useWindowDimensions().width < 520;
  const exam = getExam();

  React.useEffect(() => {
    if (error?.status === 401) onUnauthorized();
  }, [error, onUnauthorized]);

  if (error && !data) return <ErrorState message="I couldn't load today's plan. Is the connection down?" onRetry={reload} />;
  if (!data) return <TodaySkeleton />;

  const { plan, tree } = data;
  const st = tree.stats;
  const head = countdown(plan, exam, narrow);
  const tasks = plan.today;
  const next = tasks.find((t) => !t.done && t.start);
  const anyDone = tasks.some((t) => t.done);
  const allDone = tasks.length > 0 && !tasks.some((t) => !t.done && t.start);
  const left = tasks.filter((t) => !t.done).reduce((a, t) => a + t.minutes, 0);

  // The shakiest started skill, for "more" once today is done.
  const started = tree.domains.flatMap((d) => d.skills).filter((sk) => (sk.answered ?? sk.attempts) > 0 && !sk.mastered).sort((a, b) => a.mastery - b.mastery);
  const restTask = tasks.find((t) => t.kind === "rest");
  const line = restTask
    ? restTask.why
    : allDone
      ? started.length
        ? `${allDoneWords(tasks.length)} ${started[0].name} is still your shakiest skill. Ten more minutes on it?`
        : "That's today done. Come back tomorrow and the list will be new."
      : plan.status.message;

  // The button names one skill, so the set it opens is that skill, under that name.
  const more = started.length
    ? practiceSource({ mode: "skill", skill_id: started[0].id, n: 10 }, started[0].name)
    : practiceSource({ mode: "weak", n: 10 }, "Weak spots");
  const cta = next
    ? <Button title={startLabel(next)} onPress={() => onStart(taskSource(next)!)} testID="start-next" />
    : allDone && !restTask
      ? <Button title={started.length ? `Practice ${started[0].name}` : "Practice weak spots"} onPress={() => onStart(more)} testID="start-next" />
      : null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[s.scroll, wide && { paddingTop: space(4) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      >
        {/* On wide screens the rail holds the wordmark; this row's top padding matches
            the rail's, so the XP count sits on the wordmark's line. */}
        <View style={s.topRow}>
          {!wide && <Wordmark size={19} />}
          <View style={{ flex: 1 }} />
          {st.xp > 0 && (
            <View style={s.stats}>
              {st.streak >= 2 && <Stat icon="streak" value={st.streak} label={st.streak === 1 ? "day in a row" : "days in a row"} tone="gold" />}
              <Stat icon="xp" value={st.xp} label="XP" tone="blue" />
            </View>
          )}
        </View>

        <Rise>
          <Text style={type.hero} accessibilityRole="header">{head.title}</Text>
          {head.sub ? (
            <Text style={[type.body, { color: color.ink2, marginTop: space(0.5) }]}>{head.sub}</Text>
          ) : (
            <View style={s.subRow}>
              <Text style={[type.body, { color: color.ink2 }]}>No test date yet. </Text>
              <TextButton title="Set it" onPress={onEditDate} style={s.inlineLink} accessibilityLabel="Set your test date" />
            </View>
          )}
        </Rise>

        <Rise delay={80} style={{ marginTop: space(3) }}>
          <SocratesLine text={line} mood={allDone ? "happy" : plan.status.on_track ? "idle" : "concerned"} size={84} />
        </Rise>

        {tasks.length > 0 && (
          <Rise delay={140} style={{ marginTop: space(4) }}>
            {/* The rings and checks show progress; the heading only says the time. */}
            {!allDone && left > 0 && (
              <Text style={[type.heading, tabular, { marginBottom: space(1.5) }]}>{minutes(left)} {anyDone ? "left" : "today"}</Text>
            )}
            {tasks.map((t, i) => (
              <Rise key={t.id} delay={180 + i * 40}>
                <TaskRow task={t} isNext={t === next} onPress={t.start && !t.done ? () => onStart(taskSource(t)!) : undefined} />
              </Rise>
            ))}
          </Rise>
        )}

        {wide && cta && <View style={{ marginTop: space(3) }}>{cta}</View>}

        <TextButton title="See the full plan" icon="arrow" onPress={onOpenPlan} align="left" style={{ marginTop: space(1.5), alignSelf: "flex-start", marginLeft: -space(1) }} />
        <View style={{ height: space(4) }} />
      </ScrollView>
      {!wide && cta && <View style={s.foot}>{cta}</View>}
    </View>
  );
}

// Done: a gold disc with a check (finished things are gold). Next: a blue ring. Later: a quiet ring.
function Mark({ state }: { state: "done" | "next" | "later" }) {
  // The ring turning into a check pops once, so progress is felt, not counted.
  const pop = usePop(state === "done", 1.18);
  return (
    <Animated.View {...decorative} style={[{ width: 28, height: 28 }, pop]}>
      <Svg width={28} height={28} viewBox="0 0 28 28">
        {state === "done" ? (
          <>
            <Circle cx={14} cy={14} r={12.5} fill={color.gold} stroke={color.goldDark} strokeWidth={1.5} />
            <Path d="M8.4 14.4L12.2 18L19.6 10.1" stroke={color.white} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <Circle cx={14} cy={14} r={11.5} fill="none" stroke={state === "next" ? color.blue : color.lockDark} strokeWidth={3} />
        )}
      </Svg>
    </Animated.View>
  );
}

function TaskRow({ task, isNext, onPress }: { task: PlanTask; isNext: boolean; onPress?: () => void }) {
  const state = task.done ? "done" : isNext ? "next" : "later";
  const mins = minutes(task.minutes);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.task, isNext && s.taskNext, pressed && { backgroundColor: isNext ? color.blueWash : color.well }]}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${task.title}, ${mins}${task.done ? ", done" : ""}. ${task.why}`}
    >
      <Mark state={state} />
      <View style={{ flex: 1, marginLeft: space(1.5) }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text
            style={[isNext ? s.taskTitleNext : type.label, { flex: 1 }, task.done && { color: color.ink2 }]}
          >
            {task.kind === "lesson" ? taskName(task.title) : task.title}
          </Text>
          <Text style={[type.small, tabular, { marginLeft: space(1) }]}>{mins}</Text>
        </View>
        {/* Once it's checked off, the reason has done its job. */}
        {!task.done && (
          <Text style={[isNext ? type.body : type.small, isNext ? { marginTop: space(0.5) } : { marginTop: 2 }, !isNext && { color: color.ink2 }]} numberOfLines={isNext ? undefined : 2}>
            {task.why}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function TodaySkeleton() {
  return (
    <Skeleton label="Loading today's plan">
      <View style={s.scroll}>
        <View style={[s.topRow, { height: 28 }]}><Bone w={96} h={20} /></View>
        <Bone w={220} h={34} />
        <Bone w={170} h={34} style={{ marginTop: 8 }} />
        <View style={{ flexDirection: "row", marginTop: space(4), gap: space(2) }}>
          <Bone w={84} h={84} r={42} />
          <View style={{ flex: 1, gap: 10, paddingTop: 10 }}>
            <Bone h={16} /><Bone h={16} /><Bone w="60%" h={16} />
          </View>
        </View>
        <Bone w={120} h={22} style={{ marginTop: space(5) }} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: space(1.5), marginTop: space(2.5) }}>
            <Bone w={28} h={28} r={14} />
            <View style={{ flex: 1, gap: 8 }}><Bone w="70%" h={16} /><Bone h={12} /></View>
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  topRow: { flexDirection: "row", alignItems: "center", minHeight: 32, marginBottom: space(2.5) },
  stats: { flexDirection: "row", gap: space(2) },
  subRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: space(0.5) },
  inlineLink: { minHeight: 32, paddingHorizontal: 0 },
  task: { flexDirection: "row", alignItems: "flex-start", paddingVertical: space(1.5), paddingHorizontal: space(1.5), marginHorizontal: -space(1.5), borderRadius: radius.row },
  // The next task is the one card on the screen: a 2 px border, thicker at the bottom.
  taskNext: {
    backgroundColor: color.bg, paddingVertical: space(2) - BORDER, paddingHorizontal: space(1.5) - BORDER, marginVertical: space(0.75),
    borderWidth: BORDER, borderBottomWidth: BORDER * 2, borderColor: color.line, borderRadius: radius.card,
  },
  taskTitleNext: { fontFamily: font.black, fontSize: 20, lineHeight: 26, color: color.ink },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1.5), paddingBottom: space(1.5), backgroundColor: color.bg, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});
