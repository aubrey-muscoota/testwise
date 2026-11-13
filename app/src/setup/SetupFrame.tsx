// The frame every setup question shares, and the Me edit screens with it:
// a back arrow and the green progress bar on top, Socrates asking the
// question in his bubble, the answers, and one primary button at the bottom.
// Lessons and setup hide the tabs and top bar.
import React from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SocratesLine } from "../components/SocratesLine";
import { Button, IconButton, ProgressBar, Rise, TextButton } from "../components/ui";
import type { SocratesMood } from "../socrates/Socrates";
import { color, COLUMN, GUTTER, space, type } from "../theme";

export type FrameButton = { title: string; onPress: () => void; disabled?: boolean; testID?: string };

export function SetupFrame({
  line, mood = "listening", progress, onBack, backLabel = "Back", button, secondary, foot, error, children, stepKey,
}: {
  // Socrates' question: the screen's question, so there's no title under it.
  line: string;
  mood?: SocratesMood;
  // 0 to 1 across the setup steps; leave out for the Me edit screens.
  progress?: number;
  onBack?: () => void;
  backLabel?: string;
  button: FrameButton;
  secondary?: { title: string; onPress: () => void; disabled?: boolean } | null;
  // Small print under the button (the birthday's Terms line).
  foot?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  // Changes when the content swaps inside one step (the date step's calendar), so it rises in again.
  stepKey?: string;
}) {
  // Short phones: a smaller Socrates, so the answers fit above the button.
  const short = useWindowDimensions().height < 720;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.head}>
        {onBack ? <IconButton name="back" label={backLabel} onPress={onBack} style={{ marginLeft: -8 }} /> : <View style={{ width: 40 }} />}
        {progress != null && (
          <View style={{ flex: 1, flexDirection: "row", marginLeft: space(1.5) }} accessibilityLabel={`Setup, ${Math.round(progress * 100)}% done`}>
            <ProgressBar value={progress} />
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Rise key={stepKey ?? line}>
          <View accessibilityRole="header">
            <SocratesLine text={line} size={short ? 72 : 96} mood={mood} />
          </View>
          <View style={{ height: short ? space(2) : space(2.5) }} />
          {children}
          {error ? <Text style={[type.body, { color: color.badInk, marginTop: space(2) }]} accessibilityRole="alert">{error}</Text> : null}
        </Rise>
      </ScrollView>
      <View style={s.foot}>
        <Button title={button.title} disabled={button.disabled} onPress={button.onPress} testID={button.testID ?? "setup-next"} />
        {secondary && <TextButton title={secondary.title} onPress={secondary.onPress} disabled={secondary.disabled} style={{ marginTop: space(0.5) }} testID="setup-secondary" />}
        {foot}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER, paddingTop: space(1), minHeight: 52, maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  scroll: { paddingHorizontal: GUTTER, paddingTop: space(1.5), paddingBottom: space(3), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1.5), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
});
