// Path: the skill map for one section. Each domain is a unit: a banner in the
// section's color, then its skills as big pressable nodes in a centered
// zigzag (the prototype's Learn home). A node's color is its state; its name,
// status and mastery live in the sheet it opens.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, currentLearnerId, getExam, placementKey, Skill, Tree } from "../api";
import { noOrphan, skillStatus } from "../copy";
import { Icon } from "../components/icons";
import { SectionSwitch } from "../components/SectionSwitch";
import { useWide } from "../components/Shell";
import { Bone, Button, ErrorState, ProgressBar, Rise, Sheet, Skeleton, TextButton, decorative, usePop } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource, practiceSource, useLoad } from "../nav";
import { Socrates } from "../socrates/Socrates";
import { BORDER, color, EDGE, font, GUTTER, radius, space, tabular, type, COLUMN } from "../theme";

const SECTION_KEY = "testwise.section";
// Remembered between visits so the path can mark newly opened skills.
const unlockedKey = (learner: string | null) => `testwise.unlocked.${learner ?? "anon"}`;

// Nodes are 70 x 62 ovals on a 7 px edge, one per row, swinging left and right
// of the column's center (the prototype's zigzag, then its mirror).
const NODE_W = 70;
const NODE_H = 62;
const NODE_EDGE = 7;
const ROW = 86;
// Extra room above the next skill for its "Start" bubble.
const NEXT_ROOM = 40;
const XS = [0, -64, -32, 40, 0, 64, 32, -40];
const SOC = 96;

// The first section is blue; the second (Reading and Writing) is teal.
type Accent = { fill: string; edge: string; wash: string; ink: string };
const ACCENTS: Accent[] = [
  { fill: color.blue, edge: color.blueDark, wash: color.blueWash, ink: color.blueDark },
  { fill: color.teal, edge: color.tealDark, wash: color.tealWash, ink: color.tealDark },
];

type State = "locked" | "mastered" | "tested" | "progress" | "open";
function stateOf(sk: Skill): State {
  if (!sk.unlocked) return "locked";
  if (sk.mastered) return "mastered";
  // Tested out stays finished (gold) even after it's been practiced, as the unit banner counts it.
  if (sk.tested_out) return "tested";
  return (sk.answered ?? sk.attempts) > 0 ? "progress" : "open";
}

function sectionDomains(tree: Tree, id: string | null) {
  const sections = tree.sections ?? [];
  const sec = sections.find((x) => x.id === id) ?? sections[0];
  return sec ? tree.domains.filter((d) => sec.domains.includes(d.id)) : tree.domains;
}

