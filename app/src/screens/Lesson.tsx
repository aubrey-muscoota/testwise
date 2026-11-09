// The lesson screen. Runs lessons, reviews, placement quizzes and every
// practice mode (they all return the same shape). The question is the main
// thing; Socrates sits above it and reacts to each answer.
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, KeyboardAvoidingView, Platform, ScrollView, ScrollViewInstance, StyleSheet, Text, View,
} from "react-native";
import { api, getConsent, Item, Lesson as LessonT, Placement, Stats } from "../api";
import { Icon } from "../components/icons";
import { SocratesLine } from "../components/SocratesLine";
import { Button, IconButton, ProgressBar, SlideIn, TextButton, useShake } from "../components/ui";
import { clock, lines, pick } from "../copy";
import { feedback } from "../motion/feedback";
import { LessonSource } from "../nav";
import { Measurable, Phase, Question, Solution } from "../lesson/Question";
import { ResultPanel } from "../lesson/ResultPanel";
import { lessonShared } from "../lesson/shared";
import { ConsentSheet, QuitSheet } from "../lesson/sheets";
import { Tutor } from "../lesson/Tutor";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { color, font, GUTTER, shadow, space, tabular, type } from "../theme";

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
        <View style={lessonShared.head}>
          <View style={lessonShared.headRow}>
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
          contentContainerStyle={lessonShared.body}
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
                <Question
                  item={item}
                  phase={phase}
                  choice={choice}
                  typed={typed}
                  onChoice={setChoice}
                  onTyped={setTyped}
                  onSubmit={check}
                  stemRef={stemRef}
                  tileRefs={tileRefs}
                  reported={reported.has(item.id)}
                  reportFailed={reportFailed === item.id}
                  onReport={() => report(item.id, "generated question, reported before answering")}
                />
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
              <Solution steps={item.explanation} />
            </View>
          )}

          {/* Room under the last choice, so every tile can scroll clear of the bar or sheet. */}
          <View style={{ height: (checked ? space(6) : space(3)) + (checked ? tailPad : 0) }} />
          </View>
        </ScrollView>

        {phase === "answering" ? (
          <View key="foot" style={[lessonShared.foot, moreBelow && shadow.bar]}>
            <View style={lessonShared.footInner}>
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

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "flex-start", justifyContent: "center", padding: GUTTER, maxWidth: 520, width: "100%", alignSelf: "center" },
  timer: { flexDirection: "row", alignItems: "center", gap: 4 },
  timerText: { fontFamily: font.serifSemi, fontSize: 20, lineHeight: 24, color: color.ink },
  say: { marginBottom: space(2) },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, left: 0, top: 0 },
});
