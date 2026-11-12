// The question itself: passage, figure, table, stem, then the answer choices or
// the typed answer, plus the worked solution. One piece of code draws every
// item type, for the lesson screen and for the renderer checks alike.
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Item } from "../api";
import { Icon } from "../components/icons";
import { Press3D, Rise, TextButton, decorative, isReduceMotion, usePop, useShake } from "../components/ui";
import { Figure } from "../figure/Figure";
import { Passage, RichText } from "../text/Passage";
import { renderMath } from "../text/tex";
import { feedback } from "../motion/feedback";
import { BORDER, color, font, radius, space, tabular, type } from "../theme";
import { lessonShared } from "./shared";

export type Phase = "answering" | "right" | "wrong";
export type Measurable = React.ComponentRef<typeof View>;

export function Question({ item, phase, choice, typed, onChoice, onTyped, onSubmit, stemRef, tileRefs, reported = false, reportFailed = false, onReport }: {
  item: Item;
  phase: Phase;
  choice: string | null;
  typed: string;
  onChoice: (c: string) => void;
  onTyped: (t: string) => void;
  onSubmit?: () => void;
  // The lesson measures the stem and each choice after Check, so its scroll
  // can stop on a clean edge.
  stemRef?: React.Ref<Measurable>;
  tileRefs?: { current: (Measurable | null)[] };
  // Generated questions can be reported before answering.
  reported?: boolean;
  reportFailed?: boolean;
  onReport?: () => void;
}) {
  const checked = phase !== "answering";
  const tile = (i: number) => (r: Measurable | null) => { if (tileRefs) tileRefs.current[i] = r; };
  return (
    <>
      {item.passage && <Passage text={item.passage} label={item.passage2 ? "Text 1" : undefined} />}
      {item.passage2 && <Passage text={item.passage2} label="Text 2" />}
      {item.figure && <Figure spec={item.figure} />}
      {item.table && <DataTable table={item.table} />}
      <View ref={stemRef} testID="stem">
        <RichText text={item.stem} style={[type.question, s.stem]} />
      </View>
      {item.source === "generated" && !checked && onReport && (
        <View style={s.genRow}>
          <TextButton
            title={reported ? "Reported" : "Report it"}
            tone="soft"
            align="left"
            disabled={reported}
            style={{ minHeight: 32, paddingHorizontal: 0 }}
            accessibilityLabel={reported ? "Question reported" : "Report a problem with this question"}
            onPress={onReport}
          />
          {reportFailed && <Text style={[type.small, { color: color.badInk, marginLeft: space(1) }]} accessibilityRole="alert">Couldn't send that. Try again?</Text>}
        </View>
      )}

      {item.type === "mc" ? (
        <View style={{ gap: space(1.25) }} accessibilityRole="radiogroup">
          {item.choices!.map((c, i) => {
            const picked = choice === c;
            const state: TileState = checked ? (c === item.answer ? "right" : picked ? "wrong" : "dim") : picked ? "picked" : "idle";
            return (
              <Rise key={c} delay={60 + i * 40}>
                <View ref={tile(i)}>
                <ChoiceTile
                  letter={"ABCDEFGH"[i]}
                  text={c}
                  state={state}
                  selected={picked}
                  disabled={checked}
                  onPress={() => { if (choice !== c) feedback.select(); onChoice(c); }}
                />
                </View>
              </Rise>
            );
          })}
        </View>
      ) : (
        <View ref={tile(0)}>
          <View>
            <TextInput
              value={typed}
              onChangeText={onTyped}
              editable={!checked}
              placeholder="Type your answer"
              placeholderTextColor={color.ink2}
              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"}
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={onSubmit}
              style={[
                lessonShared.input,
                phase === "right" && { backgroundColor: color.goodWash, borderColor: color.good, color: color.goodInk },
                phase === "wrong" && { backgroundColor: color.badWash, borderColor: color.bad, color: color.badInk },
              ]}
              accessibilityLabel="Your answer"
            />
            {checked && (
              <View style={s.inputMark} pointerEvents="none">
                <DrawnMark ok={phase === "right"} size={26} />
              </View>
            )}
          </View>
          <Text style={[type.small, { marginTop: space(1) }]}>Fractions like 3/4 and decimals like 0.75 both work.</Text>
        </View>
      )}
    </>
  );
}

// The worked solution, step by step.
export function Solution({ steps }: { steps: string[] }) {
  return (
    <Rise delay={80} style={s.solution}>
      <Text style={[type.heading, { marginBottom: space(1) }]}>How to solve it</Text>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: space(0.75) }}>
          {steps.length > 1 && <Text style={[type.body, tabular, { width: 24, color: color.ink2 }]}>{i + 1}.</Text>}
          <Text style={[type.body, { flex: 1 }]}>{renderMath(step)}</Text>
        </View>
      ))}
    </Rise>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

