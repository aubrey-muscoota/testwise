// Practice: questions on demand, any day, even when every lesson is done.
// Each mode is a row with real counts from /api/practice/summary.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, PracticeSummary, Tree } from "../api";
import { lines, minutes, noOrphan, plural, skillStatus } from "../copy";
import { Icon } from "../components/icons";
import { SectionSwitch } from "../components/SectionSwitch";
import { useWide } from "../components/Shell";
import { Bone, Button, ErrorState, IconButton, Rise, Row, Skeleton } from "../components/ui";
import { LessonSource, practiceSource, useLoad } from "../nav";
import { color, GUTTER, space, type, COLUMN } from "../theme";

const TIMED_N = 10;
const SECTION_KEY = "testwise.section";

export function Practice({ onStart }: { onStart: (s: LessonSource) => void }) {
  const { data, error, reload } = useLoad(async () => {
    const [summary, tree] = await Promise.all([api.practiceSummary(), api.tree()]);
    return { summary, tree };
  });
  const [picking, setPicking] = useState(false);
  const wide = useWide();
  const exam = getExam();

  if (error && !data) return <ErrorState message="I couldn't load your practice counts. Try again?" onRetry={reload} />;
  if (!data) return <PracticeSkeleton />;
  const { summary, tree }: { summary: PracticeSummary; tree: Tree } = data;

  if (picking) {
    return <SkillPicker summary={summary} tree={tree} onBack={() => setPicking(false)} onPick={(id, name) => onStart(practiceSource({ mode: "skill", skill_id: id, n: 8 }, name))} />;
  }

  const t = summary.totals;
  const skills = tree.domains.flatMap((d) => d.skills);
  const started = skills.filter((sk) => (sk.answered ?? sk.attempts) > 0 && !sk.mastered).sort((a, b) => a.mastery - b.mastery);
  const weakNames = started.slice(0, 3).map((sk) => sk.name);
  const anyStarted = skills.some((sk) => sk.attempts > 0 || sk.tested_out);

  // Test pace across sections, for the timed set's length.
  const secs = exam?.sections.map((x) => x.seconds_per_question) ?? [80];
  const lo = Math.round((TIMED_N * Math.min(...secs)) / 60);
  const hi = Math.round((TIMED_N * Math.max(...secs)) / 60);
  const f = summary.fresh;
  const freshLeft = Math.max(0, f.daily_limit - f.generated_today);

  // Misses the mistakes set can serve (in open skills), and how many one set holds.
  const fixable = t.fixable ?? t.missed;
  const serve = Math.min(10, fixable);
  const go = (mode: "weak" | "mixed" | "timed" | "mistakes" | "fresh", why?: string) => {
    const n = mode === "timed" ? TIMED_N : mode === "fresh" ? 5 : mode === "mistakes" ? Math.max(3, serve) : 10;
    onStart(practiceSource({ mode, n }, undefined, why));
  };
  const mistakesWhy = "You missed these and haven't got them right since. Shall we see what tripped you?";

  // The mode worth doing first is the screen's one button; the rest are rows.
  const best = fixable >= 5 ? "mistakes" : started.length ? "weak" : "mixed";
  const headline =
    best === "mistakes" ? `${fixable} questions you missed are waiting`
    : best === "weak" ? `${weakNames[0]} is your weakest skill`
    : "Practice anything, any day";
  const cta =
    best === "mistakes" ? <Button title={`Fix ${serve} mistakes`} onPress={() => go("mistakes", mistakesWhy)} testID="practice-best" />
    // One named skill on the button, so the set it opens carries that name too.
    : best === "weak" ? <Button title={`Practice ${weakNames[0]}`} onPress={() => onStart(practiceSource({ mode: "skill", skill_id: started[0].id, n: 10 }, started[0].name))} testID="practice-best" />
    : <Button title="Start a mixed set" onPress={() => go("mixed")} testID="practice-best" />;
  const mistakesDetail = !fixable
    ? t.missed ? `${plural(t.missed, "miss", "misses")} in skills that aren't open yet` : "Nothing to fix right now"
    : serve < t.missed ? `Fix ${serve} of your ${t.missed} misses` : `${plural(serve, "question")} to fix`;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(6) }]}>
        <Rise>
          <Text style={type.title} accessibilityRole="header">{noOrphan(headline)}</Text>
          {wide && <View style={{ marginTop: space(3) }}>{cta}</View>}
        </Rise>

        <Rise delay={80} style={{ marginTop: space(3.5), gap: space(0.5) }}>
          {best !== "weak" && (
            <Row
              testID="mode-weak"
              icon="target"
              title="Weak spots"
              detail={weakNames.length ? `${weakNames[0]}${started.length > 1 ? ` and ${started.length - 1} more` : ""}` : "Your first open skills, until you've tried a few"}
              onPress={() => go("weak")}
            />
          )}
          {best !== "mistakes" && (
            <Row
              testID="mode-mistakes"
              icon="redo"
              title="My mistakes"
              detail={mistakesDetail}
              disabled={!fixable}
              onPress={() => go("mistakes", mistakesWhy)}
            />
          )}
          <Row
            testID="mode-timed"
            icon="clock"
            title="Timed set"
            detail={`${TIMED_N} questions at test pace, ${lo === hi ? minutes(lo) : `${lo} to ${hi} minutes`}`}
            onPress={() => go("timed", lines.timed)}
          />
          {best !== "mixed" && (
            <Row
              testID="mode-mixed"
              icon="shuffle"
              title="Mixed"
              detail={anyStarted ? "10 questions from skills you've started" : "10 questions from your open skills"}
              onPress={() => go("mixed")}
            />
          )}
          <Row testID="mode-skill" icon="book" title="One skill" detail="Pick any open skill and drill it" onPress={() => setPicking(true)} />
          {f.available && (
            <Row
              testID="mode-fresh"
              icon="quill"
              title="New questions from Socrates"
              detail={freshLeft > 0 ? `5 written for you, ${freshLeft} left today` : "That's today's 20. More tomorrow"}
              disabled={freshLeft === 0}
              onPress={() => go("fresh")}
            />
          )}
        </Rise>
        <View style={{ height: space(4) }} />
      </ScrollView>
      {!wide && <View style={s.foot}>{cta}</View>}
    </View>
  );
}

