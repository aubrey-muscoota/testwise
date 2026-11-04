import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, TextInput, View,
} from "react-native";
import { api, Item, Lesson as LessonT, Skill, Stats, TutorTurn } from "../api";
import { Button, Mascot, PopIn, ProgressBar, Speech } from "../components/ui";
import { lines, pick } from "../copy";
import { color, font, radius, space, type } from "../theme";

export type LessonResult = { correct: number; total: number; xp: number; stats: Stats; skillName: string | null };

type Phase = "answering" | "right" | "wrong";

export function Lesson({ skill, onDone, onQuit }: { skill: Skill | null; onDone: (r: LessonResult) => void; onQuit: () => void }) {
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
  const [line, setLine] = useState(pick(skill ? lines.lessonStart : lines.review));
  const [reported, setReported] = useState<Set<string>>(new Set());
  const started = useRef(Date.now());
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api
      .startLesson(skill?.id ?? null)
      .then((l) => {
        setLesson(l);
        setQueue(l.items.map((item) => ({ item, retry: false })));
        started.current = Date.now();
      })
      .catch(() => setError("Couldn't start the lesson."));
  }, [skill]);

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
      if (r.correct) {
        setPhase("right");
        setLine(pick(lines.correct));
      } else {
        setPhase("wrong");
        setLine(pick(lines.incorrect));
        Animated.sequence(
          [8, -8, 6, -6, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, useNativeDriver: true })),
        ).start();
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
    if (wasWrong && !current.retry) {
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
    started.current = Date.now();
    if (rest[0]?.retry && !queue[1]?.retry) setLine(pick(lines.retryQueue));
    if (!rest.length) {
      setBusy(true);
      try {
        const r = await api.finish(lesson.lesson_id);
        onDone({ ...r, skillName: skill?.name ?? null });
      } catch {
        setError("Couldn't save the lesson. Check your connection.");
        setBusy(false);
      }
    }
  }

  if (error) {
    return (
      <View style={s.center}>
        <Mascot size={96} float={false} />
        <Text style={[type.body, { textAlign: "center", marginVertical: space(2) }]}>{error}</Text>
        <Button title="Back to skills" kind="secondary" onPress={onQuit} />
      </View>
    );
  }
  if (!lesson || !current) {
    return (
      <View style={s.center}>
        <Mascot size={96} />
        <Text style={[type.body, { marginTop: space(2), color: color.textSoft }]}>{pick(lines.loading)}</Text>
        <ActivityIndicator color={color.azure} style={{ marginTop: space(2) }} />
      </View>
    );
  }

  const item = current.item;
  const checked = phase !== "answering";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.head}>
        <Pressable onPress={onQuit} accessibilityLabel="Quit lesson" hitSlop={12} style={s.quit}>
          <Text style={s.quitX}>✕</Text>
        </Pressable>
        <ProgressBar value={done / total} fill={color.green} height={16} />
      </View>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <View style={s.say}>
          <Mascot size={64} />
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <Speech text={current.retry && !checked ? pick(lines.retryQueue, total) : line} tone={phase === "right" ? "good" : phase === "wrong" ? "bad" : "plain"} />
          </View>
        </View>

        {(current.retry || item.review) && (
          <Text style={[type.label, s.tag]}>{current.retry ? "TRY AGAIN" : "REVIEW"}</Text>
        )}

        <Animated.View style={{ transform: [{ translateX: shake }] }}>
          <Text style={[type.body, s.stem]}>{item.stem}</Text>
          {item.table && <DataTable table={item.table} />}

          {item.type === "mc" ? (
            <View style={{ gap: space(1.5) }}>
              {item.choices!.map((c, i) => {
                const picked = choice === c;
                const isKey = checked && c === item.answer;
                const isWrongPick = checked && picked && c !== item.answer;
                return (
                  <Pressable
                    key={c}
                    disabled={checked}
                    onPress={() => setChoice(c)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: picked }}
                    style={[
                      s.choice,
                      picked && !checked && s.choicePicked,
                      isKey && s.choiceRight,
                      isWrongPick && s.choiceWrong,
                    ]}
                  >
                    <View style={[s.letter, picked && !checked && { borderColor: color.azure, backgroundColor: color.azureSoft }]}>
                      <Text style={[type.label, { color: picked && !checked ? color.azure : color.textSoft }]}>{"ABCD"[i]}</Text>
                    </View>
                    <Text style={[type.body, { flex: 1 }]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
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
                style={[s.input, phase === "right" && s.choiceRight, phase === "wrong" && s.choiceWrong]}
                accessibilityLabel="Your answer"
              />
              <Text style={[type.caption, { marginTop: space(1) }]}>Fractions like 3/4 and decimals like 0.75 both work.</Text>
            </View>
          )}
        </Animated.View>

        {phase === "wrong" && (
          <PopIn style={{ marginTop: space(2) }}>
            <Text style={[type.body, { fontFamily: font.bold, color: "#C94A45" }]}>Correct answer: {item.answer}</Text>
          </PopIn>
        )}

        {checked && (showSolution || phase === "right") && (
          <PopIn style={s.solution}>
            <Text style={[type.label, { color: color.textSoft, marginBottom: space(1) }]}>HOW TO SOLVE IT</Text>
            {item.explanation.map((step, i) => (
              <Text key={i} style={[type.body, { marginBottom: 4 }]}>
                {item.explanation.length > 1 ? `${i + 1}. ` : ""}
                {step}
              </Text>
            ))}
          </PopIn>
        )}

        {checked && (
          <Pressable
            onPress={async () => {
              if (reported.has(item.id)) return;
              setReported(new Set(reported).add(item.id));
              try { await api.report(item.id, `after ${phase}, answered ${response}`); } catch {}
            }}
            style={{ marginTop: space(2), alignSelf: "flex-start" }}
          >
            <Text style={[type.caption, { textDecorationLine: reported.has(item.id) ? "none" : "underline" }]}>
              {reported.has(item.id) ? "Thanks, we'll take a look at this question." : "Something wrong with this question? Report it"}
            </Text>
          </Pressable>
        )}
        <View style={{ height: space(4) }} />
      </ScrollView>

      <View style={[s.foot, phase === "right" && { backgroundColor: color.greenSoft }, phase === "wrong" && { backgroundColor: color.coralSoft }]}>
        {phase === "answering" && <Button title={busy ? "Checking…" : "Check"} disabled={!response || busy} onPress={check} />}
        {phase === "right" && <Button title="Continue" kind="success" onPress={next} disabled={busy} />}
        {phase === "wrong" && (
          <View style={{ gap: space(1.5) }}>
            <View style={{ flexDirection: "row", gap: space(1.5) }}>
              <Button title="Ask Socrates" kind="special" onPress={() => { setTutorStarted(true); setTutorOpen(true); }} style={{ flex: 1 }} small />
              {!showSolution && <Button title="Solution" kind="secondary" onPress={() => setShowSolution(true)} style={{ flex: 1 }} small />}
            </View>
            <Button title="Continue" kind="danger" onPress={next} disabled={busy} />
          </View>
        )}
      </View>

      {tutorStarted && <Tutor key={item.id + (current.retry ? "-r" : "")} visible={tutorOpen} item={item} response={response || ""} onClose={() => setTutorOpen(false)} onSolution={() => { setShowSolution(true); setTutorOpen(false); }} />}
    </KeyboardAvoidingView>
  );
}

function DataTable({ table }: { table: NonNullable<Item["table"]> }) {
  return (
    <ScrollView horizontal style={{ marginBottom: space(2) }} contentContainerStyle={s.table}>
      <View>
        <View style={[s.tr, { backgroundColor: color.azureSoft }]}>
          {table.headers.map((h, i) => (
            <Text key={i} style={[s.td, { fontFamily: font.bold }]}>{h}</Text>
          ))}
        </View>
        {table.rows.map((r, ri) => (
          <View key={ri} style={s.tr}>
            {r.map((c, ci) => (
              <Text key={ci} style={s.td}>{String(c)}</Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Tutor({ item, response, visible, onClose, onSolution }: { item: Item; response: string; visible: boolean; onClose: () => void; onSolution: () => void }) {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

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

  return (
    <View style={[s.overlay, !visible && { display: "none" }]}>
      <PopIn style={s.tutor}>
        <View style={s.tutorHead}>
          <Mascot size={44} float={false} />
          <Text style={[type.h3, { flex: 1, marginLeft: space(1) }]}>Socrates</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close Socrates">
            <Text style={s.quitX}>✕</Text>
          </Pressable>
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space(2), gap: space(1.5) }}>
          <Text style={[type.caption, { textAlign: "center" }]} numberOfLines={3}>{item.stem}</Text>
          {turns.map((t, i) => (
            <View key={i} style={[s.msg, t.role === "student" ? s.msgMe : s.msgHim]}>
              <Text style={[type.body, t.role === "student" && { color: "#fff" }]}>{t.content}</Text>
            </View>
          ))}
          {waiting && (
            <View style={[s.msg, s.msgHim]}>
              <Text style={[type.body, { color: color.textSoft }]}>{pick(lines.loading, studentTurns)}</Text>
            </View>
          )}
          {note && <Text style={[type.caption, { textAlign: "center" }]}>{note}</Text>}
        </ScrollView>
        <View style={s.tutorFoot}>
          {ended ? (
            <Button title="Show the solution" kind="secondary" onPress={onSolution} />
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
              <Pressable onPress={onSolution} style={{ marginTop: space(1), alignSelf: "center" }}>
                <Text style={[type.caption, { textDecorationLine: "underline" }]}>Just show me the solution</Text>
              </Pressable>
            </>
          )}
        </View>
      </PopIn>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space(3) },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space(2), paddingVertical: space(2), gap: space(2), maxWidth: 640, width: "100%", alignSelf: "center" },
  quit: { width: 32, alignItems: "center" },
  quitX: { fontSize: 22, color: color.textSoft, fontFamily: font.bold },
  body: { paddingHorizontal: space(2), maxWidth: 640, width: "100%", alignSelf: "center" },
  say: { flexDirection: "row", alignItems: "center", marginBottom: space(2) },
  tag: { color: color.yellowDark, marginBottom: space(1) },
  stem: { fontSize: 18, lineHeight: 27, marginBottom: space(2), fontFamily: font.semibold },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(1.5),
    padding: space(1.5),
    minHeight: 56,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: color.line,
    borderRadius: radius.button,
    backgroundColor: "#fff",
  },
  choicePicked: { borderColor: color.azure, backgroundColor: color.azureSoft },
  choiceRight: { borderColor: color.green, backgroundColor: color.greenSoft },
  choiceWrong: { borderColor: color.coral, backgroundColor: color.coralSoft },
  letter: { width: 32, height: 32, borderRadius: 10, borderWidth: 2, borderColor: color.line, alignItems: "center", justifyContent: "center" },
  input: {
    borderWidth: 2,
    borderColor: color.line,
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
  solution: { marginTop: space(2), padding: space(2), borderRadius: radius.card, backgroundColor: color.cream },
  foot: { padding: space(2), borderTopWidth: 2, borderTopColor: color.line, backgroundColor: color.bg },
  table: { borderWidth: 1, borderColor: color.line, borderRadius: 8, overflow: "hidden" },
  tr: { flexDirection: "row" },
  td: { ...type.body, minWidth: 84, paddingHorizontal: space(1.5), paddingVertical: space(1), borderRightWidth: 1, borderBottomWidth: 1, borderColor: color.line, textAlign: "center" },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(30,44,59,0.35)", justifyContent: "flex-end" },
  tutor: { backgroundColor: color.bg, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, height: "82%", maxWidth: 640, width: "100%", alignSelf: "center" },
  tutorHead: { flexDirection: "row", alignItems: "center", padding: space(2), borderBottomWidth: 2, borderBottomColor: color.line },
  msg: { maxWidth: "85%", paddingVertical: space(1.25), paddingHorizontal: space(1.75), borderRadius: 18 },
  msgHim: { alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 2, borderColor: color.line, borderTopLeftRadius: 4 },
  msgMe: { alignSelf: "flex-end", backgroundColor: color.azure, borderTopRightRadius: 4 },
  tutorFoot: { padding: space(2), borderTopWidth: 2, borderTopColor: color.line },
});
