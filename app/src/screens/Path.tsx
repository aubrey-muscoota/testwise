// Path: the skill map for one section, drawn as an inked line through the
// skills. State reads from the node and one plain sentence, not badges.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path as SvgPath } from "react-native-svg";
import { api, currentLearnerId, getExam, placementKey, Skill, Tree } from "../api";
import { noOrphan, skillStatus } from "../copy";
import { Icon } from "../components/icons";
import { SectionSwitch } from "../components/SectionSwitch";
import { useWide } from "../components/Shell";
import { Bone, Button, ErrorState, Rise, Sheet, Skeleton, TextButton, decorative, usePop } from "../components/ui";
import { feedback } from "../motion/feedback";
import { LessonSource, practiceSource, useLoad } from "../nav";
import { Socrates } from "../socrates/Socrates";
import { BORDER, color, font, GUTTER, space, tabular, type, COLUMN } from "../theme";

const SECTION_KEY = "testwise.section";
// Remembered between visits so the path can mark newly opened skills.
const unlockedKey = (learner: string | null) => `testwise.unlocked.${learner ?? "anon"}`;

const ROW = 92;
// The line wobbles in a narrow band, so skill names get most of a phone's width.
const XS = [38, 62, 80, 56, 34, 50, 74, 46];
const LABEL_X = 124;
const R = 28;
const R_NEXT = 32;

// The first section is blue; the second (Reading and Writing) is teal.
type Accent = { fill: string; edge: string; wash: string; ink: string };
const ACCENTS: Accent[] = [
  { fill: color.blue, edge: color.blueDark, wash: color.blueWash, ink: color.blueDark },
  { fill: color.teal, edge: color.tealDark, wash: color.line, ink: color.tealDark },
];

