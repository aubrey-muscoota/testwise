import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Rise } from "../components/ui";
import { legalUrl } from "../api";
import { Socrates } from "../socrates/Socrates";
import { buzz } from "../motion/feedback";
import { color, font, GUTTER, radius, space, tabular, type } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Whole years old today for someone born in the given month (1-12) and year.
// Counts the birthday as passed only once the month is over, so it never overstates.
export function ageFrom(month: number, year: number, now = new Date()) {
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 <= month) age -= 1;
  return age;
}

// A neutral age question: it doesn't say which answer lets you in.
export function AgeGate({ onAnswer }: { onAnswer: (age13Plus: boolean) => void }) {
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState("");
  const thisYear = new Date().getFullYear();
  const y = Number(year);
  const valid = month != null && /^\d{4}$/.test(year) && y >= thisYear - 100 && y <= thisYear;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Rise>
          <Socrates size={88} mood="listening" />
          <Text style={[type.title, { marginTop: space(2) }]} accessibilityRole="header">When were you born?</Text>
          <Text style={[type.body, { color: color.inkSoft, marginTop: space(1) }]}>
            We ask everyone. Testwise doesn't keep your birthday.
          </Text>
        </Rise>
        <Rise delay={80} style={{ marginTop: space(3) }}>
          <Text style={[type.label, { marginBottom: space(1) }]}>Month</Text>
          <View style={s.months} accessibilityRole="radiogroup" accessibilityLabel="Birth month">
            {MONTHS.map((m, i) => {
              const on = month === i + 1;
              return (
                <Pressable
                  key={m}
                  onPress={() => { buzz.tap(); setMonth(i + 1); }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={MONTH_NAMES[i]}
                  style={({ pressed }) => [s.month, on && s.monthOn, pressed && !on && { backgroundColor: color.rule }]}
                >
                  <Text style={[s.monthText, on && { fontFamily: font.black }]}>{m}</Text>
                </Pressable>
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
            placeholderTextColor={color.inkSoft}
            accessibilityLabel="Birth year"
            maxLength={4}
            style={[s.year, tabular]}
          />
        </Rise>
      </ScrollView>
      <View style={s.foot}>
        <Button title="Continue" disabled={!valid} onPress={() => valid && onAnswer(ageFrom(month!, y) >= 13)} />
        <Text style={[type.small, { marginTop: space(1.5) }]}>
          By continuing you agree to the{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("terms"))}>Terms</Text>
          {" "}and{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("privacy"))}>Privacy Policy</Text>.
        </Text>
      </View>
    </View>
  );
}

// Shown when the answer was under 13. There's no way back from here on this device for a day.
export function TooYoung() {
  return (
    <View style={[s.wrap, { flex: 1, justifyContent: "center" }]}>
      <Socrates size={104} mood="idle" />
      <Text style={[type.title, { marginTop: space(2) }]} accessibilityRole="header">Thanks for stopping by</Text>
      <Text style={[type.body, { color: color.inkSoft, marginTop: space(1) }]}>
        Testwise is for students 13 and older, so we haven't kept anything about you.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, paddingHorizontal: GUTTER, paddingTop: space(4), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(2), maxWidth: 520, width: "100%", alignSelf: "center" },
  months: { flexDirection: "row", flexWrap: "wrap", gap: space(1) },
  month: { width: "22%", flexGrow: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.input, backgroundColor: color.paperDeep },
  monthOn: { backgroundColor: color.azure },
  monthText: { fontFamily: font.bold, fontSize: 15, color: color.ink },
  year: {
    fontFamily: font.bold, fontSize: 20, color: color.ink, borderRadius: radius.input, minHeight: 52,
    paddingHorizontal: space(2), paddingVertical: space(1.25), backgroundColor: color.paperDeep, outlineColor: color.azure,
  } as object,
  link: { color: color.azureInk, fontFamily: font.bold, textDecorationLine: "underline" },
});
