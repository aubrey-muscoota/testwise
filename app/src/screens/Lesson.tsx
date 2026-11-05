import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, TextInput, View,
} from "react-native";
import { api, Item, Lesson as LessonT, Placement, Skill, Stats, TutorTurn } from "../api";
import {
  Burst, Button, FloatUp, Mascot, Mood, PopIn, Press3D, ProgressBar, Rise, SlideIn, SlideUp, Speech, usePop, useShake,
} from "../components/ui";
import { lines, pick } from "../copy";
import { feedback } from "../motion/feedback";
import { color, font, radius, space, type } from "../theme";

export type LessonResult = { correct: number; total: number; xp: number; stats: Stats; skillName: string | null; placement?: Placement };

type Phase = "answering" | "right" | "wrong";

// Said when a fresh question opens, so the last reaction doesn't linger.
const NEXT_LINES = [
  "Here's the next one.",
  "Onward! What do you make of this?",
  "Take your time with this one.",
  "Another puzzle for the mind.",
];
const COMBO_MILESTONES = [3, 5, 8];
const RIGHT_TITLES = ["Nicely done!", "Excellent!", "You got it!", "Brilliant!", "Spot on!"];
const GREEN_TEXT = "#3F8F3A";
const CORAL_TEXT = "#C94A45";
const CORAL_EDGE = "#E5605B";

