// Draws an item figure from its spec (see exams/FIGURE_FORMAT.md).
// Everything is placed in "plane" coordinates and mapped into an SVG viewBox.
import React, { useId, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { compile } from "./expr";
import { color, font } from "../theme";

type Pt = [number, number];
export type FigureSpec = {
  alt: string;
  aspect?: number;
  plane: {
    x: [number, number]; y: [number, number]; grid?: number; axes?: boolean; ticks?: number;
    xlabel?: string; ylabel?: string; xticklabels?: boolean; yticklabels?: boolean;
  };
  elements: any[];
};

const INK = color.ink;
const SOFT = color.inkSoft;
const GRID = color.rule;
const ACCENT = color.azureInk;
const FS = 14;

export function Figure({ spec, maxWidth = 380 }: { spec: FigureSpec; maxWidth?: number }) {
  const aspect = spec.aspect && spec.aspect > 0.3 && spec.aspect < 3 ? spec.aspect : 1;
  const W = 400;
  const H = Math.round(W / aspect);
  const clip = "plot" + useId().replace(/[^A-Za-z0-9]/g, "");
  const body = useMemo(() => draw(spec, W, H, clip), [spec, W, H, clip]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={spec.alt}
      style={{ width: "100%", maxWidth, aspectRatio: aspect, alignSelf: "center", marginBottom: 16 }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>{body}</Svg>
    </View>
  );
}

function draw(spec: FigureSpec, W: number, H: number, clip: string) {
  const pl = spec.plane;
  const axes = pl.axes !== false;
  const pad = axes ? 30 : 22;
  const [x0, x1] = pl.x;
  const [y0, y1] = pl.y;
  const sx = (W - 2 * pad) / (x1 - x0);
  const sy = (H - 2 * pad) / (y1 - y0);
  const X = (x: number) => pad + (x - x0) * sx;
  const Y = (y: number) => H - pad - (y - y0) * sy;
  const P = (p: Pt) => [X(p[0]), Y(p[1])] as const;
  const out: React.ReactNode[] = [];
  let k = 0;
  const key = () => k++;
  // Labels get a white halo so they stay readable where they cross a line.
  const label = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", fill = INK, size = FS) => (
    <G key={key()}>
      <SvgText x={x} y={y + size * 0.35} fontSize={size} fontFamily={font.bold} fill={color.sheet} stroke={color.sheet} strokeWidth={4} strokeLinejoin="round" textAnchor={anchor}>{text}</SvgText>
      <SvgText x={x} y={y + size * 0.35} fontSize={size} fontFamily={font.bold} fill={fill} textAnchor={anchor}>{text}</SvgText>
    </G>
  );
  const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(+v.toFixed(2))).replace("-", "−");

  // Grid, axes and ticks.
  if (pl.grid && pl.grid > 0 && (x1 - x0) / pl.grid <= 60 && (y1 - y0) / pl.grid <= 60) {
    for (let x = Math.ceil(x0 / pl.grid) * pl.grid; x <= x1 + 1e-9; x += pl.grid)
      out.push(<Line key={key()} x1={X(x)} y1={Y(y0)} x2={X(x)} y2={Y(y1)} stroke={GRID} strokeWidth={1} />);
    for (let y = Math.ceil(y0 / pl.grid) * pl.grid; y <= y1 + 1e-9; y += pl.grid)
      out.push(<Line key={key()} x1={X(x0)} y1={Y(y)} x2={X(x1)} y2={Y(y)} stroke={GRID} strokeWidth={1} />);
  }
  if (axes) {
    const ax = Math.min(Math.max(0, x0), x1); // where the y-axis sits
    const ay = Math.min(Math.max(0, y0), y1); // where the x-axis sits
    out.push(<Line key={key()} x1={X(x0)} y1={Y(ay)} x2={X(x1)} y2={Y(ay)} stroke={SOFT} strokeWidth={1.5} />);
    out.push(<Line key={key()} x1={X(ax)} y1={Y(y0)} x2={X(ax)} y2={Y(y1)} stroke={SOFT} strokeWidth={1.5} />);
    out.push(arrowHead(X(x1), Y(ay), 0, SOFT, key()));
    out.push(arrowHead(X(ax), Y(y1), -90, SOFT, key()));
    const t = pl.ticks;
    if (t && t > 0 && (x1 - x0) / t <= 40 && (y1 - y0) / t <= 40) {
      const showX = pl.xticklabels !== false, showY = pl.yticklabels !== false;
      for (let x = Math.ceil(x0 / t) * t; x <= x1 - t / 2; x += t) {
        if (Math.abs(x - ax) < 1e-9) continue;
        out.push(<Line key={key()} x1={X(x)} y1={Y(ay) - 4} x2={X(x)} y2={Y(ay) + 4} stroke={SOFT} strokeWidth={1.5} />);
        if (showX) out.push(label(X(x), Y(ay) + 14, fmt(x), "middle", color.inkSoft, 11));
      }
      for (let y = Math.ceil(y0 / t) * t; y <= y1 - t / 2; y += t) {
        if (Math.abs(y - ay) < 1e-9) continue;
        out.push(<Line key={key()} x1={X(ax) - 4} y1={Y(y)} x2={X(ax) + 4} y2={Y(y)} stroke={SOFT} strokeWidth={1.5} />);
        if (showY) out.push(label(X(ax) - 8, Y(y), fmt(y), "end", color.inkSoft, 11));
      }
      if (showX && showY && ax === 0 && ay === 0) out.push(label(X(0) - 8, Y(0) + 12, "0", "end", color.inkSoft, 11));
    }
    if (pl.xlabel) out.push(label(X(x1) - 4, Y(ay) - 12, pl.xlabel, "end", color.inkSoft, 13));
    if (pl.ylabel) out.push(label(X(ax) + 8, Y(y1) + 4, pl.ylabel, "start", color.inkSoft, 13));
  }

  // Elements, clipped to the plot area (labels are drawn unclipped afterwards).
  const shapes: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  const centroidOf = (pts: Pt[]) => [pts.reduce((a, p) => a + X(p[0]), 0) / pts.length, pts.reduce((a, p) => a + Y(p[1]), 0) / pts.length];
  const away = (px: number, py: number, cx: number, cy: number, d: number) => {
    const dx = px - cx, dy = py - cy, n = Math.hypot(dx, dy) || 1;
    return [px + (dx / n) * d, py + (dy / n) * d];
  };
  const POS: Record<string, [number, number, "start" | "middle" | "end"]> = {
    ne: [8, -12, "start"], nw: [-8, -12, "end"], se: [8, 14, "start"], sw: [-8, 14, "end"],
    n: [0, -16, "middle"], s: [0, 18, "middle"], e: [10, 0, "start"], w: [-10, 0, "end"],
  };
  const extend = (a: Pt, b: Pt, both: boolean) => {
    const [ax, ay] = P(a), [bx, by] = P(b);
    const dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1, L = 4 * (W + H);
    return { x1: both ? ax - (dx / n) * L : ax, y1: both ? ay - (dy / n) * L : ay, x2: bx + (dx / n) * L, y2: by + (dy / n) * L };
  };

  for (const el of spec.elements || []) {
    try {
      switch (el.type) {
        case "point": {
          const [px, py] = P(el.at);
          shapes.push(<Circle key={key()} cx={px} cy={py} r={4.5} fill={el.open ? color.sheet : INK} stroke={INK} strokeWidth={2} />);
          if (el.label) {
            const [dx, dy, a] = POS[el.labelPos || "ne"] || POS.ne;
            labels.push(label(px + dx, py + dy, el.label, a));
          }
          break;
        }
        case "segment": {
          const [ax, ay] = P(el.from), [bx, by] = P(el.to);
          shapes.push(<Line key={key()} x1={ax} y1={ay} x2={bx} y2={by} stroke={INK} strokeWidth={2} strokeDasharray={el.dash ? "6 5" : undefined} />);
          const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
          if (el.arrow === "end" || el.arrow === "both") shapes.push(arrowHead(bx, by, deg, INK, key()));
          if (el.arrow === "both") shapes.push(arrowHead(ax, ay, deg + 180, INK, key()));
          if (el.label) {
            const mx = (ax + bx) / 2, my = (ay + by) / 2, n = Math.hypot(bx - ax, by - ay) || 1;
            labels.push(label(mx + (-(by - ay) / n) * 14, my + ((bx - ax) / n) * 14, el.label));
          }
          break;
        }
        case "line":
        case "ray": {
          const e = el.type === "line" ? extend(el.through[0], el.through[1], true) : extend(el.from, el.through, false);
          shapes.push(<Line key={key()} {...e} stroke={el.color === "accent" ? ACCENT : INK} strokeWidth={2} strokeDasharray={el.dash ? "6 5" : undefined} />);
          if (el.label && el.type === "line") {
            // Label near where the line leaves the plot, nudged off the line.
            const [ax, ay] = P(el.through[0]), [bx, by] = P(el.through[1]);
            const n = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / n, uy = (by - ay) / n;
            const inside = (x: number, y: number) => x >= pad && x <= W - pad && y >= pad && y <= H - pad;
            let lo = 0, hi = 4 * (W + H);
            for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (inside(bx + ux * m, by + uy * m)) lo = m; else hi = m; }
            const ex = bx + ux * Math.max(0, lo - 14), ey = by + uy * Math.max(0, lo - 14);
            labels.push(label(ex - uy * 14, ey + ux * 14, el.label, "middle", INK));
          }
          break;
        }
        case "polygon": {
          const pts: Pt[] = el.points;
          shapes.push(<Polygon key={key()} points={pts.map((p) => P(p).join(",")).join(" ")} fill={el.fill ? color.azureWash : "none"} stroke={INK} strokeWidth={2} strokeLinejoin="round" />);
          const [cx, cy] = centroidOf(pts);
          (el.vertexLabels || []).forEach((t: string, i: number) => {
            if (!t) return;
            const [px, py] = P(pts[i]);
            const [lx, ly] = away(px, py, cx, cy, 16);
            labels.push(label(lx, ly, t));
          });
          (el.sideLabels || []).forEach((t: string, i: number) => {
            if (!t) return;
            const [ax, ay] = P(pts[i]), [bx, by] = P(pts[(i + 1) % pts.length]);
            const [lx, ly] = away((ax + bx) / 2, (ay + by) / 2, cx, cy, 16);
            labels.push(label(lx, ly, t, "middle", ACCENT));
          });
          break;
        }
        case "circle": {
          const [cx, cy] = P(el.center);
          shapes.push(<Ellipse key={key()} cx={cx} cy={cy} rx={el.r * sx} ry={el.r * sy} fill={el.fill ? color.azureWash : "none"} stroke={INK} strokeWidth={2} />);
          break;
        }
        case "arc": {
          const [cx, cy] = P(el.center);
          const rx = el.r * sx, ry = el.r * sy;
          const pt = (deg: number) => [cx + rx * Math.cos((deg * Math.PI) / 180), cy - ry * Math.sin((deg * Math.PI) / 180)];
          const sweep = (((el.end - el.start) % 360) + 360) % 360;
          const [ax, ay] = pt(el.start), [bx, by] = pt(el.start + sweep);
          shapes.push(<Path key={key()} d={`M ${ax} ${ay} A ${rx} ${ry} 0 ${sweep > 180 ? 1 : 0} 0 ${bx} ${by}`} fill="none" stroke={ACCENT} strokeWidth={3} />);
          if (el.label) {
            const [lx, ly] = [cx + (rx + 16) * Math.cos(((el.start + sweep / 2) * Math.PI) / 180), cy - (ry + 16) * Math.sin(((el.start + sweep / 2) * Math.PI) / 180)];
            labels.push(label(lx, ly, el.label, "middle", ACCENT));
          }
          break;
        }
        case "angle": {
          const [vx, vy] = P(el.vertex), [fx, fy] = P(el.from), [tx, ty] = P(el.to);
          let a1 = Math.atan2(-(fy - vy), fx - vx), a2 = Math.atan2(-(ty - vy), tx - vx);
          let d = a2 - a1;
          while (d <= -Math.PI) d += 2 * Math.PI;
          while (d > Math.PI) d -= 2 * Math.PI;
          const r = 22;
          if (el.right) {
            const u = [Math.cos(a1), -Math.sin(a1)], v = [Math.cos(a1 + d), -Math.sin(a1 + d)], s = 14;
            shapes.push(<Polyline key={key()} points={`${vx + u[0] * s},${vy + u[1] * s} ${vx + (u[0] + v[0]) * s},${vy + (u[1] + v[1]) * s} ${vx + v[0] * s},${vy + v[1] * s}`} fill="none" stroke={INK} strokeWidth={1.5} />);
          } else {
            const ex = vx + r * Math.cos(a1 + d), ey = vy - r * Math.sin(a1 + d);
            shapes.push(<Path key={key()} d={`M ${vx + r * Math.cos(a1)} ${vy - r * Math.sin(a1)} A ${r} ${r} 0 0 ${d > 0 ? 0 : 1} ${ex} ${ey}`} fill="none" stroke={ACCENT} strokeWidth={2} />);
          }
          if (el.label) {
            // Narrow angles push the label out so it clears both sides.
            const mid = a1 + d / 2, rr = Math.min(70, Math.max(r + 16, 16 / Math.max(0.15, Math.sin(Math.abs(d) / 2))));
            labels.push(label(vx + rr * Math.cos(mid), vy - rr * Math.sin(mid), el.label, "middle", ACCENT));
          }
          break;
        }
        case "function": {
          const f = compile(String(el.expr));
          const [a, b] = el.domain as [number, number];
          const lo = Math.max(a, x0), hi = Math.min(b, x1);
          const runs: string[][] = [];
          let cur: string[] = [];
          const N = 240;
          for (let i = 0; i <= N; i++) {
            const x = lo + ((hi - lo) * i) / N;
            const y = f(x);
            if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) {
              if (cur.length > 1) runs.push(cur);
              cur = [];
              continue;
            }
            cur.push(`${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
          }
          if (cur.length > 1) runs.push(cur);
          for (const r of runs) shapes.push(<Polyline key={key()} points={r.join(" ")} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeDasharray={el.dash ? "6 5" : undefined} strokeLinejoin="round" />);
          if (el.label) {
            const at: Pt = el.labelAt || [hi, f(hi)];
            const [lx, ly] = P(at);
            labels.push(label(lx, ly - 12, el.label, "end", ACCENT));
          }
          break;
        }
        case "scatter":
          for (const p of el.points as Pt[]) {
            const [px, py] = P(p);
            shapes.push(<Circle key={key()} cx={px} cy={py} r={4} fill={el.hollow ? color.sheet : INK} stroke={INK} strokeWidth={1.5} />);
          }
          break;
        case "text": {
          const [px, py] = P(el.at);
          labels.push(label(px, py, el.text));
          break;
        }
        case "tick": {
          const [ax, ay] = P(el.on[0]), [bx, by] = P(el.on[1]);
          const mx = (ax + bx) / 2, my = (ay + by) / 2, n = Math.hypot(bx - ax, by - ay) || 1;
          const ux = (bx - ax) / n, uy = (by - ay) / n;
          const c = Math.min(3, Math.max(1, el.count || 1));
          for (let i = 0; i < c; i++) {
            const o = (i - (c - 1) / 2) * 5;
            shapes.push(<Line key={key()} x1={mx + ux * o - uy * 7} y1={my + uy * o + ux * 7} x2={mx + ux * o + uy * 7} y2={my + uy * o - ux * 7} stroke={INK} strokeWidth={2} />);
          }
          break;
        }
      }
    } catch {
      // A bad element is skipped rather than breaking the question.
    }
  }

  return (
    <>
      <Defs>
        <ClipPath id={clip}>
          <Rect x={pad - 6} y={pad - 6} width={W - 2 * pad + 12} height={H - 2 * pad + 12} />
        </ClipPath>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={color.sheet} rx={16} />
      {out}
      <G clipPath={`url(#${clip})`}>{shapes}</G>
      {labels}
    </>
  );
}

function arrowHead(x: number, y: number, deg: number, fill: string, k: number) {
  return <Polygon key={k} points="0,0 -10,-5 -10,5" fill={fill} transform={`translate(${x} ${y}) rotate(${deg})`} />;
}
