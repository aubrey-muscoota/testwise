import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Easing, Image, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type ScrollViewInstance, type StyleProp, type ViewStyle,
} from "react-native";
import { api, legalUrl, Skill, Tree } from "../api";
import { Burst, Button, Card, Mascot, MuteToggle, Pill, PopIn, Press3D, ProgressBar, Pulse, Rise, SlideUp, Speech, logo } from "../components/ui";
import { lines, pick } from "../copy";
import { feedback } from "../motion/feedback";
import { color, font, space, type } from "../theme";

const OFFSETS = [0, 44, 64, 44, 0, -44, -64, -44];

// Remembered between visits so Home can celebrate what changed. Scoped to the
// learner so a fresh anonymous learner never diffs against someone else's snapshot.
const LEARNER_KEY = "testwise.learner";
const keysFor = (learner: string | null) => ({
  stats: `testwise.lastStats.${learner ?? "anon"}`,
  unlocked: `testwise.unlocked.${learner ?? "anon"}`,
});

// Path entrance: each node rises in, the whole path within ~700ms.
const ENTER_START = 80;
const ENTER_SPAN = 560;

type Prev = { stats: { xp: number; streak: number } | null; unlocked: string[] | null };
type Celebration = { xpFrom: number | null; streakUp: boolean; streakFrom: number; newIds: string[] };

async function learnerKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LEARNER_KEY);
  } catch {
    return null;
  }
}

async function readPrev(): Promise<Prev> {
  try {
    const k = keysFor(await learnerKey());
    const [a, b] = await Promise.all([AsyncStorage.getItem(k.stats), AsyncStorage.getItem(k.unlocked)]);
    return { stats: a ? JSON.parse(a) : null, unlocked: b ? JSON.parse(b) : null };
  } catch {
    return { stats: null, unlocked: null };
  }
}

async function remember(t: Tree) {
  const unlocked = t.domains.flatMap((d) => d.skills).filter((sk) => sk.unlocked).map((sk) => sk.id);
  const k = keysFor(await learnerKey());
  AsyncStorage.setItem(k.stats, JSON.stringify({ xp: t.stats.xp, streak: t.stats.streak })).catch(() => {});
  AsyncStorage.setItem(k.unlocked, JSON.stringify(unlocked)).catch(() => {});
}

function diff(t: Tree, prev: Prev): Celebration {
  const skills = t.domains.flatMap((d) => d.skills);
  const before = prev.unlocked ? new Set(prev.unlocked) : null;
  return {
    // Only count up: never animate XP downward as if it were a celebration.
    xpFrom: prev.stats && t.stats.xp > prev.stats.xp ? prev.stats.xp : null,
    streakUp: !!prev.stats && t.stats.streak > prev.stats.streak,
    streakFrom: prev.stats?.streak ?? t.stats.streak,
    // No "new" on the very first visit: everything would be new.
    newIds: before ? skills.filter((sk) => sk.unlocked && !before.has(sk.id)).map((sk) => sk.id) : [],
  };
}

