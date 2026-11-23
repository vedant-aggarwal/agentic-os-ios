// The pet's behaviour: everything that moves, as springs and small physics, stepped at a fixed rate.
// Inputs come from the app (mood, sadness, rubbing, the finger, reactions); out() packs the shader's uniforms.
import { K, EYE_R, GROUND, tearPath, facePoint, EAR_P, EAR_UP, EAR_FRONT } from './rig.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
/** 0 → 1 → 0 over a span: up over `a`, held, down over `c`, total `d`. */
const env = (t, a, d, c) => (t < 0 || t > d ? 0 : t < a ? easeInOut(t / a) : t > d - c ? easeInOut((d - t) / c) : 1);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Sp {
  constructor(x = 0) { this.x = x; this.v = 0; }
  to(target, k, c, dt) { this.v += (k * (target - this.x) - c * this.v) * dt; this.x += this.v * dt; return this.x; }
}

// ── matrices (row-major in JS, uploaded column-major) ───────────────────────────────────────────────────
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const tr = (A) => [0, 1, 2].map((i) => [A[0][i], A[1][i], A[2][i]]);
const gl = (A) => [A[0][0], A[1][0], A[2][0], A[0][1], A[1][1], A[2][1], A[0][2], A[1][2], A[2][2]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ── faces ───────────────────────────────────────────────────────────────────────────────────────────────
// Every face is a set of these. lidU/lidL: how open the upper and lower lid are (1 open, 0 shut on the closed line);
// arc: the closed line's curve (+ a relaxed curve, - the happy ^ shape); tilt: + inner corners down (cross).
const NEUTRAL = {
  lidU: 1.0, lidL: 0.96, arc: 0.22, tilt: 0, browIn: 0, knit: 0,
  mW: 0.14, mOpen: 0, mCurve: 0.25, mCat: 0.15, mPucker: 0, mSide: 0, mQuiver: 0, mTongue: 0,
  earUp: 0, earOut: 0, earBack: 0,
  sy: 1, leanZ: 0, pitch: 0,
  pupil: 0.46, flush: 0.12, puff: 0.3, fluff: 0.65, bristle: 0, wet: 0,
  warmth: 0.45, expo: 1.0, gloom: 0, angerTint: 0,
};
const KEYS = Object.keys(NEUTRAL);
const POSE = {
  joy: { lidU: 1.0, lidL: 0.45, arc: -0.6, mW: 0.25, mOpen: 0.2, mCurve: 1.0, mCat: 0, earUp: 0.35, sy: 1.035, pupil: 0.48, flush: 0.5, puff: 0.95, fluff: 0.95, warmth: 0.7, expo: 1.06 },
  wired: { lidU: 1.1, lidL: 1.0, pupil: 0.5, earUp: 0.5, sy: 1.05, browIn: 0.2, mOpen: 0.06 },
  content: { lidU: 0.82, lidL: 0.34, arc: -0.75, mW: 0.18, mCurve: 0.85, mCat: 0.7, earUp: -0.05, earOut: 0.2, sy: 0.985, flush: 0.38, puff: 0.75, warmth: 0.62 },
  sleepy: { lidU: 0.4, lidL: 0.92, arc: 0.32, mW: 0.11, mCurve: -0.05, mCat: 0, earOut: 0.5, earUp: -0.35, sy: 0.95, leanZ: -0.03, pitch: -0.12, fluff: 0.45, warmth: 0.35, expo: 0.94 },
  sad: { lidU: 0.74, lidL: 0.9, tilt: -0.05, browIn: 0.9, mW: 0.15, mCurve: -0.9, mCat: 0, mQuiver: 0.12, earOut: 0.85, earUp: -0.7, sy: 0.94, leanZ: -0.05, pitch: -0.15, fluff: 0.25, gloom: 0.45, warmth: 0.25, expo: 0.92, pupil: 0.46 },
  angry: { lidU: 0.62, lidL: 0.8, tilt: 0.5, knit: 1, browIn: -0.3, mW: 0.17, mCurve: -0.7, mCat: 0, mOpen: 0.04, earBack: 0.95, earUp: 0.1, sy: 1.04, flush: 0.3, bristle: 1, pupil: 0.3, angerTint: 1, warmth: 0.62 },
  bliss: { lidU: 0, lidL: 0, arc: -0.85, mW: 0.2, mCurve: 0.9, mCat: 1, mOpen: 0.05, earBack: 0.55, earOut: 0.3, earUp: -0.1, flush: 0.95, puff: 1, fluff: 1, warmth: 0.78, expo: 1.05 },
  worry: { lidU: 1.0, lidL: 0.9, tilt: -0.05, browIn: 1, mCurve: -0.4, mW: 0.11, mCat: 0, mPucker: 0.25, earBack: 0.45, earOut: 0.35, pupil: 0.5 },
  think: { lidU: 0.86, lidL: 0.78, mW: 0.1, mPucker: 0.6, mSide: 0.6, mCurve: -0.12, mCat: 0, knit: 0.35, earBack: 0.15 },
  misery: { lidU: 0.55, lidL: 0.72, tilt: -0.1, browIn: 1, mCurve: -1, mCat: 0, mOpen: 0.18, mQuiver: 0.9, mW: 0.19, earOut: 1.15, earUp: -0.95, sy: 0.9, leanZ: -0.07, pitch: -0.15, wet: 1, fluff: 0.12, gloom: 1, warmth: 0.15, expo: 0.88 },
};
function blendAdd(out, pose, w) { if (w <= 0) return; for (const k in pose) out[k] += (pose[k] - NEUTRAL[k]) * w; }
function blendTo(out, pose, w) { if (w <= 0) return; for (const k in pose) out[k] = lerp(out[k], pose[k], w); }

export function createSim({ big = true, seed = 7 } = {}) {
  let rnd = rng(seed);
  const R = (a, b) => a + rnd() * (b - a);

  // ── inputs ──
  const inp = { sad: 0, drive: 0, val: 0, nrg: 0, joy: 0, worry: 0, anger: 0, think: 0, reduce: false, shadow: 1, still: false };
  const finger = { x: 0, y: 0, on: false, at: -1e9, since: -1e9 };
  const rub = { on: false, fx: 0, fy: 0, t0: 0, last: 0, end: -1e9, strong: false, nuzzle: new Sp() };

  // ── state ──
  let t = 0, acc = 0;
  const face = {}; for (const k of KEYS) face[k] = new Sp(NEUTRAL[k]);
  const head = { yaw: new Sp(), pitch: new Sp(), roll: new Sp() };
  const eye = { x: new Sp(), y: new Sp(), tx: 0, ty: 0 };
  const root = { y: 0, vy: 0, x: new Sp(), air: false };
  const sq = new Sp(1);
  const lean = { x: new Sp(), z: new Sp() };
  const bliss = new Sp();
  const ears = [0, 1].map(() => ({ out: new Sp(), back: new Sp(), up: new Sp(), twist: new Sp() }));
  let breathPh = 0, breathAmp = new Sp(1);
  const look = { yaw: 0, pitch: 0, until: 0, micro: 0, microX: 0, microY: 0 };
  const blink = { next: 1.2, start: -1, close: 0.06, hold: 0.03, open: 0.14, again: false, value: 0 };
  let actions = [];
  const hops = []; // pending hops: { at, h, heavy }
  let antic = 0; // anticipation squash in progress
  const hearts = [], sparks = [];
  const tears = [0, 1].map((i) => ({ phase: 'idle', t0: 0, next: 0.6 + i * 1.7, s: 0, r: 0, wet: 0, fall: 0, pos: [0, 0, 0], start: [0, 0] }));
  let lastSigh = 0, nextSigh = 6, lastTwitch = 0, nextTwitch = 3, nextBounce = 0, nextNod = 9, nod = -1, nextBlep = 12, blep = -1;
  let haptic = null; // set by main: (kind) => void
  let busyUntil = 0; // something fast is going on (for frame pacing)
  let prevYaw = 0, prevYawV = 0;

  // ── reactions ──
  const REACT = {
    happy: { d: 1.7, go: () => { hop(0.16, 0.05); earKick(0, 6); sparkle(1); }, f: (u, o) => { const e = env(u, 0.15, 1.7, 0.6); o.arc -= 0.35 * e; o.lidL -= 0.3 * e; o.mCurve += 0.4 * e; o.mOpen += 0.22 * e; o.roll += 0.1 * e; } },
    excited: { d: 2.3, go: () => { hop(0.42, 0.12, true); hop(0.2, 0.86); earKick(0, 9); sparkle(3, 0.3); }, f: (u, o) => { const e = env(u, 0.12, 2.3, 0.7); o.lidU += 0.16 * e; o.pupil += 0.1 * e; o.mOpen += 0.5 * e; o.mCurve += 0.5 * e; o.mW += 0.05 * e; o.earUp += 0.5 * e; } },
    calm: { d: 2.6, go: () => { sigh(); }, f: (u, o) => { const e = env(u, 0.45, 2.6, 0.8); o.lidU -= 0.85 * env(u - 0.2, 0.4, 1.6, 0.6); o.lidL -= 0.5 * env(u - 0.2, 0.4, 1.6, 0.6); o.arc -= 0.7 * e; o.mCurve += 0.3 * e; o.mCat += 0.4 * e; o.earOut += 0.15 * e; } },
    proud: { d: 2.4, go: () => { sparkle(2, 0.35); hop(0.12, 1.25); }, f: (u, o) => { const e = env(u, 0.35, 2.4, 0.6); o.breath += 1.8 * e; o.sy += 0.045 * e; o.pitch += 0.2 * e - 0.12 * env(u - 1.1, 0.12, 0.35, 0.18); o.lidU -= 1.15 * e; o.lidL -= 0.95 * e; o.arc -= 0.8 * e; o.mCurve += 0.55 * e; o.mCat += 0.25 * e; o.earUp += 0.3 * e; o.flush += 0.25 * e; } },
    concerned: { d: 2.5, go: () => { blinkNow(true); }, f: (u, o) => { const e = env(u, 0.25, 2.5, 0.8); o.leanZ -= 0.04 * e; o.sy -= 0.02 * e; o.browIn += 0.9 * e; o.lidU += 0.08 * e; o.mCurve -= 0.4 * e; o.mPucker += 0.2 * e; o.earBack += 0.45 * e; o.roll += 0.1 * e; o.lookCam = e; } },
    sad: { d: 2.7, go: () => {}, f: (u, o) => { const e = env(u, 0.4, 2.7, 0.9); o.sy -= 0.06 * e - 0.025 * (env(u - 0.8, 0.06, 0.18, 0.1) + env(u - 1.15, 0.06, 0.18, 0.1)); o.pitch -= 0.2 * e; o.earOut += 0.6 * e; o.earUp -= 0.4 * e; o.browIn += 0.9 * e; o.mCurve -= 0.7 * e; o.mQuiver += 0.4 * e; o.lidU -= 0.2 * e; o.lookDown = e; } },
    tired: { d: 3.0, go: () => {}, f: (u, o) => { const y = env(u, 0.8, 1.7, 0.5); const after = env(u - 1.5, 0.4, 1.5, 0.6); o.mOpen += 1.0 * y; o.mPucker += 0.45 * y; o.mW += 0.03 * y; o.mCurve -= 0.25 * y; o.lidU -= 0.9 * y; o.lidL -= 0.85 * y; o.arc += 0.15 * y; o.sy += 0.07 * y - 0.04 * after; o.earBack += 0.5 * y; o.earUp += 0.3 * y - 0.3 * after; o.pitch += 0.16 * y; o.lidU -= 0.45 * after; } },
    angry: { d: 2.1, go: () => { hop(0.07, 0.15, false, true); }, f: (u, o) => { const e = env(u, 0.2, 2.1, 0.6); o.breath += 2.4 * e; o.sy += 0.04 * e; o.tilt += 0.62 * e; o.knit += 1.0 * e; o.browIn -= 0.3 * e; o.lidU -= 0.32 * e; o.lidL -= 0.12 * e; o.mCurve -= 1.0 * e; o.mCat -= 0.3 * e; o.mW += 0.03 * e; o.pupil -= 0.1 * e; o.earBack += 0.8 * e; o.bristle += 1 * e; o.angerTint += 0.8 * e; o.shake += env(u - 0.3, 0.05, 0.6, 0.15); } },
  };
  function react(face) {
    const r = REACT[face];
    if (!r) return;
    actions = actions.filter((a) => a.name !== face);
    actions.push({ name: face, t0: t, r });
    if (!inp.reduce) r.go();
    busyUntil = Math.max(busyUntil, t + r.d + 0.5);
  }

  function hop(h, delay = 0, big2 = false, heavy = false) {
    if (inp.reduce) return;
    hops.push({ at: t + delay, h, big: big2, heavy });
  }
  function earKick(axis, v) { for (const e of ears) e.up.v += v * (0.8 + 0.4 * rnd()); }
  function sparkle(n, delay = 0) {
    // glints just outside the silhouette, around the top, alternating sides
    const s0 = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? -s0 : s0;
      const a = Math.PI / 2 - side * R(0.45, 1.0);
      const r = R(1.18, 1.38);
      sparks.push({ t0: t + delay + i * 0.14, x: Math.cos(a) * r, y: 0.05 + Math.sin(a) * r, size: R(0.8, 1.2), life: 0.62 });
    }
    while (sparks.length > 4) sparks.shift();
  }
  function sigh() { lastSigh = t; actions.push({ name: 'sigh', t0: t, r: SIGH }); }
  const SIGH = { d: 2.6, f: (u, o) => { const inh = env(u, 0.9, 1.1, 0.2), exh = env(u - 0.9, 0.25, 1.7, 1.2); o.breath += 2.2 * inh - 1.6 * exh; o.sy += 0.02 * inh - 0.03 * exh; o.earUp += 0.15 * inh - 0.2 * exh; o.lidU -= 0.45 * exh; o.lidL -= 0.15 * exh; } };
  function blinkNow(dbl = false) { blink.start = t; blink.again = dbl; blink.close = 0.06; blink.hold = 0.03; blink.open = 0.14; }

  function heart() {
    hearts.push({ t0: t, x: R(-0.5, 0.5) * (big ? 1 : 1.5), y: R(0.62, 0.85), vx: R(-0.25, 0.25), ph: R(0, 6.28), spin: R(-1, 1) * 3.5, tilt: R(-0.35, 0.35), life: R(1.35, 1.7), s: R(0.85, 1.15) });
    while (hearts.length > 6) hearts.shift();
    busyUntil = Math.max(busyUntil, t + 2);
  }

  // ── the app's events ──
  function setState(s) {
    for (const k of ['sad', 'drive', 'val', 'nrg', 'joy', 'worry', 'anger', 'think']) if (typeof s[k] === 'number') inp[k] = s[k];
    if (typeof s.reduce === 'boolean') inp.reduce = s.reduce;
    if (typeof s.shadow === 'number') inp.shadow = s.shadow;
    if (typeof s.still === 'boolean') inp.still = s.still;
  }
  function setGaze(x, y, on) {
    if (on && !finger.on && t - finger.at > 1.2) notice();
    finger.x = x; finger.y = y; finger.on = on; finger.at = t;
    busyUntil = Math.max(busyUntil, t + 1.5);
  }
  function notice() {
    actions.push({ name: 'notice', t0: t, r: { d: 1.2, f: (u, o) => { const e = env(u, 0.08, 1.2, 0.6); o.lidU += 0.1 * env(u, 0.06, 0.5, 0.3); o.earUp += 0.3 * e; o.roll += o.noticeSide * 0.12 * e; } } });
    for (const e of ears) e.up.v += 5;
  }
  let noticeSide = 1;
  function setRub(on, fx = 0, fy = 0, strong = false, dx = 0) {
    if (on && !rub.on) { rub.on = true; rub.t0 = t; }
    if (on) {
      rub.fx = clamp(fx, -1, 1); rub.fy = clamp(fy, -1, 1); rub.last = t;
      rub.nuzzle.v += clamp(dx, -20, 20) * 0.06;
    }
    if (!on && rub.on) {
      rub.on = false; rub.end = t; rub.strong = strong;
      if (strong) {
        actions.push({ name: 'afterglow', t0: t, r: AFTER });
        if (!inp.reduce) { hop(0.15, 1.15); }
      }
    }
    busyUntil = Math.max(busyUntil, t + 3);
  }
  const AFTER = { d: 2.4, f: (u, o) => { const w = env(u - 0.45, 0.1, 0.75, 0.2); o.shimmy += w; o.joyPulse = Math.max(o.joyPulse, env(u - 0.6, 0.3, 1.8, 0.6)); } };

  // ── one fixed step ──
  function step(dt) {
    t += dt;
    const reduce = inp.reduce;
    const sad = inp.sad;

    // reactions overlay
    const o = { roll: 0, breath: 0, shake: 0, shimmy: 0, lookCam: 0, lookDown: 0, joyPulse: 0, noticeSide };
    for (const k of KEYS) o[k] = 0;
    actions = actions.filter((a) => t - a.t0 < a.r.d);
    for (const a of actions) a.r.f(t - a.t0, o);

    // mood
    const idleV = 0.38 - 1.6 * sstep(0.0, 1.0, sad) * 1.0;
    const idleE = 0.12 - 0.85 * sad;
    let V = lerp(clamp(idleV, -1, 1), inp.val, inp.drive);
    let E = lerp(idleE, inp.nrg, inp.drive);
    // joy left from a rub fades into the background while the logger has the face (its own reactions still show)
    const J = clamp01(Math.max(inp.joy * (1 - 0.7 * inp.drive), o.joyPulse));
    V = lerp(V, 1, J * 0.85);
    E = lerp(E, Math.max(E, 0.3), J * 0.6);
    const W = clamp01(inp.worry), A = clamp01(inp.anger), T = clamp01(inp.think);
    const M = clamp01((1 - inp.drive) * sstep(0.72, 0.97, sad) * (1 - J) + inp.drive * sstep(-0.7, -1.0, inp.val) * sstep(-0.1, -0.9, inp.nrg) * 0.55);

    // bliss: the finger is on it; it closes its eyes a beat after the touch, and opens them a while after it lifts
    const rubbing = rub.on && t - rub.last < 1.6; // a resting finger still counts
    const bTarget = rubbing ? sstep(0.08, 0.3, t - rub.t0) : rub.strong && t - rub.end < 0.85 ? 1 : 0;
    bliss.to(bTarget, rubbing ? 90 : 26, rubbing ? 19 : 10, dt);
    const B = clamp01(bliss.x);

    // the face
    const f = { ...NEUTRAL };
    blendAdd(f, POSE.joy, Math.max(V, 0) * sstep(-0.75, 0.25, E));
    blendAdd(f, POSE.content, Math.max(V, 0) * sstep(0.05, -0.85, E));
    blendAdd(f, POSE.wired, Math.max(E, 0) * 0.85);
    blendAdd(f, POSE.sleepy, Math.max(-E, 0) * (1 - Math.max(V, 0)) * 0.9);
    blendAdd(f, POSE.sad, Math.pow(Math.max(-V, 0), 0.8) * sstep(0.75, -0.3, E));
    blendAdd(f, POSE.angry, Math.max(-V, 0) * sstep(-0.25, 0.65, E));
    blendAdd(f, POSE.angry, A * 0.9);
    blendTo(f, POSE.worry, W * 0.8);
    blendTo(f, POSE.think, T * 0.85);
    blendTo(f, POSE.misery, M);
    blendTo(f, POSE.bliss, B);
    for (const k of KEYS) f[k] += o[k];
    // the dull, cold light is for a pet left alone; a low mood he logs gets its face, not the grey
    f.gloom *= 1 - 0.6 * inp.drive;

    // idle life: sighs when low, nodding off when drained, a tongue blep when content
    if (!reduce && !inp.still && t > nextSigh) {
      if ((sad > 0.2 && inp.drive < 0.5) || (V < -0.3 && E < 0)) sigh();
      nextSigh = t + R(6, 12) * (sad > 0.5 ? 0.8 : 1.3);
    }
    if (E < -0.55 && !rubbing && !inp.still && t > nextNod && nod < 0) { nod = t; nextNod = t + R(7, 11); }
    if (nod >= 0) {
      const u = t - nod;
      const drop = sstep(0, 2.2, u) * (u < 2.4 ? 1 : 0);
      f.lidU *= 1 - 0.9 * drop; f.pitch -= 0.16 * drop;
      if (u > 2.4) { const w = env(u - 2.4, 0.05, 0.5, 0.3); f.lidU += 0.25 * w; f.earUp += 0.4 * w; }
      if (u > 3.0) nod = -1;
    }
    const contentNow = V > 0.3 && E < -0.1 && !rubbing;
    if (contentNow && !inp.still && t > nextBlep && blep < 0) { blep = t; nextBlep = t + R(9, 16); }
    if (blep >= 0) { const u = t - blep; f.mTongue += env(u, 0.18, 1.4, 0.3); f.mOpen += 0.03 * env(u, 0.18, 1.4, 0.3); if (u > 1.5) blep = -1; }

    // blinks
    const bliss01 = B > 0.6;
    if (blink.start < 0 && t > blink.next && !bliss01 && !inp.still) blinkNow(rnd() < 0.18);
    let bv = 0;
    if (blink.start >= 0) {
      const u = t - blink.start;
      const { close, hold, open } = blink;
      bv = u < close ? easeInOut(u / close) : u < close + hold ? 1 : u < close + hold + open ? 1 - easeOut((u - close - hold) / open) : 0;
      if (u > close + hold + open) {
        blink.start = -1;
        if (blink.again) { blink.again = false; blink.next = t + 0.12; }
        else blink.next = t + R(2.2, 5.5) * (sad > 0.4 ? 1.3 : 1) * (V > 0.5 ? 0.85 : 1);
        // a content pet gives a slow cat blink now and then
        if (contentNow && rnd() < 0.35) { blink.close = 0.32; blink.hold = 0.35; blink.open = 0.45; } else { blink.close = 0.06; blink.hold = 0.03 + (sad > 0.5 ? 0.05 : 0); blink.open = 0.14 + (sad > 0.5 ? 0.1 : 0); }
      }
    }
    blink.value = bv;

    // where it looks
    const fingerOn = finger.on || t - finger.at < 0.9;
    let ly, lp, quick = false;
    if (rubbing) { ly = rub.fx * 0.3; lp = -rub.fy * 0.25; }
    else if (fingerOn) {
      const Z = 230;
      ly = clamp(Math.atan2(finger.x, Z), -0.95, 0.95);
      lp = clamp(Math.atan2(-finger.y, Z), -0.62, 0.6);
      quick = true;
    } else if (T > 0.3) {
      if (t > look.until) { look.yaw = (rnd() < 0.5 ? -1 : 1) * R(0.12, 0.3); look.pitch = R(0.38, 0.52); look.until = t + R(1.2, 2.2); }
      ly = look.yaw; lp = look.pitch;
    } else if (inp.still) { ly = 0; lp = 0.06 - 0.3 * sad;
    } else {
      if (t > look.until) {
        const cam = rnd() < (V > 0.3 ? 0.65 : 0.5);
        look.yaw = cam ? R(-0.05, 0.05) : R(-0.6, 0.6);
        look.pitch = cam ? 0.08 : R(-0.35, 0.28) - 0.25 * sad;
        look.until = t + R(0.9, 3.2) * (sad > 0.5 ? 1.6 : 1) * (E > 0.5 ? 0.7 : 1);
        if (Math.abs(look.yaw - eye.tx) > 0.4 && rnd() < 0.5 && blink.start < 0) blinkNow();
      }
      ly = look.yaw; lp = look.pitch;
    }
    if (o.lookCam > 0) { ly = lerp(ly, 0, o.lookCam); lp = lerp(lp, 0.08, o.lookCam); }
    if (o.lookDown > 0) { lp = lerp(lp, -0.45, o.lookDown); }
    // micro saccades
    if (t > look.micro && !inp.still) { look.micro = t + R(0.25, 0.8); look.microX = R(-0.025, 0.025); look.microY = R(-0.02, 0.02); }
    ly += look.microX; lp += look.microY;
    eye.tx = ly; eye.ty = lp;

    // head follows the eyes, a beat behind
    const hk = reduce ? 20 : 42;
    const hYaw = head.yaw.to(ly * 0.62 + rub.nuzzle.x * 0.0, hk, 2 * Math.sqrt(hk), dt);
    const hPitch = head.pitch.to(lp * 0.4 + f.pitch, hk, 2 * Math.sqrt(hk), dt);
    const contentW = Math.max(V, 0) * sstep(0.05, -0.85, E) * (1 - T);
    let rollT = o.roll + contentW * 0.09 + (T > 0.3 ? 0.14 * T : 0) + (rubbing ? -rub.fx * 0.22 : 0) - sad * 0.04 + rub.nuzzle.x * 0.6;
    if (o.shimmy > 0 && !reduce) rollT += Math.sin((t - rub.end) * 26) * 0.12 * o.shimmy;
    head.roll.to(rollT, 60, 11, dt);
    rub.nuzzle.to(0, 30, 6, dt);
    // eyes jump (saccade), clamped to what the sockets allow
    const ek = quick ? 1600 : 1100;
    eye.x.to(clamp(ly - hYaw, -0.55, 0.55), ek, 2 * Math.sqrt(ek), dt);
    eye.y.to(clamp(lp - (hPitch - f.pitch), -0.42, 0.45), ek, 2 * Math.sqrt(ek), dt);
    // head yaw acceleration swings the ears
    const yawV = (hYaw - prevYaw) / dt; const yawA = (yawV - prevYawV) / dt; prevYaw = hYaw; prevYawV = yawV;

    // breathing
    const rate = rubbing ? 0.42 : lerp(0.24, 0.42, clamp01(E)) * (E < 0 ? lerp(1, 0.72, -E) : 1);
    breathPh += dt * 2 * Math.PI * rate;
    breathAmp.to(sad > 0.4 ? 1.35 : 1, 4, 4, dt);
    const breath = reduce ? 0 : Math.sin(breathPh) * breathAmp.x;

    // hops
    for (let i = hops.length - 1; i >= 0; i--) {
      const h = hops[i];
      if (t >= h.at - 0.11 && t < h.at) antic = Math.max(antic, 1);
      if (t >= h.at && !root.air) {
        root.vy = Math.sqrt(2 * 22 * h.h); root.air = true; sq.v += 2.4 + h.h * 4; for (const e of ears) { e.out.v -= 3 + h.h * 6; }
        root.heavy = h.heavy; root.big = h.big; hops.splice(i, 1);
      } else if (t > h.at + 1.5) hops.splice(i, 1);
    }
    // a happy, wired pet bounces on its own
    const bouncy = Math.max(V, 0) * Math.max(E, 0);
    if (!reduce && bouncy > 0.3 && !root.air && t > nextBounce && hops.length === 0) { hop(0.06 + 0.1 * bouncy, 0.11); nextBounce = t + lerp(0.95, 0.55, bouncy); }
    if (root.air) {
      root.vy -= 22 * dt; root.y += root.vy * dt;
      if (root.y <= 0 && root.vy < 0) {
        const impact = -root.vy;
        root.y = 0; root.air = false; root.vy = 0;
        sq.v -= impact * (root.heavy ? 0.75 : 0.55);
        for (const e of ears) { e.out.v += impact * 3.2; e.up.v -= impact * 2.5; }
        if (haptic && (big || root.big) && impact > 1.2) haptic(root.heavy ? 'rigid' : impact > 2.6 ? 'light' : 'soft');
      }
    }
    // squash and stretch: a soft body on a spring
    let syT = f.sy;
    if (antic > 0) { syT = 0.84; antic -= dt / 0.11; }
    if (root.air) syT = root.vy > 0 ? 1.07 : 1.02;
    syT += o.sy;
    if (rubbing && !reduce) syT -= 0.03 + 0.006 * Math.sin(t * 95);
    sq.to(syT, reduce ? 400 : 260, reduce ? 40 : 13, dt);

    // lean and sway
    let lx = 0, lz = f.leanZ;
    if (rubbing) { lx = rub.fx * 0.17; lz += 0.05; }
    if (!reduce) {
      const swayW = Math.max(-E, 0) * 0.6 + (contentNow ? 0.5 : 0);
      lx += Math.sin(t * 0.9) * 0.045 * swayW;
      lx += ly * 0.04;
    }
    lean.x.to(lx, 50, 10, dt); lean.z.to(lz, 50, 10, dt);
    let rx = 0;
    if (!reduce) {
      const trem = Math.max(A, Math.max(-V, 0) * sstep(0.3, 0.9, E)) * 0.008;
      rx += (rnd() - 0.5) * 2 * trem;
      if (o.shake > 0) rx += Math.sin(t * 34) * 0.035 * o.shake;
    }
    root.x.to(rx, 400, 30, dt);

    // ears: springs with a little give, kicked by hops and head turns
    const twitchOK = !reduce && !rubbing && !inp.still;
    if (twitchOK && t > nextTwitch) {
      const e = ears[rnd() < 0.5 ? 0 : 1];
      if (rnd() < 0.5) e.back.v += R(9, 14); else e.out.v -= R(7, 11);
      nextTwitch = t + R(3, 9);
    }
    const ek2 = reduce ? 120 : 95, ec = reduce ? 2 * Math.sqrt(120) : 5.8;
    for (let i = 0; i < 2; i++) {
      const e = ears[i];
      const asym = T > 0.3 ? (i === 0 ? 0.18 : -0.12) * T : 0;
      e.up.to(f.earUp + asym, ek2, ec, dt);
      e.out.to(f.earOut + (sad > 0.85 && !inp.drive ? 0.05 * Math.sin(t * 0.7 + i) : 0), ek2, ec, dt);
      e.back.to(f.earBack, ek2, ec, dt);
      e.twist.v -= yawA * 0.0006 * (i === 0 ? 1 : -1);
      e.twist.to(0, ek2, ec, dt);
    }

    // tears: well up under the eye, run down the cheek, drip off
    for (let i = 0; i < 2; i++) {
      const tr2 = tears[i];
      const side = i === 0 ? 1 : -1;
      tr2.wet = Math.max(0, tr2.wet - dt / 6);
      if (tr2.phase === 'idle') {
        tr2.r = 0;
        if (M > 0.55 && t > tr2.next) { tr2.phase = 'well'; tr2.t0 = t; }
      } else if (tr2.phase === 'well') {
        const u = (t - tr2.t0) / 1.3;
        tr2.s = 0; tr2.r = 0.036 * easeOut(u) * (big ? 1 : 1.6);
        if (u >= 1) { tr2.phase = 'roll'; tr2.t0 = t; }
      } else if (tr2.phase === 'roll') {
        const u = (t - tr2.t0) / 1.7;
        tr2.s = u * u; tr2.r = lerp(0.036, 0.03, u) * (big ? 1 : 1.6); tr2.wet = 1;
        if (u >= 1) { tr2.phase = 'fall'; tr2.t0 = t; }
      } else if (tr2.phase === 'fall') {
        const u = (t - tr2.t0) / 0.45;
        tr2.fall = u; tr2.r = 0.03 * (1 - u * u) * (big ? 1 : 1.6);
        if (u >= 1) { tr2.phase = 'idle'; tr2.next = t + R(1.4, 3.6); tr2.fall = 0; }
      }
      if (tr2.phase !== 'idle') {
        const p = tearPath(side, Math.min(tr2.s, 1));
        const st = tearPath(side, 0);
        tr2.start = [st.p[0], st.p[1]];
        const fall = tr2.phase === 'fall' ? tr2.fall : 0;
        tr2.pos = [p.p[0] + p.n[0] * tr2.r * 0.55, p.p[1] + p.n[1] * tr2.r * 0.55 - fall * fall * 0.5, p.p[2] + p.n[2] * tr2.r * 0.55 + fall * 0.08];
      }
    }

    // the finger's dent
    face.flushRub = face.flushRub || new Sp();

    // settle the face params toward their targets (lids fast, the rest a touch slower)
    const fast = reduce ? 25 : 70, slow = reduce ? 14 : 26;
    for (const k of KEYS) {
      const kk = k === 'lidU' || k === 'lidL' || k === 'arc' ? fast * 2.2 : k.startsWith('m') ? fast : slow;
      face[k].to(f[k], kk, 2 * Math.sqrt(kk) * 0.92, dt);
    }

    // keep everything for out()
    cur.B = B; cur.breath = breath + face.puff.x * 0 + o.breath; cur.blink = bv; cur.M = M;
    cur.hYaw = hYaw; cur.hPitch = hPitch; cur.rubbing = rubbing; cur.V = V; cur.E = E;
  }
  const cur = { B: 0, breath: 0, blink: 0, M: 0, hYaw: 0, hPitch: 0, rubbing: false, V: 0, E: 0 };

  function advance(dtTotal) {
    acc += Math.min(dtTotal, 0.1);
    const h = 1 / 120;
    while (acc >= h) { step(h); acc -= h; }
  }

  // ── uniforms ──
  function earMatrix(i) {
    const e = ears[i];
    const side = i === 0 ? 1 : -1;
    const m = (v) => [v[0] * side, v[1], v[2]];
    const Y = m(EAR_UP), Z0 = m(EAR_FRONT);
    const X = norm(cross(Y, Z0).map((c) => c * side));
    const Z = cross(X, Y).map((c) => c * side);
    const F = [[X[0], Y[0], Z[0]], [X[1], Y[1], Z[1]], [X[2], Y[2], Z[2]]];
    const zAng = -clamp(e.out.x, -0.6, 1.5) + e.up.x * 0.22;
    const xAng = -clamp(e.back.x, -0.5, 1.2) + e.up.x * 0.18;
    const M = mul(mul(mul(F, rotZ(zAng)), rotX(xAng)), rotY(e.twist.x));
    return { inv: gl(tr(M)), p: [EAR_P[0] * side, EAR_P[1], EAR_P[2]] };
  }

  function out(view) {
    // view: { ox, oy, ppu, dpr, ptPerUnit, small }
    const fv = (k) => face[k].x;
    const blinkV = cur.blink;
    // lids: blink shuts both; looking down lowers the upper lid
    const gy = eye.y.x;
    let lidU = clamp(fv('lidU') - Math.max(0, -gy) * 0.45 + Math.max(0, gy) * 0.15, 0, 1.15) * (1 - blinkV);
    let lidL = clamp(fv('lidL'), 0, 1.1) * (1 - blinkV * 0.95);
    let arc = fv('arc');
    if (blinkV > 0) arc = lerp(arc, Math.min(arc, 0.25), blinkV);
    const tilt = fv('tilt');
    const thinkAsym = clamp01(inp.think) * 0.12;
    const lidA = [Math.min(1.15, lidU + thinkAsym), lidL, arc, tilt];
    const lidB = [Math.max(0, lidU - thinkAsym * 0.8), lidL, arc, tilt];
    // head rotation
    const Rm = mul(mul(rotY(cur.hYaw), rotX(-cur.hPitch)), rotZ(-head.roll.x));
    const headInv = gl(tr(Rm));
    const eA = earMatrix(0), eB = earMatrix(1);
    // the dent where the finger presses
    let dent = [0, 0, 0, 0];
    const rubAmt = cur.rubbing ? 1 : 0;
    if (rubAmt > 0) {
      const c = facePoint(clamp(rub.fx, -1, 1) * 0.5, -clamp(rub.fy, -1, 1) * 0.42 - 0.05);
      const n = norm([c[0], c[1] * 1.1, c[2]]);
      const depth = 0.035;
      dent = [c[0] + n[0] * (0.16 - depth), c[1] + n[1] * (0.16 - depth), c[2] + n[2] * (0.16 - depth), 1];
    }
    const sy = sq.x;
    const U = {
      uRoot: [root.x.x, root.y, inp.shadow, 0],
      uShape: [sy, lean.x.x, lean.z.x, cur.breath],
      uHeadInv: headInv,
      uLidA: lidA, uLidB: lidB,
      uBrow: [fv('browIn'), fv('browIn'), fv('knit'), 0],
      uGaze: [Math.tan(eye.x.x), Math.tan(eye.y.x), clamp(fv('pupil'), 0.18, 0.62), clamp01(fv('wet'))],
      uMouth: [clamp(fv('mW'), 0.06, 0.34), Math.max(0, fv('mOpen') - 0.09) / 0.91, clamp(fv('mCurve'), -1.1, 1.1), clamp01(fv('mCat'))],
      uMouth2: [clamp01(fv('mPucker')), clamp(fv('mSide'), -1, 1), clamp01(fv('mQuiver')), clamp01(fv('mTongue'))],
      uEarMA: eA.inv, uEarMB: eB.inv, uEarPA: eA.p, uEarPB: eB.p,
      uSkin: [clamp01(fv('flush')), clamp01(fv('puff')), clamp01(fv('fluff')), clamp01(fv('bristle'))],
      uDent: dent,
      uTearA: tears[0].phase !== 'idle' ? [...tears[0].pos, tears[0].r] : [0, 0, 0, 0],
      uTearB: tears[1].phase !== 'idle' ? [...tears[1].pos, tears[1].r] : [0, 0, 0, 0],
      uStreakA: [tears[0].start[0], tears[0].start[1], tears[0].phase === 'roll' || tears[0].phase === 'fall' ? tears[0].pos[0] : tears[0].start[0], tears[0].phase === 'roll' || tears[0].phase === 'fall' ? tears[0].pos[1] : tears[0].start[1] - 0.0],
      uStreakB: [tears[1].start[0], tears[1].start[1], tears[1].phase === 'roll' || tears[1].phase === 'fall' ? tears[1].pos[0] : tears[1].start[0], tears[1].phase === 'roll' || tears[1].phase === 'fall' ? tears[1].pos[1] : tears[1].start[1]],
      uWet: [tears[0].wet, tears[1].wet, 0, 0],
      uLight: [clamp01(fv('warmth')), fv('expo'), clamp01(fv('gloom')), clamp01(fv('angerTint'))],
    };
    // streak ends follow the drop while it runs, then stay where it left the face
    for (const [i, key] of [[0, 'uStreakA'], [1, 'uStreakB']]) {
      const tr2 = tears[i];
      if (tr2.phase === 'idle' && tr2.wet > 0) U[key] = [tr2.start[0], tr2.start[1], tr2.endX ?? tr2.start[0], tr2.endY ?? tr2.start[1]];
      if (tr2.phase === 'roll' || tr2.phase === 'fall') { tr2.endX = tr2.phase === 'fall' ? tr2.endX : tr2.pos[0]; tr2.endY = tr2.phase === 'fall' ? tr2.endY : tr2.pos[1]; U[key] = [tr2.start[0], tr2.start[1], tr2.endX, tr2.endY]; }
    }
    // hearts and sparkles, in device px
    const H = [], HB = [];
    const ptu = view.ptPerUnit, dpr = view.dpr;
    for (const h of hearts) {
      const a = t - h.t0;
      if (a > h.life) continue;
      const u = a / h.life;
      const riseUnits = view.small ? 24 / ptu : 1.35;
      const y = h.y + riseUnits * (1 - Math.exp(-a * 1.9)) / (1 - Math.exp(-h.life * 1.9));
      const x = h.x + h.vx * a + (inp.reduce ? 0 : Math.sin(a * 4.2 + h.ph) * 0.06);
      const pop = a < 0.24 ? 1 + 0.25 * Math.sin(Math.PI * clamp01(a / 0.24)) * (1 - a / 0.24) : 1;
      const grow = easeOut(a / 0.18);
      const fade = 1 - sstep(0.72, 1, u);
      const rUnits = view.small ? Math.max(0.16, 4.4 / ptu) : 0.17;
      const rpx = rUnits * view.ppu * h.s * grow * pop * lerp(0.7, 1, fade);
      const yy = inp.reduce ? h.y + 0.15 : y;
      H.push([view.ox + x * view.ppu, view.oy + (yy + root.y) * view.ppu, rpx, inp.reduce ? 0 : h.spin * a * 0.4 + Math.sin(a * 3 + h.ph) * 0.5]);
      HB.push([fade, h.tilt + Math.sin(a * 2.4 + h.ph) * 0.15, 0, 0]);
    }
    const nH = H.length;
    while (H.length < 6) { H.push([0, 0, 0, 0]); HB.push([0, 0, 0, 0]); }
    const S = [];
    for (const s of sparks) {
      const a = t - s.t0;
      if (a < 0 || a > s.life) continue;
      const k = Math.sin(Math.PI * a / s.life);
      S.push([view.ox + s.x * view.ppu, view.oy + (s.y + root.y) * view.ppu, Math.max(3 * dpr, 0.09 * view.ppu) * s.size * (0.6 + 0.4 * k), k * k]);
    }
    const nS = S.length;
    while (S.length < 4) S.push([0, 0, 0, 0]);
    U.uHeart = H.flat(); U.uHeartB = HB.flat(); U.uSpark = S.flat();
    U.uCount = [nH, nS];
    return U;
  }

  return {
    inp, setState, setGaze, setRub, react, heart, advance, out,
    get t() { return t; },
    set haptic(fn) { haptic = fn; },
    busy: () => t < busyUntil || root.air || rub.on || hearts.some((h) => t - h.t0 < h.life),
    reseed: (s) => { rnd = rng(s); },
    setNoticeSide: (s) => { noticeSide = s; },
  };
}
