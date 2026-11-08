// After a lesson or set: Socrates celebrates, the real numbers count up, and
// the plan is re-fetched so the learner sees what changed today.
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, Plan } from "../api";
import { clock, plural } from "../copy";
import { Icon } from "../components/icons";
import { SocratesLine } from "../components/SocratesLine";
import { Bone, Button, CountUp, ProgressBar, Rise, TextButton } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource } from "../nav";
import { color, font, GUTTER, space, tabular, type } from "../theme";
import type { LessonResult } from "./Lesson";
import { taskSource } from "./Today";

function socratesLine(r: LessonResult) {
  const p = r.placement;
  if (p) {
    return p.tested_out.length
      ? `You already know ${p.tested_out.length} of ${p.total_skills} skills, so I've skipped you past them.`
      : "We'll start from the first skills. That's a fine place to be.";
  }
  if (r.timeUp) {
    return r.answered
      ? `Time's up. You got through ${r.answered} of ${r.planned}. On test day, skipping a hard one sooner buys time for two easy ones.`
      : "Time's up before the first answer. Next time, give each question about a minute and move on.";
  }
  if (r.total && r.correct === r.total) return `All ${r.total} right! Tomorrow I'll check that it stuck.`;
  if (r.correct / Math.max(1, r.total) >= 0.7) return `${r.correct} of ${r.total}. The ones you missed come back in your reviews.`;
  return `${r.correct} of ${r.total}. That's what practice is for. Which one surprised you?`;
}

function titleOf(r: LessonResult) {
  if (r.placement) return "Placement done";
  if (r.timeUp) return "Time's up";
  return r.title ? `${r.title}, done` : "Done";
}

export function Complete({ result, onContinue, onStart }: { result: LessonResult; onContinue: () => void; onStart: (s: LessonSource) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planFailed, setPlanFailed] = useState(false);
  useEffect(() => {
    feedback.complete();
    api.plan().then(setPlan, () => setPlanFailed(true));
  }, []);

  const { streak, lessons_today } = result.stats;
  const streakStarted = lessons_today === 1 && streak >= 1;
  const placed = result.placement;
  const next = plan?.today.find((t) => !t.done && t.start);
  const doneCount = plan?.today.filter((t) => t.done).length ?? 0;
  const count = plan?.today.length ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Rise>
          <SocratesLine text={socratesLine(result)} mood="celebrate" size={112} />
        </Rise>

        <Rise delay={120} style={{ marginTop: space(3) }}>
          <Text style={type.title} accessibilityRole="header">{titleOf(result)}</Text>
        </Rise>

        <Rise delay={200} style={s.numbers}>
          <NumberCell label="right" delay={300}>
            <CountUp value={result.correct} delay={300} duration={600} style={s.big} />
            {result.total > 0 && <Text style={[s.big, s.of]}> of {result.total}</Text>}
          </NumberCell>
          <NumberCell label="XP" delay={400}>
            <CountUp value={result.xp} delay={400} duration={700} prefix="+" style={s.big} />
          </NumberCell>
          <NumberCell label={result.seconds >= 60 ? "minutes" : "seconds"} delay={500}>
            <Text style={[s.big, tabular]}>{result.seconds >= 60 ? clock(result.seconds) : result.seconds}</Text>
          </NumberCell>
        </Rise>

        {streakStarted && (
          <Rise delay={560} style={s.streak}>
            <Icon name="streak" color={color.terracotta} />
            <Text style={[type.label, { marginLeft: space(1) }]}>
              {streak === 1 ? "Day one of a streak" : `${streak} days in a row`}
            </Text>
          </Rise>
        )}

        {placed && (
          <Rise delay={600} style={{ marginTop: space(3) }}>
            <Text style={type.body}>
              {placed.tested_out.length ? `Tested out: ${plural(placed.tested_out.length, "skill")}. They stay open for practice.` : "Nothing skipped, so the path starts at the beginning."}
            </Text>
            {placed.next.length > 0 && (
              <Text style={[type.body, { marginTop: space(1) }]}>
                Up next: {placed.next.slice(0, 3).map((n) => n.name).join(", ")}
                {placed.next.length > 3 ? `, and ${placed.next.length - 3} more` : ""}.
              </Text>
            )}
          </Rise>
        )}

        {!placed && (
          <Rise delay={640} style={{ marginTop: space(4) }}>
            {plan ? (
              <>
                <View style={s.planHead}>
                  <Text style={type.heading}>{next ? "Today" : "Today's list is done"}</Text>
                  <Text style={[type.small, tabular]}>{doneCount} of {count} done</Text>
                </View>
                <View style={{ flexDirection: "row", marginTop: space(1) }}>
                  <ProgressBar value={count ? doneCount / count : 1} height={6} fill={next ? color.azure : color.olive} />
                </View>
                {next && (
                  <View style={{ marginTop: space(2) }}>
                    <Text style={type.label}>Next: {next.title}</Text>
                    <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2}>{next.why}</Text>
                  </View>
                )}
              </>
            ) : planFailed ? null : (
              <View style={{ gap: 10 }} accessibilityLabel="Updating today's plan">
                <Bone w={160} h={20} /><Bone h={6} /><Bone w="70%" h={14} />
              </View>
            )}
          </Rise>
        )}
      </ScrollView>
      <Rise delay={700} style={s.foot}>
        {next && !placed ? (
          <>
            <Button title="Start the next one" onPress={() => onStart(taskSource(next)!)} testID="complete-next" />
            <TextButton title="Back to today" onPress={onContinue} tone="soft" style={{ marginTop: space(0.5) }} />
          </>
        ) : (
          <Button title={placed ? "See today's plan" : "Back to today"} onPress={onContinue} testID="complete-continue" />
        )}
      </Rise>
    </View>
  );
}

function NumberCell({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <Rise delay={delay} style={{ marginRight: space(4) }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>{children}</View>
      <Text style={type.small}>{label}</Text>
    </Rise>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: space(5), paddingBottom: space(2), maxWidth: 560, width: "100%", alignSelf: "center" },
  numbers: { flexDirection: "row", flexWrap: "wrap", marginTop: space(2.5) },
  big: { fontFamily: font.serifSemi, fontSize: 36, lineHeight: 42, color: color.ink },
  of: { fontSize: 22, color: color.inkSoft },
  streak: { flexDirection: "row", alignItems: "center", marginTop: space(2.5) },
  planHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: 560, width: "100%", alignSelf: "center" },
});