// `placement` runs the placement quiz instead: one try per question, no tutor.
export function Lesson({ skill, placement = false, onDone, onQuit }: { skill: Skill | null; placement?: boolean; onDone: (r: LessonResult) => void; onQuit: () => void }) {
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
  const [line, setLine] = useState(pick(placement ? lines.placement : skill ? lines.lessonStart : lines.review));
  const [reported, setReported] = useState<Set<string>>(new Set());
  // Motion-only state.
  const [fx, setFx] = useState(0); // bumps on every checked answer, replays reactions
  const [combo, setCombo] = useState(0);
  const [toast, setToast] = useState<{ n: number; k: number } | null>(null); // combo milestone being celebrated
  const [cheer, setCheer] = useState(false);
  const [xpGain, setXpGain] = useState(0); // XP the server awarded for this answer (first tries only)
  const [bannerH, setBannerH] = useState(0);
  const [rightTitle, setRightTitle] = useState(RIGHT_TITLES[0]);
  const [quitOpen, setQuitOpen] = useState(false);
  const answeredAny = useRef(false);
  const started = useRef(Date.now());
  const areaShake = useShake();
  // Scroll bookkeeping, so the answer and the solution are never left under the banner.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const viewH = useRef(0);
  const block = useRef({ y: 0, h: 0 });
  const tileH = useRef<number[]>([]);
  const revealSolution = useRef(false);
  const solLayout = useRef<{ y: number; h: number } | null>(null);
  const contentRef = useRef<any>(null);
  const wasTutorOpen = useRef(false);

  useEffect(() => {
    (placement ? api.startPlacement() : api.startLesson(skill?.id ?? null))
      .then((l) => {
        setLesson(l);
        setQueue(l.items.map((item) => ({ item, retry: false })));
        started.current = Date.now();
      })
      .catch(() => setError(placement ? "Couldn't start the placement quiz." : "Couldn't start the lesson."));
  }, [skill, placement]);

  const total = lesson?.items.length || 1;
  const current = queue[0];
  const response = current?.item.type === "mc" ? choice : typed.trim();

  async function check() {
    if (!lesson || !current || !response || busy) return;
    setBusy(true);
    try {
      const r = await api.answer({
        lesson_id: lesson.lesson_id,
        item_id: current.item.id,
        response,
        time_ms: Date.now() - started.current,
      });
      answeredAny.current = true;
      setFx((k) => k + 1);
      if (r.correct) {
        setPhase("right");
        setRightTitle(pick(RIGHT_TITLES));
        feedback.correct();
        announce("Correct!");
        const firstTry = !current.retry;
        setXpGain(firstTry ? r.xp || 0 : 0);
        // Combo counts first-try correct answers in a row; a retry neither adds nor resets.
        const n = firstTry ? combo + 1 : combo;
        setCombo(n);
        const milestone = firstTry && COMBO_MILESTONES.includes(n);
        setCheer(milestone);
        if (milestone) {
          setToast({ n, k: Date.now() });
          setLine(pick(lines.streak));
          setTimeout(feedback.combo, 220); // let the "correct" chime land first
        } else {
          setLine(pick(lines.correct));
        }
      } else {
        setPhase("wrong");
        setLine(pick(lines.incorrect));
        setCombo(0);
        setCheer(false);
        setXpGain(0);
        feedback.wrong();
        announce(`Not quite. Correct answer: ${current.item.answer}`);
        if (current.item.type !== "mc") areaShake.shake(); // MC tiles shake themselves
      }
    } catch {
      setError("Lost connection. Your answer wasn't saved; try again.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!lesson || !current) return;
    const wasWrong = phase === "wrong";
    let rest = queue.slice(1);
    let newDone = done;
    if (wasWrong && !current.retry && !placement) {
      rest = [...rest, { item: current.item, retry: true }]; // comes back at the end, once
    } else {
      newDone = done + 1;
    }
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
    setToast(null);
    setBannerH(0);
    tileH.current = [];
    revealSolution.current = false;
    solLayout.current = null;
    scrollY.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    started.current = Date.now();
    if (rest[0]?.retry && !queue[1]?.retry) setLine(pick(lines.retryQueue));
    else setLine(pick(NEXT_LINES));
    if (!rest.length) {
      setBusy(true);
      try {
        const r = await api.finish(lesson.lesson_id);
        onDone({ ...r, skillName: placement ? "Placement quiz" : skill?.name ?? null });
      } catch {
        setError("Couldn't save the lesson. Check your connection.");
        setBusy(false);
      }
    }
  }

  function announce(msg: string) {
    // Web gets the hidden live region below; native gets a direct announcement.
    if (Platform.OS !== "web") AccessibilityInfo.announceForAccessibility(msg);
  }

  // Scrolls just enough that [top, bottom] (content coordinates) is in view.
  function ensureVisible(top: number, bottom: number) {
    const vh = viewH.current;
    if (!vh) return;
    const y = scrollY.current;
    const m = space(2);
    let to = y;
    if (bottom + m > y + vh) to = bottom + m - vh;
    if (top - m < to) to = Math.max(0, top - m);
    if (Math.abs(to - y) > 1) scrollRef.current?.scrollTo({ y: to, animated: true });
  }

  function openSolution() {
    const sl = solLayout.current;
    if (showSolution && sl) {
      setTimeout(() => ensureVisible(sl.y, sl.y + sl.h), 30); // already on screen: just bring it into view
      return;
    }
    revealSolution.current = true;
    setShowSolution(true);
  }

  // After Check, bring the correct tile (or the typed answer) into view above the banner.
  useEffect(() => {
    if (phase === "answering" || !current) return;
    const it = current.item;
    const t = setTimeout(() => {
      const { y, h } = block.current;
      if (it.type === "mc" && it.choices) {
        const i = it.choices.indexOf(it.answer);
        const hs = tileH.current;
        let bottom = y + h;
        for (let j = it.choices.length - 1; j > i; j--) bottom -= (hs[j] || 0) + space(1.5);
        ensureVisible(bottom - (hs[i] || 0), bottom);
      } else {
        ensureVisible(y, y + h);
      }
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, fx]);

  // While a sheet is open the lesson behind it is inert (no Tab stops, hidden from
  // screen readers). Focus goes back to "Ask Socrates" when the tutor closes.
  useEffect(() => {
    const modal = tutorOpen || quitOpen;
    if (Platform.OS === "web") {
      const node = contentRef.current as any;
      if (node?.setAttribute) {
        if (modal) node.setAttribute("inert", "");
        else node.removeAttribute("inert");
      }
      if (wasTutorOpen.current && !tutorOpen) {
        const d = (globalThis as any).document;
        d?.querySelector?.('[aria-label="Ask Socrates"]')?.focus?.();
      }
    }
    wasTutorOpen.current = tutorOpen;
  }, [tutorOpen, quitOpen]);

  function requestQuit() {
    if (!answeredAny.current) onQuit();
    else setQuitOpen(true);
  }

  if (error) {
    return (
      <View style={s.center}>
        <PopIn>
          <Mascot size={96} float={false} mood="sad" />
        </PopIn>
        <Text style={[type.body, { textAlign: "center", marginVertical: space(2) }]}>{error}</Text>
        <Button title="Back to skills" kind="secondary" onPress={onQuit} />
      </View>
    );
  }
  if (!lesson || !current) {
    return (
      <View style={s.center}>
        <Mascot size={96} mood="think" />
        <Text style={[type.body, { marginTop: space(2), color: color.textSoft }]}>{pick(lines.loading)}</Text>
        <ActivityIndicator color={color.azure} style={{ marginTop: space(2) }} />
      </View>
    );
  }

  const item = current.item;
  const checked = phase !== "answering";
  const qKey = item.id + (current.retry ? "-r" : "");
  // The bar moves on Check whenever this answer will count as done on Continue.
  const counts = phase === "right" || (phase === "wrong" && (current.retry || placement));
  const liveText = phase === "right" ? "Correct!" : phase === "wrong" ? `Not quite. Correct answer: ${item.answer}` : "";
  const modalOpen = tutorOpen || quitOpen;
  const mood: Mood = phase === "answering" ? (busy ? "think" : "idle") : phase === "right" ? (cheer ? "cheer" : "happy") : "sad";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View
        ref={contentRef}
        style={{ flex: 1 }}
        aria-hidden={modalOpen || undefined}
        importantForAccessibility={modalOpen ? "no-hide-descendants" : "auto"}
      >
      <View style={s.head}>
        <Pressable onPress={requestQuit} accessibilityLabel={placement ? "Quit placement quiz" : "Quit lesson"} hitSlop={12} style={s.quit}>
          <Text style={s.quitX}>✕</Text>
        </Pressable>
        <ProgressBar value={(done + (counts ? 1 : 0)) / total} fill={color.green} height={16} glow={combo >= 3} />
        {/* Fixed slot, so the bar never reflows when the flame comes and goes. */}
        <View style={s.flameSlot}>{combo >= 2 && <ComboFlame n={combo} />}</View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        onLayout={(e) => { viewH.current = e.nativeEvent.layout.height; }}
      >
        <View style={s.say}>
          <View>
            <Mascot size={64} mood={mood} moodKey={fx} />
            {phase === "right" && !current.retry && xpGain > 0 && (
              <FloatUp key={fx} text={`+${xpGain} XP`} style={s.xpFloat} />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <Speech text={current.retry && !checked ? pick(lines.retryQueue, total) : line} tone={phase === "right" ? "good" : phase === "wrong" ? "bad" : "plain"} />
          </View>
        </View>

        {/* Remount per question so the slide and the choice stagger replay. */}
        <View onLayout={(e) => { const { y, height } = e.nativeEvent.layout; block.current = { y, h: height }; }}>
        <SlideIn key={qKey} id={qKey}>
          {(current.retry || item.review || placement) && (
            <PopIn from={0.6} style={{ alignSelf: "flex-start" }}>
              <Text style={[type.label, s.tag]}>{current.retry ? "TRY AGAIN" : item.review ? "REVIEW" : `PLACEMENT ${done + 1} OF ${total}`}</Text>
            </PopIn>
          )}

          <Animated.View style={areaShake.style}>
            <Text style={[type.body, s.stem]}>{item.stem}</Text>
            {item.table && <DataTable table={item.table} />}

            {item.type === "mc" ? (
              <View style={{ gap: space(1.5) }}>
                {item.choices!.map((c, i) => {
                  const picked = choice === c;
                  const state: TileState = checked
                    ? c === item.answer ? "right" : picked ? "wrong" : "dim"
                    : picked ? "picked" : "idle";
                  // zIndex sits on the staggered wrapper so the correct tile's sparks
                  // draw over the tiles below it.
                  return (
                    <Rise key={c} delay={90 + i * 60} style={{ zIndex: state === "right" ? 2 : 0 }}>
                    <ChoiceTile
                      letter={"ABCD"[i]}
                      text={c}
                      state={state}
                      selected={picked}
                      disabled={checked}
                      celebrate={phase === "right" ? fx : null}
                      onLayout={(h) => { tileH.current[i] = h; }}
                      onPress={() => {
                        if (choice !== c) feedback.select();
                        setChoice(c);
                      }}
                    />
                    </Rise>
                  );
                })}
              </View>
            ) : (
              <View>
                <View>
                  <TextInput
                    value={typed}
                    onChangeText={setTyped}
                    editable={!checked}
                    placeholder="Type your answer"
                    placeholderTextColor={color.disabledText}
                    keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
                    autoCorrect={false}
                    autoCapitalize="none"
                    onSubmitEditing={check}
                    style={[s.input, !!typed && !checked && s.inputActive, phase === "right" && s.inputRight, phase === "wrong" && s.inputWrong]}
                    accessibilityLabel="Your answer"
                  />
                  {checked && (
                    <View style={s.inputBadge} pointerEvents="none">
                      <Badge ok={phase === "right"} size={28} />
                      {phase === "right" && <Burst key={fx} radius={64} />}
                    </View>
                  )}
                </View>
                <Text style={[type.caption, { marginTop: space(1) }]}>Fractions like 3/4 and decimals like 0.75 both work.</Text>
              </View>
            )}
          </Animated.View>
        </SlideIn>
        </View>

        {checked && (showSolution || phase === "right") && (
          <View
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              solLayout.current = { y, h: height };
              if (!revealSolution.current) return;
              revealSolution.current = false;
              setTimeout(() => ensureVisible(y, y + height), 30);
            }}
          >
          <Rise delay={phase === "right" ? 180 : 120} style={s.solution}>
            <Text style={[type.label, { color: color.textSoft, marginBottom: space(1) }]}>HOW TO SOLVE IT</Text>
            {item.explanation.map((step, i) => (
              <Text key={i} style={[type.body, { marginBottom: 4 }]}>
                {item.explanation.length > 1 ? `${i + 1}. ` : ""}
                {step}
              </Text>
            ))}
          </Rise>
          </View>
        )}

        {checked && (
          <Pressable
            onPress={async () => {
              if (reported.has(item.id)) return;
              setReported(new Set(reported).add(item.id));
              try { await api.report(item.id, `after ${phase}, answered ${response}`); } catch {}
            }}
            accessibilityRole="button"
            accessibilityLabel={reported.has(item.id) ? "Question reported" : "Report a problem with this question"}
            accessibilityState={{ disabled: reported.has(item.id) }}
            hitSlop={8}
            style={s.report}
          >
            <Text style={[type.caption, { textDecorationLine: reported.has(item.id) ? "none" : "underline" }]}>
              {reported.has(item.id) ? "Thanks, we'll take a look at this question." : "Something wrong with this question? Report it"}
            </Text>
          </Pressable>
        )}
        <View style={{ height: space(4) }} />
      </ScrollView>

      {phase === "answering" ? (
        <View key="foot" style={s.foot}>
          <View style={s.footInner}>
            <Button title={busy ? "Checking…" : "Check"} disabled={!response || busy} onPress={check} />
          </View>
        </View>
      ) : (
        // Duolingo-style result banner, replayed for every answer.
        <View key="banner" onLayout={(e) => setBannerH(e.nativeEvent.layout.height)}>
        <SlideUp key={`banner-${fx}`} distance={160} style={[s.banner, phase === "right" ? s.bannerRight : s.bannerWrong]}>
          <View style={s.footInner}>
            <View style={s.bannerHead}>
              <PopIn from={0.3} delay={90}>
                <Badge ok={phase === "right"} size={40} solid />
              </PopIn>
              <View style={{ flex: 1, marginLeft: space(1.5) }}>
                {phase === "right" ? (
                  <>
                    <Text style={[s.bannerTitle, { color: GREEN_TEXT }]}>{rightTitle}</Text>
                    {combo >= 2 && !current.retry && (
                      <Rise delay={120}>
                        <Text style={[type.label, { color: GREEN_TEXT }]}>🔥 {combo} in a row</Text>
                      </Rise>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={[s.bannerTitle, { color: CORAL_TEXT }]}>Correct answer:</Text>
                    <Rise delay={100}>
                      <Text style={[type.body, { fontFamily: font.bold, color: CORAL_TEXT }]}>{item.answer}</Text>
                    </Rise>
                  </>
                )}
              </View>
            </View>
            {phase === "right" ? (
              <Button title="Continue" kind="success" onPress={next} disabled={busy} />
            ) : (
              <View style={{ gap: space(1.5) }}>
                <View style={{ flexDirection: "row", gap: space(1.5) }}>
                  {!placement && <Button title="Ask Socrates" kind="special" onPress={() => { setTutorStarted(true); setTutorOpen(true); }} style={{ flex: 1 }} small />}
                  {!showSolution && <Button title="Solution" kind="secondary" onPress={openSolution} style={{ flex: 1 }} small />}
                </View>
                <Button title="Continue" kind="danger" onPress={next} disabled={busy} />
              </View>
            )}
          </View>
        </SlideUp>
        </View>
      )}
      </View>

      {/* Announces the result to screen readers (the banner itself mounts fresh, which live regions miss). */}
      <View style={s.srOnly} pointerEvents="none">
        <Text aria-live="polite" accessibilityLiveRegion="polite">{liveText}</Text>
      </View>

      {/* Floats just above the banner so it never covers Socrates' line. */}
      {toast && bannerH > 0 && <ComboToast key={toast.k} n={toast.n} bottom={bannerH + space(2)} />}

      {tutorStarted && <Tutor key={qKey} visible={tutorOpen} item={item} response={response || ""} onClose={() => setTutorOpen(false)} onSolution={() => { openSolution(); setTutorOpen(false); }} />}

      {quitOpen && <QuitSheet placement={placement} onStay={() => setQuitOpen(false)} onLeave={onQuit} />}
    </KeyboardAvoidingView>
  );
}

// ─── Answer tiles ────────────────────────────────────────────────────────────

type TileState = "idle" | "picked" | "right" | "wrong" | "dim";

const TILE: Record<TileState, { bg: string; border: string; edge: string; letterBg: string; letterBorder: string; letterFg: string }> = {
  idle: { bg: "#fff", border: color.line, edge: "#D3DCE6", letterBg: "#fff", letterBorder: color.line, letterFg: color.textSoft },
  picked: { bg: color.azureSoft, border: color.azure, edge: color.azureDark, letterBg: color.azure, letterBorder: color.azure, letterFg: "#fff" },
  right: { bg: color.greenSoft, border: color.green, edge: color.greenDark, letterBg: color.green, letterBorder: color.green, letterFg: "#fff" },
  wrong: { bg: color.coralSoft, border: color.coral, edge: CORAL_EDGE, letterBg: color.coral, letterBorder: color.coral, letterFg: "#fff" },
  dim: { bg: "#fff", border: color.line, edge: "#D3DCE6", letterBg: "#fff", letterBorder: color.line, letterFg: color.disabledText },
};

function ChoiceTile({ letter, text, state, selected, disabled, celebrate, onPress, onLayout }: {
  letter: string; text: string; state: TileState; selected: boolean; disabled: boolean; celebrate: number | null; onPress: () => void;
  onLayout?: (height: number) => void;
}) {
  const t = TILE[state];
  const pop = usePop(state === "picked" || state === "right", state === "right" ? 1.06 : 1.03);
  const { style: shakeStyle, shake } = useShake();
  useEffect(() => {
    if (state === "wrong") shake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Animated.View style={shakeStyle} onLayout={onLayout && ((e) => onLayout(e.nativeEvent.layout.height))}>
      <Animated.View style={pop}>
        <Press3D
          onPress={onPress}
          disabled={disabled}
          sound={false}
          haptic={false}
          edge={t.edge}
          accessibilityRole="radio"
          accessibilityLabel={text}
          accessibilityState={{ selected }}
          style={state === "dim" ? { opacity: 0.6 } : undefined}
          face={[s.choice, { backgroundColor: t.bg, borderColor: t.border }]}
        >
          <View style={[s.letter, { backgroundColor: t.letterBg, borderColor: t.letterBorder }]}>
            <Text style={[type.label, { color: t.letterFg, fontFamily: font.black }]}>{letter}</Text>
          </View>
          <Text style={[type.body, { flex: 1 }, state === "right" && { fontFamily: font.bold }]}>{text}</Text>
          {(state === "right" || state === "wrong") && (
            <View>
              <PopIn from={0.2} delay={state === "right" ? 60 : 0}>
                <Badge ok={state === "right"} size={28} solid />
              </PopIn>
              {state === "right" && celebrate != null && <Burst key={celebrate} radius={72} count={14} />}
            </View>
          )}
        </Press3D>
      </Animated.View>
    </Animated.View>
  );
}

// Round check / cross badge.
function Badge({ ok, size, solid }: { ok: boolean; size: number; solid?: boolean }) {
  const c = ok ? color.green : color.coral;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: solid ? c : "#fff",
        borderWidth: solid ? 0 : 2,
        borderColor: c,
        borderBottomWidth: solid ? 3 : 2,
        borderBottomColor: ok ? color.greenDark : CORAL_EDGE,
      }}
    >
      <Text style={{ color: solid ? "#fff" : c, fontFamily: font.black, fontSize: size * 0.5, lineHeight: size * 0.62 }}>{ok ? "✓" : "✕"}</Text>
    </View>
  );
}

// ─── Combo ───────────────────────────────────────────────────────────────────

function ComboFlame({ n }: { n: number }) {
  const pop = usePop(n, 1.4);
  return (
    <PopIn from={0.3}>
      <Animated.View style={[s.flame, pop]} accessibilityLabel={`${n} in a row`}>
        <Text style={{ fontSize: 16 }}>🔥</Text>
        <Text style={s.flameN}>{n}</Text>
      </Animated.View>
    </PopIn>
  );
}

// Pops in just above the result banner, holds briefly, then drifts up and fades. Never blocks taps.
function ComboToast({ n, bottom }: { n: number; bottom: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 14 }),
      Animated.delay(650),
      Animated.timing(v, { toValue: 2, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [v]);
  return (
    <View pointerEvents="none" style={[s.toastWrap, { bottom }]}>
      <Animated.View
        style={[s.toast, {
          opacity: v.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1, 2], outputRange: [-16, 0, -14] }) },
            { scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.5, 1, 0.92] }) },
          ],
        }]}
      >
        <Burst radius={80} count={14} />
        <Text style={{ fontSize: 22 }}>🔥</Text>
        <Text style={s.toastText}>{n} in a row!</Text>
      </Animated.View>
    </View>
  );
}

