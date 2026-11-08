// The lesson screen. Runs lessons, reviews, placement quizzes and every
// practice mode (they all return the same shape). The question is the main
// thing; Socrates sits above it and reacts to each answer.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { api, getConsent, Item, legalUrl, Lesson as LessonT, Placement, Stats, TutorTurn } from "../api";
import { Icon } from "../components/icons";
import { SocratesLine, SocratesSays } from "../components/SocratesLine";
import {
  Button, FloatUp, IconButton, PopIn, Press3D, ProgressBar, Rise, Sheet, SlideIn, TextButton, decorative, isReduceMotion, usePop, useReducedMotion, useShake,
} from "../components/ui";
import { clock, lines, pick } from "../copy";
import { Figure } from "../figure/Figure";
import { Passage, RichText } from "../text/Passage";
import { renderMath } from "../text/tex";
import { feedback } from "../motion/feedback";
import { LessonSource, MODE_TITLE } from "../nav";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { color, font, GUTTER, radius, scrim, shadow, space, tabular, type, COLUMN } from "../theme";

export type LessonResult = {
  correct: number;
  total: number;
  xp: number;
  stats: Stats;
  title: string | null;
  placement?: Placement;
  source: LessonSource;
  seconds: number;
  timeUp?: boolean;
  mode?: string;
  // Questions answered, and how many the set had (a timed set can end early).
  answered: number;
  planned: number;
};

type Phase = "answering" | "right" | "wrong";

const COMBO_MILESTONES = [3, 5, 8];

export function sourceTitle(src: LessonSource) {
  if (src.kind === "skill") return src.name;
  if (src.kind === "review") return "Review";
  if (src.kind === "placement") return `${src.name} placement`;
  return src.title;
}

function begin(src: LessonSource) {
  if (src.kind === "skill") return api.startLesson(src.skillId);
  if (src.kind === "review") return api.startLesson(null);
  if (src.kind === "placement") return api.startPlacement(src.section || undefined);
  return api.start(src.start);
}

// What Socrates says before question 1. The header already names the set, so
// this never repeats it; plan metadata (a task's why) is only for practice modes.
// An empty line means he stays quiet until the first answer.
function openingLine(src: LessonSource, l: LessonT) {
  if (l.note) return l.note;
  if (src.kind === "placement") return pick(lines.placement);
  const lessonTask = src.kind === "task" && !src.mode;
  if (src.kind === "review" || (lessonTask && src.title === "Review")) return pick(lines.review);
  if (src.kind === "task" && src.mode && src.why) return src.why;
  if (l.time_limit_seconds) return lines.timed;
  if (src.kind === "skill" || lessonTask || (src.kind === "task" && src.mode === "skill")) return "Read each one to the end before the choices.";
  return "";
}

