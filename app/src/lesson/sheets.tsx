// Sheets the lesson opens over itself: the one-time AI consent (also used from
// Me) and the "stop here?" check before quitting.
import React, { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { legalUrl } from "../api";
import { Button, Sheet, TextButton } from "../components/ui";
import { Socrates } from "../socrates/Socrates";
import { color, font, space, type } from "../theme";

export function ConsentSheet({ onAgree, onDecline, where = "lesson" }: { onAgree: () => void; onDecline: () => void; where?: "lesson" | "Me" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet onClose={onDecline} label="Before you talk to Socrates">
      <View accessibilityRole="alert">
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Socrates size={64} mood="listening" />
          <Text style={[type.title, { flex: 1, marginLeft: space(1.5) }]}>Before we talk</Text>
        </View>
        <Text style={[type.body, { marginTop: space(2) }]}>
          Socrates is an AI tutor powered by Claude, made by Anthropic. When you chat with him, this question, your answer and what you type are sent to Anthropic to write his replies.
        </Text>
        <Text style={[type.body, { marginTop: space(1) }]}>
          Please don't share personal details like your name, school or contact info. Socrates can make mistakes; the worked solution is always checked.
        </Text>
        <Text style={[type.small, { marginTop: space(1.5), marginBottom: space(2.5) }]}>
          Details are in our{" "}
          <Text style={s.legalLink} accessibilityRole="link" onPress={() => Linking.openURL(legalUrl("privacy"))}>Privacy Policy</Text>. You can turn this off any time in {where === "Me" ? "this screen" : "Me"}.
        </Text>
      </View>
      <Button title="I agree, ask Socrates" disabled={busy} onPress={() => { setBusy(true); onAgree(); }} />
      <TextButton title="Not now" tone="soft" onPress={onDecline} style={{ marginTop: space(0.5) }} />
    </Sheet>
  );
}

export function QuitSheet({ placement, onStay, onLeave }: { placement: boolean; onStay: () => void; onLeave: () => void }) {
  return (
    <Sheet onClose={onStay} label="Leave this set?">
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Socrates size={64} mood="concerned" />
        <Text style={[type.title, { flex: 1, marginLeft: space(1.5) }]}>{placement ? "Stop the quiz?" : "Stop here?"}</Text>
      </View>
      <Text style={[type.body, { marginTop: space(2), marginBottom: space(3) }]}>
        {placement ? "If you stop now, nothing gets skipped and you start from the first skills." : "Answers so far are saved, but the set won't count toward today until you finish it."}
      </Text>
      <Button title="Keep going" onPress={onStay} />
      <TextButton title={placement ? "End the quiz" : "End lesson"} tone="brick" onPress={onLeave} style={{ marginTop: space(0.5) }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  legalLink: { color: color.azureInk, fontFamily: font.bold, textDecorationLine: "underline" },
});
