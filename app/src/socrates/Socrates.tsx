/*
 * Socrates — the animated mascot rig
 * ==================================
 *
 * What it is
 *   A cut-out ("puppet") rig drawn with react-native-svg and moved with React
 *   Native's Animated API. The art in parts.tsx is traced from
 *   assets/socratesmascotmain.png on the same 1024 x 1024 canvas, so at rest
 *   the rig looks like the PNG and frames exactly like it.
 *
 * Usage
 *   <Socrates size={120} mood="happy" talking lookAt="bubble" />
 *   <SocratesAvatar size={96} mood="cheer" moodKey={n} />   // old <Mascot> props
 *
 *   mood      idle | happy | thinking | concerned | celebrate | listening | sleepy
 *             (moods.ts maps app events to these: MOOD_FOR.correct, ...)
 *   talking   mouth flaps in an irregular syllable / word / phrase rhythm
 *   lookAt    {x, y} in -1..1, or "user" | "bubble" | "down"; when left out
 *             he glances around on his own
 *   animate   false draws a still frame of the mood's pose. The OS "reduce
 *             motion" setting does the same.
 *   moodKey   change it to replay the mood's entrance (a hop per correct answer)
 *   ambient   false stops breathing and idle fidgets (blinks stay)
 *
 * Hierarchy (back to front; * = animated group, pivot in brackets)
 *   outer Animated.View*      hop, squash and stretch, lean, slump (native driver)
 *   body*                     breathing scale [feet]
 *     far arm*                hangs behind the toga; raises for celebrate [shoulder]
 *     torso                   feet, chest, toga
 *     head*                   tilt, bob, nods, follows the gaze a little [neck]
 *       hair+beard, ear, face
 *       brows*                height and angle per mood [brow centre]
 *       eyes                  white clipped to its shape; pupil* glances, lid* blinks
 *       nose
 *       mouths*               smile, grin, flat, frown, "o", talk (cross-faded)
 *     forearm*                rotates at the elbow hidden under the cuff [elbow]
 *       thumb hand* / palm*   cross-faded
 *     cuff                    the toga fold over the elbow
 *
 * How it moves
 *   Every mood is a resting Pose (moods.ts). Changing mood springs each part to
 *   its new pose with a small stagger (brows, then eyes and mouth, then head,
 *   then arms) and with anticipation and overshoot on the big moves. On top of
 *   that run independent, randomly timed loops, so it never repeats exactly:
 *   breathing, blinks (sometimes double), glances, and per-mood "life"
 *   (thinking strokes his beard, listening nods, sleepy dozes off and yawns,
 *   celebrate fist-pumps).
 *
 * Performance
 *   Static art is created once (parts.tsx); only ~19 small <G> wrappers are
 *   animated and each one updates only when its own inputs change. Body moves
 *   (hop, squash, lean) run on the native driver. The SVG props run on the JS
 *   driver: react-native-svg props are not supported by the native driver. On
 *   web, Animated re-renders just the animated <G> with numeric transform props
 *   (translateX, rotation, scaleY, originX ...), which react-native-svg turns
 *   into a `transform` attribute plus `transform-origin`; the static children
 *   are the same element objects every frame, so React skips them.
 *
 * Swapping the renderer
 *   The props are mood-based on purpose. A Rive state machine with inputs
 *   mood / talking / lookX / lookY could replace this file without touching
 *   any caller.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleProp, ViewStyle } from "react-native";
import Svg, { ClipPath, Defs, G } from "react-native-svg";
import * as A from "./parts";
import { LookAt, lookTarget, MouthShape, Pose, POSES, SocratesMood } from "./moods";

export type { LookAt, SocratesMood } from "./moods";
export { MOOD_FOR, MOODS } from "./moods";

export type SocratesProps = {
  size?: number;
  mood?: SocratesMood;
  talking?: boolean;
  lookAt?: LookAt;
  animate?: boolean;
  moodKey?: unknown;
  ambient?: boolean;
  style?: StyleProp<ViewStyle>;
};

const AG = Animated.createAnimatedComponent(G);
// The outer View's transforms can run on the native driver (not on web).
const ND = Platform.OS !== "web";
const MOUTHS: MouthShape[] = ["smile", "grin", "flat", "frown", "o"];
const FEET = A.PIV.feet.y / 1024 - 0.5; // feet below the View's centre, as a fraction of size

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p;
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

type V = Animated.Value;
type Anim = Animated.CompositeAnimation;

function makeChannels(p: Pose) {
  const v = (n = 0) => new Animated.Value(n);
  return {
    // Outer View (native driver on iOS/Android).
    hop: v(), sx: v(1), sy: v(1), lean: v(), slump: v(),
    // SVG (JS driver).
    breath: v(), head: v(p.head), headY: v(p.headY), nod: v(), talkHead: v(),
    gx: v(p.gaze.x), gy: v(p.gaze.y),
    lid: v(p.lid), sqL: v(p.squint[0]), sqR: v(p.squint[1]),
    bLy: v(p.browL[0]), bLr: v(p.browL[1]), bRy: v(p.browR[0]), bRr: v(p.browR[1]),
    arm: v(p.arm), stroke: v(), back: v(p.back), palm: v(p.palm),
    smile: v(p.mouth === "smile" ? 1 : 0), grin: v(p.mouth === "grin" ? 1 : 0), flat: v(p.mouth === "flat" ? 1 : 0),
    frown: v(p.mouth === "frown" ? 1 : 0), o: v(p.mouth === "o" ? 1 : 0),
    open: v(), talkW: v(1),
  };
}
type Ch = ReturnType<typeof makeChannels>;

// Timers that die together.
function clock() {
  const ids = new Set<ReturnType<typeof setTimeout>>();
  let alive = true;
  return {
    after(ms: number, fn: () => void) {
      const id = setTimeout(() => {
        ids.delete(id);
        if (alive) fn();
      }, ms);
      ids.add(id);
    },
    alive: () => alive,
    stop() {
      alive = false;
      ids.forEach(clearTimeout);
      ids.clear();
    },
  };
}

// Springs tuned to read as hand-animated: quick, with a visible overshoot.
const spring = (val: V, toValue: number, o: { stiffness?: number; damping?: number; nd?: boolean } = {}) =>
  Animated.spring(val, { toValue, stiffness: o.stiffness ?? 170, damping: o.damping ?? 12, mass: 1, useNativeDriver: !!o.nd && ND });
const ease = (val: V, toValue: number, duration: number, easing: (t: number) => number = Easing.inOut(Easing.cubic), nd = false) =>
  Animated.timing(val, { toValue, duration, easing, useNativeDriver: nd && ND });
const after = (ms: number, a: Anim) => (ms > 0 ? Animated.sequence([Animated.delay(ms), a]) : a);
// Parts are interrupted all the time (a blink takes over the lids, a fist pump
// the arm). With the default stopTogether, one interruption would freeze every
// other part of the group mid-move.
const par = (xs: Anim[]) => Animated.parallel(xs, { stopTogether: false });
// Wind up a little the other way, then spring through.
const antic = (val: V, from: number, to: number, o?: { stiffness?: number; damping?: number }) =>
  Math.abs(to - from) < 0.001
    ? spring(val, to, o)
    : Animated.sequence([ease(val, from - (to - from) * 0.18, 110, Easing.out(Easing.quad)), spring(val, to, o)]);

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => on && setR(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => setR(!!v));
    return () => {
      on = false;
      sub?.remove?.();
    };
  }, []);
  return r;
}

let seq = 0;

export function Socrates({
  size = 120, mood = "idle", talking = false, lookAt, animate = true, moodKey, ambient = true, style,
}: SocratesProps) {
  const reduce = useReducedMotion();
  const live = animate && !reduce;
  const [ch] = useState(() => makeChannels(POSES[mood]));
  const [uid] = useState(() => `socrates${++seq}`);
  const pose = POSES[mood] ?? POSES.idle;
  const restLid = useRef(pose.lid);
  const prev = useRef<Pose>(pose);
  const look = lookTarget(lookAt);
  const lookKey = look ? `${look.x.toFixed(2)},${look.y.toFixed(2)}` : "auto";

  // ─── Pose + entrance + per-mood life ───────────────────────────────────────
  useEffect(() => {
    const p = POSES[mood] ?? POSES.idle;
    const from = prev.current;
    prev.current = p;
    restLid.current = p.lid;
    const t = clock();
    const running: Anim[] = [];
    const run = (a: Anim, cb?: () => void) => {
      running.push(a);
      a.start(cb ? ({ finished }) => finished && t.alive() && cb() : undefined);
    };

    if (!live) {
      setPose(ch, p, size);
      return () => t.stop();
    }

    // Brows lead, then lids and mouth, then the head, then the arms.
    run(par([
      antic(ch.bLy, from.browL[0], p.browL[0], { stiffness: 260, damping: 14 }),
      antic(ch.bRy, from.browR[0], p.browR[0], { stiffness: 240, damping: 14 }),
      spring(ch.bLr, p.browL[1], { stiffness: 220 }),
      spring(ch.bRr, p.browR[1], { stiffness: 200 }),
      after(30, par([
        ease(ch.lid, p.lid, 160), ease(ch.sqL, p.squint[0], 200), ease(ch.sqR, p.squint[1], 200),
        ...MOUTHS.map((m) => ease(ch[m], p.mouth === m ? 1 : 0, 110)),
      ])),
      after(70, mood === "thinking" || mood === "sleepy"
        ? par([ease(ch.head, p.head, 900), ease(ch.headY, p.headY, 900)])
        : par([antic(ch.head, from.head, p.head, { stiffness: 130, damping: 11 }), spring(ch.headY, p.headY, { stiffness: 140, damping: 12 })])),
      after(110, antic(ch.arm, from.arm, p.arm, { stiffness: 150, damping: 11 })),
      after(110, ease(ch.palm, p.palm, 160)),
      after(150, antic(ch.back, from.back, p.back, { stiffness: 120, damping: 10 })),
      after(60, spring(ch.slump, p.slump * size, { stiffness: 90, damping: 13, nd: true })),
      ease(ch.stroke, 0, 200),
    ]));

    // Entrances.
    const hopOnce = (h: number, then?: Anim) =>
      Animated.sequence([
        par([ease(ch.sy, 0.92, 90, Easing.out(Easing.quad), true), ease(ch.sx, 1.05, 90, Easing.out(Easing.quad), true)]),
        par([
          ease(ch.hop, -h, 190, Easing.out(Easing.quad), true),
          ease(ch.sy, 1.05, 120, Easing.out(Easing.quad), true), ease(ch.sx, 0.96, 120, Easing.out(Easing.quad), true),
        ]),
        par([
          ease(ch.hop, 0, 170, Easing.in(Easing.quad), true),
          ease(ch.sy, 1, 170, Easing.linear, true), ease(ch.sx, 1, 170, Easing.linear, true),
        ]),
        par([ease(ch.sy, 0.94, 70, Easing.out(Easing.quad), true), ease(ch.sx, 1.04, 70, Easing.out(Easing.quad), true)]),
        par([spring(ch.sy, 1, { stiffness: 300, damping: 10, nd: true }), spring(ch.sx, 1, { stiffness: 300, damping: 10, nd: true }), ...(then ? [then] : [])]),
      ]);
    const wiggle = (a: number) =>
      Animated.sequence([ease(ch.lean, a, 100, undefined, true), ease(ch.lean, -a * 0.7, 140, undefined, true), spring(ch.lean, 0, { stiffness: 200, damping: 9, nd: true })]);

    if (mood === "happy") {
      run(Animated.sequence([hopOnce(size * rnd(0.09, 0.12)), wiggle(rnd(3, 5) * (chance(0.5) ? 1 : -1))]));
    } else if (mood === "celebrate") {
      run(Animated.sequence([hopOnce(size * rnd(0.13, 0.16)), hopOnce(size * rnd(0.06, 0.09)), wiggle(5)]));
      const pump = (n: number) => {
        if (n <= 0) return;
        run(Animated.sequence([ease(ch.arm, p.arm - 12, 120, Easing.out(Easing.quad)), spring(ch.arm, p.arm, { stiffness: 260, damping: 10 })]), () =>
          t.after(rnd(60, 160), () => pump(n - 1)));
      };
      t.after(420, () => pump(3));
      // Keeps bouncing now and then while the mood lasts.
      const again = () => t.after(rnd(1600, 2800), () => {
        if (ambient) run(par([hopOnce(size * rnd(0.03, 0.05)), Animated.sequence([ease(ch.arm, p.arm - 9, 110), spring(ch.arm, p.arm, { stiffness: 240, damping: 10 })])]));
        again();
      });
      again();
    } else if (mood === "concerned") {
      run(Animated.sequence([
        par([ease(ch.sy, 0.965, 260, Easing.out(Easing.quad), true), ease(ch.sx, 1.02, 260, Easing.out(Easing.quad), true)]),
        par([spring(ch.sy, 1, { stiffness: 80, damping: 14, nd: true }), spring(ch.sx, 1, { stiffness: 80, damping: 14, nd: true })]),
      ]));
      // A sigh: one deep breath, a beat after the news lands.
      t.after(450, () => run(Animated.sequence([ease(ch.breath, 1.6, 700, Easing.out(Easing.sin)), ease(ch.breath, 0, 1100, Easing.inOut(Easing.sin))])));
    } else if (from !== p) {
      // A small settle so a mood change never just snaps.
      run(Animated.sequence([ease(ch.sy, 0.975, 90, undefined, true), spring(ch.sy, 1, { stiffness: 260, damping: 11, nd: true })]));
    }

    // Per-mood life on random timers.
    if (ambient) {
      if (mood === "thinking") {
        const strokeBeard = () => t.after(rnd(1300, 3200), () => {
          const n = Math.round(rnd(2, 4));
          const seqA: Anim[] = [];
          for (let i = 0; i < n; i++) seqA.push(ease(ch.stroke, rnd(3, 5), rnd(260, 380)), ease(ch.stroke, rnd(-0.5, 0.5), rnd(260, 380)));
          run(Animated.sequence(seqA), strokeBeard);
          if (chance(0.5)) run(Animated.sequence([ease(ch.bRy, p.browR[0] - 6, 200), ease(ch.bRy, p.browR[0], 400)]));
        });
        strokeBeard();
        const ponder = () => t.after(rnd(2500, 5000), () => {
          run(ease(ch.head, p.head + rnd(-2.5, 2.5), rnd(900, 1500)));
          ponder();
        });
        ponder();
      } else if (mood === "listening") {
        const nod = () => t.after(rnd(1800, 4200), () => {
          const n = chance(0.35) ? 2 : 1;
          const s: Anim[] = [];
          for (let i = 0; i < n; i++) s.push(ease(ch.nod, rnd(6, 10), 150, Easing.out(Easing.quad)), ease(ch.nod, 0, 220, Easing.inOut(Easing.quad)));
          run(Animated.sequence(s), nod);
        });
        nod();
        const tilt = () => t.after(rnd(3000, 6000), () => {
          run(spring(ch.head, p.head + rnd(-2, 3), { stiffness: 60, damping: 10 }));
          tilt();
        });
        tilt();
      } else if (mood === "sleepy") {
        const doze = () => t.after(rnd(3500, 7000), () => {
          if (chance(0.45)) {
            // Yawn: eyes squeeze, brows lift, mouth opens wide and slow.
            run(par([
              Animated.sequence([ease(ch.open, 1, 700, Easing.out(Easing.sin)), Animated.delay(rnd(500, 800)), ease(ch.open, 0, 450)]),
              Animated.sequence([ease(ch.lid, 0.95, 500), Animated.delay(rnd(600, 900)), ease(ch.lid, p.lid, 500)]),
              Animated.sequence([ease(ch.head, p.head - 6, 700), Animated.delay(600), ease(ch.head, p.head, 900)]),
              Animated.sequence([ease(ch.bLy, p.browL[0] - 12, 600), Animated.delay(700), ease(ch.bLy, p.browL[0], 600)]),
              Animated.sequence([ease(ch.bRy, p.browR[0] - 12, 600), Animated.delay(700), ease(ch.bRy, p.browR[0], 600)]),
            ]), doze);
          } else {
            // Nod off, then jerk awake.
            run(Animated.sequence([
              par([ease(ch.headY, p.headY + rnd(10, 16), rnd(1800, 2600), Easing.in(Easing.sin)), ease(ch.lid, 0.9, 2000), ease(ch.head, p.head + 3, 2200)]),
              par([spring(ch.headY, p.headY - 6, { stiffness: 260, damping: 9 }), ease(ch.lid, 0.15, 90), spring(ch.head, p.head, { stiffness: 200, damping: 10 }),
                Animated.sequence([ease(ch.bLy, p.browL[0] - 14, 90), ease(ch.bLy, p.browL[0], 700)]),
                Animated.sequence([ease(ch.bRy, p.browR[0] - 14, 90), ease(ch.bRy, p.browR[0], 700)])]),
              Animated.delay(rnd(500, 900)),
              par([ease(ch.lid, p.lid, 900), spring(ch.headY, p.headY, { stiffness: 60, damping: 12 })]),
            ]), doze);
          }
        });
        doze();
      } else if (mood === "idle" || mood === "happy" || mood === "concerned") {
        const fidget = () => t.after(rnd(2800, 6500), () => {
          const k = pick(["tilt", "brows", "shift", "tilt", "stroke"] as const);
          if (k === "tilt") run(spring(ch.head, p.head + rnd(-2.5, 2.5), { stiffness: 70, damping: 11 }));
          if (k === "brows" && mood !== "concerned") {
            const d = rnd(6, 10);
            run(Animated.sequence([
              par([ease(ch.bLy, p.browL[0] - d, 120), ease(ch.bRy, p.browR[0] - d * rnd(0.6, 1.1), 140)]),
              Animated.delay(rnd(150, 400)),
              par([spring(ch.bLy, p.browL[0]), spring(ch.bRy, p.browR[0])]),
            ]));
          }
          if (k === "shift") run(Animated.sequence([ease(ch.lean, rnd(-1.4, 1.4), rnd(700, 1100), undefined, true), Animated.delay(rnd(600, 1600)), ease(ch.lean, 0, 900, undefined, true)]));
          if (k === "stroke") run(Animated.sequence([ease(ch.stroke, 3, 300), ease(ch.stroke, 0, 300), ease(ch.stroke, 2.5, 280), ease(ch.stroke, 0, 340)]));
          fidget();
        });
        fidget();
      }
    }

    return () => {
      t.stop();
      running.forEach((a) => a.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, moodKey, live, size, ambient, ch]);

  // ─── Breathing ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !ambient) {
      ch.breath.setValue(0);
      return;
    }
    const t = clock();
    const sleepy = mood === "sleepy";
    const period = (POSES[mood] ?? POSES.idle).breath * 1000;
    const cycle = () => {
      const amp = (sleepy ? 1.35 : 1) * rnd(0.8, 1.15);
      const d = period * rnd(0.88, 1.12);
      Animated.sequence([
        ease(ch.breath, amp, d * 0.45, Easing.inOut(Easing.sin)),
        ease(ch.breath, 0, d * 0.55, Easing.inOut(Easing.sin)),
      ]).start(({ finished }) => finished && t.alive() && cycle());
    };
    t.after(rnd(0, 400), cycle);
    return () => {
      t.stop();
      ch.breath.stopAnimation();
    };
  }, [live, ambient, mood, ch]);

  // ─── Blinks ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    const t = clock();
    const blink = (twice: boolean) => {
      const slow = mood === "sleepy" ? 1.8 : 1;
      const one = () => [
        ease(ch.lid, 1, rnd(55, 80) * slow, Easing.in(Easing.quad)),
        Animated.delay(rnd(20, 60) * slow),
        ease(ch.lid, restLid.current, rnd(110, 160) * slow, Easing.out(Easing.quad)),
      ];
      Animated.sequence(twice ? [...one(), Animated.delay(rnd(60, 110)), ...one()] : one()).start();
    };
    const next = () => t.after(mood === "sleepy" ? rnd(4000, 8000) : rnd(2500, 6000), () => {
      blink(chance(0.2));
      next();
    });
    t.after(rnd(600, 2000), () => {
      blink(false);
      next();
    });
    return () => t.stop();
  }, [live, mood, ch]);

  // ─── Gaze ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const p = POSES[mood] ?? POSES.idle;
    const home = look ?? p.gaze;
    if (!live) {
      ch.gx.setValue(home.x);
      ch.gy.setValue(home.y);
      return;
    }
    const t = clock();
    const saccade = (x: number, y: number, cb?: () => void) =>
      par([ease(ch.gx, x, rnd(90, 140), Easing.out(Easing.cubic)), ease(ch.gy, y, rnd(90, 140), Easing.out(Easing.cubic))]).start(
        ({ finished }) => finished && t.alive() && cb?.(),
      );
    t.after(rnd(40, 160), () => saccade(home.x, home.y));
    const wander = () => t.after(look ? rnd(700, 2200) : rnd(1200, 4500), () => {
      if (look) {
        // Fixed target: tiny micro-saccades so the eyes never look painted on.
        saccade(home.x + rnd(-0.07, 0.07), home.y + rnd(-0.06, 0.06), wander);
      } else {
        let x = rnd(-0.9, 0.9);
        let y = rnd(-0.6, 0.5);
        if (mood === "thinking") [x, y] = chance(0.5) ? [rnd(0.3, 0.8), rnd(-0.9, -0.6)] : [rnd(-0.7, -0.3), rnd(-0.8, -0.5)];
        if (mood === "concerned" && chance(0.5)) [x, y] = [rnd(-0.2, 0.2), rnd(-0.1, 0.1)];
        saccade(x, y, () => t.after(rnd(350, 1200), () => saccade(home.x + rnd(-0.08, 0.08), home.y + rnd(-0.06, 0.06), wander)));
      }
    });
    wander();
    return () => t.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, mood, lookKey, ch]);

  // ─── Talking ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live || !talking) {
      ch.open.stopAnimation();
      ch.talkHead.stopAnimation();
      if (live) par([ease(ch.open, 0, 90), ease(ch.talkHead, 0, 120), ease(ch.talkW, 1, 90)]).start();
      else {
        ch.open.setValue(0);
        ch.talkHead.setValue(0);
      }
      return;
    }
    const t = clock();
    let syllables = 0;
    let words = 0;
    const p = POSES[mood] ?? POSES.idle;
    const syllable = () => {
      if (!t.alive()) return;
      if (syllables <= 0) {
        words--;
        if (words <= 0) {
          // Phrase break: close, breathe, sometimes lift the brows on the next phrase.
          words = Math.round(rnd(2, 6));
          syllables = Math.round(rnd(1, 4));
          par([ease(ch.open, 0, 90), ease(ch.talkHead, 0, 200)]).start();
          if (chance(0.4)) t.after(300, () => Animated.sequence([
            par([ease(ch.bLy, p.browL[0] - 9, 110), ease(ch.bRy, p.browR[0] - 9, 130)]),
            Animated.delay(rnd(180, 420)),
            par([spring(ch.bLy, p.browL[0]), spring(ch.bRy, p.browR[0])]),
          ]).start());
          t.after(rnd(320, 750), syllable);
          return;
        }
        syllables = Math.round(rnd(1, 4));
        ease(ch.open, rnd(0, 0.08), 70).start();
        t.after(rnd(70, 200), syllable);
        return;
      }
      syllables--;
      const o = chance(0.12) ? rnd(0.9, 1) : rnd(0.3, 0.85);
      const stressed = o > 0.8;
      Animated.sequence([
        par([
          ease(ch.open, o, rnd(55, 100), Easing.out(Easing.quad)),
          ease(ch.talkW, chance(0.25) ? rnd(0.7, 0.82) : rnd(0.9, 1.05), 80),
          ease(ch.talkHead, stressed ? 1 : rnd(0.1, 0.4), 120, Easing.out(Easing.quad)),
        ]),
        ease(ch.open, rnd(0.02, 0.2), rnd(50, 110), Easing.in(Easing.quad)),
      ]).start(({ finished }) => finished && syllable());
    };
    t.after(rnd(0, 80), syllable);
    return () => {
      t.stop();
      ch.open.stopAnimation();
    };
  }, [live, talking, mood, ch]);

  // Stop everything on unmount.
  useEffect(() => () => Object.values(ch).forEach((v) => v.stopAnimation()), [ch]);

  // ─── Wiring (built once per instance; values do the rest) ─────────────────
  const n = useMemo(() => wire(ch, size), [ch, size]);
  const clipL = `${uid}L`;
  const clipR = `${uid}R`;

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Socrates"
      style={[{ width: size, height: size }, style, { transform: n.outer }]}
    >
      <Svg width={size} height={size} viewBox={A.VIEWBOX}>
        <Defs>
          <ClipPath id={clipL}>{A.EyeWhiteL}</ClipPath>
          <ClipPath id={clipR}>{A.EyeWhiteR}</ClipPath>
        </Defs>
        <AG originX={A.PIV.feet.x} originY={A.PIV.feet.y} scaleX={n.bodySX} scaleY={n.bodySY}>
          <AG originX={A.PIV.shoulderBack.x} originY={A.PIV.shoulderBack.y} rotation={n.back}>
            <AG opacity={n.backHang}>{A.BackArmHangArt}</AG>
            <AG opacity={n.backUp}>{A.BackArmRaisedArt}</AG>
          </AG>
          {A.TorsoArt}
          <AG originX={A.PIV.neck.x} originY={A.PIV.neck.y} rotation={n.head} translateY={n.headY}>
            {A.HeadBackArt}
            <AG originX={A.PIV.browL.x} originY={A.PIV.browL.y} translateY={ch.bLy} rotation={ch.bLr}>{A.BrowLArt}</AG>
            <AG originX={A.PIV.browR.x} originY={A.PIV.browR.y} translateY={ch.bRy} rotation={ch.bRr}>{A.BrowRArt}</AG>
            <G clipPath={`url(#${clipL})`}>
              {A.EyeWhiteL}
              <AG translateX={n.px} translateY={n.py}>{A.PupilLArt}</AG>
              <AG translateY={n.lidL}>{A.LidLArt}</AG>
            </G>
            <G clipPath={`url(#${clipR})`}>
              {A.EyeWhiteR}
              <AG translateX={n.px} translateY={n.py}>{A.PupilRArt}</AG>
              <AG translateY={n.lidR}>{A.LidRArt}</AG>
            </G>
            {A.NoseArt}
            <AG opacity={n.m.smile}>{A.MouthSmileArt}</AG>
            <AG opacity={n.m.flat}>{A.MouthFlatArt}</AG>
            <AG opacity={n.m.frown}>{A.MouthFrownArt}</AG>
            <AG opacity={n.m.o}>{A.MouthOArt}</AG>
            <AG opacity={n.m.grin} originX={A.PIV.mouth.x} originY={A.PIV.mouth.y} scaleX={1.1} scaleY={0.9}>{A.MouthOpenArt}</AG>
            <AG opacity={n.talkOn} originX={A.PIV.mouth.x} originY={A.PIV.mouth.y} scaleX={ch.talkW} scaleY={n.talkSY}>{A.MouthOpenArt}</AG>
          </AG>
          <AG originX={A.PIV.elbow.x} originY={A.PIV.elbow.y} rotation={n.arm}>
            {A.ForearmArt}
            <AG opacity={n.thumb}>{A.ThumbHandArt}</AG>
            <AG opacity={ch.palm}>{A.PalmArt}</AG>
          </AG>
          {A.CuffArt}
        </AG>
      </Svg>
    </Animated.View>
  );
}

// Set every channel to a pose at once (reduced motion, animate={false}).
function setPose(ch: Ch, p: Pose, size: number) {
  Object.values(ch).forEach((v) => v.stopAnimation());
  ch.hop.setValue(0); ch.sx.setValue(1); ch.sy.setValue(1); ch.lean.setValue(0); ch.slump.setValue(p.slump * size);
  ch.breath.setValue(0); ch.nod.setValue(0); ch.talkHead.setValue(0); ch.stroke.setValue(0); ch.open.setValue(0); ch.talkW.setValue(1);
  ch.head.setValue(p.head); ch.headY.setValue(p.headY);
  ch.lid.setValue(p.lid); ch.sqL.setValue(p.squint[0]); ch.sqR.setValue(p.squint[1]);
  ch.bLy.setValue(p.browL[0]); ch.bLr.setValue(p.browL[1]); ch.bRy.setValue(p.browR[0]); ch.bRr.setValue(p.browR[1]);
  ch.arm.setValue(p.arm); ch.back.setValue(p.back); ch.palm.setValue(p.palm);
  MOUTHS.forEach((m) => ch[m].setValue(p.mouth === m ? 1 : 0));
}

// Derived values: how channels combine into each group's props.
function wire(ch: Ch, size: number) {
  type N = Parameters<typeof Animated.add>[0];
  const add = (...xs: N[]) => xs.reduce((a, b) => Animated.add(a, b));
  const lin = (v: V, k: number) => v.interpolate({ inputRange: [0, 1], outputRange: [0, k] });
  const shut = ch.open.interpolate({ inputRange: [0, 0.12], outputRange: [1, 0], extrapolate: "clamp" });
  const lidTo = (v: Animated.AnimatedAddition, travel: number) =>
    v.interpolate({ inputRange: [0, 1], outputRange: [0, travel], extrapolate: "clamp" });
  return {
    outer: [
      // Squash and stretch from the feet, not the middle.
      { translateY: add(ch.hop, ch.slump, Animated.multiply(Animated.subtract(1, ch.sy), size * FEET)) },
      { rotate: ch.lean.interpolate({ inputRange: [-30, 30], outputRange: ["-30deg", "30deg"] }) },
      { scaleX: ch.sx },
      { scaleY: ch.sy },
    ],
    bodySY: ch.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.013] }),
    bodySX: ch.breath.interpolate({ inputRange: [0, 1], outputRange: [1, 0.997] }),
    head: add(ch.head, lin(ch.gx, 2.2)),
    headY: add(ch.headY, lin(ch.breath, -7), lin(ch.talkHead, -5), ch.nod),
    px: lin(ch.gx, 13),
    py: lin(ch.gy, 15),
    lidL: lidTo(Animated.add(ch.lid, ch.sqL), A.LID_TRAVEL.L),
    lidR: lidTo(Animated.add(ch.lid, ch.sqR), A.LID_TRAVEL.R),
    arm: add(ch.arm, ch.stroke, lin(ch.breath, 0.9)),
    back: add(ch.back, lin(ch.breath, -0.8)),
    backHang: ch.back.interpolate({ inputRange: [-30, -5], outputRange: [0, 1], extrapolate: "clamp" }),
    backUp: ch.back.interpolate({ inputRange: [-60, -15], outputRange: [1, 0], extrapolate: "clamp" }),
    thumb: ch.palm.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    m: {
      smile: Animated.multiply(ch.smile, shut),
      grin: Animated.multiply(ch.grin, shut),
      flat: Animated.multiply(ch.flat, shut),
      frown: Animated.multiply(ch.frown, shut),
      o: Animated.multiply(ch.o, shut),
    },
    talkOn: ch.open.interpolate({ inputRange: [0, 0.12], outputRange: [0, 1], extrapolate: "clamp" }),
    talkSY: ch.open.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
  };
}

// ─── Drop-in for the old PNG <Mascot> ────────────────────────────────────────
// Same props as components/ui.tsx's Mascot, so swapping is a rename.

export type LegacyMood = "idle" | "happy" | "cheer" | "sad" | "think" | "talk";
const LEGACY: Record<LegacyMood, SocratesMood> = {
  idle: "idle", happy: "happy", cheer: "celebrate", sad: "concerned", think: "thinking", talk: "idle",
};

export function SocratesAvatar({
  size = 96, float = true, mood = "idle", moodKey, talking, lookAt, style,
}: {
  size?: number;
  float?: boolean;
  mood?: LegacyMood | SocratesMood;
  moodKey?: unknown;
  talking?: boolean;
  lookAt?: LookAt;
  style?: StyleProp<ViewStyle>;
}) {
  const m = (LEGACY as Record<string, SocratesMood>)[mood] ?? (mood as SocratesMood);
  return (
    <Socrates size={size} mood={m} talking={talking ?? mood === "talk"} moodKey={moodKey} ambient={float} lookAt={lookAt} style={style} />
  );
}

export default Socrates;
