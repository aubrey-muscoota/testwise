// Me: the test date, target and daily time (each editable), sound, the
// Socrates AI switch, the legal pages and deleting everything.
import React, { useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getExam, legalUrl, Profile, Tree } from "../api";
import { monthName, parseDay } from "../copy";
import { useWide } from "../components/Shell";
import { Bone, ErrorState, Rise, Row, Skeleton, Toggle, TextButton, useMuted } from "../components/ui";
import { useLoad } from "../nav";
import { color, GUTTER, space, type, COLUMN } from "../theme";
import type { Field } from "./Onboarding";
import { ConsentSheet } from "./Lesson";

function confirm(title: string, msg: string, yes: () => void) {
  if (Platform.OS === "web") {
    if ((globalThis as { confirm?: (m: string) => boolean }).confirm?.(msg)) yes();
  } else {
    Alert.alert(title, msg, [{ text: "Cancel", style: "cancel" }, { text: "Yes", style: "destructive", onPress: yes }]);
  }
}

export function Me({ onEdit, onDeleted }: { onEdit: (f: Field, p: Profile) => void; onDeleted: () => void }) {
  const { data, error, reload, setData } = useLoad(async () => {
    const [profile, tree] = await Promise.all([api.profile(), api.tree()]);
    return { profile, tree };
  });
  const [muted, setMuted] = useMuted();
  const [consentOpen, setConsentOpen] = useState(false);
  // One action at a time; failures say so in plain words under their group.
  const [pending, setPending] = useState<null | "ai" | "delete">(null);
  const [actErr, setActErr] = useState<null | { at: "ai" | "delete"; msg: string }>(null);
  const wide = useWide();
  const exam = getExam();

  if (error && !data) return <ErrorState message="I couldn't load your settings. Try again?" onRetry={reload} />;
  if (!data) return <MeSkeleton />;
  const { profile, tree }: { profile: Profile; tree: Tree } = data;
  const ai = !!tree.learner?.ai_consent;
  const name = exam?.short_name ?? "test";

  const dateText = profile.exam_date ? (() => { const d = parseDay(profile.exam_date!); return `${monthName(d.getMonth())} ${d.getDate()}`; })() : profile.not_booked ? "Not booked yet" : "Not set";
  // The rows below carry the date, so the title doesn't repeat it.
  const title = `Your ${name} plan`;

  const setAi = (on: boolean) => {
    if (on) { setConsentOpen(true); return; }
    confirm("Turn off Socrates AI?", "Socrates will stop sending your chats to Anthropic. You can turn him back on here or from any lesson.", async () => {
      setPending("ai");
      setActErr(null);
      try {
        const c = await api.setConsent({ ai: false });
        setData({ profile, tree: { ...tree, learner: c } });
      } catch {
        setActErr({ at: "ai", msg: "That didn't save. Check your connection and try again." });
      } finally {
        setPending(null);
      }
    });
  };
  const errFor = (at: "ai" | "delete") =>
    actErr?.at === at ? <Text style={[type.body, { color: color.brick, marginTop: space(1) }]} accessibilityRole="alert">{actErr.msg}</Text> : null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[s.scroll, wide && { paddingTop: space(6) }]}>
        <Rise>
          <Text style={type.title} accessibilityRole="header">{title}</Text>
        </Rise>

        <Rise delay={60} style={{ marginTop: space(3) }}>
          <Row icon="calendar" title="Test date" value={dateText} onPress={() => onEdit("date", profile)} accessibilityLabel={`Test date, ${dateText}. Change`} />
          <Row icon="target" title="Target score" value={profile.target_score ? String(profile.target_score) : "None"} onPress={() => onEdit("score", profile)} accessibilityLabel={`Target score, ${profile.target_score ?? "none"}. Change`} />
          <Row icon="clock" title="Time each day" value={`${profile.daily_minutes ?? exam?.plan.default_daily_minutes ?? 20} min`} onPress={() => onEdit("minutes", profile)} accessibilityLabel={`Time each day, ${profile.daily_minutes ?? 20} minutes. Change`} />
        </Rise>

        <Rise delay={100} style={{ marginTop: space(3) }}>
          <Row
            icon={muted ? "soundOff" : "soundOn"}
            title="Sound"
            detail="Chimes for right and wrong answers"
            accessory={<Toggle value={!muted} onChange={(v) => setMuted(!v)} label="Sound" testID="sound-toggle" />}
          />
          <Row
            icon="quill"
            title="Socrates AI"
            detail={ai ? "He chats with you about missed questions. Chats go to Anthropic." : "Off. He uses his written notes instead."}
            accessory={<Toggle value={ai} onChange={setAi} label="Socrates AI" testID="ai-toggle" disabled={pending === "ai"} />}
          />
          {errFor("ai")}
        </Rise>

        <Rise delay={140} style={{ marginTop: space(3), alignItems: "flex-start" }}>
          <TextButton title="Privacy policy" tone="ink" align="left" onPress={() => Linking.openURL(legalUrl("privacy"))} style={s.link} />
          <TextButton title="Terms" tone="ink" align="left" onPress={() => Linking.openURL(legalUrl("terms"))} style={s.link} />
          <TextButton
            title={pending === "delete" ? "Deleting…" : "Delete my data"}
            tone="brick"
            align="left"
            style={s.link}
            disabled={pending === "delete"}
            onPress={() => confirm("Delete everything?", "This permanently deletes your progress, streak, plan and Socrates chats on Testwise.", async () => {
              setPending("delete");
              setActErr(null);
              try {
                await api.deleteMe();
                onDeleted();
              } catch {
                setActErr({ at: "delete", msg: "I couldn't delete your data. Try again?" });
              } finally {
                setPending(null);
              }
            })}
          />
          {errFor("delete")}
        </Rise>

        <Text style={[type.small, { marginTop: space(3) }]}>{exam?.publisher.disclaimer}</Text>
        <View style={{ height: space(4) }} />
      </ScrollView>
      {consentOpen && (
        <ConsentSheet
          where="Me"
          onAgree={async () => {
            setPending("ai");
            setActErr(null);
            try {
              const c = await api.setConsent({ ai: true });
              setData({ profile, tree: { ...tree, learner: c } });
            } catch {
              setActErr({ at: "ai", msg: "That didn't save. Check your connection and try again." });
            } finally {
              setPending(null);
              setConsentOpen(false);
            }
          }}
          onDecline={() => setConsentOpen(false)}
        />
      )}
    </View>
  );
}

function MeSkeleton() {
  return (
    <Skeleton label="Loading your settings">
      <View style={s.scroll}>
        <Bone w={240} h={30} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: 14, marginTop: i ? 26 : 36 }}>
            <Bone w={24} h={24} r={12} />
            <Bone w="40%" h={16} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  link: { paddingHorizontal: 0 },
});