function SkillPicker({
  summary, tree, onBack, onPick,
}: { summary: PracticeSummary; tree: Tree; onBack: () => void; onPick: (id: string, name: string) => void }) {
  const sections = tree.sections ?? [];
  const [sec, setSec] = useState<string>(sections[0]?.id ?? "");
  useEffect(() => {
    AsyncStorage.getItem(SECTION_KEY).then((v) => v && sections.some((x) => x.id === v) && setSec(v), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const counts = new Map(summary.skills.map((x) => [x.skill_id, x] as const));
  const section = sections.find((x) => x.id === sec);
  const domains = section ? tree.domains.filter((d) => section.domains.includes(d.id)) : tree.domains;
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <IconButton name="back" label="Back to practice modes" onPress={onBack} style={{ marginLeft: -8, marginBottom: space(1) }} />
      <Text style={type.title} accessibilityRole="header">Which skill?</Text>
      <View style={{ marginTop: space(1.5) }}>
        <SectionSwitch sections={sections} value={sec} onChange={(id) => { setSec(id); AsyncStorage.setItem(SECTION_KEY, id).catch(() => {}); }} />
      </View>
      {domains.map((d) => (
        <View key={d.id} style={{ marginTop: space(3.5) }}>
          <Text style={type.heading}>{d.name}</Text>
          <View style={{ marginTop: space(1) }}>
            {d.skills.filter((sk) => sk.unlocked || sk.attempts > 0).map((sk) => {
              const c = counts.get(sk.id);
              // The same words as Path, plus the percentage Path shows in its ring.
              const detail = skillStatus(sk, c?.missed ?? 0, true) || "Not started";
              return <Row key={sk.id} title={sk.name} detail={detail} onPress={() => onPick(sk.id, sk.name)} />;
            })}
            {(() => {
              const locked = d.skills.filter((sk) => !sk.unlocked && sk.attempts === 0);
              if (!locked.length) return null;
              return (
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: space(1.25) }}>
                  <Icon name="lock" size={18} color={color.ink2} />
                  <Text style={[type.small, { marginLeft: space(1), flex: 1 }]}>
                    {locked.length === d.skills.length ? "All" : locked.length} {locked.length === 1 ? "skill opens" : "skills open"} as you finish the ones before {locked.length === 1 ? "it" : "them"}
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>
      ))}
      <View style={{ height: space(4) }} />
    </ScrollView>
  );
}

function PracticeSkeleton() {
  return (
    <Skeleton label="Loading practice">
      <View style={s.scroll}>
        <Bone w={260} h={30} />
        <Bone w={200} h={30} style={{ marginTop: 8 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: 14, marginTop: i ? 22 : 34 }}>
            <Bone w={24} h={24} r={12} />
            <View style={{ flex: 1, gap: 8 }}><Bone w="45%" h={16} /><Bone w="75%" h={12} /></View>
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1.5), paddingBottom: space(1.5), backgroundColor: color.bg, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});

