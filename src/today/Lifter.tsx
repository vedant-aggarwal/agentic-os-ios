import { useEffect } from 'react';
import Animated, { useAnimatedProps, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

// A gym-sign figure doing the exercise in side view: thick round limbs, a round head, the machine in grey.
// Joints come from a pose per movement, worked out on the UI thread each frame from one running clock.

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const ALine = Animated.createAnimatedComponent(Line);

export type Move =
  | 'curl' | 'hammer' | 'pulldown' | 'cablerow' | 'facepull' | 'pushdown' | 'ohp' | 'raise'
  | 'bench' | 'dbbench' | 'incline' | 'pushup' | 'squat' | 'legpress' | 'rdl' | 'row' | 'press'
  | 'crunch' | 'plank' | 'hang' | 'legraise' | 'kneeraise' | 'walk' | 'run' | 'bike';

const BY_ID: Record<string, Move> = {
  bench: 'bench', 'db-bench': 'dbbench', 'incline-db': 'incline', ohp: 'ohp', 'lat-raise': 'raise', 'cable-fly': 'press',
  pushdown: 'pushdown', pushup: 'pushup', row: 'row', pulldown: 'pulldown', 'cable-row': 'cablerow', 'face-pull': 'facepull',
  curl: 'curl', hammer: 'hammer', 'neck-curl': 'curl', squat: 'squat', rdl: 'rdl', 'leg-press': 'legpress', calf: 'squat',
  walk: 'walk', bike: 'bike', run: 'run', sprint: 'run', hlr: 'legraise', 'knee-raise': 'kneeraise', 'dead-hang': 'hang',
  'cable-crunch': 'crunch', 'decline-crunch': 'crunch', 'dead-bug': 'crunch', 'ab-wheel': 'pushup', pallof: 'press',
  plank: 'plank', 'side-plank': 'plank',
};
const BY_NAME: [RegExp, Move][] = [
  [/pulldown/, 'pulldown'], [/face pull/, 'facepull'], [/hammer/, 'hammer'], [/curl/, 'curl'], [/pushdown|tricep|extension/, 'pushdown'],
  [/incline/, 'incline'], [/overhead|shoulder press|military/, 'ohp'], [/bench|chest press|floor press/, 'bench'], [/push-?up/, 'pushup'],
  [/leg press/, 'legpress'], [/deadlift|rdl|good morning/, 'rdl'], [/squat|lunge|step-?up|calf/, 'squat'], [/cable row|seated row/, 'cablerow'],
  [/row/, 'row'], [/fly|crossover|pallof/, 'press'], [/raise/, 'raise'], [/hang|pull-?up|chin-?up/, 'hang'], [/plank/, 'plank'],
  [/crunch|sit-?up|dead bug/, 'crunch'], [/sprint|run|jog/, 'run'], [/walk|treadmill/, 'walk'], [/bike|cycl/, 'bike'],
];
export function moveOf(ex: string, name: string): Move {
  return BY_ID[ex] ?? BY_NAME.find(([re]) => re.test(name.toLowerCase()))?.[1] ?? 'curl';
}

// ── body and timing ──────────────────────────────────────────────────────────
const TL = 27, NL = 10.5, UA = 15, FA = 14.5, TH = 19.5, SH = 19, FT = 6.5, F = 114, AY = F - 3;
const LEG = TH + SH - 0.4; // a standing leg, just short of locked
const REP = 2.8; // seconds: lift, squeeze, lower, breathe

type Pose = {
  b: number[]; // near side: toe, ankle, knee, hip, shoulder, elbow, hand
  f: number[]; // far side: leg (toe, ankle, knee, hip), then arm (shoulder, elbow, hand) when it moves apart
  h: number[]; // head centre
  e: number[]; // what the hand holds: x, y, forearm angle
  k: number[]; // cable from pulley to hand
  s: number; // weight stack lift, 0 to 1
  m: number[]; // one moving machine part (leg press plate, pulldown bar)
};

function P(x: number, y: number, a: number, l: number) {
  'worklet';
  const r = (a * Math.PI) / 180;
  return [x + Math.sin(r) * l, y - Math.cos(r) * l];
}
// two-bone reach: the middle joint (elbow or knee) for an end point, and the end point it can reach
function IK(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: number) {
  'worklet';
  let dx = tx - sx, dy = ty - sy;
  let d = Math.sqrt(dx * dx + dy * dy) || 0.001;
  const max = l1 + l2 - 0.05, min = Math.abs(l1 - l2) + 0.05;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < min) { dx *= min / d; dy *= min / d; d = min; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  return [sx + ux * a - uy * h * bend, sy + uy * a + ux * h * bend, sx + dx, sy + dy];
}
function rep(c: number) {
  'worklet';
  const t = (c % REP) / REP;
  const e = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.32) return e(t / 0.32);
  if (t < 0.42) return 1;
  if (t < 0.86) return 1 - e((t - 0.42) / 0.44);
  return 0;
}
function mix(a: number, b: number, p: number) {
  'worklet';
  return a + (b - a) * p;
}
// standing legs: ankles planted, knees forward
function stand(hx: number, hy: number, ax: number, far: number) {
  'worklet';
  const n = IK(hx, hy, ax, AY, TH, SH, -1), f = IK(hx, hy, ax - far, AY, TH, SH, -1);
  return { n: [n[2] + FT, n[3] + 2.5, n[2], n[3], n[0], n[1], hx, hy], f: [f[2] + FT, f[3] + 2.5, f[2], f[3], f[0], f[1], hx, hy] };
}
function pack(l: number[], s: number[], e: number[], h: number[]) {
  'worklet';
  return [l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], s[0], s[1], e[0], e[1], h[0], h[1]];
}

