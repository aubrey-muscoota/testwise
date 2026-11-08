// After a lesson or set: Socrates celebrates, the real numbers count up, and
// the plan is re-fetched so the learner sees what changed today.
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, Plan } from "../api";
import { clock, taskName } from "../copy";
import { Icon } from "../components/icons";
import { SocratesLine } from "../components/SocratesLine";
import { Bone, Button, CountUp, Rise, TextButton } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource } from "../nav";
import { color, font, GUTTER, space, tabular, type, COLUMN } from "../theme";
import type { LessonResult } from "./Lesson";
import { taskSource } from "./Today";

const low = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);

// "math" from a Math placement, so counts say which skills they mean.
const sectionWord = (r: LessonResult) => (r.source.kind === "placement" && r.source.name ? `${r.source.name.toLowerCase()} ` : "");

function socratesLine(r: LessonResult) {
  const p = r.placement;
  if (p) {
    return p.tested_out.length
      ? `You already know ${p.tested_out.length} of ${p.total_skills} ${sectionWord(r)}skills, so I've skipped you past them.`
      : "We'll start from the first skills. That's a fine place to be.";
  }
  if (r.timeUp) {
    return r.answered
      ? `Time's up. You got through ${r.answered} of ${r.planned}. On test day, skipping a hard one sooner buys time for two easy ones.`
      : "Give each question about a minute, then move on.";
  }
  // The score sits right below in big numbers, so he doesn't read it out.
  if (r.total && r.correct === r.total) return "Every one right! Tomorrow I'll check that it stuck.";
  if (r.correct / Math.max(1, r.total) >= 0.7) return "The ones you missed come back in your reviews.";
  return "That's what practice is for. Which one surprised you?";
}

function titleOf(r: LessonResult) {
  const p = r.placement;
  if (p) return p.tested_out.length && p.next.length ? `You start at ${p.next[0].name.toLowerCase()}` : "You start at the beginning";
  if (r.timeUp) return r.answered ? "Time's up" : "Time ran out before you answered";
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
  // A timed set that ran out with nothing answered: no score, and the next
  // step is the same set again, not today's list.
  const empty = !!result.timeUp && result.answered === 0;
  const next = empty ? undefined : plan?.today.find((t) => !t.done && t.start);
  const names = placed?.next.map((n) => n.name) ?? [];
  const placedFirst = placed?.tested_out.length ? placed.next[0]?.id : undefined;
  const planNext = plan?.today.find((t) => !t.done && t.start && t.kind === "lesson");
  const more = names.length - 3;
  const retryPlan = () => { setPlanFailed(false); api.plan().then(setPlan, () => setPlanFailed(true)); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap}>
        <Rise>
          <SocratesLine text={socratesLine(result)} mood={empty ? "concerned" : "celebrate"} size={112} />
        </Rise>

        <Rise delay={120} style={{ marginTop: space(3) }}>
          <Text style={type.title} accessibilityRole="header">{titleOf(result)}</Text>
        </Rise>

        {!empty && <Rise delay={200} style={s.numbers}>
          {(
            <NumberCell label="right" delay={300}>
              <CountUp value={result.correct} delay={300} duration={600} style={s.big} />
              {result.total > 0 && <Text style={[s.big, s.of, tabular]}> of {result.total}</Text>}
            </NumberCell>
          )}
          {!empty && !placed && (
            <NumberCell label="XP" delay={400}>
              <CountUp value={result.xp} delay={400} duration={700} prefix="+" style={s.big} />
            </NumberCell>
          )}
          <NumberCell label={result.seconds >= 60 ? "time" : "seconds"} delay={500}>
            <Text style={[s.big, tabular]}>{result.seconds >= 60 ? clock(result.seconds) : result.seconds}</Text>
          </NumberCell>
        </Rise>}

        {streakStarted && !placed && !empty && (
          <Rise delay={560} style={s.streak}>
            <Icon name="streak" color={color.terracotta} />
            <Text style={[type.label, { marginLeft: space(1) }]}>
              {streak === 1 ? "Day one of a streak" : `${streak} days in a row`}
            </Text>
          </Rise>
        )}

        {placed && (
          <Rise delay={600} style={{ marginTop: space(3) }}>
            {names.length > 1 && (
              <Text style={type.body}>
                {names.length > 2 ? `Then ${low(names[1])} and ${low(names[2])}${more > 0 ? `, and ${more} more` : ""}.` : `Then ${low(names[1])}.`}
              </Text>
            )}
            {/* Today's list can lead with another section; say so, so the title isn't contradicted. */}
            {placedFirst && planNext && planNext.skill_id !== placedFirst && (
              <Text style={[type.body, { marginTop: space(1.5) }]}>
                {`Today's list opens with ${low(taskName(planNext.title))}, then ${sectionWord(result).trim() || "these"}.`}
              </Text>
            )}
          </Rise>
        )}

        {!placed && !empty && (
          <Rise delay={640} style={{ marginTop: space(4) }}>
            {plan ? (
              <>
                <Text style={type.heading}>{next ? `Next: ${next.title}` : "Today's list is done"}</Text>
              </>
            ) : planFailed ? (
              <View style={{ alignItems: "flex-start" }}>
                <Text style={type.small}>I couldn't refresh today's list.</Text>
                <TextButton title="Try again" align="left" onPress={retryPlan} style={{ paddingHorizontal: 0 }} />
              </View>
            ) : (
              <View style={{ gap: 10 }} accessibilityLabel="Updating today's plan">
                <Bone w={220} h={24} />
              </View>
            )}
          </Rise>
        )}
      </ScrollView>
      <Rise delay={700} style={s.foot}>
        {empty ? (
          <>
            <Button title="Try the timed set again" onPress={() => onStart(result.source)} testID="complete-retry" />
            <TextButton title="Back to today" onPress={onContinue} tone="soft" style={{ marginTop: space(0.5) }} />
          </>
        ) : next && !placed ? (
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
      {/* A fixed height, so every label sits on one line whatever the number's run. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", height: 42 }}>{children}</View>
      <Text style={type.small}>{label}</Text>
    </Rise>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: space(5), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  numbers: { flexDirection: "row", flexWrap: "wrap", marginTop: space(2.5) },
  big: { fontFamily: font.serifSemi, fontSize: 36, lineHeight: 42, color: color.ink },
  of: { fontSize: 22, color: color.inkSoft },
  streak: { flexDirection: "row", alignItems: "center", marginTop: space(2.5) },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});


