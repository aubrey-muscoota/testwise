import React, { useState } from "react";
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { Press3D } from "../components/ui";
import { legalUrl } from "../api";
import { noOrphan } from "../copy";
import { Socrates } from "../socrates/Socrates";
import { buzz } from "../motion/feedback";
import { SetupFrame } from "../setup/SetupFrame";
import { BORDER, color, font, GUTTER, radius, space, tabular, type, COLUMN } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Whole years old today for someone born in the given month (1-12) and year.
// Counts the birthday as passed only once the month is over, so it never overstates.
export function ageFrom(month: number, year: number, now = new Date()) {
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 <= month) age -= 1;
  return age;
}

// A neutral age question: it doesn't say which answer lets you in. In setup
// it is a step like the others (back arrow, progress bar); a learner from
// before the age question answers it on its own.
export function AgeGate({ onAnswer, progress, onBack, busy, error }: {
  onAnswer: (age13Plus: boolean) => void;
  progress?: number;
  onBack?: () => void;
  // Setup saves everything once this is answered: the button says so meanwhile.
  busy?: boolean;
  error?: string | null;
}) {
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState("");
  const thisYear = new Date().getFullYear();
  const y = Number(year);
  const valid = month != null && /^\d{4}$/.test(year) && y >= thisYear - 100 && y <= thisYear;

  return (
    <SetupFrame
      line="When were you born?"
      progress={progress}
      onBack={onBack}
      error={error}
      button={{ title: busy ? "Saving…" : "Continue", disabled: !valid || busy, onPress: () => valid && onAnswer(ageFrom(month!, y) >= 13), testID: "age-continue" }}
      foot={
        <Text style={[type.small, { marginTop: space(1.5) }]}>
          By continuing you agree to the{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("terms"))}>Terms</Text>
          {" "}and{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("privacy"))}>Privacy Policy</Text>.
        </Text>
      }
    >
      <Text style={type.small}>{noOrphan("We ask everyone. Testwise doesn't keep your birthday.")}</Text>
      <Text style={[type.label, { marginTop: space(2.5), marginBottom: space(1) }]}>Month</Text>
      <View style={s.months} accessibilityRole="radiogroup" accessibilityLabel="Birth month">
        {MONTHS.map((m, i) => {
          const on = month === i + 1;
          return (
            <Press3D
              key={m}
              testID={`age-month-${i + 1}`}
              onPress={() => { buzz.tap(); setMonth(i + 1); }}
              sound={false}
              haptic={false}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, selected: on }}
              accessibilityLabel={MONTH_NAMES[i]}
              edge={on ? color.blue : color.line}
              border={on ? color.blue : color.line}
              depth={BORDER}
              radius={radius.input}
              style={s.month}
              face={[s.monthFace, { backgroundColor: on ? color.blueWash : color.bg }]}
            >
              <Text style={[s.monthText, on && { color: color.blueDark }]}>{m}</Text>
            </Press3D>
          );
        })}
      </View>
      <Text style={[type.label, { marginTop: space(2.5), marginBottom: space(1) }]}>Year</Text>
      <TextInput
        value={year}
        onChangeText={(t) => setYear(t.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        keyboardType="number-pad"
        placeholder="2009"
        placeholderTextColor={color.ink2}
        accessibilityLabel="Birth year"
        maxLength={4}
        style={[s.year, tabular]}
        testID="age-year"
      />
    </SetupFrame>
  );
}

// Shown when the answer was under 13. There's no way back from here on this device for a day.
export function TooYoung() {
  return (
    <View style={[s.wrap, { flex: 1, justifyContent: "center" }]}>
      <Socrates size={104} mood="idle" />
      <Text style={[type.title, { marginTop: space(2) }]} accessibilityRole="header">Thanks for stopping by</Text>
      <Text style={[type.body, { color: color.ink2, marginTop: space(1) }]}>
        Testwise is for students 13 and older, so we haven't kept anything about you.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: space(4), paddingBottom: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  months: { flexDirection: "row", flexWrap: "wrap", gap: space(1) },
  month: { width: "22%", flexGrow: 1 },
  monthFace: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  monthText: { fontFamily: font.extra, fontSize: 16, color: color.ink },
  year: {
    fontFamily: font.extra, fontSize: 20, color: color.ink, borderRadius: radius.input, minHeight: 54,
    paddingHorizontal: space(2), paddingVertical: space(1.25), backgroundColor: color.bg,
    borderWidth: BORDER, borderColor: color.line, outlineColor: color.blue,
  } as object,
  link: { color: color.blueDark, fontFamily: font.extra, textDecorationLine: "underline" },
});