export function PathScreen({ onStart, onStartPlacement }: { onStart: (s: LessonSource) => void; onStartPlacement: (section: string, name: string) => void }) {
  const { data, error, reload } = useLoad(async () => {
    const [tree, summary] = await Promise.all([api.tree(), api.practiceSummary().catch(() => null)]);
    return { tree, missed: new Map((summary?.skills ?? []).map((x) => [x.skill_id, x.missed] as const)) };
  });
  const tree = data?.tree;
  const [section, setSection] = useState<string | null>(null);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const wide = useWide();
  const exam = getExam();
  const [placed, setPlaced] = useState<Record<string, boolean>>(exam ? { [exam.default_section]: true } : {});

  useEffect(() => {
    AsyncStorage.getItem(SECTION_KEY).then((v) => v && setSection(v), () => {});
    const id = currentLearnerId();
    for (const sec of exam?.sections ?? []) {
      if (sec.id === exam?.default_section) continue;
      AsyncStorage.getItem(placementKey(id, sec.id)).then((v) => v === "1" && setPlaced((p) => ({ ...p, [sec.id]: true })), () => {});
    }
  }, [exam]);

  // Which skills opened since the last visit.
  useEffect(() => {
    if (!tree) return;
    const key = unlockedKey(currentLearnerId());
    const now = tree.domains.flatMap((d) => d.skills).filter((sk) => sk.unlocked).map((sk) => sk.id);
    AsyncStorage.getItem(key).then((prev) => {
      if (prev) {
        const before = new Set(JSON.parse(prev) as string[]);
        const fresh = now.filter((id) => !before.has(id));
        if (fresh.length) { setNewIds(new Set(fresh)); setTimeout(feedback.unlock, 500); }
      }
      AsyncStorage.setItem(key, JSON.stringify(now)).catch(() => {});
    }, () => {});
  }, [tree]);

  const settleOffer = (sec: string) => {
    setPlaced((p) => ({ ...p, [sec]: true }));
    AsyncStorage.setItem(placementKey(currentLearnerId(), sec), "1").catch(() => {});
  };

  if (error && !tree) return <ErrorState message="I couldn't load your skills. Try again?" onRetry={reload} />;
  if (!tree) return <PathSkeleton />;

  const sections = tree.sections ?? [];
  const sec = sections.find((x) => x.id === section) ?? sections[0];
  const domains = sectionDomains(tree, sec?.id ?? null);
  const all = domains.flatMap((d) => d.skills);
  const next = all.find((sk) => sk.unlocked && !sk.mastered && !sk.tested_out) ?? all.find((sk) => sk.unlocked && !sk.mastered);
  const started = all.filter((sk) => sk.attempts > 0 || sk.tested_out || sk.mastered).length;
  const showOffer = sec && !placed[sec.id] && all.every((sk) => sk.attempts === 0 && !sk.tested_out);
  const byId = new Map(tree.domains.flatMap((d) => d.skills).map((sk) => [sk.id, sk] as const));
  const accent = ACCENTS[Math.max(0, sections.indexOf(sec!)) % ACCENTS.length];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={[s.scroll, wide && { paddingTop: space(6) }]}>
        <Text style={type.title} accessibilityRole="header">
          {noOrphan(started ? `${started} of ${all.length} skills started` : `${all.length} skills to learn`)}
        </Text>
        <View style={{ marginTop: space(1.5) }}>
          <SectionSwitch
            sections={sections}
            value={sec?.id ?? ""}
            onChange={(id) => { setSection(id); scrollRef.current?.scrollTo({ y: 0, animated: false }); AsyncStorage.setItem(SECTION_KEY, id).catch(() => {}); }}
          />
        </View>

        {showOffer && sec && (
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

        {domains.map((d, di) => (
          <View key={`${sec?.id}-${d.id}`} style={{ marginTop: space(di === 0 ? 3 : 4) }}>
            <UnitBanner name={d.name} done={d.skills.filter((sk) => sk.mastered || sk.tested_out).length} total={d.skills.length} accent={accent} />
            <Track
              skills={d.skills}
              offset={di * 3}
              nextId={next?.id}
              newIds={newIds}
              onOpen={setSelected}
              byId={byId}
              missed={data!.missed}
              accent={accent}
              socrates={!showOffer}
            />
          </View>
        ))}
        <Text style={[type.small, { marginTop: space(3) }]}>{exam?.publisher.disclaimer}</Text>
        <View style={{ height: space(4) }} />
      </ScrollView>

      {selected && (
        <SkillSheet
          skill={selected}
          byId={byId}
          missed={data!.missed.get(selected.id) ?? 0}
          onClose={() => setSelected(null)}
          onLesson={() => { setSelected(null); onStart({ kind: "skill", skillId: selected.id, name: selected.name }); }}
          onDrill={() => { setSelected(null); onStart(practiceSource({ mode: "skill", skill_id: selected.id, n: 8 }, selected.name)); }}
        />
      )}
    </View>
  );
}

// A unit's banner: the domain on a filled face in the section's color, sitting
// on its darker edge like a button, with how many of its skills are finished.
// Both are 19 px black, so white passes on blue and teal as large text.
function UnitBanner({ name, done, total, accent }: { name: string; done: number; total: number; accent: Accent }) {
  return (
    <View style={[s.unitEdge, { backgroundColor: accent.edge }]} accessibilityRole="header" accessibilityLabel={`${name}, ${done} of ${total} skills finished`}>
      <View style={[s.unit, { backgroundColor: accent.fill }]}>
        <Text style={[s.unitText, { flex: 1 }]}>{name}</Text>
        <Text style={[s.unitText, tabular, { marginLeft: space(1.5) }]} {...decorative}>{done} of {total}</Text>
      </View>
    </View>
  );
}

// One unit's skills in a zigzag down the middle of the column.
function Track({
  skills, offset, nextId, newIds, onOpen, byId, missed, accent, socrates,
}: {
  skills: Skill[]; offset: number; nextId?: string; newIds: Set<string>; onOpen: (sk: Skill) => void; byId: Map<string, Skill>; missed: Map<string, number>;
  accent: Accent; socrates: boolean;
}) {
  // Each node's center; the next skill gets extra room above for its bubble.
  let y = space(3);
  const pts = skills.map((sk, i) => {
    if (sk.id === nextId) y += NEXT_ROOM;
    const p = { x: XS[(i + offset) % XS.length], y: y + NODE_H / 2 };
    y += ROW;
    return p;
  });
  const h = y - ROW + NODE_H + NODE_EDGE + space(1);
  const ni = skills.findIndex((sk) => sk.id === nextId);
  // Socrates keeps the learner company beside the next skill, on the roomier side.
  const soc = socrates && ni >= 0 ? { x: pts[ni].x <= 0 ? pts[ni].x + NODE_W / 2 + space(3) : pts[ni].x - NODE_W / 2 - space(3) - SOC, y: pts[ni].y - SOC / 2 } : null;
  return (
    <View style={{ height: h }}>
      {soc && (
        <View {...decorative} pointerEvents="none" style={{ position: "absolute", left: "50%", marginLeft: soc.x, top: soc.y }}>
          <Socrates size={SOC} mood="idle" />
        </View>
      )}
      {skills.map((sk, i) => (
        <SkillNode key={sk.id} skill={sk} x={pts[i].x} y={pts[i].y} isNext={sk.id === nextId} isNew={newIds.has(sk.id)} onPress={() => onOpen(sk)} byId={byId} missed={missed.get(sk.id) ?? 0} accent={accent} />
      ))}
    </View>
  );
}

// Prerequisites not yet done, by name.
function unmet(sk: Skill, byId: Map<string, Skill>) {
  return sk.prereqs.map((id) => byId.get(id)).filter((x): x is Skill => !!x && !x.mastered && !x.tested_out).map((x) => x.name);
}

function statusLine(sk: Skill, isNext: boolean, byId: Map<string, Skill>, missed: number) {
  const st = stateOf(sk);
  if (st === "locked") {
    const before = unmet(sk, byId);
    // The first unmet skill only: the dotted line already shows the order.
    return before.length ? noOrphan(`After ${before[0]}`) : "Opens soon";
  }
  // The same words as the skill picker; the percentage lives in the ring.
  const line = skillStatus(sk, missed);
  if (line) return line;
  return isNext ? "Start here" : "Not started";
}

function SkillNode({ skill: sk, x, y, isNext, isNew, onPress, byId, missed, accent }: {
  skill: Skill; x: number; y: number; isNext: boolean; isNew: boolean; onPress: () => void; byId: Map<string, Skill>; missed: number; accent: Accent;
}) {
  const st = stateOf(sk);
  const pop = usePop(isNew, 1.18);
  const status = statusLine(sk, isNext, byId, missed);
  const label = `${sk.name}, ${st === "progress" ? `${sk.mastery}%, ` : ""}${isNew && st !== "progress" ? "just opened" : status}`;
  const [down, setDown] = useState(false);
  return (
    <>
      {isNext && <StartBubble x={x} y={y} ink={accent.ink} />}
      <Pressable
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ position: "absolute", left: "50%", marginLeft: x - NODE_W / 2, top: y - NODE_H / 2, width: NODE_W, height: NODE_H + NODE_EDGE }}
      >
        <NodeArt state={st} pop={pop} isNext={isNext} isNew={isNew} accent={accent} down={down} />
      </Pressable>
    </>
  );
}

