// Renderer check page: every item type, drawn by the same code the lesson
// uses, in a chosen state. Web only, for the screenshot tests and for review:
//   ?lab=renderers                       an index of the fixtures
//   ?lab=renderers&item=<id>&state=<s>   one fixture; s = idle, picked, right, wrong, solution
// The fixtures live in app/src/lab/items.json.
import React, { useRef, useState } from "react";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { Fraunces_400Regular, Fraunces_600SemiBold } from "@expo-google-fonts/fraunces";
import { ScrollView, ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import type { Item } from "../api";
import { SocratesLine } from "../components/SocratesLine";
import { Button, IconButton, ProgressBar, SlideIn } from "../components/ui";
import { Phase, Question, Solution } from "../lesson/Question";
import { ResultPanel } from "../lesson/ResultPanel";
import { lessonShared } from "../lesson/shared";
import fixtures from "../lab/items.json";
import { color, GUTTER, space, tabular, type } from "../theme";

type Fixture = { id: string; title: string; states: LabState[]; item: Item };
export type LabState = "idle" | "picked" | "right" | "wrong" | "solution";
const FIXTURES = fixtures as unknown as Fixture[];
const STATES: LabState[] = ["idle", "picked", "right", "wrong", "solution"];

function param(k: string) {
  try {
    return new URLSearchParams(window.location.search).get(k);
  } catch {
    return null;
  }
}

// The learner's answer and the screen's phase for a state.
function pose(item: Item, state: LabState): { phase: Phase; choice: string | null; typed: string; solution: boolean } {
  const mc = item.type === "mc";
  const wrong = item.choices?.find((c) => c !== item.answer) ?? "";
  if (state === "idle") return { phase: "answering", choice: null, typed: "", solution: false };
  if (state === "picked") return { phase: "answering", choice: mc ? wrong : null, typed: mc ? "" : "3/4", solution: false };
  if (state === "right") return { phase: "right", choice: mc ? item.answer : null, typed: mc ? "" : item.answer, solution: false };
  return { phase: "wrong", choice: mc ? wrong : null, typed: mc ? "" : "7", solution: state === "solution" };
}

export function RendererLab() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Fraunces_400Regular, Fraunces_600SemiBold,
  });
  if (!fontsLoaded) return <View style={st.root} />;
  const id = param("item");
  const fixture = FIXTURES.find((f) => f.id === id);
  const state = (STATES as string[]).includes(param("state") ?? "") ? (param("state") as LabState) : "idle";
  return (
    <View style={st.root} testID="lab-ready">
      {fixture ? <Frame fixture={fixture} state={state} /> : <Index />}
    </View>
  );
}

// The lesson screen's frame around one question: header, scrolling body, then
// the Check bar or the result panel. Same styles as the lesson itself.
function Frame({ fixture, state }: { fixture: Fixture; state: LabState }) {
  const item = fixture.item;
  const p = pose(item, state);
  const [choice, setChoice] = useState(p.choice);
  const [typed, setTyped] = useState(p.typed);
  const checked = p.phase !== "answering";
  const response = item.type === "mc" ? choice : typed.trim();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const why = p.phase === "wrong" ? item.wrong_reasons[response ?? ""] || "Not this one. Read the question once more, slowly." : "Yes. That's the one.";
  return (
    <>
      <View style={lessonShared.head}>
        <View style={lessonShared.headRow}>
          <IconButton name="close" onPress={() => {}} label="Quit lesson" style={{ marginLeft: -8 }} />
          <Text style={[type.label, { flex: 1, marginLeft: space(1) }]} numberOfLines={1} accessibilityRole="header">{fixture.title}</Text>
          <Text style={[type.small, tabular]}>3 of 8</Text>
        </View>
        <View style={{ flexDirection: "row", marginTop: space(1) }}>
          <ProgressBar value={(2 + (checked ? 1 : 0)) / 8} height={8} fill={color.azure} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        testID="lab-body"
        contentContainerStyle={lessonShared.body}
        onContentSizeChange={() => { if (checked) scrollRef.current?.scrollToEnd({ animated: false }); }}
      >
        {!checked && (
          <View style={{ marginBottom: space(2) }}>
            <SocratesLine text="Read each one to the end before the choices." mood="thinking" size={64} textStyle={type.socratesSmall} />
          </View>
        )}
        <SlideIn id={item.id}>
          <Question
            item={item}
            phase={p.phase}
            choice={choice}
            typed={typed}
            onChoice={setChoice}
            onTyped={setTyped}
            reported={false}
            reportFailed={false}
            onReport={() => {}}
          />
        </SlideIn>
        {checked && p.solution && item.explanation.length > 0 && <Solution steps={item.explanation} />}
        <View style={{ height: checked ? space(6) : space(3) }} />
      </ScrollView>
      {!checked ? (
        <View style={lessonShared.foot}>
          <View style={lessonShared.footInner}>
            <Button title="Check" disabled={!response} onPress={() => {}} />
          </View>
        </View>
      ) : (
        <ResultPanel
          ok={p.phase === "right"}
          line={why}
          mood={p.phase === "right" ? "happy" : "concerned"}
          fx={1}
          answer={item.answer}
          combo={0}
          xp={p.phase === "right" ? 10 : 0}
          busy={false}
          onNext={() => {}}
          onAsk={p.phase === "wrong" ? () => {} : undefined}
          onSolution={p.solution || item.explanation.length === 0 ? undefined : () => {}}
          reported={false}
          reportFailed={false}
          onReport={() => {}}
          last={false}
        />
      )}
    </>
  );
}

function Index() {
  return (
    <ScrollView contentContainerStyle={st.index}>
      <Text style={type.title}>Renderer check</Text>
      <Text style={[type.body, { marginTop: space(1), marginBottom: space(3) }]}>
        One fixture per item type, drawn by the lesson's own components. Open a state, or run npx playwright test.
      </Text>
      {FIXTURES.map((f) => (
        <View key={f.id} style={{ marginBottom: space(2) }}>
          <Text style={type.label}>{f.id}</Text>
          <Text style={type.small}>{f.title} · {f.item.type}{f.item.figure ? " · figure" : ""}{f.item.table ? " · table" : ""}{f.item.passage ? " · passage" : ""}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: space(0.5) }}>
            {STATES.map((s) => (
              <Text
                key={s}
                accessibilityRole="link"
                {...({ href: `?lab=renderers&item=${f.id}&state=${s}` } as object)}
                style={[type.body, { color: color.azureInk, marginRight: space(2), fontFamily: f.states.includes(s) ? "Nunito_700Bold" : "Nunito_400Regular" }]}
              >
                {s}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, minHeight: "100%" } as object,
  index: { padding: GUTTER, paddingTop: space(4), maxWidth: 640, width: "100%", alignSelf: "center" },
});
