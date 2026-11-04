import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, Skill, Tree } from "../api";
import { Button, Card, Mascot, Pill, PopIn, ProgressBar, Speech, logo } from "../components/ui";
import { lines, pick } from "../copy";
import { color, font, shadow, space, type } from "../theme";

const OFFSETS = [0, 44, 64, 44, 0, -44, -64, -44];

export function Home({ onStartLesson, onReset }: { onStartLesson: (skill: Skill | null) => void; onReset: () => void }) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTree(await api.tree());
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) onReset();
      else setError("Couldn't load your skills. Pull to retry.");
    }
  }, [onReset]);

  useEffect(() => {
    load();
  }, [load]);

  if (!tree) {
    return (
      <View style={s.center}>
        {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={color.azure} />}
        {error && <Button title="Retry" onPress={load} style={{ marginTop: space(2) }} />}
      </View>
    );
  }

  const st = tree.stats;
  const allSkills = tree.domains.flatMap((d) => d.skills);
  const next = allSkills.find((sk) => sk.unlocked && !sk.mastered);
  let n = 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        <Image source={logo} style={{ width: 112, height: 24 }} resizeMode="contain" accessibilityLabel="testwise" />
        <View style={s.pills}>
          <Pill icon="🔥" text={String(st.streak)} tint={st.streak ? "#F08A24" : color.textSoft} />
          <Pill icon="⚡" text={`${st.xp} XP`} tint={color.yellowDark} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <PopIn style={s.greet}>
          <Mascot size={72} />
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <Speech
              text={
                st.lessons_today
                  ? `${pick(lines.streak, st.streak)} ${st.lessons_today} lesson${st.lessons_today > 1 ? "s" : ""} today.`
                  : st.reviews_due
                    ? `${pick(lines.review, st.reviews_due)} You have ${st.reviews_due} question${st.reviews_due > 1 ? "s" : ""} to review.`
                    : next
                      ? `Today's goal: one lesson. How about ${next.name}?`
                      : "The path to wisdom is patient, and always open."
              }
            />
          </View>
        </PopIn>

        {st.reviews_due > 0 && (
          <Card style={[s.review]}>
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>Review</Text>
              <Text style={[type.body, { color: color.textSoft }]}>
                {st.reviews_due} question{st.reviews_due > 1 ? "s" : ""} you missed {st.reviews_due > 1 ? "are" : "is"} due
              </Text>
            </View>
            <Button title="Review" kind="special" small onPress={() => onStartLesson(null)} />
          </Card>
        )}

        {tree.domains.map((d) => (
          <View key={d.id} style={s.domain}>
            <View style={s.domainHead}>
              <View style={s.rule} />
              <Text style={[type.label, s.domainName]}>{d.name.toUpperCase()}</Text>
              <View style={s.rule} />
            </View>
            {d.skills.map((sk) => {
              const off = OFFSETS[n++ % OFFSETS.length];
              return (
                <View key={sk.id} style={[s.node, { transform: [{ translateX: off }] }]}>
                  <Bubble skill={sk} active={selected?.id === sk.id} onPress={() => setSelected(sk)} />
                  <Text style={[s.skillName, !sk.unlocked && { color: color.disabledText }]} numberOfLines={2}>
                    {sk.name}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={[type.caption, { textAlign: "center", marginTop: space(4) }]}>
          Testwise is not affiliated with College Board. SAT is a trademark of College Board.
        </Text>
        <View style={{ height: selected ? 220 : space(4) }} />
      </ScrollView>

      {selected && (
        <PopIn key={selected.id} style={s.sheet}>
          <Card>
            <Text style={type.h3}>{selected.name}</Text>
            {selected.unlocked ? (
              <>
                <View style={s.sheetRow}>
                  <ProgressBar value={selected.mastery / 100} fill={selected.mastered ? color.green : color.azure} height={12} />
                  <Text style={[type.label, { marginLeft: space(1.5), color: color.textSoft }]}>
                    {selected.mastered ? "Mastered" : selected.attempts ? `${selected.mastery}% mastery` : "New"}
                  </Text>
                </View>
                <View style={s.sheetRow}>
                  <Button title="Not now" kind="secondary" small onPress={() => setSelected(null)} style={{ marginRight: space(1.5) }} />
                  <Button
                    title={selected.attempts ? "Practice" : "Start"}
                    onPress={() => onStartLesson(selected)}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={[type.body, { color: color.textSoft, marginTop: space(1) }]}>
                  Unlocks after a lesson in{" "}
                  {selected.prereqs
                    .map((id) => allSkills.find((x) => x.id === id))
                    .filter((x): x is Skill => !!x && x.attempts < 8)
                    .map((x) => x.name)
                    .join(" and ") || "earlier skills"}
                  .
                </Text>
                <Button title="OK" kind="secondary" small onPress={() => setSelected(null)} style={{ marginTop: space(2) }} />
              </>
            )}
          </Card>
        </PopIn>
      )}
    </View>
  );
}

function Bubble({ skill, active, onPress }: { skill: Skill; active: boolean; onPress: () => void }) {
  const state = !skill.unlocked ? "locked" : skill.mastered ? "done" : skill.attempts ? "progress" : "open";
  const bg = state === "locked" ? color.locked : state === "done" ? color.green : "#fff";
  const border = state === "locked" ? color.lockedLine : state === "done" ? color.greenDark : color.azure;
  const icon = state === "locked" ? "🔒" : state === "done" ? "★" : state === "progress" ? `${skill.mastery}%` : "▶";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${skill.name}, ${state === "locked" ? "locked" : state === "done" ? "mastered" : `${skill.mastery}% mastery`}`}
      style={[
        s.bubble,
        { backgroundColor: bg, borderColor: border, borderStyle: state === "locked" ? "dashed" : "solid" },
        active && { transform: [{ scale: 1.08 }] },
        state !== "locked" && shadow.md,
      ]}
    >
      <Text
        style={{
          fontFamily: font.black,
          fontSize: state === "progress" ? 17 : 26,
          color: state === "done" ? "#fff" : state === "locked" ? color.disabledText : color.azure,
        }}
      >
        {icon}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(3) },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    borderBottomWidth: 2,
    borderBottomColor: color.line,
    backgroundColor: color.bg,
  },
  pills: { flexDirection: "row", gap: space(1) },
  scroll: { padding: space(2), maxWidth: 560, width: "100%", alignSelf: "center" },
  greet: { flexDirection: "row", alignItems: "center", marginVertical: space(2) },
  review: { flexDirection: "row", alignItems: "center", marginBottom: space(2), borderLeftWidth: 6, borderLeftColor: color.yellow },
  domain: { marginTop: space(2) },
  domainHead: { flexDirection: "row", alignItems: "center", marginBottom: space(2) },
  rule: { flex: 1, height: 2, backgroundColor: color.line },
  domainName: { marginHorizontal: space(1.5), color: color.textSoft, textAlign: "center", maxWidth: 260 },
  node: { alignItems: "center", marginBottom: space(2.5) },
  bubble: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderBottomWidth: 6, alignItems: "center", justifyContent: "center" },
  skillName: { fontFamily: font.semibold, fontSize: 14, color: color.text, marginTop: space(1), textAlign: "center", maxWidth: 180 },
  sheet: { position: "absolute", left: space(2), right: space(2), bottom: space(2), maxWidth: 528, alignSelf: "center", width: "100%" },
  sheetRow: { flexDirection: "row", alignItems: "center", marginTop: space(2) },
});
