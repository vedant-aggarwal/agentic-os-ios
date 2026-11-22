import { BlurView } from 'expo-blur';
import { memo, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
  type AnimatedStyle, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Glass, LIQUID } from '@/components/Glass';
import { LockHint } from '@/components/HoldLock';
import { PcMic, Plus, Work } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import type { ProjectCard } from './types';

// The projects fan: hold the Work orb and the projects stack up the right edge, nearest the thumb first. The fan
// never takes touches itself; the orb keeps the finger for the whole gesture (useWorkOrb.ts) and this file only
// draws. Hover runs on the UI thread: one frame callback hit tests the finger against the rows' fixed geometry,
// so nothing here measures views and React re-renders only when recording starts or stops.

// ---- geometry ----
export const ROW_H = 52; // a glass pill: four 44 pt targets inside a 4 pt inset
const ROW_R = ROW_H / 2;
export const GAP = 8;
export const STRIDE = ROW_H + GAP;
export const BTN = 44;
export const PAD = (ROW_H - BTN) / 2;
const NAME_X = PAD + 4 * BTN + 12; // the name starts 12 right of the last target
const NAME_PAD = 16;
const PLUS = ROW_H; // the round + after the last row, as tall as a row
const ABOVE = 12; // the nearest row's bottom edge sits this far above the orb
const SLOP = 16; // a finger this far left of a row still counts as on it
const ORB = 64; // the Work orb in the dock
export const LOCK = 72; // slide up this far from the mic to lock the recording
const BAND = 80; // edge scroll bands
const MIN_SPEED = 60; // pt/s at the band's edge
const MAX_SPEED = 720; // pt/s at its far side
const STAGGER = 35; // ms between rows sliding in

export const NONE = -1;
export const PLUS_HIT = -2;
/** A hover target is `row * 8 + part`; NONE and PLUS_HIT are the rest. */
export const Part = { name: 0, mic: 1, idea: 2, task: 3, job: 4 } as const;

export type FanLayout = {
  right: number; // the stack's right edge: the Work orb's right edge, from the screen's left
  rowW: number;
  base: number; // the nearest row's bottom edge, from the screen's top
  top: number; // the highest a row rests while the stack fits
  n: number; // rows, or -1 while loading
  max: number; // how far the stack scrolls down when it doesn't fit
  off: number; // how far a row travels to leave by the right edge
};

/** Where Dock.tsx draws the Work orb (SideOrb, right side): the dock's own sums, as a centre point. */
export function dockWorkOrb(screenW: number, screenH: number, bottomInset: number) {
  const BAR_H = 64, ORB_R = 36, ICON = 24;
  const G = Math.round(Math.max(8, Math.min(18, (screenW - 32 - 2 * ORB - 2 * ORB_R - 2 * ICON) / 6)));
  const total = 2 * (ORB_R + ICON + 2 * G) + 2 * (ORB + G);
  const lift = Math.max(bottomInset, 12) + 12;
  return { cx: (screenW + total) / 2 - ORB / 2, cy: screenH - lift - BAR_H / 2 };
}

export function fanLayout(orb: { cx: number; cy: number }, screenW: number, topInset: number, n: number): FanLayout {
  const right = orb.cx + ORB / 2;
  const rowW = Math.min(right - 16, 360);
  const base = orb.cy - ORB / 2 - ABOVE;
  const top = topInset + 8;
  const tall = n < 0 ? ROW_H : n * STRIDE + PLUS;
  return { right, rowW, base, top, n, max: Math.max(0, tall - (base - top)), off: screenW - right + rowW + 24 };
}

/** Row i's box on screen with the stack scrolled down by `off`. */
export function rowBox(L: FanLayout, i: number, off: number) {
  const bottom = L.base - i * STRIDE + off;
  return { left: L.right - L.rowW, right: L.right, top: bottom - ROW_H, bottom };
}