// ─── Quit confirm ────────────────────────────────────────────────────────────

function Backdrop({ onPress, visible = true }: { onPress?: () => void; visible?: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(v, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
  }, [visible, v]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: v }]}>
      {onPress ? (
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onPress} accessibilityRole="button" accessibilityLabel="Close" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.scrim]} />
      )}
    </Animated.View>
  );
}

function QuitSheet({ placement, onStay, onLeave }: { placement: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <View style={s.overlay}>
      <Backdrop onPress={onStay} />
      <SlideUp distance={320} style={s.sheet}>
        <View style={{ alignItems: "center" }}>
          <Mascot size={88} float={false} mood="sad" />
          <Text style={[type.h3, { fontFamily: font.black, textAlign: "center", marginTop: space(1.5) }]}>Wait, don't go!</Text>
          <Text style={[type.body, { textAlign: "center", color: color.textSoft, marginTop: space(0.5), marginBottom: space(3) }]}>
            {placement ? "If you end now, nothing is skipped. You can start from the first skills instead." : "If you end now, you won't get XP for this lesson."}
          </Text>
        </View>
        <Button title={placement ? "Keep going" : "Keep learning"} onPress={onStay} />
        <Pressable onPress={onLeave} accessibilityRole="button" accessibilityLabel={placement ? "End the quiz" : "End lesson"} style={s.endBtn} hitSlop={8}>
          <Text style={s.endText}>{placement ? "End the quiz" : "End lesson"}</Text>
        </Pressable>
      </SlideUp>
    </View>
  );
}

