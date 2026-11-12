// The band that rises after Check, in the answer's color: right or not,
// Socrates' reaction, and the links to the tutor, the solution and the report.
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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
  useEffect(() => {
    (still
      ? Animated.timing(v, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== "web" })
      : Animated.spring(v, { toValue: 1, speed: 18, bounciness: 5, useNativeDriver: Platform.OS !== "web" })
    ).start();
  }, [v, still]);
  return (
    <Animated.View
      style={[s.panel, short && { paddingTop: space(1.25), paddingBottom: space(1) }, { backgroundColor: ok ? color.goodWash : color.badWash }, {
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: still ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
      }]}
    >
      <View style={lessonShared.footInner}>
        <View style={[s.panelHead, short && { marginBottom: space(0.75) }]}>
          <View>
            <Socrates size={short ? 48 : 72} mood={mood} moodKey={fx} talking={typing} lookAt={typing ? "bubble" : undefined} />
            {ok && xp > 0 && (
              <FloatUp style={s.xpFloat}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Icon name="xp" size={18} color={color.blue} strokeWidth={2.5} />
                  <Text style={[type.label, tabular, { marginLeft: 3, color: color.blueDark }]}>+{xp}</Text>
                </View>
              </FloatUp>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: space(1.5) }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <DrawnMark ok={ok} size={26} />
              <Text style={[s.panelTitle, short && s.panelTitleShort, { color: ink, marginLeft: space(0.75) }]}>
                {ok ? (combo >= 2 ? `Right, ${combo} in a row` : "Right") : "Not quite"}
              </Text>
            </View>
            <SocratesSays text={line} onTyping={setTyping} tail="none" textStyle={[s.panelLine, { color: ink }]} style={{ marginTop: space(0.5) }} />
            {!ok && answer ? <RichText text={`The answer is ${answer}`} style={[s.panelAnswer, short && { marginTop: 0 }, { color: ink }]} /> : null}
          </View>
        </View>
        {(() => {
          const reportBtn = (
            <TextButton
              title={reported ? "Reported" : short ? "Report" : "Report a problem"}
              tone={tone}
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
                  {!ok && onAsk && <TextButton title="Ask Socrates" onPress={onAsk} tone={tone} underline style={{ paddingHorizontal: 0, marginRight: space(short ? 2 : 3) }} />}
                  {onSolution && <TextButton title="Show the solution" onPress={onSolution} tone={tone} underline style={{ paddingHorizontal: 0, marginRight: space(short ? 2 : 3) }} />}
                  {inline && reportBtn}
                </View>
              )}
              <Button title={last ? "Finish" : "Continue"} onPress={onNext} disabled={busy} testID="continue" tone={tone} />
              {!inline && <View style={s.panelReport}>{reportBtn}</View>}
              {reportFailed && <Text style={[type.small, { color: color.badInk, textAlign: "center" }]} accessibilityRole="alert">Couldn't send that. Try again?</Text>}
            </>
          );
        })()}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // Full width; its contents line up with the lesson column through footInner.
  panel: { width: "100%", paddingHorizontal: GUTTER, paddingTop: space(2.5), paddingBottom: space(1.5) },
  panelHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: space(1.5) },
  panelTitle: { fontFamily: font.black, fontSize: 22, lineHeight: 28 },
  panelLine: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  panelAnswer: { fontFamily: font.black, fontSize: 16, lineHeight: 22, marginTop: space(0.5) },
  panelTitleShort: { fontSize: 20, lineHeight: 26 },
  panelLinks: { flexDirection: "row", flexWrap: "wrap", marginBottom: space(1), marginTop: -space(0.5) },
  panelReport: { alignItems: "center", marginTop: space(0.25) },
  xpFloat: { position: "absolute", left: 18, top: -18 },
});