// "Start" over the next skill: a small bubble whose tail points down at it.
function StartBubble({ x, y, ink }: { x: number; y: number; ink: string }) {
  return (
    <View {...decorative} pointerEvents="none" style={[s.start, { left: "50%", marginLeft: x - 40, top: y - NODE_H / 2 - 52 }]}>
      <View style={s.startTail} />
      <Text style={[s.startText, { color: ink }]}>Start</Text>
    </View>
  );
}

// Nodes are chunky ovals on a darker edge, like the primary button. Finished
// skills (mastered or tested out) are gold with a check; open and started ones
// are the section's color; locked ones are grey with a lock. The next skill
// also gets a ring in the section's wash, like the current tab. Mastery is in
// the sheet, not on the node.
function NodeArt({ state, pop, isNext, isNew, accent, down }: {
  state: State; pop: object; isNext: boolean; isNew: boolean; accent: Accent; down: boolean;
}) {
  const look =
    state === "mastered" || state === "tested" ? { face: color.gold, edge: color.goldDark }
    : state === "locked" ? { face: color.lock, edge: color.lockDark }
    : { face: accent.fill, edge: accent.edge };
  const mark =
    state === "mastered" || state === "tested" ? <Icon name="check" size={30} color={color.white} strokeWidth={3.5} />
    : state === "locked" ? <Icon name="lock" size={26} color={color.ink2} strokeWidth={2.5} />
    // Nudged right: a triangle's visual center sits left of its box's.
    : <Icon name="play" size={28} color={color.white} strokeWidth={3} style={{ marginLeft: 3 }} />;
  return (
    <Animated.View style={pop}>
      {isNext && <View style={[s.halo, { borderColor: accent.wash }]} />}
      <View style={{ width: NODE_W, height: NODE_H + NODE_EDGE, borderRadius: NODE_W / 2, backgroundColor: look.edge }}>
        <View
          style={{
            width: NODE_W, height: NODE_H, borderRadius: NODE_W / 2, backgroundColor: look.face, alignItems: "center", justifyContent: "center",
            transform: [{ translateY: down ? NODE_EDGE - 2 : 0 }],
          }}
        >
          {mark}
        </View>
      </View>
      {/* A skill that opened since the last visit: a gold dot, like a fresh notification. */}
      {isNew && <View style={s.newDot} />}
    </Animated.View>
  );
}

