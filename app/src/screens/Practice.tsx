// Practice: questions on demand, any day, even when every lesson is done.
// Each mode is a row with real counts from /api/practice/summary.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, PracticeSummary, Tree } from "../api";
import { listOf, minutes, plural } from "../copy";
import { Icon } from "../components/icons";
import { SectionSwitch } from "../components/SectionSwitch";
import { useWide } from "../components/Shell";
import { Bone, ErrorState, IconButton, Rise, Row, Skeleton } from "../components/ui";
import { LessonSource, practiceSource, useLoad } from "../nav";
import { color, GUTTER, space, type } from "../theme";

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
    return <SkillPicker summary={summary} tree={tree} onBack={() => setPicking(false)} onPick={(id, name) => onStart(practiceSource({ mode: "skill", skill_id: id, n: 8 }, name, `Eight questions on ${name}, easy to hard.`))} />;
  }

  const t = summary.totals;
  const skills = tree.domains.flatMap((d) => d.skills);
  const started = skills.filter((sk) => sk.attempts > 0 && !sk.mastered).sort((a, b) => a.mastery - b.mastery);
  const weakNames = started.slice(0, 3).map((sk) => sk.name);
  const anyStarted = skills.some((sk) => sk.attempts > 0 || sk.tested_out);

  // Test pace across sections, for the timed set's length.
  const secs = exam?.sections.map((x) => x.seconds_per_question) ?? [80];
  const lo = Math.round((TIMED_N * Math.min(...secs)) / 60);
  const hi = Math.round((TIMED_N * Math.max(...secs)) / 60);
  const f = summary.fresh;
  const freshLeft = Math.max(0, f.daily_limit - f.generated_today);

  const go = (mode: "weak" | "mixed" | "timed" | "mistakes" | "fresh", why?: string) => {
    const n = mode === "timed" ? TIMED_N : mode === "fresh" ? 5 : mode === "mistakes" ? Math.min(10, Math.max(3, t.missed)) : 10;
    onStart(practiceSource({ mode, n }, undefined, why));
  };

  // The row worth doing first gets the emphasis.
  const best = t.missed >= 5 ? "mistakes" : started.length ? "weak" : "mixed";

  return (
    <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(6) }]}>
      <Rise>
        <Text style={type.title} accessibilityRole="header">
          {t.unseen.toLocaleString("en-US")} questions{"\n"}you haven't tried
        </Text>
        <Text style={[type.body, { color: color.inkSoft, marginTop: space(1) }]}>
          {t.seen > 0 ? `You've answered ${plural(t.seen, "question")} so far. ` : ""}Every set counts toward today's plan.
        </Text>
      </Rise>

      <Rise delay={80} style={{ marginTop: space(3.5), gap: space(0.5) }}>
        <Row
          testID="mode-weak"
          icon="target"
          iconTint={color.terracotta}
          title="Weak spots"
          detail={weakNames.length ? listOf(weakNames) : "Your first open skills, until you've tried a few"}
          emphasized={best === "weak"}
          onPress={() => go("weak", weakNames.length ? `Your lowest right now: ${listOf(weakNames)}.` : undefined)}
        />
        <Row
          testID="mode-mistakes"
          icon="redo"
          iconTint={color.brick}
          title="My mistakes"
          detail={t.missed ? `${plural(t.missed, "question")} to fix` : "Nothing to fix right now"}
          disabled={!t.missed}
          emphasized={best === "mistakes"}
          onPress={() => go("mistakes", "You missed these and haven't got them right since. Shall we see what tripped you?")}
        />
        <Row
          testID="mode-timed"
          icon="clock"
          title="Timed set"
          detail={`${TIMED_N} questions at test pace, ${lo === hi ? minutes(lo) : `${lo} to ${hi} minutes`}`}
          onPress={() => go("timed", `${TIMED_N} questions at test pace. When the clock hits zero, the set ends.`)}
        />
        <Row
          testID="mode-mixed"
          icon="shuffle"
          title="Mixed"
          detail={anyStarted ? "10 questions from skills you've started" : "10 questions from your open skills"}
          emphasized={best === "mixed"}
          onPress={() => go("mixed")}
        />
        <Row testID="mode-skill" icon="book" title="One skill" detail="Pick any open skill and drill it" onPress={() => setPicking(true)} />
        <Row
          testID="mode-fresh"
          icon="quill"
          iconTint={color.azureInk}
          title="New questions from Socrates"
          detail={
            f.available
              ? freshLeft > 0
                ? `He writes 5 just for you · ${freshLeft} left today`
                : "That's today's 20. More tomorrow, or bank questions now"
              : "He can't write new ones here yet, so you'll get unseen bank questions"
          }
          onPress={() => go("fresh")}
        />
      </Rise>
      <View style={{ height: space(4) }} />
    </ScrollView>
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
              const detail = c
                ? `${c.unseen.toLocaleString("en-US")} unseen${c.missed ? ` \u00b7 ${c.missed} to fix` : ""}${sk.attempts ? ` \u00b7 ${sk.mastery}%` : ""}`
                : undefined;
              return <Row key={sk.id} title={sk.name} detail={detail} onPress={() => onPick(sk.id, sk.name)} />;
            })}
            {(() => {
              const locked = d.skills.filter((sk) => !sk.unlocked && sk.attempts === 0);
              if (!locked.length) return null;
              return (
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: space(1.25) }}>
                  <Icon name="lock" size={18} color={color.inkSoft} />
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
        <Bone w="80%" h={16} style={{ marginTop: 14 }} />
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
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(3), maxWidth: 640, width: "100%", alignSelf: "center" },
});