/** What the finger at (x, y) is over. The bands between rows belong to the nearer row, so hover never flickers. */
export function hitTest(x: number, y: number, off: number, L: FanLayout) {
  'worklet';
  if (L.n < 0 || y > L.base + GAP / 2) return NONE; // loading, or below the stack: the dock zone
  const left = L.right - L.rowW;
  const slot = Math.floor((L.base + GAP / 2 - (y - off)) / STRIDE);
  if (slot < 0 || slot > L.n) return NONE;
  if (slot === L.n) return x >= L.right - PLUS - SLOP ? PLUS_HIT : NONE;
  if (x < left - SLOP) return NONE;
  const lx = x - left - PAD;
  const part = lx < BTN ? Part.mic : lx < 2 * BTN ? Part.idea : lx < 3 * BTN ? Part.task : lx < 4 * BTN ? Part.job : Part.name;
  return slot * 8 + part;
}

/** Edge scroll speed in pt/s for a finger at y; positive moves the stack down so higher rows come into view. */
export function scrollSpeed(y: number, L: FanLayout) {
  'worklet';
  if (L.max <= 0) return 0;
  const up = L.top + BAND - y;
  const down = y - (L.base + GAP / 2);
  const depth = up > 0 ? up : down > 0 ? down : 0;
  if (!depth) return 0;
  const t = Math.min(depth / BAND, 1);
  const v = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * t * t;
  return up > 0 ? v : -v;
}