function SkillSheet({ skill: sk, byId, missed, onClose, onLesson, onDrill }: { skill: Skill; byId: Map<string, Skill>; missed: number; onClose: () => void; onLesson: () => void; onDrill: () => void }) {
  const st = stateOf(sk);
  const ref = useRef(sk.id);
  ref.current = sk.id;
  const body =
    st === "locked" ? (unmet(sk, byId).length ? `Opens after ${unmet(sk, byId).join(", ")}. Finish a lesson there first.` : "Opens soon.")
    : st === "mastered" ? "You've mastered this. A drill now and then keeps it that way."
    : st === "tested" ? "You tested out of this in the placement quiz. Practice it any time."
    : st === "progress" ? `${skillStatus(sk, 0, true)}. A 6-minute lesson goes over what you've been missing.`
    : missed ? `You missed ${missed === 1 ? "one" : missed} in the placement quiz. A short lesson, about 6 minutes, starts from the basics.`
    : "A short lesson, about 6 minutes.";
  return (
    <Sheet onClose={onClose} label={sk.name}>
      <Text style={type.title}>{sk.name}</Text>
      {(st === "progress" || st === "mastered" || (st === "tested" && (sk.answered ?? sk.attempts) > 0)) && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: space(1.5) }} accessibilityLabel={`${sk.mastery}% mastered`}>
          <ProgressBar value={sk.mastery / 100} fill={st === "progress" ? color.good : color.gold} />
          <Text style={[type.label, tabular, { marginLeft: space(1.5), minWidth: 44, textAlign: "right" }]}>{sk.mastery}%</Text>
        </View>
      )}
      <Text style={[type.body, { marginTop: space(1.5) }]}>{noOrphan(body)}</Text>
      <View style={{ marginTop: space(3), gap: space(1) }}>
        {st === "locked" ? (
          <TextButton title="OK" onPress={onClose} />
        ) : (
          <>
            <Button title="Start lesson" onPress={onLesson} />
            {(sk.attempts > 0 || st !== "open") && <TextButton title="Just drill questions" onPress={onDrill} />}
          </>
        )}
      </View>
    </Sheet>
  );
}

function PathSkeleton() {
  return (
    <Skeleton label="Loading your path">
      <View style={s.scroll}>
        <Bone w={240} h={30} />
        <View style={{ flexDirection: "row", gap: 24, marginTop: 20 }}><Bone w={50} h={18} /><Bone w={150} h={18} /></View>
        <Bone h={56} r={radius.card} style={{ marginTop: 24 }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ height: ROW, justifyContent: "center", alignItems: "center", paddingTop: i ? 0 : space(3) }}>
            <Bone w={NODE_W} h={NODE_H} r={NODE_W / 2} style={{ marginLeft: XS[i] * 2 }} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  // Grouped by space only: no card around the offer.
  offer: { marginTop: space(3) },
  unitEdge: { borderRadius: radius.card, paddingBottom: EDGE },
  unit: { flexDirection: "row", alignItems: "center", borderRadius: radius.card, paddingVertical: space(2), paddingHorizontal: space(2) },
  unitText: { fontFamily: font.black, fontSize: 19, lineHeight: 24, color: color.white },
  halo: { position: "absolute", left: -10, top: -10, width: NODE_W + 20, height: NODE_H + NODE_EDGE + 20, borderRadius: (NODE_W + 20) / 2, borderWidth: 6 },
  newDot: { position: "absolute", right: -2, top: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: color.gold, borderWidth: 3, borderColor: color.bg },
  // The "Start" bubble: the speech-bubble look (white, 2 px line border), small.
  start: {
    position: "absolute", width: 80, height: 38, alignItems: "center", justifyContent: "center",
    backgroundColor: color.bg, borderWidth: BORDER, borderColor: color.line, borderRadius: 12,
  },
  startTail: {
    position: "absolute", bottom: -7 - BORDER, left: 40 - 7 - BORDER, width: 14, height: 14, backgroundColor: color.bg,
    borderRightWidth: BORDER, borderBottomWidth: BORDER, borderColor: color.line, transform: [{ rotate: "45deg" }],
  },
  startText: { fontFamily: font.black, fontSize: 16, lineHeight: 21 },
});