function pose(m: Move, c: number): Pose {
  'worklet';
  const p = rep(c);
  const none: number[] = [];
  switch (m) {
    case 'pulldown': {
      const hip = [48, 90], t = -6 - 6 * p;
      const S = P(hip[0], hip[1], t, TL);
      const E = P(S[0], S[1], 6 - 171 * p, UA * (1 - 0.5 * Math.sin(Math.PI * p))); // elbows come out toward you
      const H = P(E[0], E[1], 6 + 26 * p, FA);
      const K = P(hip[0], hip[1], 95, TH), A = P(K[0], K[1], 178, SH);
      return { b: pack([A[0] + FT, A[1] + 2.5, A[0], A[1], K[0], K[1], hip[0], hip[1]], S, E, H), f: none, h: P(hip[0], hip[1], t, TL + NL),
        e: none, k: [50, 12, H[0], H[1]], s: p, m: [H[0] - 11, H[1], H[0] + 11, H[1]] };
    }
    case 'cablerow': {
      const hip = [36, 92], t = 16 - 22 * p;
      const S = P(hip[0], hip[1], t, TL);
      const E = P(S[0], S[1], 100 + 95 * p, UA), H = P(E[0], E[1], 97 - 17 * p, FA);
      const L = IK(hip[0], hip[1], 72, 95, TH, SH, -1);
      return { b: pack([L[2] + 1.5, L[3] - 6.5, L[2], L[3], L[0], L[1], hip[0], hip[1]], S, E, H), f: none, h: P(hip[0], hip[1], t, TL + NL),
        e: [H[0], H[1], 0], k: [84, 92, H[0], H[1]], s: p, m: none };
    }
    case 'facepull': {
      const L = stand(45, AY - 38.2, 47, 7), t = -6;
      const S = P(45, AY - 38.2, t, TL);
      const E = [S[0] + UA * Math.cos(Math.PI * p), S[1] - 1.5]; // the elbow swings out wide and back
      const H = P(E[0], E[1], 86 - 26 * p, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(45, AY - 38.2, t, TL + NL), e: [H[0], H[1], 0], k: [104, 40, H[0], H[1]], s: p, m: none };
    }
    case 'pushdown': {
      const L = stand(46, AY - 38.2, 48, 7), t = 10;
      const S = P(46, AY - 38.2, t, TL), E = P(S[0], S[1], 174, UA), H = P(E[0], E[1], 30 + 146 * p, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(46, AY - 38.2, t, TL + NL), e: [H[0], H[1], 0], k: [64, 10, H[0], H[1]], s: p, m: none };
    }
    case 'ohp': {
      const L = stand(48, AY - 38.2, 50, 7), t = -3 - 2 * p;
      const S = P(48, AY - 38.2, t, TL);
      const R = IK(S[0], S[1], S[0] + mix(5, 1, p), S[1] - mix(4, 29, p), UA, FA, 1);
      return { b: pack(L.n, S, R, [R[2], R[3]]), f: L.f, h: P(48, AY - 38.2, t, TL + NL), e: [R[2], R[3], 0], k: none, s: 0, m: none };
    }
    case 'raise': {
      const L = stand(48, AY - 38.2, 50, 7);
      const S = P(48, AY - 38.2, 0, TL), ua = 176 - 84 * p, E = P(S[0], S[1], ua, UA), H = P(E[0], E[1], ua - 8, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(48, AY - 38.2, 0, TL + NL), e: [H[0], H[1], ua - 8], k: none, s: 0, m: none };
    }
    case 'bench':
    case 'dbbench': {
      const hip = [36, 86.5], S = [63, 86.5];
      const L = IK(hip[0], hip[1], 16, AY, TH, SH, 1);
      const R = IK(S[0], S[1], S[0] - mix(3, 1, p), S[1] - mix(15, 29, p), UA, FA, -1);
      return { b: pack([L[2] - FT, L[3] + 2.5, L[2], L[3], L[0], L[1], hip[0], hip[1]], S, R, [R[2], R[3]]), f: none, h: [S[0] + NL, S[1]],
        e: [R[2], R[3], 90], k: none, s: 0, m: none };
    }
    case 'incline': {
      const hip = [62, 91], t = -55, S = P(hip[0], hip[1], t, TL);
      const K = P(hip[0], hip[1], 95, TH), A = P(K[0], K[1], 178, SH);
      const R = IK(S[0], S[1], S[0] + 3, S[1] - mix(13, 29, p), UA, FA, 1);
      return { b: pack([A[0] + FT, A[1] + 2.5, A[0], A[1], K[0], K[1], hip[0], hip[1]], S, R, [R[2], R[3]]), f: none, h: P(hip[0], hip[1], t, TL + NL),
        e: [R[2], R[3], 90], k: none, s: 0, m: none };
    }
    case 'pushup': {
      const phi = 79 - 11 * p, A = [18, AY + 0.5];
      const K = P(A[0], A[1], phi, SH), hip = P(A[0], A[1], phi, LEG), S = P(hip[0], hip[1], phi, TL);
      const R = IK(S[0], S[1], 79, F - 2, UA, FA, 1);
      return { b: pack([A[0] + 3, F, A[0], A[1], K[0], K[1], hip[0], hip[1]], S, R, [R[2], R[3]]), f: none, h: P(hip[0], hip[1], phi, TL + NL),
        e: none, k: none, s: 0, m: none };
    }
    case 'squat': {
      const hx = mix(50, 35, p), hy = mix(AY - 38.2, 92, p), t = mix(4, 40, p);
      const L = stand(hx, hy, 52, 5);
      const S = P(hx, hy, t, TL), E = P(S[0], S[1], t + 150, UA), H = P(E[0], E[1], t - 25, FA);
      const B = P(S[0], S[1], t - 90, 4.5);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(hx, hy, t, TL + NL), e: [B[0], B[1] + 1, 0], k: none, s: 0, m: none };
    }
    case 'legpress': {
      const hip = [42, 94], t = -62;
      const S = P(hip[0], hip[1], t, TL);
      const A = P(hip[0], hip[1], 52, mix(24, 36.5, p));
      const L = IK(hip[0], hip[1], A[0], A[1], TH, SH, -1);
      const T = P(L[2], L[3], -38, FT);
      const R = IK(S[0], S[1], hip[0] + 3, hip[1] + 4, UA, FA, -1), E = [R[0], R[1]], H = [R[2], R[3]]; // hands on the seat handles
      const C = P(L[2], L[3], 52, 3), a = P(C[0], C[1], -38, 13), b = P(C[0], C[1], 142, 9);
      return { b: pack([T[0], T[1], L[2], L[3], L[0], L[1], hip[0], hip[1]], S, E, H), f: none, h: P(hip[0], hip[1], t, TL + NL),
        e: none, k: none, s: 0, m: [a[0], a[1], b[0], b[1]] };
    }
    case 'rdl': {
      const hx = mix(51, 41, p), hy = mix(AY - 38.4, 76, p), t = mix(2, 80, p);
      const L = stand(hx, hy, 54, 6);
      const S = P(hx, hy, t, TL), E = P(S[0], S[1], 179, UA), H = P(E[0], E[1], 179, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(hx, hy, t, TL + NL), e: [H[0], H[1], 0], k: none, s: 0, m: none };
    }
    case 'row': {
      const L = stand(42, 77, 54, 6), t = 72;
      const S = P(42, 77, t, TL), E = P(S[0], S[1], 180 + 68 * p, UA), H = P(E[0], E[1], 180 - 8 * p, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(42, 77, t, TL + NL), e: [H[0], H[1], 0], k: none, s: 0, m: none };
    }
    case 'press': {
      const L = stand(48, AY - 38.2, 52, 8), t = 6;
      const S = P(48, AY - 38.2, t, TL);
      const R = IK(S[0], S[1], S[0] + mix(6, 29, p), S[1] + mix(6, 3, p), UA, FA, 1);
      return { b: pack(L.n, S, R, [R[2], R[3]]), f: L.f, h: P(48, AY - 38.2, t, TL + NL), e: [R[2], R[3], 0], k: [6, 44, R[2], R[3]], s: p, m: none };
    }
    case 'crunch': {
      const hip = [54, F - 7], t = -84 + 30 * p;
      const L = IK(hip[0], hip[1], 76, AY + 1, TH, SH, -1);
      const S = P(hip[0], hip[1], t, TL), Hd = P(hip[0], hip[1], t, TL + NL);
      const E = P(S[0], S[1], t + 70, 10), H = [Hd[0] - 2, Hd[1] + 2];
      return { b: pack([L[2] + FT, L[3] + 2.5, L[2], L[3], L[0], L[1], hip[0], hip[1]], S, E, H), f: none, h: Hd, e: none, k: none, s: 0, m: none };
    }
    case 'plank': {
      const phi = 78.5 + 0.5 * Math.sin((c * Math.PI * 2) / 3.2), A = [16, AY + 0.5];
      const K = P(A[0], A[1], phi, SH), hip = P(A[0], A[1], phi, LEG), S = P(hip[0], hip[1], phi, TL);
      const E = [S[0], F - 3], H = [S[0] + 14, F - 3];
      return { b: pack([A[0] + 3, F, A[0], A[1], K[0], K[1], hip[0], hip[1]], S, E, H), f: none, h: P(hip[0], hip[1], phi, TL + NL),
        e: none, k: none, s: 0, m: none };
    }
    case 'hang':
    case 'legraise':
    case 'kneeraise': {
      const sway = m === 'hang' ? 3.5 * Math.sin((c * Math.PI * 2) / 4.4) : 0;
      const H = [60, 14], S = P(H[0], H[1], 184 + sway, UA + FA - 0.5);
      const E = [(S[0] + H[0]) / 2 + 0.8, (S[1] + H[1]) / 2];
      const hip = P(S[0], S[1], 180 + sway * 0.6, TL);
      const lift = m === 'hang' ? 0 : 90 * p;
      const th = (m === 'hang' ? 172 : 182) + sway * 0.3 - lift, sh = m === 'kneeraise' ? 186 + sway * 0.3 : m === 'hang' ? 210 + sway * 0.3 : th + 4;
      const K = P(hip[0], hip[1], th, TH), A = P(K[0], K[1], sh, SH), T = P(A[0], A[1], sh - 25, FT * 0.8);
      return { b: pack([T[0], T[1], A[0], A[1], K[0], K[1], hip[0], hip[1]], S, E, H), f: none, h: P(S[0], S[1], -10 + sway, NL), e: none, k: none, s: 0, m: none };
    }
    case 'walk':
    case 'run':
    case 'bike': {
      if (m === 'bike') {
        const w = (c * Math.PI * 2) / 0.95, hip = [44, 66], t = 32;
        const S = P(hip[0], hip[1], t, TL), R = IK(S[0], S[1], 72, 58, UA, FA, 1);
        const pn = [60 + 7 * Math.cos(w), 98 + 7 * Math.sin(w)], pf = [60 - 7 * Math.cos(w), 98 - 7 * Math.sin(w)];
        const n = IK(hip[0], hip[1], pn[0], pn[1], TH, SH, -1), f = IK(hip[0], hip[1], pf[0], pf[1], TH, SH, -1);
        return { b: pack([n[2] + FT, n[3] + 1, n[2], n[3], n[0], n[1], hip[0], hip[1]], S, R, [R[2], R[3]]),
          f: [f[2] + FT, f[3] + 1, f[2], f[3], f[0], f[1], hip[0], hip[1]], h: P(hip[0], hip[1], t, TL + NL), e: none, k: none, s: 0, m: none };
      }
      const run = m === 'run', w = (c * Math.PI * 2) / (run ? 0.72 : 1.15);
      const amp = run ? 34 : 22, flex = run ? 75 : 30, t = run ? 10 : 4;
      const hip = [run ? 54 : 52, AY - 38.3 - (run ? 2.5 : 1.1) * Math.abs(Math.sin(w))];
      const leg = (sg: number) => {
        const th = 180 + sg * amp * Math.sin(w), sh = th + 6 + flex * Math.max(0, -sg * Math.cos(w));
        const K = P(hip[0], hip[1], th, TH), A = P(K[0], K[1], sh, SH), T = P(A[0], A[1], sh - 90, FT);
        return [T[0], T[1], A[0], A[1], K[0], K[1], hip[0], hip[1]];
      };
      const S = P(hip[0], hip[1], t, TL);
      const arm = (sg: number) => {
        const ua = 180 - sg * (run ? 40 : 20) * Math.sin(w), E = P(S[0], S[1], ua, UA), H = P(E[0], E[1], ua - (run ? 85 : 20), FA);
        return [E[0], E[1], H[0], H[1]];
      };
      const an = arm(1), af = arm(-1);
      return { b: pack(leg(1), S, [an[0], an[1]], [an[2], an[3]]), f: [...leg(-1), S[0], S[1], af[0], af[1], af[2], af[3]],
        h: P(hip[0], hip[1], t, TL + NL), e: none, k: none, s: 0, m: none };
    }
    case 'hammer':
    case 'curl':
    default: {
      const L = stand(50, AY - 38.2, 52, 6), t = 1 - 5 * p;
      const S = P(50, AY - 38.2, t, TL), E = P(S[0], S[1], 178 - 10 * p, UA), fa = 174 - 148 * p, H = P(E[0], E[1], fa, FA);
      return { b: pack(L.n, S, E, H), f: L.f, h: P(50, AY - 38.2, t, TL + NL), e: [H[0], H[1], fa], k: none, s: 0, m: none };
    }
  }
}