// ---- what React needs to know, kept out of the host screen so a touch never re-renders it ----
export type Rec = { slug: string; i: number; cx: number; cy: number } | null;
export type FanView = { shown: boolean; rec: Rec };
export function createFanStore() {
  let v: FanView = { shown: false, rec: null };
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set: (p: Partial<FanView>) => {
      const next = { ...v, ...p };
      if (next.shown === v.shown && next.rec === v.rec) return;
      v = next;
      subs.forEach((f) => f());
    },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type FanStore = ReturnType<typeof createFanStore>;

// ---- motion ----
// Same family as the Nora dial in Dock.tsx: springs re-target from where they are, so a close mid-open is continuous.
const OPEN = { duration: 360, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 220, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const LIFT = { duration: 260, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const POP = { duration: 320, dampingRatio: 0.62, reduceMotion: ReduceMotion.System } as const;
const DIM = { duration: 220, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const FADE_IN = { duration: 200, easing: EASE, reduceMotion: ReduceMotion.Never } as const;
const FADE_OUT = { duration: 160, easing: EASE, reduceMotion: ReduceMotion.Never } as const;

/** One row's (or the +'s) way in and out: slides from the right edge, or fades in place under Reduce Motion. */
function useEnter(phase: SharedValue<number>, delay: number, reduce: boolean) {
  const e = useSharedValue(0);
  useAnimatedReaction(() => phase.value, (p, prev) => {
    if (p === prev) return;
    if (reduce) e.set(withTiming(p, p ? FADE_IN : FADE_OUT));
    else e.set(p ? withDelay(delay, withSpring(1, OPEN)) : withSpring(0, CLOSE));
  });
  return e;
}

function enterStyle(e: number, off: number, reduce: boolean) {
  'worklet';
  // Liquid Glass stops rendering at low opacity, so there a reduced-motion row appears whole instead of fading
  if (reduce) return { opacity: LIQUID ? (e > 0.01 ? 1 : 0) : e, tx: 0 };
  return { opacity: 1, tx: (1 - e) * off };
}

/** 0 nothing hovered, 1 this row, 2 something else (rows dim). */
function hoverState(h: number, i: number) {
  'worklet';
  if (h === NONE) return 0;
  return h >= 0 && Math.floor(h / 8) === i ? 1 : 2;
}

// ---- icons: SF Symbols on iOS; these duotone SVGs (the 256 grid of Icons.tsx) elsewhere ----
function Duo({ line, fill }: { line: string; fill?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 256 256">
      {fill ? <Path d={fill} fill={C.text} opacity={0.16} /> : null}
      <Path d={line} fill="none" stroke={C.text} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
const BULB = 'M128 32a64 64 0 0 0-40 114c8 7 8 14 8 22v8h64v-8c0-8 0-15 8-22a64 64 0 0 0-40-114z';
const RING = 'M128 32a96 96 0 1 1-0.01 0z';
const SCREEN = 'M40 48h176a16 16 0 0 1 16 16v128a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16V64a16 16 0 0 1 16-16z';
const ICONS: Record<'mic' | 'idea' | 'task' | 'job', ReactNode> = {
  mic: <Sym name="mic.fill" size={20} fallback={<PcMic size={22} />} />,
  idea: <Sym name="lightbulb.fill" size={20} fallback={<Duo fill={BULB} line={`${BULB} M100 208h56 M108 232h40`} />} />,
  task: <Sym name="checkmark.circle.fill" size={20} fallback={<Duo fill={RING} line={`${RING} M88 132l28 28 52-56`} />} />,
  job: <Sym name="terminal.fill" size={20} fallback={<Duo fill={SCREEN} line={`${SCREEN} M72 104l32 24-32 24 M128 152h48`} />} />,
};

// ---- pieces ----
/** A 44 pt target in a row. Hovered, it pops and a soft disc lights behind it. The mic also carries the red
 *  recording ring; the other three step aside while it records. */
function Btn({ code, x, hover, ring, mic, children }: {
  code: number; x: number; hover: SharedValue<number>; ring: SharedValue<number>; mic?: boolean; children: ReactNode;
}) {
  const pop = useSharedValue(0);
  useAnimatedReaction(() => hover.value === code, (on, prev) => {
    if (on !== prev) pop.set(withSpring(on ? 1 : 0, POP));
  });
  const body = useAnimatedStyle(() => ({
    opacity: mic ? 1 : 1 - ring.value,
    transform: [{ scale: 1 + 0.14 * pop.value }],
  }));
  const disc = useAnimatedStyle(() => ({ opacity: pop.value * (mic ? 1 - ring.value : 1) }));
  const red = useAnimatedStyle(() => ({ opacity: ring.value, transform: [{ scale: 0.7 + 0.4 * ring.value }] }));
  return (
    <Animated.View style={[s.btn, { left: x }, body]}>
      <Animated.View style={[s.disc, disc]} />
      {mic ? <Animated.View style={[s.recRing, red]} /> : null}
      <View>{children}</View>
    </Animated.View>
  );
}

const Row = memo(function Row({ p, i, left, top, w, off, delay, phase, hover, recording, reduce }: {
  p: ProjectCard; i: number; left: number; top: number; w: number; off: number; delay: number;
  phase: SharedValue<number>; hover: SharedValue<number>; recording: boolean; reduce: boolean;
}) {
  const e = useEnter(phase, delay, reduce);
  const lift = useSharedValue(0), dim = useSharedValue(0), ring = useSharedValue(0);
  useAnimatedReaction(() => hoverState(hover.value, i), (v, prev) => {
    if (v === prev) return;
    lift.set(withSpring(v === 1 ? 1 : 0, LIFT));
    dim.set(withSpring(v === 2 ? 1 : 0, DIM));
  });
  useEffect(() => { ring.set(withSpring(recording ? 1 : 0, POP)); }, [recording, ring]);
  const box = useAnimatedStyle(() => {
    const m = enterStyle(e.value, off, reduce);
    return { opacity: m.opacity, transform: [{ translateX: m.tx }, { translateY: -2 * lift.value }, { scale: 1 + 0.03 * lift.value }] };
  });
  const bright = useAnimatedStyle(() => ({ opacity: lift.value }));
  const shade = useAnimatedStyle(() => ({ opacity: dim.value }));
  const dot = p.counts.needs > 0 ? s.needs : p.counts.live > 0 ? s.live : null;
  const label = `${p.name}${p.counts.needs > 0 ? ', needs you' : p.counts.live > 0 ? ', agent working' : ''}`;
  const base = i * 8;
  return (
    <Animated.View accessible accessibilityLabel={label} style={[s.row, { left, top, width: w }, box]}>
      <Glass radius={ROW_R} />
      <Animated.View style={[s.fill, s.bright, bright]} />
      <Btn code={base + Part.mic} x={PAD} hover={hover} ring={ring} mic>{ICONS.mic}</Btn>
      <Btn code={base + Part.idea} x={PAD + BTN} hover={hover} ring={ring}>{ICONS.idea}</Btn>
      <Btn code={base + Part.task} x={PAD + 2 * BTN} hover={hover} ring={ring}>{ICONS.task}</Btn>
      <Btn code={base + Part.job} x={PAD + 3 * BTN} hover={hover} ring={ring}>{ICONS.job}</Btn>
      {recording ? (
        <View style={[s.label, { left: PAD + BTN + 12, justifyContent: 'flex-start' }]}>
          <Text style={s.recText} numberOfLines={1}>Recording into {p.name}</Text>
        </View>
      ) : (
        <View style={[s.label, { left: NAME_X }]}>
          <Text style={s.name} numberOfLines={1}>{p.name}</Text>
          {dot ? <View style={[s.dot, dot]} /> : null}
        </View>
      )}
      <Animated.View style={[s.fill, s.shade, shade]} />
    </Animated.View>
  );
});

function LoadingRow({ left, top, w, off, phase, reduce }: {
  left: number; top: number; w: number; off: number; phase: SharedValue<number>; reduce: boolean;
}) {
  const e = useEnter(phase, 0, reduce);
  const box = useAnimatedStyle(() => {
    const m = enterStyle(e.value, off, reduce);
    return { opacity: m.opacity, transform: [{ translateX: m.tx }] };
  });
  return (
    <Animated.View style={[s.row, { left, top, width: w }, box]}>
      <Glass radius={ROW_R} />
      <View style={[s.label, { left: NAME_PAD }]}><Text style={s.muted}>Loading projects</Text></View>
    </Animated.View>
  );
}

/** The round + after the last row: release on it to create a project. With no projects it stands alone. */
function PlusOrb({ left, top, w, off, delay, phase, hover, reduce, empty }: {
  left: number; top: number; w: number; off: number; delay: number;
  phase: SharedValue<number>; hover: SharedValue<number>; reduce: boolean; empty: boolean;
}) {
  const e = useEnter(phase, delay, reduce);
  const pop = useSharedValue(0), dim = useSharedValue(0);
  useAnimatedReaction(() => hover.value, (h, prev) => {
    if (h === prev) return;
    pop.set(withSpring(h === PLUS_HIT ? 1 : 0, POP));
    dim.set(withSpring(h >= 0 ? 1 : 0, DIM));
  });
  const box = useAnimatedStyle(() => {
    const m = enterStyle(e.value, off, reduce);
    return { opacity: m.opacity, transform: [{ translateX: m.tx }] };
  });
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.1 * pop.value }] }));
  const bright = useAnimatedStyle(() => ({ opacity: pop.value }));
  const shade = useAnimatedStyle(() => ({ opacity: dim.value }));
  return (
    <Animated.View style={[s.plusRow, { left, top, width: w }, box]}>
      {empty ? <Text style={s.muted}>No projects yet</Text> : null}
      <Animated.View accessible accessibilityLabel="New project" style={[s.plus, circle]}>
        <Glass radius={PLUS / 2} />
        <Animated.View style={[s.fill, s.bright, { borderRadius: PLUS / 2 }, bright]} />
        <View><Sym name="plus" size={20} fallback={<Plus size={22} />} /></View>
        <Animated.View style={[s.fill, s.shade, { borderRadius: PLUS / 2 }, shade]} />
      </Animated.View>
    </Animated.View>
  );
}

/** A copy of the Work orb drawn above the blur while the fan is open, so the fan stays tied to where it came from. */
function Anchor({ cx, cy, style }: { cx: number; cy: number; style: AnimatedStyle<ViewStyle> }) {
  return (
    <Animated.View style={[s.anchor, { left: cx - ORB / 2, top: cy - ORB / 2 }, style]}>
      <Glass radius={ORB / 2} />
      <View><Sym name="briefcase.fill" size={22} fallback={<Work />} /></View>
    </Animated.View>
  );
}

export function ProjectFan({ projects, L, orb, store, phase, hover, offset, lift, orbStyle }: {
  projects: ProjectCard[] | null; L: FanLayout; orb: { cx: number; cy: number }; store: FanStore;
  phase: SharedValue<number>; hover: SharedValue<number>; offset: SharedValue<number>; lift: SharedValue<number>;
  orbStyle: AnimatedStyle<ViewStyle>;
}) {
  const { shown, rec } = useSyncExternalStore(store.subscribe, store.get);
  const reduce = useReducedMotion();
  const veil = useSharedValue(0);
  useAnimatedReaction(() => phase.value, (p, prev) => {
    if (p !== prev) veil.set(withTiming(p, p ? FADE_IN : FADE_OUT));
  });
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const stack = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const left = L.right - L.rowW;
  const top = (slot: number) => L.base - ROW_H - slot * STRIDE;
  // rows on screen at rest; the stagger stops there so rows further up don't hold the + back
  const cap = Math.max(1, Math.floor((L.base - L.top) / STRIDE));
  const delay = (slot: number) => Math.min(slot, cap) * STAGGER;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.dimmer]} />
      </Animated.View>
      {/* rows scrolled below the nearest row's place slide under the orb's top edge */}
      <View style={[s.clip, { height: L.base + ABOVE }]}>
        <Animated.View style={[StyleSheet.absoluteFill, stack]}>
          {projects == null ? (
            <LoadingRow left={left} top={top(0)} w={L.rowW} off={L.off} phase={phase} reduce={reduce} />
          ) : (
            <>
              {projects.map((p, i) => (
                <Row key={p.slug} p={p} i={i} left={left} top={top(i)} w={L.rowW} off={L.off} delay={delay(i)}
                  phase={phase} hover={hover} recording={rec?.slug === p.slug} reduce={reduce} />
              ))}
              <PlusOrb left={left} top={top(projects.length)} w={L.rowW} off={L.off} delay={delay(projects.length)}
                phase={phase} hover={hover} reduce={reduce} empty={!projects.length} />
            </>
          )}
        </Animated.View>
      </View>
      {shown ? <Anchor cx={orb.cx} cy={orb.cy} style={orbStyle} /> : null}
      {rec ? <LockHint lift={lift} holding top={rec.cy - LOCK - 20} left={rec.cx - 20} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  dimmer: { backgroundColor: 'rgba(8,8,10,0.6)' },
  clip: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  row: { position: 'absolute', height: ROW_H, borderRadius: ROW_R, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ROW_R },
  bright: { backgroundColor: 'rgba(255,255,255,0.08)' },
  shade: { backgroundColor: 'rgba(0,0,0,0.45)' },
  btn: { position: 'absolute', top: PAD, width: BTN, height: BTN, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', width: BTN, height: BTN, borderRadius: BTN / 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  recRing: {
    position: 'absolute', width: BTN, height: BTN, borderRadius: BTN / 2, borderWidth: 2, borderColor: C.danger,
    backgroundColor: 'rgba(248,113,113,0.16)', boxShadow: '0 0 12px rgba(248,113,113,0.55)',
  },
  label: { position: 'absolute', top: 0, bottom: 0, right: NAME_PAD, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  name: { flexShrink: 1, fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  recText: { flexShrink: 1, fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
  muted: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  live: { backgroundColor: '#3DDC97', boxShadow: '0 0 8px rgba(61,220,151,0.7)' }, // an agent is working here
  needs: { backgroundColor: '#FFB547', boxShadow: '0 0 8px rgba(255,181,71,0.7)' }, // something waits on him
  plusRow: { position: 'absolute', height: PLUS, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  plus: {
    width: PLUS, height: PLUS, borderRadius: PLUS / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  anchor: {
    position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
  },
});