type State = "locked" | "mastered" | "tested" | "progress" | "open";
function stateOf(sk: Skill): State {
  if (!sk.unlocked) return "locked";
  if (sk.mastered) return "mastered";
  const answered = sk.answered ?? sk.attempts;
  if (sk.tested_out && answered === 0) return "tested";
  return answered > 0 ? "progress" : "open";
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
          <View key={`${sec?.id}-${d.id}`} style={{ marginTop: space(di === 0 ? 4 : 3) }}>
            <Text style={type.heading} accessibilityRole="header">{d.name}</Text>
            <Track
              skills={d.skills}
              offset={di * 3}
              nextId={next?.id}
              newIds={newIds}
              onOpen={setSelected}
              byId={byId}
              missed={data!.missed}
              accent={accent}
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

// One domain's skills along an inked line.
function Track({
  skills, offset, nextId, newIds, onOpen, byId, missed, accent,
}: {
  skills: Skill[]; offset: number; nextId?: string; newIds: Set<string>; onOpen: (sk: Skill) => void; byId: Map<string, Skill>; missed: Map<string, number>;
  accent: Accent;
}) {
  const pts = skills.map((_, i) => ({ x: XS[(i + offset) % XS.length], y: ROW * i + ROW / 2 }));
  const h = ROW * skills.length;
  // Segments, each a little uneven; solid up to open skills, dotted to locked ones.
  // Drawn in the locked grey, thick and round, so the nodes stay the loud part.
  const segs = useMemo(
    () => pts.slice(1).map((p, i) => {
      const a = pts[i];
      const j = ((i * 37 + offset * 11) % 9) - 4;
      return { d: `M${a.x} ${a.y}C${a.x + j} ${a.y + ROW * 0.55},${p.x - j * 0.6} ${p.y - ROW * 0.5},${p.x} ${p.y}`, open: skills[i + 1].unlocked };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skills, offset],
  );
  return (
    <View style={{ height: h, marginTop: space(0.5) }}>
      <View {...decorative} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={LABEL_X} height={h}>
          {segs.map((sg, i) => (
            <SvgPath key={i} d={sg.d} stroke={color.lockDark} strokeWidth={4} strokeDasharray={sg.open ? undefined : "1 10"} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
      </View>
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
  const r = isNext ? R_NEXT : R;
  const pop = usePop(isNew, 1.18);
  const status = statusLine(sk, isNext, byId, missed);
  const label = `${sk.name}, ${st === "progress" ? `${sk.mastery}%, ` : ""}${status}${isNew ? ", new" : ""}`;
  // Both the node and its label press together: the node presses onto its edge, the name turns blue.
  const [down, setDown] = useState(false);
  const press = { onPressIn: () => setDown(true), onPressOut: () => setDown(false) };
  return (
    <>
      <Pressable
        {...press}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ position: "absolute", left: x - r - 4, top: y - r - 4 - NODE_EDGE / 2, width: r * 2 + 8, height: r * 2 + 8 + NODE_EDGE, alignItems: "center", justifyContent: "center" }}
      >
        <NodeArt state={st} r={r} mastery={sk.mastery} pop={pop} isNext={isNext} accent={accent} down={down} />
      </Pressable>
      <Pressable {...press} onPress={onPress} accessible={false} focusable={false} style={[s.label, { top: y - 36, height: 72 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[type.label, st === "locked" && { color: color.ink2 }, down && { color: color.blueDark }, { flexShrink: 1 }]} numberOfLines={2}>{noOrphan(sk.name)}</Text>
          {isNew && <Icon name="dot" size={14} color={color.goldDark} style={{ marginLeft: 4 }} />}
        </View>
        <Text style={[type.small, tabular, isNext && { color: accent.ink, fontFamily: font.extra }]} numberOfLines={2}>
          {isNew && st !== "progress" ? "Just opened" : status}
        </Text>
      </Pressable>
    </>
  );
}

// Nodes are chunky round buttons on a darker edge, like the primary button.
// Only the next skill is filled with the section's color, with a ring of its
// wash around it, so "Start here" is the one thing that stands out. Finished
// skills (mastered or tested out) are gold; open ones are white with a line
// border; skills in progress show their mastery as an arc; locked ones are grey.
const NODE_EDGE = 5;

function NodeArt({ state, r, mastery, pop, isNext, accent, down }: {
  state: State; r: number; mastery: number; pop: object; isNext: boolean; accent: Accent; down: boolean;
}) {
  const size = r * 2;
  const c = r;
  const look =
    state === "mastered" || state === "tested" ? { face: color.gold, edge: color.goldDark, border: undefined }
    : state === "locked" ? { face: color.lock, edge: color.lockDark, border: undefined }
    : state === "open" && isNext ? { face: accent.fill, edge: accent.edge, border: undefined }
    : { face: color.bg, edge: color.line, border: color.line };
  let mark: React.ReactNode = null;
  if (state === "progress") {
    const rr = r - 7;
    const len = 2 * Math.PI * rr;
    mark = (
      <>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={c} cy={c} r={rr} stroke={color.lock} strokeWidth={5} fill="none" />
          <Circle
            cx={c} cy={c} r={rr} stroke={accent.fill} strokeWidth={5} fill="none" strokeLinecap="round"
            strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - Math.max(0.04, mastery / 100))}
            transform={`rotate(-90 ${c} ${c})`}
          />
        </Svg>
        <Text style={[s.pct, tabular]}>{mastery}%</Text>
      </>
    );
  } else if (state === "mastered" || state === "tested") {
    mark = <Icon name="check" size={r} color={color.white} strokeWidth={3.25} />;
  } else if (state === "open") {
    mark = <Icon name="play" size={r * 0.9} color={isNext ? color.white : accent.ink} strokeWidth={2.75} />;
  } else {
    mark = <Icon name="lock" size={r * 0.8} color={color.ink2} strokeWidth={2.5} />;
  }
  return (
    <Animated.View style={[{ alignItems: "center" }, pop]}>
      {/* The current skill gets a ring in its wash, like the current tab. */}
      {isNext && state === "open" && <View style={[s.halo, { width: size + 20, height: size + 20 + NODE_EDGE, borderRadius: r + 10, borderColor: accent.wash }]} />}
      <View style={{ width: size, height: size + NODE_EDGE, borderRadius: r, backgroundColor: look.edge }}>
        <View
          style={{
            width: size, height: size, borderRadius: r, backgroundColor: look.face, alignItems: "center", justifyContent: "center",
            transform: [{ translateY: down ? NODE_EDGE - 1 : 0 }],
            ...(look.border ? { borderWidth: BORDER, borderColor: look.border } : null),
          }}
        >
          {mark}
        </View>
      </View>
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
      <Text style={[type.body, { marginTop: space(1) }]}>{noOrphan(body)}</Text>
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
        <Bone w={180} h={22} style={{ marginTop: 36 }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", height: ROW }}>
            <View style={{ width: LABEL_X }}><Bone w={52} h={52} r={26} style={{ marginLeft: XS[i] - 26 }} /></View>
            <View style={{ flex: 1, gap: 8 }}><Bone w="70%" h={16} /><Bone w="40%" h={12} /></View>
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
  label: { position: "absolute", left: LABEL_X, right: 0, minHeight: 44, justifyContent: "center" },
  pct: { fontFamily: font.black, fontSize: 13, lineHeight: 17, color: color.ink },
  halo: { position: "absolute", top: -10, borderWidth: 6 },
});
