// The lesson's top bar, as in the prototype: a close button and a thick
// progress bar, plus the countdown in a timed set. The set's name and the
// count are read out to screen readers instead of shown.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Icon } from "../components/icons";
import { IconButton, ProgressBar } from "../components/ui";
import { clock } from "../copy";
import { color, font, space, tabular } from "../theme";
import { lessonShared } from "./shared";

export function LessonHead({ title, question, total, progress, left, onQuit, quitLabel }: {
  title: string; question: number; total: number; progress: number; left?: number | null; onQuit: () => void; quitLabel: string;
}) {
  const lowTime = left != null && left <= 60;
  return (
    <View style={lessonShared.head}>
      <View style={lessonShared.headRow}>
        <IconButton name="close" onPress={onQuit} label={quitLabel} style={{ marginLeft: -8 }} />
        <View style={s.bar} accessible accessibilityRole="header" accessibilityLabel={`${title}, question ${question} of ${total}`}>
          <ProgressBar value={progress} />
        </View>
        {left != null && (
          <View style={s.timer} accessible accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
            <Icon name="clock" size={20} color={lowTime ? color.badInk : color.ink2} />
            <Text style={[s.timerText, tabular, lowTime && { color: color.badInk }]}>{clock(left)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flex: 1, flexDirection: "row", marginLeft: space(1) },
  timer: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: space(1.5) },
  timerText: { fontFamily: font.black, fontSize: 20, lineHeight: 24, color: color.ink },
});