export function Lesson({ source, onDone, onQuit }: { source: LessonSource; onDone: (r: LessonResult) => void; onQuit: () => void }) {
  const placement = source.kind === "placement";
  const [lesson, setLesson] = useState<LessonT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ item: Item; retry: boolean }[]>([]);
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<Phase>("answering");
  const [choice, setChoice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorStarted, setTutorStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [reportFailed, setReportFailed] = useState<string | null>(null);
  const quietStart = useRef(false);
  const [fx, setFx] = useState(0); // bumps on every checked answer, replays reactions
  const [combo, setCombo] = useState(0);
  const [cheer, setCheer] = useState(false);
  const [xpGain, setXpGain] = useState(0);
  const [quitOpen, setQuitOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [left, setLeft] = useState<number | null>(null); // timed: seconds remaining
  const answeredAny = useRef(false);
  const answered = useRef(0);
  const started = useRef(Date.now());
  const begunAt = useRef(Date.now());
  const finishing = useRef(false);
  const areaShake = useShake();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const block = useRef({ y: 0, h: 0 });
  // The stem and each choice, measured when Check lands, so a scroll can stop on a clean edge.
  type Measurable = React.ComponentRef<typeof View>;
  const innerRef = useRef<Measurable>(null);
  const stemRef = useRef<Measurable>(null);
  const tileRefs = useRef<(Measurable | null)[]>([]);
  const contentH = useRef(0);
  // The Check bar floats (with a shadow) only while there's more to scroll under it.
  const [moreBelow, setMoreBelow] = useState(false);
  // Extra room under a checked question, so its stem can scroll up to the header.
  const [tailPad, setTailPad] = useState(0);
  const updateMore = () => setMoreBelow(contentH.current - (scrollY.current + viewH.current) > 4);
  const revealSolution = useRef(false);
  const solLayout = useRef<{ y: number; h: number } | null>(null);
  const contentRef = useRef<React.ComponentRef<typeof View>>(null);
  const wasTutorOpen = useRef(false);
  const title = sourceTitle(source);
  const timed = !!lesson?.time_limit_seconds;

  const load = () => {
    setError(null);
    begin(source)
      .then((l) => {
        setLesson(l);
        setQueue(l.items.map((item) => ({ item, retry: false })));
        const opener = openingLine(source, l);
        quietStart.current = opener === "";
        setLine(opener);
        started.current = Date.now();
        begunAt.current = Date.now();
        if (l.time_limit_seconds) setLeft(l.time_limit_seconds);
      })
      .catch((e: Error & { status?: number }) => {
        const msg = e.status && e.status < 500 && e.message && !/^HTTP/.test(e.message) ? e.message : null;
        setError(
          msg === "no mistakes to fix" ? "There's nothing in your mistakes pile right now. Nice."
          : msg === "no skills to practice yet" ? "Start a skill first, then there's something to practice."
          : msg === "skill locked" ? "That skill isn't open yet."
          : placement ? "I couldn't start the placement quiz. Is the connection down?"
          : "I couldn't start this set. Is the connection down?",
        );
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Timed sets: a countdown; at zero the set ends where it is.
  useEffect(() => {
    if (left == null || !lesson) return;
    if (left <= 0) { finish(true); return; }
    const t = setTimeout(() => setLeft((x) => (x == null ? x : x - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, lesson]);

  const total = lesson?.items.length || 1;
  const current = queue[0];
  const response = current?.item.type === "mc" ? choice : typed.trim();

  async function finish(timeUp = false) {
    if (!lesson || finishing.current) return;
    finishing.current = true;
    setBusy(true);
    try {
      const r = await api.finish(lesson.lesson_id);
      onDone({
        ...r,
        title,
        source,
        seconds: Math.round((Date.now() - begunAt.current) / 1000),
        timeUp,
        mode: lesson.mode,
        answered: answered.current,
        planned: lesson.items.length,
      });
    } catch {
      finishing.current = false;
      setError("I couldn't save this set. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function check() {
    if (!lesson || !current || !response || busy) return;
    setBusy(true);
    try {
      const r = await api.answer({ lesson_id: lesson.lesson_id, item_id: current.item.id, response, time_ms: Date.now() - started.current });
      answeredAny.current = true;
      if (!current.retry) answered.current += 1;
      setFx((k) => k + 1);
      if (r.correct) {
        setPhase("right");
        feedback.correct();
        announce("Correct");
        const firstTry = !current.retry;
        setXpGain(firstTry ? r.xp || 0 : 0);
        const n = firstTry ? combo + 1 : combo;
        setCombo(n);
        const milestone = firstTry && COMBO_MILESTONES.includes(n);
        setCheer(milestone);
        if (milestone) {
          setLine("Keep reading every line, all the way to the end.");
          setTimeout(feedback.combo, 220);
        } else {
          setLine(pick(lines.correct));
        }
      } else {
        setPhase("wrong");
        const why = current.item.wrong_reasons?.[response];
        setLine(why ? why : pick(lines.incorrect));
        setCombo(0);
        setCheer(false);
        setXpGain(0);
        feedback.wrong();
        announce(`Not quite. The answer is ${current.item.answer}`);
        if (current.item.type !== "mc") areaShake.shake();
      }
    } catch {
      setLine("That didn't go through. Try Check again?");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!lesson || !current) return;
    const wasWrong = phase === "wrong";
    let rest = queue.slice(1);
    let newDone = done;
    if (wasWrong && !current.retry && !placement && !timed) rest = [...rest, { item: current.item, retry: true }];
    else newDone = done + 1;
    setDone(newDone);
    setQueue(rest);
    setPhase("answering");
    setChoice(null);
    setTyped("");
    setShowSolution(false);
    setTutorOpen(false);
    setTutorStarted(false);
    setCheer(false);
    setXpGain(0);
    revealSolution.current = false;
    solLayout.current = null;
    tileRefs.current = [];
    setTailPad(0);
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    started.current = Date.now();
    const up = rest[0];
    if (up?.retry) setLine(pick(lines.retry));
    else if (up?.item.review) setLine(pick(lines.review));
    else if (up?.item.source === "generated") setLine("I wrote this one myself. If something's off, report it.");
    else setLine(pick(lines.next));
    if (!rest.length) await finish();
  }

  // Reports only show as sent once the server has them.
  async function report(id: string, note: string) {
    if (reported.has(id)) return;
    setReportFailed(null);
    try {
      await api.report(id, note);
      setReported((r) => new Set(r).add(id));
    } catch {
      setReportFailed(id);
    }
  }

  function announce(msg: string) {
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(msg);
  }

  // `below` keeps extra room under the block.
  function ensureVisible(top: number, bottom: number, below = 0) {
    const vh = viewH.current;
    if (!vh) return;
    const y = scrollY.current;
    const m = space(2);
    let to = y;
    if (bottom + m + below > y + vh) to = bottom + m + below - vh;
    if (top - m < to) to = Math.max(0, top - m);
    if (Math.abs(to - y) > 1) scrollRef.current?.scrollTo({ y: to, animated: true });
  }

  function openSolution() {
    const sl = solLayout.current;
    if (showSolution && sl) { setTimeout(() => ensureVisible(sl.y, sl.y + sl.h), 30); return; }
    revealSolution.current = true;
    setShowSolution(true);
  }

  // After Check, show the answer area above the feedback panel. The view's top
  // edge stops at the start of the stem or of a choice, never partway through a
  // line of the passage.
  // Positions are measured now rather than kept from onLayout: on web, onLayout
  // only reports size changes, and the folded Socrates row moves things without
  // resizing them.
  async function revealAnswer() {
    const inner = innerRef.current;
    const sv = scrollRef.current as unknown as { getScrollableNode?: () => { clientHeight: number; scrollHeight: number } } | null;
    if (!inner || !sv) return;
    const node = Platform.OS === "web" ? sv.getScrollableNode?.() : null;
    const vh = node ? node.clientHeight : viewH.current;
    const ch = node ? node.scrollHeight : contentH.current;
    if (!vh) return;
    const top = (r: Measurable | null) => new Promise<{ y: number; h: number } | null>((res) => {
      if (!r) return res(null);
      try { r.measureLayout(inner as never, (_x, y, _w, h) => res({ y, h }), () => res(null)); } catch { res(null); }
    });
    const [stem, ...tiles] = await Promise.all([top(stemRef.current), ...tileRefs.current.map(top)]);
    const parts = [stem, ...tiles].filter((x): x is { y: number; h: number } => !!x);
    if (!parts.length) return;
    const m = space(2);
    const last = parts[parts.length - 1];
    const want = Math.max(0, last.y + last.h + m - vh);
    const max = Math.max(0, ch - vh);
    const edges = parts.map((p) => Math.max(0, p.y - m));
    // The first clean edge at or past where the last choice fits. When the
    // content is too short to scroll that far, room is added under it.
    const to = want === 0 ? 0 : edges.find((e) => e >= want) ?? want;
    const go = () => { if (Math.abs(to - scrollY.current) > 1) scrollRef.current?.scrollTo({ y: to, animated: true }); };
    if (to > max) { setTailPad((p) => p + Math.ceil(to - max)); setTimeout(go, 60); } else go();
  }
  useEffect(() => {
    if (phase === "answering") return;
    const t = setTimeout(revealAnswer, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fx]);

  // While a sheet is open, the lesson behind it is inert.
  useEffect(() => {
    const modal = tutorOpen || quitOpen || consentOpen;
    if (Platform.OS === "web") {
      const node = contentRef.current as unknown as { setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void } | null;
      if (node?.setAttribute) {
        if (modal) node.setAttribute("inert", "");
        else node.removeAttribute?.("inert");
      }
      if (wasTutorOpen.current && !tutorOpen) {
        const d = (globalThis as { document?: { querySelector?: (q: string) => { focus?: () => void } | null } }).document;
        d?.querySelector?.('[aria-label="Ask Socrates"]')?.focus?.();
      }
    }
    wasTutorOpen.current = tutorOpen;
  }, [tutorOpen, quitOpen, consentOpen]);

  // Socrates needs a one-time OK, because it sends the question and the
  // learner's messages to Anthropic (App Store Guideline 5.1.2(i)).
  function askSocrates() {
    if (getConsent()?.ai_consent) { setTutorStarted(true); setTutorOpen(true); }
    else setConsentOpen(true);
  }

  function requestQuit() {
    if (!answeredAny.current) onQuit();
    else setQuitOpen(true);
  }

  if (error) {
    return (
      <View style={s.center}>
        <Socrates size={104} mood="concerned" />
        <Text style={[type.socrates, { marginTop: space(2) }]} accessibilityRole="alert">{error}</Text>
        <View style={{ alignSelf: "stretch", marginTop: space(3), gap: space(1) }}>
          {!lesson && <Button title="Try again" onPress={load} />}
          {lesson && <Button title="Try again" onPress={() => { setError(null); finish(); }} />}
          <TextButton title="Back" onPress={onQuit} />
        </View>
      </View>
    );
  }
  if (!lesson || !current) {
    return (
      <View style={s.center}>
        <Socrates size={104} mood="thinking" />
        <Text style={[type.socrates, { marginTop: space(2), color: color.inkSoft }]} accessibilityRole="progressbar" aria-busy>
          {source.kind === "task" && source.mode === "fresh" ? "Writing you some new questions. This takes a few seconds…" : pick(lines.loading, 0)}
        </Text>
      </View>
    );
  }

  const item = current.item;
  const checked = phase !== "answering";
  const qKey = item.id + (current.retry ? "-r" : "");
  const counts = phase === "right" || (phase === "wrong" && (current.retry || placement || timed));
  const progress = (done + (counts ? 1 : 0)) / total;
  const liveText = phase === "right" ? "Correct" : phase === "wrong" ? `Not quite. The answer is ${item.answer}` : "";
  const modalOpen = tutorOpen || quitOpen || consentOpen;
  const mood: SocratesMood = phase === "answering" ? "thinking" : phase === "right" ? (cheer ? "celebrate" : "happy") : "concerned";
  const lowTime = left != null && left <= 60;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View ref={contentRef} style={{ flex: 1 }} aria-hidden={modalOpen || undefined} importantForAccessibility={modalOpen ? "no-hide-descendants" : "auto"}>
        <View style={s.head}>
          <View style={s.headRow}>
            <IconButton name="close" onPress={requestQuit} label={placement ? "Quit placement quiz" : "Quit lesson"} style={{ marginLeft: -8 }} />
            <Text style={[type.label, { flex: 1, marginLeft: space(1) }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
            {left != null ? (
              <View style={s.timer} accessible accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
                <Icon name="clock" size={20} color={lowTime ? color.brick : color.inkSoft} />
                <Text style={[s.timerText, tabular, lowTime && { color: color.brick }]}>{clock(left)}</Text>
              </View>
            ) : (
              <Text style={[type.small, tabular]}>{Math.min(done + 1, total)} of {total}</Text>
            )}
          </View>
          <View style={{ flexDirection: "row", marginTop: space(1) }}>
            <ProgressBar value={progress} height={8} fill={color.azure} />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; updateMore(); }}
          onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; updateMore(); }}
          onContentSizeChange={(_, hgt) => { contentH.current = hgt; updateMore(); }}
        >
          <View ref={innerRef}>
          {/* Once checked, Socrates speaks from the feedback sheet, so his row here folds away. */}
          {!checked && !(quietStart.current && done === 0 && !current.retry) && (
            <FadeWhen hidden={false} style={s.say}>
              <SocratesLine text={line} mood={mood} size={64} textStyle={type.socratesSmall} />
            </FadeWhen>
          )}

          <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; block.current = { y, h: height }; }}>
            <SlideIn key={qKey} id={qKey}>
              <Animated.View style={areaShake.style}>
                {item.passage && <Passage text={item.passage} label={item.passage2 ? "Text 1" : undefined} />}
                {item.passage2 && <Passage text={item.passage2} label="Text 2" />}
                {item.figure && <Figure spec={item.figure} />}
                {item.table && <DataTable table={item.table} />}
                <View ref={stemRef}>
                  <RichText text={item.stem} style={[type.question, s.stem]} />
                </View>
                {item.source === "generated" && !checked && (
                  <View style={s.genRow}>
                    <TextButton
                      title={reported.has(item.id) ? "Reported" : "Report it"}
                      tone="soft"
                      align="left"
                      disabled={reported.has(item.id)}
                      style={{ minHeight: 32, paddingHorizontal: 0 }}
                      accessibilityLabel={reported.has(item.id) ? "Question reported" : "Report a problem with this question"}
                      onPress={() => report(item.id, "generated question, reported before answering")}
                    />
                    {reportFailed === item.id && <Text style={[type.small, { color: color.brick, marginLeft: space(1) }]} accessibilityRole="alert">Couldn't send that. Try again?</Text>}
                  </View>
                )}

                {item.type === "mc" ? (
                  <View style={{ gap: space(1.25) }} accessibilityRole="radiogroup">
                    {item.choices!.map((c, i) => {
                      const picked = choice === c;
                      const state: TileState = checked ? (c === item.answer ? "right" : picked ? "wrong" : "dim") : picked ? "picked" : "idle";
                      return (
                        <Rise key={c} delay={60 + i * 40}>
                          <View ref={(r) => { tileRefs.current[i] = r; }}>
                          <ChoiceTile
                            letter={"ABCDEFGH"[i]}
                            text={c}
                            state={state}
                            selected={picked}
                            disabled={checked}
                            onPress={() => { if (choice !== c) feedback.select(); setChoice(c); }}
                          />
                          </View>
                        </Rise>
                      );
                    })}
                  </View>
                ) : (
                  <View ref={(r) => { tileRefs.current[0] = r; }}>
                    <View>
                      <TextInput
                        value={typed}
                        onChangeText={setTyped}
                        editable={!checked}
                        placeholder="Type your answer"
                        placeholderTextColor={color.inkSoft}
                        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                        autoCorrect={false}
                        autoCapitalize="none"
                        onSubmitEditing={check}
                        style={[s.input, phase === "right" && { backgroundColor: color.oliveWash }, phase === "wrong" && { backgroundColor: color.brickWash }]}
                        accessibilityLabel="Your answer"
                      />
                      {checked && (
                        <View style={s.inputMark} pointerEvents="none">
                          <DrawnMark ok={phase === "right"} size={26} />
                        </View>
                      )}
                    </View>
                    <Text style={[type.small, { marginTop: space(1) }]}>Fractions like 3/4 and decimals like 0.75 both work.</Text>
                  </View>
                )}
              </Animated.View>
            </SlideIn>
          </View>

          {checked && showSolution && item.explanation.length > 0 && (
            <View
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                solLayout.current = { y, h: height };
                if (!revealSolution.current) return;
                revealSolution.current = false;
                setTimeout(() => ensureVisible(y, y + height), 30);
              }}
            >
              <Rise delay={80} style={s.solution}>
                <Text style={[type.heading, { marginBottom: space(1) }]}>How to solve it</Text>
                {item.explanation.map((step, i) => (
                  <View key={i} style={{ flexDirection: "row", marginBottom: space(0.75) }}>
                    {item.explanation.length > 1 && <Text style={[type.body, tabular, { width: 24, color: color.inkSoft }]}>{i + 1}.</Text>}
                    <Text style={[type.body, { flex: 1 }]}>{renderMath(step)}</Text>
                  </View>
                ))}
              </Rise>
            </View>
          )}

          {/* Room under the last choice, so every tile can scroll clear of the bar or sheet. */}
          <View style={{ height: (checked ? space(6) : space(3)) + (checked ? tailPad : 0) }} />
          </View>
        </ScrollView>

        {phase === "answering" ? (
          <View key="foot" style={[s.foot, moreBelow && shadow.bar]}>
            <View style={s.footInner}>
              <Button title={busy ? "Checking…" : "Check"} disabled={!response || busy} onPress={check} />
            </View>
          </View>
        ) : (
          <ResultPanel
            key={`panel-${fx}`}
            ok={phase === "right"}
            line={line}
            mood={mood}
            fx={fx}
            answer={item.answer}
            combo={phase === "right" && !current.retry ? combo : 0}
            xp={xpGain}
            busy={busy}
            onNext={next}
            onAsk={placement ? undefined : askSocrates}
            onSolution={showSolution || item.explanation.length === 0 ? undefined : openSolution}
            reported={reported.has(item.id)}
            reportFailed={reportFailed === item.id}
            onReport={() => report(item.id, `after ${phase}, answered ${response}`)}
            last={queue.length === 1 && !(phase === "wrong" && !current.retry && !placement && !timed)}
          />
        )}
      </View>

      <View style={s.srOnly} pointerEvents="none">
        <Text aria-live="polite" accessibilityLiveRegion="polite">{liveText}</Text>
      </View>

      {tutorStarted && (
        <Tutor key={qKey} visible={tutorOpen} item={item} response={response || ""} onClose={() => setTutorOpen(false)} onSolution={() => { openSolution(); setTutorOpen(false); }} />
      )}

      {consentOpen && (
        <ConsentSheet
          where="lesson"
          onAgree={async () => {
            try {
              await api.setConsent({ ai: true });
              setConsentOpen(false);
              setTutorStarted(true);
              setTutorOpen(true);
            } catch {
              setConsentOpen(false);
            }
          }}
          onDecline={() => setConsentOpen(false)}
        />
      )}
      {quitOpen && <QuitSheet placement={placement} onStay={() => setQuitOpen(false)} onLeave={onQuit} />}
    </KeyboardAvoidingView>
  );
}

// ─── Result panel ────────────────────────────────────────────────────────────

function ResultPanel({ ok, line, mood, fx, combo, xp, busy, onNext, onAsk, onSolution, last, reported, reportFailed, onReport }: {
  ok: boolean; line: string; mood: SocratesMood; fx: number; answer: string; combo: number; xp: number; busy: boolean;
  onNext: () => void; onAsk?: () => void; onSolution?: () => void; last: boolean;
  reported: boolean; reportFailed: boolean; onReport: () => void;
}) {
  // Short phones: a smaller Socrates and tighter padding, so the picked and
  // the right tile stay visible above the panel.
  const short = useWindowDimensions().height < 720;
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    (still
      ? Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, speed: 18, bounciness: 5, useNativeDriver: Platform.OS !== "web" })
    ).start();
  }, [v, still]);
  return (
    <Animated.View
      style={[s.panel, short && { paddingTop: space(2) }, { backgroundColor: ok ? color.oliveWash : color.brickWash }, {
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
      }]}
    >
      <View style={s.footInner}>
        <View style={[s.panelHead, short && { marginBottom: space(1) }]}>
          <View>
            <Socrates size={short ? 56 : 72} mood={mood} moodKey={fx} talking={typing} lookAt={typing ? "bubble" : undefined} />
            {ok && xp > 0 && (
              <FloatUp style={s.xpFloat}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Icon name="xp" size={18} color={color.ochre} />
                  <Text style={[type.label, tabular, { marginLeft: 3 }]}>+{xp}</Text>
                </View>
              </FloatUp>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <DrawnMark ok={ok} size={26} />
              <Text style={[s.panelTitle, { color: ok ? color.olive : color.brick, marginLeft: space(0.75) }]}>
                {ok ? (combo >= 2 ? `Right, ${combo} in a row` : "Right") : "Not quite"}
              </Text>
            </View>
            <SocratesSays text={line} onTyping={setTyping} tail="none" textStyle={type.socratesSmall} style={{ marginTop: space(0.75) }} />
          </View>
        </View>
        {(() => {
          const reportBtn = (
            <TextButton
              title={reported ? "Reported" : "Report a problem"}
              tone="soft"
              disabled={reported}
              onPress={onReport}
              accessibilityLabel={reported ? "Question reported" : "Report a problem with this question"}
              style={{ minHeight: 36, paddingHorizontal: 0 }}
            />
          );
          const links = (!ok && onAsk) || onSolution;
          // Short phones: the report link joins the links row, so the panel is one row shorter.
          const inline = short && links;
          return (
            <>
              {links && (
                <View style={s.panelLinks}>
                  {!ok && onAsk && <TextButton title="Ask Socrates" onPress={onAsk} tone="ink" style={{ paddingHorizontal: 0, marginRight: space(3) }} />}
                  {onSolution && <TextButton title="Show the solution" onPress={onSolution} tone="ink" style={{ paddingHorizontal: 0, marginRight: space(3) }} />}
                  {inline && reportBtn}
                </View>
              )}
              <Button title={last ? "Finish" : "Continue"} onPress={onNext} disabled={busy} testID="continue" />
              {!inline && <View style={s.panelReport}>{reportBtn}</View>}
              {reportFailed && <Text style={[type.small, { color: color.brick, textAlign: "center" }]} accessibilityRole="alert">Couldn't send that. Try again?</Text>}
            </>
          );
        })()}
      </View>
    </Animated.View>
  );
}

// Fades its content out (keeping its space) while `hidden`.
function FadeWhen({ hidden, children, style }: { hidden: boolean; children: React.ReactNode; style?: object }) {
  const v = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: hidden ? 0 : 1, duration: hidden ? 160 : 220, useNativeDriver: Platform.OS !== "web" }).start();
  }, [hidden, v]);
  return (
    <Animated.View style={[style, { opacity: v }]} pointerEvents={hidden ? "none" : "auto"} aria-hidden={hidden || undefined}>
      {children}
    </Animated.View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A check or a cross that draws itself in.
function DrawnMark({ ok, size }: { ok: boolean; size: number }) {
  const v = useRef(new Animated.Value(isReduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReduceMotion()) return;
    Animated.timing(v, { toValue: 1, duration: ok ? 360 : 260, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, ok]);
  const c = ok ? color.olive : color.brick;
  const len = 30;
  const off = v.interpolate({ inputRange: [0, 1], outputRange: [len, 0] });
  return (
    <View {...decorative} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {ok ? (
          <AnimatedPath d="M4.6 12.9L9.6 17.6L19.4 6.8" stroke={c} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
        ) : (
          <>
            <AnimatedPath d="M6.3 6L18 18" stroke={c} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
            <AnimatedPath d="M17.8 6.2L6 17.9" stroke={c} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
          </>
        )}
      </Svg>
    </View>
  );
}

// ─── Answer choices ──────────────────────────────────────────────────────────

type TileState = "idle" | "picked" | "right" | "wrong" | "dim";

const TILE: Record<TileState, { bg: string; edge: string; letterBg: string; letterFg: string; text: string }> = {
  idle: { bg: color.sheet, edge: color.rule, letterBg: color.paperDeep, letterFg: color.ink, text: color.ink },
  picked: { bg: color.azureWash, edge: color.azure, letterBg: color.azure, letterFg: color.ink, text: color.ink },
  right: { bg: color.oliveWash, edge: color.olive, letterBg: color.olive, letterFg: color.sheet, text: color.ink },
  wrong: { bg: color.brickWash, edge: color.brick, letterBg: color.brick, letterFg: color.sheet, text: color.ink },
  dim: { bg: color.paper, edge: color.paperDeep, letterBg: color.paperDeep, letterFg: color.inkSoft, text: color.inkSoft },
};

const TILE_R = radius.row;
const TILE_PAD = space(1.5);

function ChoiceTile({ letter, text, state, selected, disabled, onPress }: {
  letter: string; text: string; state: TileState; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  const t = TILE[state];
  const pop = usePop(state === "picked" || state === "right", state === "right" ? 1.04 : 1.02);
  const { style: shakeStyle, shake } = useShake();
  useEffect(() => {
    if (state === "wrong") shake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Animated.View style={shakeStyle}>
      <Animated.View style={pop}>
        <Press3D
          onPress={onPress}
          disabled={disabled}
          sound={false}
          haptic={false}
          edge={t.edge}
          depth={3}
          radius={TILE_R}
          accessibilityRole="radio"
          accessibilityLabel={text}
          accessibilityState={{ selected, checked: selected }}
          face={[s.choice, { backgroundColor: t.bg }]}
        >
          <View style={[s.letter, { backgroundColor: t.letterBg }]}>
            {state === "right" ? <Icon name="check" size={18} color={t.letterFg} strokeWidth={2.4} />
              : state === "wrong" ? <Icon name="close" size={16} color={t.letterFg} strokeWidth={2.4} />
              : <Text style={[type.label, { color: t.letterFg, fontFamily: font.black }]}>{letter}</Text>}
          </View>
          <RichText text={text} style={[type.body, { flex: 1, color: t.text }, state === "right" && { fontFamily: font.bold }]} />
        </Press3D>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

export function ConsentSheet({ onAgree, onDecline, where = "lesson" }: { onAgree: () => void; onDecline: () => void; where?: "lesson" | "Me" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet onClose={onDecline} label="Before you talk to Socrates">
      <View accessibilityRole="alert">
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Socrates size={64} mood="listening" />
          <Text style={[type.title, { flex: 1, marginLeft: space(1.5) }]}>Before we talk</Text>
        </View>
        <Text style={[type.body, { marginTop: space(2) }]}>
          Socrates is an AI tutor powered by Claude, made by Anthropic. When you chat with him, this question, your answer and what you type are sent to Anthropic to write his replies.
        </Text>
        <Text style={[type.body, { marginTop: space(1) }]}>
          Please don't share personal details like your name, school or contact info. Socrates can make mistakes; the worked solution is always checked.
        </Text>
        <Text style={[type.small, { marginTop: space(1.5), marginBottom: space(2.5) }]}>
          Details are in our{" "}
          <Text style={s.legalLink} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("privacy"))}>Privacy Policy</Text>. You can turn this off any time in {where === "Me" ? "this screen" : "Me"}.
        </Text>
      </View>
      <Button title="I agree, ask Socrates" disabled={busy} onPress={() => { setBusy(true); onAgree(); }} />
      <TextButton title="Not now" tone="soft" onPress={onDecline} style={{ marginTop: space(0.5) }} />
    </Sheet>
  );
}

function QuitSheet({ placement, onStay, onLeave }: { placement: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <Sheet onClose={onStay} label="Leave this set?">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Socrates size={64} mood="concerned" />
        <Text style={[type.title, { flex: 1, marginLeft: space(1.5) }]}>{placement ? "Stop the quiz?" : "Stop here?"}</Text>
      </View>
      <Text style={[type.body, { marginTop: space(2), marginBottom: space(3) }]}>
        {placement ? "If you stop now, nothing gets skipped and you start from the first skills." : "Answers so far are saved, but the set won't count toward today until you finish it."}
      </Text>
      <Button title="Keep going" onPress={onStay} />
      <TextButton title={placement ? "End the quiz" : "End lesson"} tone="brick" onPress={onLeave} style={{ marginTop: space(0.5) }} />
    </Sheet>
  );
}

// ─── Data table ──────────────────────────────────────────────────────────────

function DataTable({ table }: { table: NonNullable<Item["table"]> }) {
  const n = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
  const cols = Array.from({ length: n }, (_, ci) => ci);
  const cell = (r: (string | number)[], ci: number) => (r[ci] == null ? "" : String(r[ci]));
  const titleEl = table.title ? <Text style={[type.label, { marginBottom: space(1) }]}>{table.title}</Text> : null;

  if (n <= 4) {
    const longestWord = (t: string) => Math.max(0, ...t.split(/\s+/).map((w) => w.length));
    const weight = cols.map((ci) => Math.max(5, longestWord(table.headers[ci] ?? "") + 1, ...table.rows.map((r) => cell(r, ci).length)));
    const small = n >= 4;
    const row = (vals: string[], header: boolean, last: boolean, key: React.Key) => (
      <View key={key} style={[s.tr, !last && s.trRule, header && { backgroundColor: color.paperDeep }]}>
        {cols.map((ci) => (
          <View key={ci} style={[s.tdCell, small && { paddingHorizontal: space(0.5) }, { flex: weight[ci] }]}>
            <Text style={[s.tdFit, tabular, small && s.tdSmall, header && { fontFamily: font.bold }]}>{vals[ci] ?? ""}</Text>
          </View>
        ))}
      </View>
    );
    return (
      <View style={{ marginBottom: space(2) }}>
        {titleEl}
        <View style={s.table}>
          {row(table.headers, true, table.rows.length === 0, "h")}
          {table.rows.map((r, ri) => row(cols.map((ci) => cell(r, ci)), false, ri === table.rows.length - 1, ri))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: space(2) }}>
      {titleEl}
      <ScrollView horizontal contentContainerStyle={s.table}>
        <View style={{ flexDirection: "row" }}>
          {cols.map((ci) => (
            <View key={ci} style={{ flexGrow: 1 }}>
              <Text numberOfLines={1} style={[s.td, tabular, s.th]}>{table.headers[ci] ?? ""}</Text>
              {table.rows.map((r, ri) => (
                <Text key={ri} numberOfLines={1} style={[s.td, tabular, ri === table.rows.length - 1 && s.tdBottom]}>{cell(r, ci)}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Socrates tutor ──────────────────────────────────────────────────────────

function Tutor({ item, response, visible, onClose, onSolution }: { item: Item; response: string; visible: boolean; onClose: () => void; onSolution: () => void }) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const closeRef = useRef<React.ComponentRef<typeof View>>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(visible);
  const still = useReducedMotion();

  useEffect(() => {
    if (visible) {
      setShown(true);
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: Platform.OS !== "web", speed: 14, bounciness: 4 }).start();
      const t = setTimeout(() => (closeRef.current as unknown as { focus?: () => void } | null)?.focus?.(), 0);
      return () => clearTimeout(t);
    }
    Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => {
      if (finished) setShown(false);
    });
  }, [visible, slide]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const d = (globalThis as { document?: Document }).document;
    if (!d?.addEventListener) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  async function send(history: TutorTurn[]) {
    setWaiting(true);
    try {
      const r = await api.socrates({ item_id: item.id, response, history });
      setTurns([...history, { role: "socrates", content: r.reply }]);
      if (r.done || r.error === "daily_limit") setEnded(true);
      if (r.offline) setNote("Offline. Socrates is answering from saved hints.");
      else if (r.remaining_today != null && r.remaining_today <= 1)
        setNote(r.remaining_today === 0 ? "That's your last Socrates chat for today." : "One Socrates chat left today.");
    } catch (e) {
      const needsOk = (e as { status?: number })?.status === 403;
      setTurns([...history, { role: "socrates", content: needsOk ? "I need your OK before we chat. Close this and tap Ask Socrates again." : lines.tutorOffline }]);
      setEnded(true);
    } finally {
      setWaiting(false);
    }
  }

  useEffect(() => {
    send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [turns, waiting]);

  const submit = () => {
    const text = draft.trim();
    if (!text || waiting || ended) return;
    setDraft("");
    const h: TutorTurn[] = [...turns, { role: "student", content: text }];
    setTurns(h);
    send(h);
  };

  const lastHim = useMemo(() => turns.map((t) => t.role).lastIndexOf("socrates"), [turns]);
  const mood: SocratesMood = waiting ? "thinking" : typing ? "idle" : ended ? "idle" : "listening";

  return (
    <View style={[s.overlay, !shown && { display: "none" }]} pointerEvents={visible ? "auto" : "none"} role="dialog" aria-modal aria-label="Socrates" accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }) }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[s.tutor, {
          transform: still ? [] : [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [500, 0], extrapolateRight: "clamp" }) }],
          opacity: still ? slide : 1,
        }]}
      >
        <View style={s.tutorHead}>
          <Socrates size={56} mood={mood} talking={typing} moodKey={turns.length} />
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <Text style={type.heading}>Socrates</Text>
            {waiting && <Text style={type.small}>Thinking…</Text>}
          </View>
          <IconButton ref={closeRef} name="close" onPress={onClose} label="Close Socrates" tone={color.inkSoft} style={{ marginRight: -8 }} />
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingVertical: space(2), gap: space(2) }}>
          {turns.map((t, i) =>
            t.role === "student" ? (
              <Rise key={i} style={s.msgMe}>
                <Text style={type.body}>{t.content}</Text>
              </Rise>
            ) : (
              <Rise key={i} style={s.msgHim}>
                {i === lastHim ? (
                  <SocratesSays text={t.content} onTyping={setTyping} tail="none" />
                ) : (
                  <Text style={type.socrates}>{t.content}</Text>
                )}
              </Rise>
            ),
          )}
          {waiting && (
            <PopIn style={s.msgHim}>
              <View accessible accessibilityRole="text" accessibilityLabel="Socrates is thinking" aria-live="polite">
                <ThinkingDots />
              </View>
            </PopIn>
          )}
        </ScrollView>
        <View style={s.tutorFoot}>
          {ended ? (
            <Button title="Show the solution" onPress={onSolution} />
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: space(1), alignItems: "center" }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Tell him what you think"
                  placeholderTextColor={color.inkSoft}
                  onSubmitEditing={submit}
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  editable={!waiting}
                  maxLength={500}
                  accessibilityLabel="Your reply"
                />
                <Pressable
                  onPress={submit}
                  disabled={!draft.trim() || waiting}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                  accessibilityState={{ disabled: !draft.trim() || waiting }}
                  style={({ pressed }) => [s.send, { backgroundColor: !draft.trim() || waiting ? color.paperDeep : color.azure }, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  <Icon name="send" color={!draft.trim() || waiting ? color.inkSoft : color.ink} strokeWidth={2.2} />
                </Pressable>
              </View>
              {note && <Text style={[type.small, { marginTop: space(1) }]}>{note}</Text>}
              <TextButton title="Just show me the solution" tone="soft" onPress={onSolution} style={{ marginTop: space(0.5) }} />
            </>
          )}
          {ended && note && <Text style={[type.small, { marginTop: space(1) }]}>{note}</Text>}
        </View>
      </Animated.View>
    </View>
  );
}

// Three ink dots, rising in turn, while Socrates writes.
function ThinkingDots() {
  const t = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [t, still]);
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingVertical: 8 }}>
      {[0, 1, 2].map((i) => {
        const a = 0.05 + i * 0.2;
        return (
          <Animated.View
            key={i}
            style={[s.dot, { transform: [{ translateY: t.interpolate({ inputRange: [0, a, a + 0.15, a + 0.3, 1], outputRange: [0, 0, -5, 0, 0] }) }] }]}
          />
        );
      })}
    </View>
  );
}

