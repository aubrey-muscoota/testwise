import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Mascot, PopIn, Rise } from "../components/ui";
import { legalUrl } from "../api";
import { color, font, radius, space, type } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <PopIn from={0.6} style={{ alignItems: "center" }}>
        <Mascot size={96} />
      </PopIn>
      <Rise delay={120} style={{ alignSelf: "stretch" }}>
        <Text style={[type.h2, s.center]} accessibilityRole="header">When were you born?</Text>
        <Text style={[type.body, s.center, { color: color.textSoft, marginTop: space(1) }]}>
          We ask everyone. Testwise doesn't keep your birthday.
        </Text>
      </Rise>
      <Rise delay={240} style={{ alignSelf: "stretch", marginTop: space(3) }}>
        <Text style={[type.label, { marginBottom: space(1) }]}>Month</Text>
        <View style={s.months} accessibilityRole="radiogroup" accessibilityLabel="Birth month">
          {MONTHS.map((m, i) => {
            const on = month === i + 1;
            return (
              <Pressable
                key={m}
                onPress={() => setMonth(i + 1)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={m}
                style={[s.month, on && s.monthOn]}
              >
                <Text style={[s.monthText, on && { color: "#fff" }]}>{m}</Text>
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
          placeholder="YYYY"
          placeholderTextColor={color.disabledText}
          accessibilityLabel="Birth year"
          maxLength={4}
          style={s.year}
        />
      </Rise>
      <Rise delay={360} style={{ alignSelf: "stretch", marginTop: space(3) }}>
        <Button title="Continue" disabled={!valid} onPress={() => valid && onAnswer(ageFrom(month!, y) >= 13)} />
        <Text style={[type.caption, s.center, { marginTop: space(2) }]}>
          By continuing you agree to the{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("terms"))}>Terms</Text>
          {" "}and{" "}
          <Text style={s.link} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("privacy"))}>Privacy Policy</Text>.
        </Text>
      </Rise>
    </ScrollView>
  );
}

// Shown when the answer was under 13. There's no way back from here on this device for a day.
export function TooYoung() {
  return (
    <View style={[s.wrap, { flex: 1 }]}>
      <Mascot size={96} />
      <Text style={[type.h2, s.center, { marginTop: space(2) }]} accessibilityRole="header">Thanks for your interest!</Text>
      <Text style={[type.body, s.center, { color: color.textSoft, marginTop: space(1) }]}>
        Testwise is for students 13 and older, so we haven't kept anything about you.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: space(3), alignItems: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  center: { textAlign: "center" },
  months: { flexDirection: "row", flexWrap: "wrap", gap: space(1) },
  month: {
    width: "22%", flexGrow: 1, paddingVertical: space(1.25), alignItems: "center", borderRadius: radius.input,
    borderWidth: 2, borderColor: color.line, backgroundColor: color.card,
  },
  monthOn: { backgroundColor: color.azure, borderColor: color.azureDark },
  monthText: { fontFamily: font.bold, fontSize: 15, color: color.text },
  year: {
    fontFamily: font.bold, fontSize: 20, color: color.text, borderWidth: 2, borderColor: color.line, borderRadius: radius.input,
    paddingHorizontal: space(2), paddingVertical: space(1.25), backgroundColor: color.card, letterSpacing: 2,
  },
  link: { color: color.azureDark, fontFamily: font.bold, textDecorationLine: "underline" },
});
