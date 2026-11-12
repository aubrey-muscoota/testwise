// After Check: where to scroll so the answer area shows above the result band.
// Shared by the lesson and the renderer check page, so the committed
// screenshots show what a learner sees.
import { Platform } from "react-native";
import { space } from "../theme";
import type { Measurable } from "./Question";

type Box = { y: number; h: number };

// The view's top edge stops at the start of the stem or of a choice, never
// partway through a line of the passage. The picked and the right tile stay in
// view; when both can't fit, the right one wins, since the band names it.
// Returns the offset and how much room to add under the content to reach it.
export function revealTarget({ stem, tiles, keep, vh, ch }: {
  stem: Box | null; tiles: (Box | null)[]; keep: { right: number; picked: number }; vh: number; ch: number;
}): { to: number; pad: number } | null {
  const parts = [stem, ...tiles].filter((x): x is Box => !!x);
  if (!parts.length || !vh) return null;
  const m = space(2);
  const right = keep.right >= 0 ? tiles[keep.right] : null;
  const picked = keep.picked >= 0 ? tiles[keep.picked] : null;
  const pick = (bs: (Box | null)[]) => bs.filter((x): x is Box => !!x);
  let must = pick([right, picked]);
  const span = (bs: Box[]) => Math.max(...bs.map((p) => p.y + p.h)) - Math.min(...bs.map((p) => p.y)) + 2 * m;
  if (must.length > 1 && span(must) > vh && right) must = [right];
  if (!must.length) must = [parts[parts.length - 1]];
  const mustTop = Math.max(0, Math.min(...must.map((p) => p.y)) - m);
  const mustBottom = Math.max(...must.map((p) => p.y + p.h));
  const want = Math.max(0, mustBottom + m - vh);
  const max = Math.max(0, ch - vh);
  const edges = parts.map((p) => Math.max(0, p.y - m));
  // The first clean edge at or past where those tiles fit, but never past the
  // top of the higher one.
  const clean = want === 0 ? 0 : edges.find((e) => e >= want) ?? want;
  const to = clean > mustTop ? Math.max(want, mustTop) : clean;
  return { to, pad: to > max ? Math.ceil(to - max) : 0 };
}

type Scrollable = { scrollTo: (o: { y: number; animated: boolean }) => void; getScrollableNode?: () => { clientHeight: number; scrollHeight: number } } | null;

// Positions are measured now rather than kept from onLayout: on web, onLayout
// only reports size changes, and the folded Socrates row moves things without
// resizing them.
export async function revealAnswer({ inner, scroll, stem, tiles, choices, answer, picked, viewH, contentH, scrollY, addPad, animated = true }: {
  inner: Measurable | null; scroll: Scrollable; stem: Measurable | null; tiles: (Measurable | null)[];
  choices?: string[]; answer: string; picked: string | null; viewH: number; contentH: number; scrollY: number;
  addPad: (px: number) => void; animated?: boolean;
}) {
  if (!inner || !scroll) return;
  const node = Platform.OS === "web" ? scroll.getScrollableNode?.() : null;
  const vh = node ? node.clientHeight : viewH;
  const ch = node ? node.scrollHeight : contentH;
  const box = (r: Measurable | null) => new Promise<Box | null>((res) => {
    if (!r) return res(null);
    try { r.measureLayout(inner as never, (_x, y, _w, h) => res({ y, h }), () => res(null)); } catch { res(null); }
  });
  const [s, ...ts] = await Promise.all([box(stem), ...tiles.map(box)]);
  const t = revealTarget({
    stem: s, tiles: ts, vh, ch,
    keep: { right: choices ? choices.indexOf(answer) : -1, picked: choices && picked != null ? choices.indexOf(picked) : -1 },
  });
  if (!t) return;
  const go = () => { if (Math.abs(t.to - scrollY) > 1) scroll.scrollTo({ y: t.to, animated }); };
  if (t.pad) { addPad(t.pad); setTimeout(go, 60); } else go();
}