export function Home({ onStartLesson, onReset }: { onStartLesson: (skill: Skill | null) => void; onReset: () => void }) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Skill | null>(null);
  // Which section's path is showing (SAT Math or Reading and Writing). Remembered.
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(SECTION_KEY).then((v) => v && setSection(v), () => {});
  }, []);
  const pickSection = (id: string) => {
    setSection(id);
    setSelected(null);
    AsyncStorage.setItem(SECTION_KEY, id).catch(() => {});
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const [refreshing, setRefreshing] = useState(false);
  const [cel, setCel] = useState<Celebration | null>(null);
  const [streakBump, setStreakBump] = useState(0);
  const [xpBump, setXpBump] = useState(0);
  const [burstIds, setBurstIds] = useState<string[]>([]);

  const scroll = useRef<ScrollViewInstance>(null);
  const viewH = useRef(0);
  const domainY = useRef<Record<string, number>>({});
  const nodeY = useRef<Record<string, { domain: string; y: number; h: number }>>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      const [t, prev] = await Promise.all([api.tree(), readPrev()]);
      setCel(diff(t, prev));
      setTree(t);
      remember(t).catch(() => {});
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401) onReset();
      else setError("Couldn't load your skills. Pull to retry.");
    }
  }, [onReset]);

  useEffect(() => {
    load();
  }, [load]);

  // Celebrate what changed since last visit, after the path has risen in.
  useEffect(() => {
    if (!cel) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (cel.streakUp) {
      timers.push(setTimeout(() => { setStreakBump((b) => b + 1); feedback.combo(); }, 450));
    }
    const first = cel.newIds[0];
    if (first) {
      timers.push(setTimeout(() => {
        const n = nodeY.current[first];
        if (!n) return;
        const y = (domainY.current[n.domain] ?? 0) + n.y;
        if (y + n.h > viewH.current - 40) scroll.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
      }, 350));
      // One burst per newly unlocked skill, staggered so each reads on its own.
      const start = cel.streakUp ? 900 : 750;
      setBurstIds([]);
      cel.newIds.forEach((id, i) => {
        timers.push(setTimeout(() => {
          setBurstIds((b) => (b.includes(id) ? b : [...b, id]));
          if (i === 0) feedback.unlock();
        }, start + i * 250));
      });
    } else {
      setBurstIds([]);
    }
    return () => timers.forEach(clearTimeout);
  }, [cel]);

  const xpShown = useCountUp(tree?.stats.xp ?? 0, cel?.xpFrom ?? null, 300, () => setXpBump((b) => b + 1));

  // Bottom sheet: backdrop fades in; on close both slide away before unmounting.
  const backdrop = useRef(new Animated.Value(0)).current;
  const leave = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const sheetRef = useRef<React.ComponentRef<typeof View>>(null);
  const returnFocus = useRef<{ focus?: () => void } | null>(null);
  const open = (sk: Skill) => {
    closing.current = false;
    if (Platform.OS === "web" && !selected && typeof document !== "undefined") {
      returnFocus.current = document.activeElement as unknown as { focus?: () => void } | null;
    }
    leave.setValue(0);
    if (!selected) {
      backdrop.setValue(0);
      Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    setSelected(sk);
  };
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(leave, { toValue: 1, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      closing.current = false;
      setSelected(null);
      const el = returnFocus.current;
      returnFocus.current = null;
      el?.focus?.();
    });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Web: Escape closes the sheet, and focus moves into it while it is open.
  const sheetOpen = !!selected;
  useEffect(() => {
    if (!sheetOpen || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => (sheetRef.current as unknown as { focus?: () => void } | null)?.focus?.(), 50);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [sheetOpen]);

  // After a placement quiz the next skill can be far down the path: bring it into view.
  useEffect(() => {
    if (!tree || cel?.newIds.length) return;
    const all = domainsOf(tree, section).flatMap((d) => d.skills);
    const nx = all.find((sk) => sk.unlocked && !sk.mastered && !sk.tested_out);
    if (!nx || !all.some((sk) => sk.tested_out)) return;
    const t = setTimeout(() => {
      const n = nodeY.current[nx.id];
      if (!n) return;
      const y = (domainY.current[n.domain] ?? 0) + n.y;
      if (y + n.h > viewH.current - 40) scroll.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
    }, 800);
    return () => clearTimeout(t);
  }, [tree, cel, section]);

  if (!tree) {
    return (
      <View style={s.center}>
        {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={color.azure} />}
        {error && <Button title="Retry" onPress={load} style={{ marginTop: space(2) }} />}
      </View>
    );
  }

  const st = tree.stats;
  const sections = tree.sections ?? [];
  const sec = sections.find((x) => x.id === section) ?? sections[0];
  const domains = domainsOf(tree, sec?.id ?? null);
  const allSkills = domains.flatMap((d) => d.skills);
  // Skills skipped in the placement quiz stay open, but the path starts after them.
  const next =
    allSkills.find((sk) => sk.unlocked && !sk.mastered && !sk.tested_out) ??
    allSkills.find((sk) => sk.unlocked && !sk.mastered);
  const newIds = new Set(cel?.newIds ?? []);
  const newSkill = cel?.newIds.length ? allSkills.find((sk) => sk.id === cel.newIds[0]) : undefined;
  const newCount = cel?.newIds.length ?? 0;
  // Hold the old streak until the pop, then flip to the new number on the bump.
  const streakShown = cel?.streakUp && streakBump === 0 ? cel.streakFrom : st.streak;
  const step = Math.min(60, ENTER_SPAN / Math.max(1, allSkills.length));
  const delayOf = (i: number) => ENTER_START + Math.min(i * step, ENTER_SPAN);
  let n = 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={s.top}>
        <Image source={logo} style={{ width: 112, height: 24 }} resizeMode="contain" accessibilityLabel="testwise" />
        <View style={s.pills}>
          <View>
            {/* Burst sits behind the pill so the sparks fly out around it, not over the digit. */}
            {streakBump > 0 && <Burst key={streakBump} count={12} radius={52} size={6} colors={["#F08A24", "#FFD66D", "#FF7E79"]} />}
            <Pill icon="🔥" text={String(streakShown)} tint={streakShown ? "#F08A24" : color.textSoft} bump={`${st.streak}:${streakBump}`} />
          </View>
          <Pill icon="⚡" text={`${xpShown} XP`} tint={color.yellowDark} bump={xpBump} />
          <MuteToggle />
        </View>
      </View>

      <ScrollView
        ref={scroll}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <PopIn style={s.greet}>
          <Mascot size={72} mood={newSkill || st.lessons_today ? "cheer" : "idle"} moodKey={newSkill?.id} />
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <Speech
              text={
                newCount > 1
                  ? `${newCount} new skills unlocked! Start with ${newSkill?.name ?? "one"}?`
                  : newSkill
                  ? `New skill unlocked: ${newSkill.name}!`
                  : st.lessons_today
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
          <Rise delay={120}>
            <Card style={[s.review]}>
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>Review</Text>
                <Text style={[type.body, { color: color.textSoft }]}>
                  {st.reviews_due} question{st.reviews_due > 1 ? "s" : ""} you missed {st.reviews_due > 1 ? "are" : "is"} due
                </Text>
              </View>
              <Breathe>
                <Button title="Review" kind="special" small onPress={() => onStartLesson(null)} />
              </Breathe>
            </Card>
          </Rise>
        )}

        {sections.length > 1 && (
          <View style={s.tabs} accessibilityRole="tablist">
            {sections.map((x) => {
              const on = x.id === sec?.id;
              return (
                <Pressable
                  key={x.id}
                  onPress={() => pickSection(x.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[s.tab, on && s.tabOn]}
                >
                  <Text style={[s.tabText, on && { color: "#fff" }]}>{x.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {domains.map((d) => (
          <View key={d.id} style={s.domain} onLayout={(e) => { domainY.current[d.id] = e.nativeEvent.layout.y; }}>
            <FadeIn delay={delayOf(n)} style={s.domainHead}>
              <View style={s.rule} />
              <Text style={[type.label, s.domainName]}>{d.name.toUpperCase()}</Text>
              <View style={s.rule} />
            </FadeIn>
            {d.skills.map((sk) => {
              const i = n++;
              const off = OFFSETS[i % OFFSETS.length];
              const isNext = next?.id === sk.id;
              const delay = delayOf(i);
              return (
                <View
                  key={sk.id}
                  style={[s.node, { transform: [{ translateX: off }] }]}
                  onLayout={(e: LayoutChangeEvent) => {
                    const { y, height } = e.nativeEvent.layout;
                    nodeY.current[sk.id] = { domain: d.id, y, h: height };
                  }}
                >
                  <Rise delay={delay} style={{ alignItems: "center" }}>
                    {isNext && <Callout label={sk.attempts > 0 ? "CONTINUE" : "START"} delay={delay + 200} />}
                    <Bubble
                      skill={sk}
                      active={selected?.id === sk.id}
                      onPress={() => open(sk)}
                      isNext={isNext}
                      isNew={newIds.has(sk.id)}
                      burst={burstIds.includes(sk.id)}
                      delay={delay}
                    />
                    {/* The label opens the sheet too; the bubble already carries the a11y label. */}
                    <Pressable onPress={() => open(sk)} accessible={false} focusable={false}>
                      <Text style={[s.skillName, !sk.unlocked && { color: color.disabledText }]} numberOfLines={2}>
                        {sk.name}
                      </Text>
                      {sk.tested_out && !sk.mastered && <Text style={s.testedOut}>TESTED OUT</Text>}
                    </Pressable>
                  </Rise>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={[type.caption, { textAlign: "center", marginTop: space(4) }]}>
          Testwise is not affiliated with College Board. SAT is a trademark of College Board.
        </Text>
        <FooterLinks aiConsent={!!tree.learner?.ai_consent} onChanged={load} onDeleted={onReset} />
        <View style={{ height: selected ? 220 : space(4) }} />
      </ScrollView>

      {selected && (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: backdrop }]} importantForAccessibility="no-hide-descendants">
            <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            pointerEvents="box-none"
            style={[s.sheet, {
              // Stay opaque while sliding away; fade only at the very end so the path never shows through.
              opacity: leave.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [{ translateY: leave.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }],
            }]}
          >
            <SlideUp key={selected.id} distance={260} style={s.sheetInner}>
              <View
                ref={sheetRef}
                role="dialog"
                aria-modal
                aria-label={selected.name}
                accessibilityViewIsModal
                focusable={Platform.OS === "web"}
                style={s.sheetFocus}
              >
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
                      <Button title="Not now" kind="secondary" small onPress={close} style={{ marginRight: space(1.5) }} />
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
                    <Button title="OK" kind="secondary" small onPress={close} style={{ marginTop: space(2) }} />
                  </>
                )}
              </Card>
              </View>
            </SlideUp>
          </Animated.View>
        </>
      )}
    </View>
  );
}

// ─── Local helpers ───────────────────────────────────────────────────────────

// Counts a number from `from` to `to` (for text inside a Pill). Calls onDone when it lands.
function useCountUp(to: number, from: number | null, delay: number, onDone: () => void) {
  // `shown` is tagged with the run it belongs to, so a stale value never flashes.
  const run = `${from}>${to}`;
  const [shown, setShown] = useState<{ run: string; v: number } | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (from == null || from === to) return;
    const v = new Animated.Value(from);
    const id = v.addListener(({ value }) => setShown({ run, v: Math.round(value) }));
    const a = Animated.timing(v, { toValue: to, duration: 900, delay, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start(({ finished }) => { if (finished) { setShown({ run, v: to }); done.current(); } });
    return () => { a.stop(); v.removeListener(id); };
  }, [run, to, from, delay]);
  if (from == null || from === to) return to;
  return shown?.run === run ? shown.v : from;
}

function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// A soft, slow scale breath to draw the eye (review button).
function Breathe({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>{children}</Animated.View>;
}

// "START" / "CONTINUE" label that bobs above the next skill.
function Callout({ label, delay }: { label: string; delay: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -5, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  return (
    <View pointerEvents="none" style={{ marginBottom: -2 }}>
      <PopIn delay={delay} from={0.6}>
        <Animated.View style={{ alignItems: "center", transform: [{ translateY: bob }] }}>
          <View style={s.callout}>
            <Text style={s.calloutText}>{label}</Text>
          </View>
          <View style={s.pointerOuter} />
          <View style={s.pointerInner} />
        </Animated.View>
      </PopIn>
    </View>
  );
}

// Mastery ring without SVG: two half-ring clips rotated into view.
function ProgressRing({ size, stroke, value, fill, track, delay }: { size: number; stroke: number; value: number; fill: string; track: string; delay: number }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, {
      toValue: Math.max(0, Math.min(1, value)), duration: 700, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [p, value, delay]);
  const half = size / 2;
  const ring = { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: fill };
  const right = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "180deg", "180deg"] });
  const left = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["0deg", "0deg", "180deg"] });
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: size, height: size }}>
      <View style={[ring, { position: "absolute", borderColor: track }]} />
      {/* 0–50%: the left half of a ring swings clockwise into the right clip. */}
      <View style={{ position: "absolute", left: half, width: half, height: size, overflow: "hidden" }}>
        <Animated.View style={{ position: "absolute", left: -half, width: size, height: size, transform: [{ rotate: right }] }}>
          <View style={{ width: half, height: size, overflow: "hidden" }}><View style={ring} /></View>
        </Animated.View>
      </View>
      {/* 50–100%: the right half swings into the left clip. */}
      <View style={{ position: "absolute", left: 0, width: half, height: size, overflow: "hidden" }}>
        <Animated.View style={{ position: "absolute", left: 0, width: size, height: size, transform: [{ rotate: left }] }}>
          <View style={{ position: "absolute", left: half, width: half, height: size, overflow: "hidden" }}>
            <View style={[ring, { marginLeft: -half }]} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Skill bubble ────────────────────────────────────────────────────────────

const FACE = 72;
const DEPTH = 6;
const RING = 92;

const PALETTE = {
  locked: { face: "#E8ECF0", edge: "#C9D0D8", fg: color.disabledText },
  done: { face: color.green, edge: color.greenDark, fg: "#fff" },
  open: { face: color.azure, edge: color.azureDark, fg: "#fff" },
};

function Bubble({
  skill, active, onPress, isNext, isNew, burst, delay,
}: { skill: Skill; active: boolean; onPress: () => void; isNext: boolean; isNew: boolean; burst: boolean; delay: number }) {
  const state = !skill.unlocked ? "locked" : skill.mastered ? "done" : skill.attempts ? "progress" : "open";
  const pal = state === "locked" ? PALETTE.locked : state === "done" ? PALETTE.done : PALETTE.open;
  const icon = state === "locked" ? "🔒" : state === "done" ? "★" : state === "progress" ? `${skill.mastery}%` : "▶";

  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: active ? 1.08 : 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
  }, [active, scale]);

  const body = (
    <Animated.View style={[s.bubbleBox, { transform: [{ scale }] }]}>
      {state === "progress" && (
        <ProgressRing size={RING} stroke={6} value={skill.mastery / 100} fill={color.yellow} track={color.line} delay={delay + 150} />
      )}
      <Press3D
        onPress={onPress}
        depth={DEPTH}
        radius={FACE / 2}
        edge={pal.edge}
        style={{ marginTop: DEPTH }}
        accessibilityLabel={`${skill.name}, ${state === "locked" ? "locked" : state === "done" ? "mastered" : `${skill.mastery}% mastery`}${skill.tested_out && state !== "done" ? ", tested out" : ""}`}
        face={[s.face, { backgroundColor: pal.face }]}
      >
        {state !== "locked" && <View style={s.shine} />}
        <Text
          style={{
            fontFamily: font.black,
            fontSize: state === "progress" ? 18 : 28,
            color: pal.fg,
            opacity: state === "locked" ? 0.55 : 1,
          }}
        >
          {icon}
        </Text>
      </Press3D>
      {burst && <Burst count={16} radius={84} />}
      {isNew && (
        <View pointerEvents="none" style={s.newBadge}>
          <PopIn delay={delay + 500} from={0.4}>
            <View style={s.newInner}><Text style={s.newText}>NEW</Text></View>
          </PopIn>
        </View>
      )}
    </Animated.View>
  );

  return isNext ? <Pulse size={FACE + 8} ring={color.azure}>{body}</Pulse> : body;
}

const SECTION_KEY = "testwise.section";

// The domains on the path for one section (all of them if the tree has no sections).
function domainsOf(tree: Tree, sectionId: string | null) {
  const sections = tree.sections ?? [];
  const sec = sections.find((x) => x.id === sectionId) ?? sections[0];
  return sec ? tree.domains.filter((d) => sec.domains.includes(d.id)) : tree.domains;
}

const s = StyleSheet.create({
  tabs: { flexDirection: "row", backgroundColor: color.locked, borderRadius: 14, padding: 4, gap: 4, marginBottom: space(1) },
  tab: { flex: 1, paddingVertical: space(1), borderRadius: 11, alignItems: "center" },
  tabOn: { backgroundColor: color.azure },
  tabText: { fontFamily: font.bold, fontSize: 15, color: color.textSoft },
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
    zIndex: 2,
  },
  pills: { flexDirection: "row", alignItems: "center", gap: space(1) },
  scroll: { padding: space(2), maxWidth: 560, width: "100%", alignSelf: "center" },
  greet: { flexDirection: "row", alignItems: "center", marginVertical: space(2) },
  review: { flexDirection: "row", alignItems: "center", marginBottom: space(2), borderLeftWidth: 6, borderLeftColor: color.yellow },
  domain: { marginTop: space(2) },
  domainHead: { flexDirection: "row", alignItems: "center", marginBottom: space(2) },
  rule: { flex: 1, height: 2, backgroundColor: color.line },
  domainName: { marginHorizontal: space(1.5), color: color.textSoft, textAlign: "center", maxWidth: 260 },
  node: { alignItems: "center", marginBottom: space(1.5) },
  bubbleBox: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  face: { width: FACE, height: FACE, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  shine: { position: "absolute", top: 9, left: 17, width: 22, height: 9, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.35)", transform: [{ rotate: "-20deg" }] },
  newBadge: { position: "absolute", top: 0, right: -8 },
  newInner: { backgroundColor: color.coral, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: "#fff" },
  newText: { fontFamily: font.black, fontSize: 11, color: "#fff", letterSpacing: 0.6 },
  callout: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: color.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  calloutText: { fontFamily: font.black, fontSize: 14, letterSpacing: 1, color: color.azure },
  pointerOuter: {
    width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 9,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color.line, marginTop: -1,
  },
  pointerInner: {
    position: "absolute", bottom: 3, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#fff",
  },
  testedOut: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8, color: color.green, textAlign: "center", marginTop: 2 },
  skillName: { fontFamily: font.semibold, fontSize: 14, color: color.text, marginTop: space(0.5), textAlign: "center", maxWidth: 180 },
  backdrop: { backgroundColor: "rgba(30,44,59,0.35)", zIndex: 10 },
  // The absolute wrapper only positions; the inner view carries the width cap so it centers.
  sheet: { position: "absolute", left: 0, right: 0, bottom: space(2), paddingHorizontal: space(2), alignItems: "center", zIndex: 11 },
  sheetInner: { width: "100%", maxWidth: 528 },
  sheetFocus: { outlineStyle: "none" } as unknown as ViewStyle,
  sheetRow: { flexDirection: "row", alignItems: "center", marginTop: space(2) },
});

// Privacy, terms, the Socrates AI switch and data deletion.
function FooterLinks({ aiConsent, onChanged, onDeleted }: { aiConsent: boolean; onChanged: () => void; onDeleted: () => void }) {
  const confirm = (msg: string, yes: () => void) => {
    if (Platform.OS === "web") {
      if ((globalThis as any).confirm?.(msg)) yes();
    } else {
      Alert.alert("Are you sure?", msg, [{ text: "Cancel", style: "cancel" }, { text: "Yes", style: "destructive", onPress: yes }]);
    }
  };
  const link = (label: string, onPress: () => void) => (
    <Text style={f.link} accessibilityRole="link" onPress={onPress}>{label}</Text>
  );
  return (
    <View style={f.row}>
      {link("Privacy", () => Linking.openURL(legalUrl("privacy")))}
      <Text style={f.dot}>·</Text>
      {link("Terms", () => Linking.openURL(legalUrl("terms")))}
      {aiConsent && (
        <>
          <Text style={f.dot}>·</Text>
          {link("Turn off Socrates AI", () => confirm("Socrates will stop sending your chats to Anthropic. You can turn him back on from any lesson.", () => {
            api.setConsent({ ai: false }).then(onChanged, () => {});
          }))}
        </>
      )}
      <Text style={f.dot}>·</Text>
      {link("Delete my data", () => confirm("This permanently deletes your progress, streak and Socrates chats on Testwise.", () => {
        api.deleteMe().then(onDeleted, () => {});
      }))}
    </View>
  );
}

const f = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", marginTop: space(1.5), gap: space(0.75) },
  link: { ...type.caption, color: color.azureDark, fontFamily: font.bold, textDecorationLine: "underline" },
  dot: { ...type.caption },
});
