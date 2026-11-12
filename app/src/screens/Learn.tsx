// Learn: the home tab. One path through the whole test (GET /api/path): units
// in the section's color, their circles in a zigzag, the current one ringed
// with Socrates beside it. Tapping a circle opens its card with one button.
// Coming back from a lesson, the circle just finished turns gold and the next
// one opens.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, currentLearnerId, getExam, LearnPath, PathNode, PathUnit, placementKey } from "../api";
import { useWide } from "../components/Shell";
import { Bone, Button, ErrorState, Rise, Skeleton, TextButton, isReduceMotion } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource, nodeSource, useLoad } from "../nav";
import { NodeCard, cardTop } from "../path/NodeCard";
import { layoutTrack, Point, Track } from "../path/Track";
import { UnitBanner } from "../path/UnitBanner";
import { accentFor, NODE_H, NODE_W, ROW, XS } from "../path/shared";
import { Socrates } from "../socrates/Socrates";
import { color, COLUMN, GUTTER, radius, space, type } from "../theme";

// Remembered between visits (per learner, on this device) so the path can
// show what changed: {current, done}.
const memoryKey = (learner: string | null) => `testwise.path.${learner ?? "anon"}`;
type Memory = { current: string; done: string[] };

const allNodes = (p: LearnPath): PathNode[] => [...p.units.flatMap((u) => u.nodes), p.end];

type Selected = { id: string; unit: string; at: Point };