const line = (v: number[], from: number, n: number) => {
  'worklet';
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${v[from + i * 2].toFixed(1)} ${v[from + i * 2 + 1].toFixed(1)}`;
  return d;
};

const GREY = 'rgba(255,255,255,0.26)';
const DIM = 'rgba(255,255,255,0.09)';

// the machine around the figure, which doesn't move
function Rig({ m }: { m: Move }) {
  const g = { stroke: GREY, strokeWidth: 3.5, strokeLinecap: 'round' as const, fill: 'none' };
  const stack = (x: number) => <Line x1={x} y1={20} x2={x} y2={F} {...g} strokeWidth={2} />;
  switch (m) {
    case 'pulldown':
      return (<>
        <Path d={`M50 12H100V${F}`} {...g} /><Circle cx={50} cy={12} r={3.5} {...g} />
        <Path d={`M34 95H62M47 95V${F}M60 84H74`} {...g} strokeWidth={5} />
      </>);
    case 'cablerow':
      return (<>
        <Path d={`M22 96H54M38 96V${F}M77 86V104`} {...g} strokeWidth={5} /><Circle cx={84} cy={92} r={3.5} {...g} />{stack(98)}
      </>);
    case 'facepull':
      return (<><Circle cx={104} cy={40} r={3.5} {...g} />{stack(110)}</>);
    case 'pushdown':
      return (<><Path d={`M64 10H104V${F}`} {...g} /><Circle cx={64} cy={10} r={3.5} {...g} /></>);
    case 'press':
      return (<><Circle cx={6} cy={44} r={3.5} {...g} /></>);
    case 'bench':
    case 'dbbench':
      return <Path d={`M16 93H84M26 93V${F}M74 93V${F}`} {...g} strokeWidth={5} />;
    case 'incline':
      return <Path d={`M52 97H74M62 97V${F}M58 96L32 77`} {...g} strokeWidth={5} />;
    case 'legpress':
      return <Path d={`M36 100H54M44 100V${F}M38 99L12 85M70 92L104 66`} {...g} strokeWidth={5} />;
    case 'crunch':
      return <Line x1={10} y1={F - 1} x2={92} y2={F - 1} {...g} strokeWidth={5} />;
    case 'hang':
    case 'legraise':
    case 'kneeraise':
      return (<><Path d={`M60 12H104V${F}`} {...g} /><Circle cx={60} cy={12} r={3.2} fill={GREY} /></>);
    case 'walk':
      return <Path d={`M12 ${F - 0.5}H96L94 58L82 60`} {...g} />;
    case 'bike':
      return (<>
        <Path d={`M38 66H50M46 68L54 98H78M78 98L74 60M74 60L66 58M34 ${F - 1}H92M54 98L48 ${F - 1}M78 98L86 ${F - 1}`} {...g} />
        <Circle cx={80} cy={96} r={10} {...g} strokeWidth={2.5} />
      </>);
    default:
      return null;
  }
}

/** The figure doing `move`. `color` is the body aspect's; the rest is grey. */
export function Lifter({ move, size, color, playing = true, hold = REP * 0.37 }: { move: Move; size: number; color: string; playing?: boolean; hold?: number }) {
  const reduce = useReducedMotion();
  const clock = useSharedValue(0);
  const fc = useFrameCallback((f) => {
    clock.value += Math.min(0.05, (f.timeSincePreviousFrame ?? 16) / 1000);
  }, false);
  useEffect(() => {
    clock.set(reduce || !playing ? hold : 0); // still: the top of the rep unless told otherwise
    fc.setActive(!reduce && playing);
  }, [move, reduce, playing, hold, clock, fc]);

  const pz = useDerivedValue(() => pose(move, clock.value));
  const near = useAnimatedProps(() => ({ d: line(pz.value.b, 0, 7) }));
  const far = useAnimatedProps(() => {
    const f = pz.value.f;
    return { d: f.length ? line(f, 0, 4) + (f.length > 8 ? line(f, 8, 3) : '') : 'M0 0' };
  });
  const head = useAnimatedProps(() => ({ cx: pz.value.h[0], cy: pz.value.h[1] }));
  const cable = useAnimatedProps(() => {
    const k = pz.value.k;
    return k.length ? { x1: k[0], y1: k[1], x2: k[2], y2: k[3], opacity: 1 } : { x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0 };
  });
  const part = useAnimatedProps(() => {
    const v = pz.value.m;
    return v.length ? { x1: v[0], y1: v[1], x2: v[2], y2: v[3], opacity: 1 } : { x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0 };
  });
  const stackP = useAnimatedProps(() => ({ y1: F - 3 - 12 * pz.value.s, y2: F - 17 - 12 * pz.value.s }));
  const held = useAnimatedProps(() => {
    const e = pz.value.e;
    if (!e.length) return { d: 'M0 0' };
    if (move === 'hammer' || move === 'raise' || move === 'dbbench' || move === 'incline') {
      const a = P(e[0], e[1], e[2] + 90, 6), b = P(e[0], e[1], e[2] - 90, 6); // a dumbbell across the hand
      return { d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}` };
    }
    return { d: `M${e[0].toFixed(1)} ${e[1].toFixed(1)}h0.01` };
  });
  const plate = move === 'curl' || move === 'squat' || move === 'rdl' || move === 'row' || move === 'ohp' || move === 'bench';
  const handle = move === 'cablerow' || move === 'facepull' || move === 'pushdown' || move === 'press';
  const stackX = move === 'pulldown' ? 100 : move === 'cablerow' ? 98 : move === 'facepull' ? 110 : move === 'press' ? 6 : 0;
  const width = 6;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Line x1={4} y1={F + 1.5} x2={116} y2={F + 1.5} stroke={DIM} strokeWidth={1.5} strokeLinecap="round" />
      <Rig m={move} />
      {stackX ? <ALine animatedProps={stackP} x1={stackX} x2={stackX} stroke={GREY} strokeWidth={9} strokeLinecap="round" /> : null}
      <ALine animatedProps={cable} stroke={GREY} strokeWidth={1.5} />
      <APath animatedProps={far} stroke={color} strokeOpacity={0.38} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <APath animatedProps={near} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ACircle animatedProps={head} r={6.6} fill={color} />
      <ALine animatedProps={part} stroke={GREY} strokeWidth={4.5} strokeLinecap="round" />
      {plate ? <APath animatedProps={held} stroke="#9AA0A8" strokeWidth={move === 'bench' || move === 'ohp' || move === 'curl' ? 13 : 16} strokeLinecap="round" fill="none" /> : null}
      {handle ? <APath animatedProps={held} stroke="#9AA0A8" strokeWidth={5} strokeLinecap="round" fill="none" /> : null}
      {!plate && !handle ? <APath animatedProps={held} stroke="#9AA0A8" strokeWidth={5.5} strokeLinecap="round" fill="none" /> : null}
    </Svg>
  );
}
