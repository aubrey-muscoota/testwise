// The first screen: which test, like a language app's list of languages.
// Every exam pack is listed (GET /api/exams), so a new test shows up once its
// pack is turned on. A test's mark is its own short name in a tile: no logos,
// flags or per-test colours. Tests that aren't ready yet stay in the list,
// quieter and not pressable.
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api, ExamListing } from "../api";
import { Skeleton, Bone, ErrorState } from "../components/ui";
import { useLoad } from "../nav";
import { color, font, radius, space, type } from "../theme";
import { OptionCard, Options } from "./OptionCard";
import { SetupFrame } from "./SetupFrame";

// The one setup line written before any exam pack is chosen.
export const PICKER_LINE = "Which test are you studying for?";

export function TestPicker({ initial, onPick, exams: given }: {
  initial?: string | null;
  // Resolves once the picked exam's pack is loaded (the button says so meanwhile).
  onPick: (examId: string) => Promise<void>;
  // Review page only: a list to show instead of loading one.
  exams?: ExamListing[];
}) {
  const { data, error, reload } = useLoad(() => (given ? Promise.resolve(given) : api.exams()), [given]);
  const [picked, setPicked] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (error && !data) return <ErrorState message="I couldn't load the list of tests. Is the connection down?" onRetry={reload} />;

  const go = async () => {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      await onPick(picked);
    } catch {
      setErr("I couldn't connect. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <SetupFrame
      line={PICKER_LINE}
      button={{ title: busy ? "Getting ready…" : "Continue", disabled: !picked || busy, onPress: go }}
      error={err}
    >
      {!data ? (
        <Skeleton label="Loading the tests">
          <View style={{ gap: space(1.25) }}>{[0, 1, 2, 3].map((i) => <Bone key={i} h={68} r={radius.card} />)}</View>
        </Skeleton>
      ) : (
        <Options label="Tests">
          {data.map((x) => (x.ready ? (
            <OptionCard
              key={x.id}
              testID={`test-${x.id}`}
              title={x.name}
              detail={sectionLine(x.sections)}
              selected={picked === x.id}
              onPress={() => setPicked(x.id)}
              lead={<Mark text={x.short_name} on={picked === x.id} />}
            />
          ) : (
            <NotReady key={x.id} test={x} />
          )))}
        </Options>
      )}
    </SetupFrame>
  );
}

// "Math, Reading and Writing": the sections, so a learner knows what it covers.
function sectionLine(sections?: string[]) {
  return sections?.length ? sections.join(", ") : null;
}

// The test's short name in a 76 x 44 tile: blueWash with blueDark text, blue
// with white text once picked; lock grey with ink2 text when not ready.
export function Mark({ text, on, off }: { text: string; on?: boolean; off?: boolean }) {
  return (
    <View style={[s.mark, on && { backgroundColor: color.blue }, off && { backgroundColor: color.lock }]}>
      <Text style={[s.markText, on && { color: color.white }, off && { color: color.ink2 }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// Nothing to press, so no card: the tile and the name, lined up with the
// cards' contents (a border is only for things you can press).
function NotReady({ test }: { test: ExamListing }) {
  return (
    <View
      style={s.off}
      accessible
      accessibilityRole="radio"
      accessibilityState={{ disabled: true, checked: false }}
      aria-disabled
      accessibilityLabel={`${test.name}. Not ready yet`}
      testID={`test-${test.id}`}
    >
      <Mark text={test.short_name} off />
      <View style={{ flex: 1 }}>
        <Text style={[s.offTitle]}>{test.name}</Text>
        <Text style={[type.small, { marginTop: 2 }]}>Not ready yet</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  mark: { width: 76, height: 44, borderRadius: radius.input - 4, backgroundColor: color.blueWash, alignItems: "center", justifyContent: "center", paddingHorizontal: space(1) },
  markText: { fontFamily: font.black, fontSize: 19, lineHeight: 24, color: color.blueDark },
  off: { flexDirection: "row", alignItems: "center", gap: space(1.5), minHeight: 64, paddingVertical: space(0.5), paddingHorizontal: space(2) },
  offTitle: { fontFamily: font.black, fontSize: 17, lineHeight: 23, color: color.ink2 },
});