// ─── Data table ──────────────────────────────────────────────────────────────

function DataTable({ table }: { table: NonNullable<Item["table"]> }) {
  const n = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
  const cols = Array.from({ length: n }, (_, ci) => ci);
  const cell = (r: (string | number)[], ci: number) => (r[ci] == null ? "" : String(r[ci]));

  // Up to 4 columns: fit the screen width. Every row shares the same column
  // widths (sized by the longest body value, so headers wrap instead of numbers).
  if (n <= 4) {
    // A header word never breaks mid-word, so its longest word sets a floor too.
    const longestWord = (t: string) => Math.max(0, ...t.split(/\s+/).map((w) => w.length));
    const weight = cols.map((ci) => Math.max(5, longestWord(table.headers[ci] ?? "") + 1, ...table.rows.map((r) => cell(r, ci).length)));
    const small = n >= 4;
    const row = (vals: string[], header: boolean, last: boolean, key: React.Key) => (
      <View key={key} style={[s.tr, !last && s.trRule, header && { backgroundColor: color.azureSoft }]}>
        {cols.map((ci) => (
          <View key={ci} style={[s.tdCell, small && { paddingHorizontal: space(0.5) }, ci < n - 1 && s.tdRule, { flex: weight[ci] }]}>
            <Text style={[s.tdFit, small && s.tdSmall, header && { fontFamily: font.bold }]}>{vals[ci] ?? ""}</Text>
          </View>
        ))}
      </View>
    );
    return (
      <View style={[s.table, { marginBottom: space(2) }]}>
        {row(table.headers, true, table.rows.length === 0, "h")}
        {table.rows.map((r, ri) => row(cols.map((ci) => cell(r, ci)), false, ri === table.rows.length - 1, ri))}
      </View>
    );
  }

  // Wider tables scroll sideways. Laid out by column so a header and its cells
  // share one width; cells stay on one line so rows line up.
  return (
    <ScrollView horizontal style={{ marginBottom: space(2) }} contentContainerStyle={s.table}>
      <View style={{ flexDirection: "row" }}>
        {cols.map((ci) => (
          <View key={ci} style={{ flexGrow: 1 }}>
            <Text numberOfLines={1} style={[s.td, s.th, ci === n - 1 && s.tdLast]}>{table.headers[ci] ?? ""}</Text>
            {table.rows.map((r, ri) => (
              <Text key={ri} numberOfLines={1} style={[s.td, ci === n - 1 && s.tdLast, ri === table.rows.length - 1 && s.tdBottom]}>
                {cell(r, ci)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Socrates tutor ──────────────────────────────────────────────────────────

// Three dots bouncing in sequence.
function TypingDots() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t]);
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => {
        const a = 0.05 + i * 0.2;
        return (
          <Animated.View
            key={i}
            style={[s.dot, {
              opacity: t.interpolate({ inputRange: [0, a, a + 0.15, a + 0.3, 1], outputRange: [0.45, 0.45, 1, 0.45, 0.45] }),
              transform: [{ translateY: t.interpolate({ inputRange: [0, a, a + 0.15, a + 0.3, 1], outputRange: [0, 0, -6, 0, 0] }) }],
            }]}
          />
        );
      })}
    </View>
  );
}

function Tutor({ item, response, visible, onClose, onSolution }: { item: Item; response: string; visible: boolean; onClose: () => void; onSolution: () => void }) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const closeRef = useRef<any>(null);
  // The sheet stays mounted (display:none) when closed, so it slides up again on every open
  // and keeps the conversation. It slides down before it is hidden.
  const slide = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(visible);

  useEffect(() => {
    if (visible) {
      setShown(true);
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 5 }).start();
      // Move focus into the dialog.
      const t = setTimeout(() => closeRef.current?.focus?.(), 0);
      return () => clearTimeout(t);
    }
    Animated.timing(slide, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShown(false);
    });
  }, [visible, slide]);

  // Escape closes the sheet on web.
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const d = (globalThis as any).document;
    if (!d?.addEventListener) return;
    const onKey = (e: { key: string }) => { if (e.key === "Escape") onClose(); };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  async function send(history: TutorTurn[]) {
    setWaiting(true);
    try {
      const r = await api.socrates({ item_id: item.id, response, history });
      setTurns([...history, { role: "socrates", content: r.reply }]);
      if (r.done || r.error === "daily_limit") setEnded(true);
      if (r.offline) setNote("Socrates is using his notes right now.");
      else if (r.remaining_today != null && r.remaining_today <= 1)
        setNote(r.remaining_today === 0 ? "That's your last Socrates chat for today." : "One Socrates chat left today.");
    } catch {
      setTurns([...history, { role: "socrates", content: "The Oracle is silent for a moment. Let's look at the solution instead." }]);
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

  const studentTurns = useMemo(() => turns.filter((t) => t.role === "student").length, [turns]);
  const lastHim = useMemo(() => turns.map((t) => t.role).lastIndexOf("socrates"), [turns]);

  return (
    <View
      style={[s.overlay, !shown && { display: "none" }]}
      pointerEvents={visible ? "auto" : "none"}
      role="dialog"
      aria-modal
      aria-label="Socrates"
      accessibilityViewIsModal
    >
      <Backdrop visible={visible} onPress={onClose} />
      <Animated.View
        style={[s.tutor, {
          opacity: slide.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          // Clamped so the spring's overshoot never lifts the sheet off the bottom edge.
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [500, 0], extrapolateRight: "clamp" }) }],
        }]}
      >
        <View style={s.tutorHead}>
          <Mascot size={44} float={false} mood={waiting ? "talk" : "idle"} />
          <Text style={[type.h3, { flex: 1, marginLeft: space(1) }]}>Socrates</Text>
          <Pressable ref={closeRef} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close Socrates">
            <Text style={s.quitX}>✕</Text>
          </Pressable>
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space(2), gap: space(1.5) }}>
          <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={3}>{item.stem}</Text>
          {note && (
            <Rise>
              <Text style={[type.caption, { textAlign: "center" }]}>{note}</Text>
            </Rise>
          )}
          {turns.map((t, i) =>
            t.role === "student" ? (
              <Rise key={i} style={[s.msg, s.msgMe]}>
                <Text style={[type.body, { color: "#fff" }]}>{t.content}</Text>
              </Rise>
            ) : (
              // Avatar column on every Socrates row (mascot on the latest), so a reply
              // lands exactly where the typing dots were.
              <Rise key={i} style={s.himRow}>
                <View style={s.avatar}>{!waiting && i === lastHim && <Mascot size={28} float={false} mood="idle" />}</View>
                <View style={[s.msg, s.msgHim, s.himBubble]}>
                  <Text style={type.body}>{t.content}</Text>
                </View>
              </Rise>
            ),
          )}
          {waiting && (
            <PopIn from={0.8} style={s.himRow}>
              <View style={s.avatar}>
                <Mascot size={28} float={false} mood="talk" />
              </View>
              <View
                style={[s.msg, s.msgHim, s.himBubble]}
                accessible
                accessibilityRole="text"
                accessibilityLabel={pick(lines.loading, studentTurns)}
                accessibilityLiveRegion="polite"
                aria-live="polite"
              >
                <TypingDots />
              </View>
            </PopIn>
          )}
        </ScrollView>
        <View style={s.tutorFoot}>
          {ended ? (
            <Rise>
              <Button title="Show the solution" kind="secondary" onPress={onSolution} />
            </Rise>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: space(1), alignItems: "center" }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Reply to Socrates"
                  placeholderTextColor={color.disabledText}
                  onSubmitEditing={submit}
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  editable={!waiting}
                  maxLength={500}
                  accessibilityLabel="Your reply"
                />
                <Button title="Send" onPress={submit} disabled={!draft.trim() || waiting} small />
              </View>
              <Pressable onPress={onSolution} accessibilityRole="button" hitSlop={8} style={{ marginTop: space(1), alignSelf: "center", minHeight: 32, justifyContent: "center" }}>
                <Text style={[type.caption, { textDecorationLine: "underline" }]}>Just show me the solution</Text>
              </Pressable>
            </>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(3) },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(2), paddingVertical: space(2), gap: space(2), maxWidth: 640, width: "100%", alignSelf: "center" },
  quit: { width: 32, alignItems: "center" },
  quitX: { fontSize: 22, color: color.textSoft, fontFamily: font.bold },
  body: { paddingHorizontal: space(2), paddingTop: space(4), maxWidth: 640, width: "100%", alignSelf: "center" },
  say: { flexDirection: "row", alignItems: "center", marginBottom: space(2) },
  xpFloat: { position: "absolute", top: -6, left: 0, right: 0, alignItems: "center" },
  tag: { color: color.yellowDark, marginBottom: space(1) },
  stem: { fontSize: 18, lineHeight: 27, marginBottom: space(2), fontFamily: font.semibold },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    padding: space(1.5),
    minHeight: 56,
    borderWidth: 2,
    borderRadius: radius.button,
  },
  letter: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  input: {
    borderWidth: 2,
    borderColor: color.line,
    borderBottomWidth: 4,
    borderRadius: radius.input,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    fontSize: 18,
    fontFamily: font.semibold,
    color: color.text,
    backgroundColor: "#fff",
    minHeight: 52,
    marginTop: space(1),
  },
  inputActive: { borderColor: color.azure },
  inputRight: { borderColor: color.green, backgroundColor: color.greenSoft, paddingRight: space(6) },
  inputWrong: { borderColor: color.coral, backgroundColor: color.coralSoft, paddingRight: space(6) },
  inputBadge: { position: "absolute", right: space(1.5), top: space(1), bottom: 4, justifyContent: "center" },
  report: { marginTop: space(1), alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  srOnly: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, left: 0, top: 0 },
  solution: { marginTop: space(2), padding: space(2), borderRadius: radius.card, backgroundColor: color.cream },
  foot: { padding: space(2), borderTopWidth: 2, borderTopColor: color.line, backgroundColor: color.bg },
  footInner: { maxWidth: 640, width: "100%", alignSelf: "center" },
  // The top rule makes content scrolled under the banner read as layered, not clipped.
  banner: { padding: space(2), paddingTop: space(2.5), borderTopWidth: 2 },
  bannerRight: { backgroundColor: color.greenSoft, borderTopColor: "#BFE3C0" },
  bannerWrong: { backgroundColor: color.coralSoft, borderTopColor: "#FFC9C6" },
  bannerHead: { flexDirection: "row", alignItems: "center", marginBottom: space(2) },
  bannerTitle: { fontFamily: font.black, fontSize: 22, lineHeight: 28 },
  flameSlot: { width: 40, alignItems: "flex-end" },
  flame: { flexDirection: "row", alignItems: "center" },
  flameN: { fontFamily: font.black, fontSize: 16, color: "#F08A24", marginLeft: 2 },
  toastWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 20 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1),
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.25),
    borderRadius: radius.pill,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: color.yellow,
    borderBottomWidth: 4,
    borderBottomColor: color.yellowDark,
  },
  toastText: { fontFamily: font.black, fontSize: 18, color: "#F08A24" },
  table: { borderWidth: 1, borderColor: color.line, borderRadius: 8, overflow: "hidden" },
  th: { fontFamily: font.bold, backgroundColor: color.azureSoft },
  tr: { flexDirection: "row", alignItems: "stretch" },
  trRule: { borderBottomWidth: 1, borderColor: color.line },
  tdCell: { justifyContent: "center", paddingHorizontal: space(1), paddingVertical: space(1) },
  tdFit: { ...type.body, textAlign: "center" },
  tdSmall: { fontSize: 14, lineHeight: 19 },
  tdRule: { borderRightWidth: 1, borderColor: color.line },
  tdLast: { borderRightWidth: 0 },
  tdBottom: { borderBottomWidth: 0 },
  td: { ...type.body, minWidth: 64, paddingHorizontal: space(1.5), paddingVertical: space(1), borderRightWidth: 1, borderBottomWidth: 1, borderColor: color.line, textAlign: "center" },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end", zIndex: 30 },
  scrim: { backgroundColor: "rgba(30,44,59,0.35)" },
  sheet: {
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: space(3),
    paddingBottom: space(2),
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  endBtn: { alignSelf: "center", marginTop: space(1.5), paddingVertical: space(1), paddingHorizontal: space(2) },
  endText: { fontFamily: font.black, fontSize: 15, letterSpacing: 0.8, textTransform: "uppercase", color: CORAL_TEXT },
  tutor: { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, height: "82%", maxWidth: 640, width: "100%", alignSelf: "center" },
  tutorHead: { flexDirection: "row", alignItems: "center", padding: space(2), borderBottomWidth: 2, borderBottomColor: color.line },
  msg: { maxWidth: "85%", paddingVertical: space(1.25), paddingHorizontal: space(1.75), borderRadius: 18 },
  msgHim: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 2, borderColor: color.line, borderTopLeftRadius: 4 },
  msgMe: { alignSelf: "flex-end", backgroundColor: color.azure, borderTopRightRadius: 4 },
  himRow: { flexDirection: "row", alignItems: "flex-end", alignSelf: "stretch" },
  avatar: { width: 28 },
  himBubble: { alignSelf: "auto", marginLeft: space(1), flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.textSoft },
  tutorFoot: { padding: space(2), borderTopWidth: 2, borderTopColor: color.line },
});