const PANEL_R = radius.sheet;
// One column for the lesson on wide screens: header, body, panel and tutor.


const s = StyleSheet.create({
  center: { flex: 1, alignItems: "flex-start", justifyContent: "center", padding: GUTTER, maxWidth: 520, width: "100%", alignSelf: "center" },
  head: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  headRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  timer: { flexDirection: "row", alignItems: "center", gap: 4 },
  timerText: { fontFamily: font.serifSemi, fontSize: 20, lineHeight: 24, color: color.ink },
  body: { paddingHorizontal: GUTTER, paddingTop: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  say: { marginBottom: space(2) },
  xpFloat: { position: "absolute", left: 18, top: -18 },
  stem: { marginBottom: space(2.5) },
  genRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: -space(1.5), marginBottom: space(2) },
  choice: { flexDirection: "row", alignItems: "center", gap: space(1.5), padding: TILE_PAD, minHeight: 56, borderRadius: TILE_R },
  // Inner corner: a circle, so radius = half its size regardless of the tile.
  letter: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  input: {
    borderRadius: radius.input,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    fontSize: 19,
    fontFamily: font.semibold,
    color: color.ink,
    backgroundColor: color.paperDeep,
    minHeight: 54,
    marginTop: space(0.5),
    outlineColor: color.azure,
  } as object,
  inputMark: { position: "absolute", right: space(1.5), top: space(0.5), bottom: 0, justifyContent: "center" },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, left: 0, top: 0 },
  solution: { marginTop: space(3) },
  foot: { paddingHorizontal: GUTTER, paddingVertical: space(1.5), backgroundColor: color.paper },
  footInner: { maxWidth: COLUMN - 2 * GUTTER, width: "100%", alignSelf: "center" },
  // Full width; its contents line up with the lesson column through footInner.
  panel: { width: "100%", paddingHorizontal: GUTTER, paddingTop: space(2.5), paddingBottom: space(1.5), borderTopLeftRadius: PANEL_R, borderTopRightRadius: PANEL_R },
  panelHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: space(1.5) },
  panelTitle: { fontFamily: font.serifSemi, fontSize: 22, lineHeight: 28 },
  panelLinks: { flexDirection: "row", flexWrap: "wrap", marginBottom: space(1), marginTop: -space(0.5) },
  panelReport: { alignItems: "center", marginTop: space(0.25) },
  table: { borderRadius: radius.small, overflow: "hidden", backgroundColor: color.sheet },
  th: { fontFamily: font.bold, backgroundColor: color.paperDeep },
  tr: { flexDirection: "row", alignItems: "stretch" },
  trRule: { borderBottomWidth: 1, borderColor: color.rule },
  tdCell: { justifyContent: "center", paddingHorizontal: space(1), paddingVertical: space(1) },
  tdFit: { ...type.body, textAlign: "center" },
  tdSmall: { fontSize: 14, lineHeight: 19 },
  tdBottom: { borderBottomWidth: 0 },
  td: { ...type.body, minWidth: 64, paddingHorizontal: space(1.5), paddingVertical: space(1), borderBottomWidth: 1, borderColor: color.rule, textAlign: "center" },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end", zIndex: 30 },
  legalLink: { color: color.azureInk, fontFamily: font.bold, textDecorationLine: "underline" },
  tutor: { backgroundColor: color.sheet, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, height: "86%", maxWidth: COLUMN, width: "100%", alignSelf: "center", ...shadow.float },
  tutorHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER, paddingTop: space(2), paddingBottom: space(1) },
  msgHim: { alignSelf: "stretch", paddingRight: space(4) },
  msgMe: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: color.azureWash, paddingVertical: space(1.25), paddingHorizontal: space(1.75), borderRadius: radius.row },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.inkSoft },
  tutorFoot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5) },
  send: { width: 48, height: 48, borderRadius: radius.input, alignItems: "center", justifyContent: "center" },
});