export function Learn({
  onStart, onStartPlacement, onUnauthorized, fixture, openId,
}: {
  onStart: (s: LessonSource) => void;
  onStartPlacement: (section: string, name: string) => void;
  onUnauthorized?: () => void;
  // Review page only (?lab=path): a path to show instead of loading one, and a card to open.
  fixture?: LearnPath;
  openId?: string;
}) {
  const { data, error, reload } = useLoad<LearnPath>(() => (fixture ? Promise.resolve(fixture) : api.path()), [fixture]);
  const wide = useWide();
  const exam = getExam();
  const [selected, setSelected] = useState<Selected | null>(null);
  // The open card's height, so its unit makes room under it for whatever the card runs past.
  const [cardH, setCardH] = useState(0);
  useEffect(() => setCardH(0), [selected?.id]);
  // An unlock to show: the circle just finished and the one it opened.
  const [unlock, setUnlock] = useState<{ from: string; to: string; stage: "pre" | "go" } | null>(null);
  const [checked, setChecked] = useState(!!fixture);
  const [placed, setPlaced] = useState<Record<string, boolean>>(exam ? { [exam.default_section]: true } : {});
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const unitY = useRef(new Map<string, number>());
  const trackY = useRef(new Map<string, number>());
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const scrolled = useRef(false);

  useEffect(() => {
    if (error?.status === 401) onUnauthorized?.();
  }, [error, onUnauthorized]);

  // The second section's placement offer, until it's taken or declined.
  useEffect(() => {
    const id = currentLearnerId();
    for (const sec of exam?.sections ?? []) {
      if (sec.id === exam?.default_section) continue;
      AsyncStorage.getItem(placementKey(id, sec.id)).then((v) => v === "1" && setPlaced((p) => ({ ...p, [sec.id]: true })), () => {});
    }
  }, [exam]);

  // What changed since the last visit: the remembered current circle is done now.
  useEffect(() => {
    if (!data || fixture) return;
    const key = memoryKey(currentLearnerId());
    const nodes = allNodes(data);
    const done = nodes.filter((n) => n.state === "done").map((n) => n.id);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        const before = raw ? (JSON.parse(raw) as Memory) : null;
        if (before && before.current !== data.current && done.includes(before.current) && !before.done.includes(before.current)) {
          setUnlock({ from: before.current, to: data.current, stage: "pre" });
        }
      } catch {}
      setChecked(true);
      try {
        await AsyncStorage.setItem(key, JSON.stringify({ current: data.current, done } satisfies Memory));
      } catch {}
    })();
  }, [data, fixture]);

  // Where a circle sits in the scroll content.
  const nodeY = useCallback((id: string) => {
    if (!data) return null;
    const units = [...data.units.map((u) => ({ id: u.id, nodes: u.nodes })), { id: "end", nodes: [data.end as PathNode] }];
    let offset = 0;
    for (const u of units) {
      const i = u.nodes.findIndex((n) => n.id === id);
      if (i >= 0) {
        const uy = unitY.current.get(u.id);
        const ty = trackY.current.get(u.id);
        if (uy == null || ty == null) return null;
        return uy + ty + layoutTrack(u.nodes, offset).pts[i].y;
      }
      offset += u.nodes.length;
    }
    return null;
  }, [data]);

  // Returns where it scrolled to, or null before the layout is known.
  const scrollToNode = useCallback((id: string, animated: boolean) => {
    const y = nodeY(id);
    if (y == null || !viewH.current) return null;
    const to = Math.max(0, y - viewH.current * 0.4);
    scrollRef.current?.scrollTo({ y: to, animated: animated && !isReduceMotion() });
    return to;
  }, [nodeY]);
  // Where the last programmatic scroll went, until the scroll event reports it.
  const pendingTop = useRef<number | null>(null);

  // On open, the current circle sits about 40% down the screen (or the one
  // just finished, when an unlock is about to play).
  const settle = useCallback(() => {
    if (scrolled.current || !data) return;
    const target = unlock?.stage === "pre" ? unlock.from : data.current;
    const to = scrollToNode(openId ?? target, false);
    if (to != null) {
      scrolled.current = true;
      pendingTop.current = to;
    }
  }, [data, unlock, openId, scrollToNode]);

  // The unlock: the finished circle pops gold, then the next one opens.
  useEffect(() => {
    if (!unlock || unlock.stage !== "pre") return;
    scrolled.current = false;
    settle();
    const t = setTimeout(() => {
      feedback.unlock();
      setUnlock((u) => (u ? { ...u, stage: "go" } : u));
      scrollToNode(unlock.to, true);
    }, 500);
    return () => clearTimeout(t);
  }, [unlock, settle, scrollToNode]);

  const close = useCallback(() => {
    const id = selected?.id;
    setSelected(null);
    // Focus goes back to the circle that opened the card.
    if (id && Platform.OS === "web" && typeof document !== "undefined") {
      (document.querySelector(`[data-testid="node-${id}"]`) as HTMLElement | null)?.focus?.();
    }
  }, [selected]);

  useEffect(() => {
    if (!selected || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, close]);

  // The lab opens a card on its own.
  useEffect(() => {
    if (!data || !openId) return;
    let offset = 0;
    for (const u of [...data.units, { id: "end", nodes: [data.end as PathNode] } as Pick<PathUnit, "id" | "nodes">]) {
      const i = u.nodes.findIndex((n) => n.id === openId);
      if (i >= 0) {
        setSelected({ id: openId, unit: u.id, at: layoutTrack(u.nodes, offset).pts[i] });
        return;
      }
      offset += u.nodes.length;
    }
  }, [data, openId]);

  if (error && !data) return <ErrorState message="I couldn't load your path. Is the connection down?" onRetry={reload} />;
  if (!data) return <LearnSkeleton />;

  const settleOffer = (sec: string) => {
    setPlaced((p) => ({ ...p, [sec]: true }));
    AsyncStorage.setItem(placementKey(currentLearnerId(), sec), "1").catch(() => {});
  };
  // A section gets the placement offer above its first unit until the learner
  // takes or declines it, or starts anything in it.
  const untouched = (sectionId: string) => data.units
    .filter((u) => u.section_id === sectionId)
    .every((u) => u.nodes.every((n) => n.kind !== "skill" || (n.state !== "done" && n.mastery === 0 && !n.tested_out)));
  const firstOf = new Map<string, string>();
  for (const u of data.units) if (!firstOf.has(u.section_id)) firstOf.set(u.section_id, u.id);

  const open = (n: PathNode, unit: string, at: Point) => {
    setSelected((cur) => (cur?.id === n.id ? null : { id: n.id, unit, at }));
  };
  const start = (n: PathNode) => {
    const src = nodeSource(n);
    if (!src) return;
    setSelected(null);
    onStart(src);
  };
  const cardLayout = (unit: string, at: Point) => (e: LayoutChangeEvent) => {
    // Keep the whole card in view (short phones), without moving when it fits.
    const uy = unitY.current.get(unit);
    const ty = trackY.current.get(unit);
    const h = e.nativeEvent.layout.height;
    setCardH(h);
    if (uy == null || ty == null || !viewH.current) return;
    const bottom = uy + ty + cardTop(at) + h + space(2);
    // After the room under the card is laid out, so the scroll isn't cut short.
    setTimeout(() => {
      const top = pendingTop.current ?? scrollY.current;
      pendingTop.current = null;
      if (bottom > top + viewH.current) scrollRef.current?.scrollTo({ y: bottom - viewH.current, animated: !isReduceMotion() });
    }, 30);
  };

  // The ring and bubble wait until the memory is read, so an unlock doesn't
  // flash them on the old circle first. The finished circle pops as soon as
  // the unlock starts; the new one when it opens.
  const ring = checked && (!unlock || unlock.stage === "go");
  const popIds = new Set<string>(unlock ? (unlock.stage === "go" ? [unlock.from, unlock.to] : [unlock.from]) : []);

  const groups: { id: string; unit: PathUnit | null; nodes: PathNode[]; accent: ReturnType<typeof accentFor> }[] = [
    ...data.units.map((u) => ({ id: u.id, unit: u, nodes: u.nodes, accent: accentFor(u.section_index) })),
    { id: "end", unit: null, nodes: [data.end as PathNode], accent: accentFor(0) },
  ];
  let offset = 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; settle(); }}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; pendingTop.current = null; }}
        scrollEventThrottle={32}
        contentContainerStyle={[s.scroll, wide && { paddingTop: space(1) }]}
      >
        {selected && <Pressable style={[StyleSheet.absoluteFill, { zIndex: 5 }]} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />}
        {groups.map((g, gi) => {
          const from = offset;
          offset += g.nodes.length;
          const u = g.unit;
          const sec = u && exam?.sections.find((x) => x.id === u.section_id);
          const offer = !fixture && u && sec && firstOf.get(u.section_id) === u.id && !placed[u.section_id] && untouched(u.section_id);
          const sel = selected?.unit === g.id ? selected : null;
          const selNode = sel ? g.nodes.find((n) => n.id === sel.id) : null;
          return (
            <View
              key={g.id}
              onLayout={(e) => { unitY.current.set(g.id, e.nativeEvent.layout.y); settle(); }}
              style={[{ marginTop: gi === 0 ? space(2) : space(1) }, sel && { zIndex: 10 }]}
            >
              {offer && sec && (
                <Rise style={s.offer}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                    <Socrates size={64} mood="idle" />
                    <View style={{ flex: 1, marginLeft: space(1.5) }}>
                      <Text style={type.heading}>New to {sec.name}?</Text>
                      <Text style={[type.body, { marginTop: space(0.5) }]}>
                        Answer about {(sec.domains.length || 4) * (exam?.placement.per_domain ?? 3)} questions and I'll skip you past what you already know.
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space(1), marginTop: space(2) }}>
                    <Button title="Find my level" onPress={() => onStartPlacement(sec.id, sec.name)} style={{ flex: 1 }} />
                    <TextButton title="Not now" tone="soft" onPress={() => settleOffer(sec.id)} />
                  </View>
                </Rise>
              )}
              {u && <UnitBanner unit={u} accent={g.accent} />}
              <Track
                nodes={g.nodes}
                offset={from}
                accent={g.accent}
                selectedId={selected?.id ?? null}
                ring={ring}
                popIds={popIds}
                onOpen={(n, at) => open(n, g.id, at)}
                onLayout={(e) => { trackY.current.set(g.id, e.nativeEvent.layout.y); settle(); }}
              >
                {sel && selNode && <NodeCard node={selNode} at={sel.at} onStart={() => start(selNode)} onLayout={cardLayout(g.id, sel.at)} />}
              </Track>
              {sel && cardH > 0 && (
                <View style={{ height: Math.max(0, cardTop(sel.at) + cardH + space(2) - layoutTrack(g.nodes, from).height) }} />
              )}
            </View>
          );
        })}
        <Text style={[type.small, { marginTop: space(2) }]}>{exam?.publisher.disclaimer}</Text>
        <View style={{ height: space(4) }} />
      </ScrollView>
    </View>
  );
}

function LearnSkeleton() {
  return (
    <Skeleton label="Loading your path">
      <View style={[s.scroll, { paddingTop: space(2) }]}>
        <Bone h={74} r={18} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ height: ROW, justifyContent: "center", alignItems: "center", paddingTop: i ? 0 : space(3) }}>
            <Bone w={NODE_W} h={NODE_H} r={NODE_W / 2} style={{ marginLeft: XS[i] * 2 }} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(1), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  // Grouped by space only: no card around the offer.
  offer: { marginTop: space(1), marginBottom: space(3), borderRadius: radius.card, backgroundColor: color.bg },
});
