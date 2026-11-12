// The Socrates chat: a sheet over the lesson, one wrong answer at a time.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";
import { api, Item, TutorTurn } from "../api";
import { Icon } from "../components/icons";
import { SocratesSays } from "../components/SocratesLine";
import { Button, IconButton, PopIn, Rise, TextButton, useReducedMotion } from "../components/ui";
import { lines } from "../copy";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { BORDER, color, GUTTER, radius, scrim, shadow, space, type, COLUMN } from "../theme";
import { lessonShared } from "./shared";

export function Tutor({ item, response, visible, onClose, onSolution }: { item: Item; response: string; visible: boolean; onClose: () => void; onSolution: () => void }) {
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
          <IconButton ref={closeRef} name="close" onPress={onClose} label="Close Socrates" tone={color.ink2} style={{ marginRight: -8 }} />
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
                  placeholderTextColor={color.ink2}
                  onSubmitEditing={submit}
                  style={[lessonShared.input, { flex: 1, marginTop: 0 }]}
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
                  style={({ pressed }) => [s.send, { backgroundColor: !draft.trim() || waiting ? color.lock : color.blue }, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  <Icon name="send" color={!draft.trim() || waiting ? color.ink3 : color.white} strokeWidth={2.75} />
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

const s = StyleSheet.create({
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "flex-end", zIndex: 30 },
  tutor: { backgroundColor: color.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, height: "86%", maxWidth: COLUMN, width: "100%", alignSelf: "center", ...shadow.float },
  tutorHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER, paddingTop: space(2), paddingBottom: space(1) },
  // His words in a speech bubble (white, line border); the learner's in a blue wash.
  msgHim: {
    alignSelf: "flex-start", maxWidth: "88%", backgroundColor: color.bg, borderWidth: BORDER, borderColor: color.line,
    paddingVertical: space(1.25), paddingHorizontal: space(1.75), borderRadius: radius.card,
  },
  msgMe: { alignSelf: "flex-end", maxWidth: "85%", backgroundColor: color.blueWash, paddingVertical: space(1.25), paddingHorizontal: space(1.75), borderRadius: radius.card },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink2 },
  tutorFoot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5) },
  send: { width: 48, height: 48, borderRadius: radius.input, alignItems: "center", justifyContent: "center" },
});
