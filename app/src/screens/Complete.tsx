// After a lesson or set: Socrates celebrates, the real numbers count up, and
// Continue goes back where the lesson started (the Learn path shows the next
// circle opening). After placement, the path is re-fetched to say where it
// picks up.
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { api, LearnPath, PathNode } from "../api";
import { clock, noOrphan } from "../copy";
import { SocratesSays } from "../components/SocratesLine";
import { Socrates } from "../socrates/Socrates";
import { Button, CountUp, Rise, TextButton } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource } from "../nav";
import { color, font, GUTTER, space, type, COLUMN } from "../theme";
import type { LessonResult } from "./Lesson";
import { Streak } from "./Streak";

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
  const [path, setPath] = useState<LearnPath | null>(null);
  useEffect(() => {
    feedback.complete();
    // The top bar's numbers and, after placement, where the path picks up.
    api.path().then(setPath, () => {});
  }, []);

  const { streak, lessons_today, lessons_today_no_placement } = result.stats;
  const placed = result.placement;
  // A timed set that ran out with nothing answered: no score, and the next
  // step is the same set again, not today's list.
  const empty = !!result.timeUp && result.answered === 0;
  // The first finished lesson of the learner's day moves the streak: whatever
  // they press next, the streak screen comes first, then that. The placement
  // quiz keeps the day but isn't a lesson, so it never shows the screen and
  // the first real lesson after it still does.
  const streakDue = !placed && !empty && streak >= 1 && (lessons_today_no_placement ?? lessons_today) === 1;
  const [after, setAfter] = useState<(() => void) | null>(null);
  const go = (fn: () => void) => () => (streakDue ? setAfter(() => fn) : fn());
  const names = placed?.next.map((n) => n.name) ?? [];
  const placedFirst = placed?.tested_out.length ? placed.next[0]?.id : undefined;
  const pathNext = path ? [...path.units.flatMap((u) => u.nodes), path.end as PathNode].find((n) => n.id === path.current) : undefined;
  const more = names.length - 3;
  const short = useWindowDimensions().height < 720;

  const [typing, setTyping] = useState(true);
  const mood = empty ? "concerned" : "celebrate";

  if (after) return <Streak stats={result.stats} onContinue={after} />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap}>
        {/* The finale is centered, like the prototype: Socrates big, his line under
            him, then the title and the three numbers spread across the column. */}
        <Rise style={s.center}>
          <Socrates size={short ? 104 : 140} mood={mood} talking={typing} lookAt={typing ? "user" : undefined} />
          <SocratesSays
            text={socratesLine(result)}
            tail="top"
            tailX="center"
            onTyping={setTyping}
            textStyle={{ textAlign: "center" }}
            style={{ marginTop: space(2), alignSelf: "center", maxWidth: 360 }}
          />
        </Rise>

        <Rise delay={120} style={{ marginTop: space(short ? 2.5 : 3) }}>
          <Text style={s.title} accessibilityRole="header">{noOrphan(titleOf(result))}</Text>
        </Rise>

        {!empty && <Rise delay={200} style={s.numbers}>
          <NumberCell label="right" delay={300}>
            <CountUp value={result.correct} delay={300} duration={600} style={type.number} />
            {result.total > 0 && <Text style={type.number}> of {result.total}</Text>}
          </NumberCell>
          {!placed && (
            <NumberCell label="XP" delay={400}>
              <CountUp value={result.xp} delay={400} duration={700} prefix="+" style={[type.number, { color: color.blue }]} />
            </NumberCell>
          )}
          <NumberCell label={result.seconds >= 60 ? "time" : "seconds"} delay={500}>
            <Text style={type.number}>{result.seconds >= 60 ? clock(result.seconds) : result.seconds}</Text>
          </NumberCell>
        </Rise>}

        {placed && (
          <Rise delay={600} style={{ marginTop: space(3) }}>
            {names.length > 1 && (
              <Text style={[type.body, s.centerText]}>
                {noOrphan(names.length > 2 ? `Then ${low(names[1])} and ${low(names[2])}${more > 0 ? `, and ${more} more` : ""}.` : `Then ${low(names[1])}.`)}
              </Text>
            )}
            {/* The path can pick up somewhere else (another section's unit); say so, so the title isn't contradicted. */}
            {placedFirst && pathNext && !(pathNext.kind === "skill" && pathNext.skill_id === placedFirst) && (
              <Text style={[type.body, s.centerText, { marginTop: space(1.5) }]}>
                {noOrphan(`Your path picks up at ${pathNext.kind === "skill" ? low(pathNext.title) : `the ${low(pathNext.title)}`}.`)}
              </Text>
            )}
          </Rise>
        )}

      </ScrollView>
      <Rise delay={700} style={s.foot}>
        {empty ? (
          <>
            <Button title="Try the timed set again" onPress={() => onStart(result.source)} testID="complete-retry" />
            <TextButton title="Back" onPress={onContinue} tone="soft" style={{ marginTop: space(0.5) }} />
          </>
        ) : (
          <Button title={placed ? "See your path" : "Continue"} onPress={go(onContinue)} testID="complete-continue" />
        )}
      </Rise>
    </View>
  );
}

function NumberCell({ label, children, delay }: { label: string; children: React.ReactNode; delay: number }) {
  return (
    <Rise delay={delay} style={{ alignItems: "center", minWidth: 88 }}>
      {/* A fixed height, so every label sits on one line whatever the number's run. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", height: 36 }}>{children}</View>
      <Text style={type.small}>{label}</Text>
    </Rise>
  );
}

const s = StyleSheet.create({
  // Centered in the space above the button, so there's no hole under the numbers.
  wrap: { flexGrow: 1, justifyContent: "center", paddingHorizontal: GUTTER, paddingTop: space(3), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  center: { alignItems: "center" },
  centerText: { textAlign: "center", ...(Platform.OS === "web" ? ({ textWrap: "balance" } as object) : null) },
  title: { fontFamily: font.black, fontSize: 28, lineHeight: 34, color: color.ink, textAlign: "center", ...(Platform.OS === "web" ? ({ textWrap: "balance" } as object) : null) },
  numbers: { flexDirection: "row", justifyContent: "space-around", marginTop: space(2.5), width: "100%", maxWidth: 420, alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});


