// The band that rises after Check, in the answer's color: right or not,
// Socrates' reaction, and the links to the tutor, the solution and the report.
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, findNodeHandle, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Icon } from "../components/icons";
import { SocratesSays } from "../components/SocratesLine";
import { Button, FloatUp, TextButton, useReducedMotion } from "../components/ui";
import { Socrates, SocratesMood } from "../socrates/Socrates";
import { color, font, GUTTER, space, tabular, type } from "../theme";
import { DrawnMark } from "./Question";
import { lessonShared } from "./shared";
import { RichText } from "../text/Passage";

export function ResultPanel({ ok, line, mood, fx, answer, combo, xp, busy, onNext, onAsk, onSolution, last, reported, reportFailed, onReport }: {
  ok: boolean; line: string; mood: SocratesMood; fx: number; answer?: string; combo: number; xp: number; busy: boolean;
  onNext: () => void; onAsk?: () => void; onSolution?: () => void; last: boolean;
  reported: boolean; reportFailed: boolean; onReport: () => void;
}) {
  // Short phones: a smaller Socrates and tighter padding, so the picked and
  // the right tile stay visible above the panel.
  const short = useWindowDimensions().height < 720;
  const v = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  const [typing, setTyping] = useState(true);
  const ink = ok ? color.goodInk : color.badInk;
  const tone = ok ? "good" : "bad";
  const title = ok ? (combo >= 2 ? `Right, ${combo} in a row` : "Right") : "Not quite";
  const box = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    (still
      ? Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, speed: 18, bounciness: 5, useNativeDriver: Platform.OS !== "web" })
    ).start();
  }, [v, still]);
  // The Check button is gone, so focus moves to the band: keyboard and screen
  // reader users land on the result, with Continue next.
  useEffect(() => {
    const el = box.current as unknown as { focus?: (o?: object) => void } | null;
    if (Platform.OS === "web") { el?.focus?.({ preventScroll: true }); return; }
    const h = findNodeHandle(box.current);
    if (h) AccessibilityInfo.setAccessibilityFocus(h);
  }, []);
  const links = (!ok && onAsk) || onSolution;
  const reportBtn = (
    <TextButton
      title={reported ? "Reported" : "Report"}
      tone={tone}
      disabled={reported}
      onPress={onReport}
      accessibilityLabel={reported ? "Question reported" : "Report a problem with this question"}
      style={{ minHeight: 36, paddingHorizontal: 0 }}
    />
  );
  const gap = { paddingHorizontal: 0, marginRight: space(short ? 2 : 2.5) };
  return (
    <Animated.View
      style={[s.panel, short && { paddingTop: space(1.25), paddingBottom: space(1) }, { backgroundColor: ok ? color.goodWash : color.badWash }, {
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
      }]}
    >
      <View
        ref={box}
        style={[lessonShared.footInner, s.focusBox]}
        accessible={Platform.OS !== "web"}
        accessibilityLabel={title}
        {...(Platform.OS === "web" ? ({ tabIndex: -1, role: "group", "aria-label": title } as object) : null)}
      >
        {(() => {
          const rig = (
            <View>
              <Socrates size={short ? 40 : 64} mood={mood} moodKey={fx} talking={typing} lookAt={typing ? "bubble" : undefined} />
              {ok && xp > 0 && (
                <FloatUp style={s.xpFloat}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Icon name="xp" size={18} color={color.blue} strokeWidth={2.5} />
                    <Text style={[type.label, tabular, { marginLeft: 3, color: color.blueDark }]}>+{xp}</Text>
                  </View>
                </FloatUp>
              )}
            </View>
          );
          const head = (
            <View style={{ flexDirection: "row", alignItems: "center", marginLeft: short ? space(1) : 0 }}>
              <DrawnMark ok={ok} size={26} />
              <Text style={[s.panelTitle, short && s.panelTitleShort, { color: ink, marginLeft: space(0.75) }]}>{title}</Text>
            </View>
          );
          // When wrong, the answer ends the same paragraph, as in the prototype.
          const says = (
            <SocratesSays
              text={line}
              onTyping={setTyping}
              tail="none"
              lines={short ? 4 : undefined}
              textStyle={[s.panelLine, { color: ink }]}
              style={{ marginTop: space(0.25) }}
              after={!ok && answer ? <Text> The answer is <RichText text={answer} style={s.panelAnswer} /></Text> : undefined}
            />
          );
          // Short phones: Socrates joins the title row and his words take the
          // full width, so the band stays near a third of the screen.
          return short ? (
            <View style={{ marginBottom: space(0.5) }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>{rig}{head}</View>
              {says}
            </View>
          ) : (
            <View style={s.panelHead}>
              {rig}
              <View style={{ flex: 1, marginLeft: space(1.5) }}>{head}{says}</View>
            </View>
          );
        })()}
        {/* The links and the report share one row, so the band stays low. */}
        <View style={s.panelLinks}>
          {!ok && onAsk && <TextButton title="Ask Socrates" onPress={onAsk} tone={tone} underline style={gap} />}
          {onSolution && <TextButton title="Show the solution" onPress={onSolution} tone={tone} underline style={gap} />}
          {reportBtn}
        </View>
        <Button title={last ? "Finish" : "Continue"} onPress={onNext} disabled={busy} testID="continue" tone={tone} />
        {reportFailed && <Text style={[type.small, { color: color.badInk, textAlign: "center" }]} accessibilityRole="alert">Couldn't send that. Try again?</Text>}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // Full width; its contents line up with the lesson column through footInner.
  panel: { width: "100%", paddingHorizontal: GUTTER, paddingTop: space(2), paddingBottom: space(1.5) },
  // Focused from code only, so no ring; the result is read out instead.
  focusBox: { outlineStyle: "none" } as object,
  panelHead: { flexDirection: "row", alignItems: "center", marginBottom: space(1) },
  panelTitle: { fontFamily: font.black, fontSize: 22, lineHeight: 28 },
  panelLine: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  panelAnswer: { fontFamily: font.black },
  panelTitleShort: { fontSize: 20, lineHeight: 26 },
  panelLinks: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: space(0.75) },
  xpFloat: { position: "absolute", left: 18, top: -18 },
});