// A check or a cross that draws itself in.
export function DrawnMark({ ok, size }: { ok: boolean; size: number }) {
  const v = useRef(new Animated.Value(isReduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReduceMotion()) return;
    Animated.timing(v, { toValue: 1, duration: ok ? 360 : 260, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, ok]);
  const c = ok ? color.good : color.bad;
  const len = 30;
  const off = v.interpolate({ inputRange: [0, 1], outputRange: [len, 0] });
  return (
    <View {...decorative} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {ok ? (
          <AnimatedPath d="M4.6 12.9L9.6 17.6L19.4 6.8" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
        ) : (
          <>
            <AnimatedPath d="M6.3 6L18 18" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
            <AnimatedPath d="M17.8 6.2L6 17.9" stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={off} />
          </>
        )}
      </Svg>
    </View>
  );
}

// ─── Answer choices ──────────────────────────────────────────────────────────

export type TileState = "idle" | "picked" | "right" | "wrong" | "dim";

// Answer cards: a 2 px border with a thicker bottom. The border, the letter's
// key and the text all take the state's color; the wash fills the card.
const TILE: Record<TileState, { bg: string; edge: string; mark: string; text: string }> = {
  idle: { bg: color.bg, edge: color.line, mark: color.ink2, text: color.ink },
  picked: { bg: color.blueWash, edge: color.blue, mark: color.blueDark, text: color.blueDark },
  right: { bg: color.goodWash, edge: color.good, mark: color.goodInk, text: color.goodInk },
  wrong: { bg: color.badWash, edge: color.bad, mark: color.badInk, text: color.badInk },
  dim: { bg: color.bg, edge: color.line, mark: color.ink2, text: color.ink2 },
};

const TILE_R = radius.card;
const TILE_PAD = space(1.5);
// The letter's key: a small rounded square inside the card.
const KEY = 32;
const KEY_R = 10;

export function ChoiceTile({ letter, text, state, selected, disabled, onPress }: {
  letter: string; text: string; state: TileState; selected: boolean; disabled: boolean; onPress: () => void;
}) {
  const t = TILE[state];
  const pop = usePop(state === "picked" || state === "right", state === "right" ? 1.04 : 1.02);
  const { style: shakeStyle, shake } = useShake();
  useEffect(() => {
    if (state === "wrong") shake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <Animated.View style={shakeStyle}>
      <Animated.View style={pop}>
        <Press3D
          onPress={onPress}
          disabled={disabled}
          sound={false}
          haptic={false}
          edge={t.edge}
          border={t.edge}
          depth={BORDER}
          radius={TILE_R}
          accessibilityRole="radio"
          accessibilityLabel={text}
          accessibilityState={{ selected, checked: selected }}
          face={[s.choice, { backgroundColor: t.bg }]}
        >
          <View style={[s.letter, { borderColor: state === "idle" || state === "dim" ? color.line : t.edge }]}>
            {state === "right" ? <Icon name="check" size={18} color={t.mark} strokeWidth={3} />
              : state === "wrong" ? <Icon name="close" size={16} color={t.mark} strokeWidth={3} />
              : <Text style={[s.letterText, { color: t.mark }]}>{letter}</Text>}
          </View>
          <RichText text={text} style={[type.body, s.choiceText, { color: t.text }]} />
        </Press3D>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Data table ──────────────────────────────────────────────────────────────

export function DataTable({ table }: { table: NonNullable<Item["table"]> }) {
  const n = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
  const cols = Array.from({ length: n }, (_, ci) => ci);
  const cell = (r: (string | number)[], ci: number) => (r[ci] == null ? "" : String(r[ci]));
  // In the column-stacked layout an empty cell must still take a line, or the column shifts up.
  const line = (v: string) => (v.trim() === "" ? "\u00a0" : v);
  const titleEl = table.title ? <Text style={[type.label, { marginBottom: space(1) }]}>{table.title}</Text> : null;

  if (n <= 4) {
    const longestWord = (t: string) => Math.max(0, ...t.split(/\s+/).map((w) => w.length));
    const weight = cols.map((ci) => Math.max(5, longestWord(table.headers[ci] ?? "") + 1, ...table.rows.map((r) => cell(r, ci).length)));
    const small = n >= 4;
    const row = (vals: string[], header: boolean, last: boolean, key: React.Key) => (
      <View key={key} style={[s.tr, !last && s.trRule, header && { backgroundColor: color.well }]}>
        {cols.map((ci) => (
          <View key={ci} style={[s.tdCell, small && { paddingHorizontal: space(0.5) }, { flex: weight[ci] }]}>
            <Text style={[s.tdFit, tabular, small && s.tdSmall, header && { fontFamily: font.extra }]}>{vals[ci] ?? ""}</Text>
          </View>
        ))}
      </View>
    );
    return (
      <View style={{ marginBottom: space(2) }}>
        {titleEl}
        <View style={s.table}>
          {row(table.headers, true, table.rows.length === 0, "h")}
          {table.rows.map((r, ri) => row(cols.map((ci) => cell(r, ci)), false, ri === table.rows.length - 1, ri))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: space(2) }}>
      {titleEl}
      <ScrollView horizontal contentContainerStyle={s.table}>
        <View style={{ flexDirection: "row" }}>
          {cols.map((ci) => (
            <View key={ci} style={{ flexGrow: 1 }}>
              <Text numberOfLines={1} style={[s.td, tabular, s.th]}>{line(table.headers[ci] ?? "")}</Text>
              {table.rows.map((r, ri) => (
                <Text key={ri} numberOfLines={1} style={[s.td, tabular, ri === table.rows.length - 1 && s.tdBottom]}>{line(cell(r, ci))}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  stem: { marginBottom: space(2.5) },
  genRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: -space(1.5), marginBottom: space(2) },
  choice: { flexDirection: "row", alignItems: "center", gap: space(1.5), padding: TILE_PAD - BORDER, minHeight: 58, borderRadius: TILE_R },
  choiceText: { flex: 1, fontFamily: font.bold },
  letter: { width: KEY, height: KEY, borderRadius: KEY_R, borderWidth: BORDER, alignItems: "center", justifyContent: "center" },
  letterText: { fontFamily: font.black, fontSize: 14, lineHeight: 18 },
  inputMark: { position: "absolute", right: space(1.5), top: space(0.5), bottom: 0, justifyContent: "center" },
  solution: { marginTop: space(3) },
  table: { borderRadius: radius.small, overflow: "hidden", backgroundColor: color.bg, borderWidth: BORDER, borderColor: color.line },
  th: { fontFamily: font.extra, backgroundColor: color.well },
  tr: { flexDirection: "row", alignItems: "stretch" },
  trRule: { borderBottomWidth: 1, borderColor: color.line },
  tdCell: { justifyContent: "center", paddingHorizontal: space(1), paddingVertical: space(1) },
  tdFit: { ...type.body, textAlign: "center" },
  tdSmall: { fontSize: 14, lineHeight: 19 },
  tdBottom: { borderBottomWidth: 0 },
  td: { ...type.body, minWidth: 64, paddingHorizontal: space(1.5), paddingVertical: space(1), borderBottomWidth: 1, borderColor: color.line, textAlign: "center" },
});
