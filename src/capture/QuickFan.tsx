import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { createElement, memo, useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, useWindowDimensions, View, type ViewProps, type ViewStyle } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
  type AnimatedStyle, type SharedValue,
} from 'react-native-reanimated';
import { Glyph } from '@/aspects/kit/controls';
import { Glass, LIQUID, lightTap, tap } from '@/components/Glass';
import { Plus } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import { useCapture } from './data';
import { DROP, litres } from './parts';

// Hold the dock's + for quick actions. They stack up from the + the way the projects fan stacks up from the Work orb
// (src/work/ProjectFan.tsx): the same glass rows, veil, springs and haptics, a Medium tap as it opens, a tick per row
// slid over, a Light one on letting go. Slide to a row and let go to run it; let go anywhere else and nothing happens.
// A plain tap still opens the capture panel. The + keeps the finger for the whole gesture (the responder system, as
// the Nora and Work orbs do), so the rows here only draw.

export type QuickKind = 'water' | 'task' | 'describe' | 'dictate' | 'smart' | 'mood';
type Action = { kind: QuickKind; label: string; sf: Parameters<typeof Glyph>[0]['sf']; d: string };

const TASK = 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM8.2 12.3l2.6 2.6l5-5.2';
const BUBBLE = 'M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8.5L6 19.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5zM8 9.5h8M8 12.5h5';
const MIC = 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5';
const CAMERA = 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.5a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z';
const SMILE = 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM8.5 14a4.5 4.5 0 0 0 7 0M9.2 9.6v.6M14.8 9.6v.6';

/** Nearest the thumb first: the bottom row is the first one the finger meets. */
export const QUICK: Action[] = [
  { kind: 'water', label: 'Glass of water', sf: 'drop.fill', d: DROP },
  { kind: 'task', label: 'New task', sf: 'checkmark.circle.fill', d: TASK },
  { kind: 'describe', label: 'Describe anything', sf: 'text.bubble.fill', d: BUBBLE },
  { kind: 'dictate', label: 'Dictate', sf: 'mic.fill', d: MIC },
  { kind: 'smart', label: 'Smart photo', sf: 'camera.fill', d: CAMERA },
  { kind: 'mood', label: 'Log mood', sf: 'face.smiling', d: SMILE },
];

// ---- geometry: the projects fan's (ROW_H, GAP, the 44 pt target in a 4 pt inset), mirrored to the left ----
const ROW_H = 52;
const ROW_R = ROW_H / 2;
const GAP = 8;
const STRIDE = ROW_H + GAP;
const BTN = 44;
const PAD = (ROW_H - BTN) / 2;
const ABOVE = 12; // the nearest row's bottom edge sits this far above the dock's bar
const BAR_H = 64; // the dock's bar
const ROUND = 48; // the + in the bar
const SLOP = 16; // a finger this far past a row's end still counts as on it
const STAGGER = 35;
const TAP = 280; // let go sooner than this without sliding: a tap, the panel
const SWIPE = 8; // pt of travel that opens the actions at once
const NONE = -1;

type QuickLayout = { left: number; rowW: number; base: number; off: number };
function quickLayout(at: { x: number; y: number }, screenW: number): QuickLayout {
  const left = Math.max(8, at.x - PAD - BTN / 2); // each row's icon stands over the +
  const rowW = Math.min(240, screenW - left - 16);
  return { left, rowW, base: at.y - BAR_H / 2 - ABOVE, off: left + rowW + 24 };
}
/** The row under the finger, or NONE. The bands between rows belong to the nearer row, so hover never flickers. */
function hitTest(x: number, y: number, L: QuickLayout) {
  if (y > L.base + GAP / 2) return NONE; // below the stack: the dock
  const slot = Math.floor((L.base + GAP / 2 - y) / STRIDE);
  if (slot < 0 || slot >= QUICK.length) return NONE;
  if (x < L.left - SLOP || x > L.left + L.rowW + SLOP) return NONE;
  return slot;
}

// ---- motion: ProjectFan's ----
const OPEN = { duration: 360, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 220, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const LIFT = { duration: 260, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const POP = { duration: 320, dampingRatio: 0.62, reduceMotion: ReduceMotion.System } as const;
const DIM = { duration: 220, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const FADE_IN = { duration: 200, easing: EASE, reduceMotion: ReduceMotion.Never } as const;
const FADE_OUT = { duration: 160, easing: EASE, reduceMotion: ReduceMotion.Never } as const;
const PRESS = { duration: 120, easing: EASE, reduceMotion: ReduceMotion.Never } as const;

// whether the actions are up, for React (the anchor, VoiceOver); a touch never re-renders the dock
function createShown() {
  let v = false;
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set: (next: boolean) => { if (next !== v) { v = next; subs.forEach((f) => f()); } },
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
type Shown = ReturnType<typeof createShown>;

export type QuickHandlers = Pick<ViewProps,
  | 'accessible' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint' | 'accessibilityActions' | 'onAccessibilityAction'
  | 'onStartShouldSetResponder' | 'onResponderTerminationRequest' | 'onResponderGrant' | 'onResponderMove' | 'onResponderRelease'
  | 'onResponderTerminate'>;

/** The +'s touch: spread `handlers` on the +, draw `pressStyle` on it and `overlay` at screen level over the dock. */
export function useQuickPlus({ at, onTap, onAct }: {
  /** the + button's centre on screen */ at: { x: number; y: number };
  onTap: () => void; onAct: (kind: QuickKind) => void;
}): { handlers: QuickHandlers; overlay: ReactElement; pressStyle: AnimatedStyle<ViewStyle> } {
  const { width } = useWindowDimensions();
  const L = quickLayout(at, width);
  const [shown] = useState(createShown);
  const phase = useSharedValue(0); // 0 closed, 1 open
  const hover = useSharedValue(NONE);
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle<ViewStyle>(() => ({ transform: [{ scale: press.value }] }));

  // the latest render's values, for the touch handlers and the hold timer
  const live = useRef({ L, onTap, onAct });
  useEffect(() => { live.current = { L, onTap, onAct }; });
  // gesture bookkeeping, read and written only in the touch handlers and the timer they start
  const g = useRef({ active: false, open: false, moved: false, t0: 0, x0: 0, y0: 0, hover: NONE, timer: null as ReturnType<typeof setTimeout> | null });

  const clearTimer = () => { const st = g.current; if (st.timer) { clearTimeout(st.timer); st.timer = null; } };
  const openUp = () => {
    const st = g.current;
    clearTimer();
    if (!st.active || st.open) return;
    st.open = true;
    phase.set(1);
    shown.set(true);
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  };
  const finish = () => {
    const st = g.current;
    clearTimer();
    st.active = false; st.open = false; st.hover = NONE;
    phase.set(0); hover.set(NONE);
    press.set(withTiming(1, PRESS));
    shown.set(false);
  };
  const over = (h: number) => {
    const st = g.current;
    if (h === st.hover) return;
    st.hover = h;
    hover.set(h);
    if (h !== NONE) tap(() => Haptics.selectionAsync());
  };

  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    clearTimer();
    Object.assign(st, { active: true, open: false, moved: false, t0: n.timestamp, x0: n.pageX, y0: n.pageY, hover: NONE });
    hover.set(NONE);
    press.set(withTiming(0.92, PRESS));
    st.timer = setTimeout(openUp, TAP); // held: the actions come up under the finger
  };
  const onMove = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    if (!st.active) return;
    if (!st.moved && Math.hypot(n.pageX - st.x0, n.pageY - st.y0) >= SWIPE) { st.moved = true; openUp(); }
    if (st.open) over(hitTest(n.pageX, n.pageY, live.current.L));
  };
  // a tap is timed by the touches' own timestamps, so a busy moment on the JS thread can't turn a hold into a tap
  const onRelease = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    if (!st.active) return;
    const open = st.open, quick = !st.moved && n.timestamp - st.t0 < TAP;
    const code = open ? hitTest(n.pageX, n.pageY, live.current.L) : NONE;
    finish();
    if (!open) { if (quick) live.current.onTap(); return; }
    if (code !== NONE) { lightTap(); live.current.onAct(QUICK[code].kind); }
  };

  useEffect(() => () => clearTimer(), []);

  const handlers: QuickHandlers = {
    accessible: true,
    accessibilityRole: 'button',
    accessibilityLabel: 'Capture',
    accessibilityHint: 'Hold for quick actions',
    // VoiceOver lists the quick actions as the button's own actions
    accessibilityActions: [{ name: 'activate' }, ...QUICK.map((a) => ({ name: a.kind, label: a.label }))],
    onAccessibilityAction: (e) => {
      const name = e.nativeEvent.actionName;
      if (name === 'activate') live.current.onTap();
      else if (QUICK.some((a) => a.kind === name)) live.current.onAct(name as QuickKind);
    },
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: onGrant,
    onResponderMove: onMove,
    onResponderRelease: onRelease,
    onResponderTerminate: finish,
  };
  const overlay = createElement(QuickFan, { L, at, shown, phase, hover, pressStyle });
  return { handlers, overlay, pressStyle };
}

/** One row's way in and out: slides in from the left edge, or fades in place under Reduce Motion. */
function useEnter(phase: SharedValue<number>, delay: number, reduce: boolean) {
  const e = useSharedValue(0);
  useAnimatedReaction(() => phase.value, (p, prev) => {
    if (p === prev) return;
    if (reduce) e.set(withTiming(p, p ? FADE_IN : FADE_OUT));
    else e.set(p ? withDelay(delay, withSpring(1, OPEN)) : withSpring(0, CLOSE));
  });
  return e;
}

const Row = memo(function Row({ a, i, left, top, w, off, delay, phase, hover, reduce }: {
  a: Action; i: number; left: number; top: number; w: number; off: number; delay: number;
  phase: SharedValue<number>; hover: SharedValue<number>; reduce: boolean;
}) {
  const e = useEnter(phase, delay, reduce);
  const lift = useSharedValue(0), dim = useSharedValue(0);
  useAnimatedReaction(() => (hover.value === NONE ? 0 : hover.value === i ? 1 : 2), (v, prev) => {
    if (v === prev) return;
    lift.set(withSpring(v === 1 ? 1 : 0, LIFT));
    dim.set(withSpring(v === 2 ? 1 : 0, DIM));
  });
  const pop = useSharedValue(0);
  useAnimatedReaction(() => hover.value === i, (on, prev) => { if (on !== prev) pop.set(withSpring(on ? 1 : 0, POP)); });
  const box = useAnimatedStyle(() => {
    // Liquid Glass stops rendering at low opacity, so a reduced-motion row appears whole there instead of fading
    const opacity = reduce ? (LIQUID ? (e.value > 0.01 ? 1 : 0) : e.value) : 1;
    const tx = reduce ? 0 : -(1 - e.value) * off;
    return { opacity, transform: [{ translateX: tx }, { translateY: -2 * lift.value }, { scale: 1 + 0.03 * lift.value }] };
  });
  const bright = useAnimatedStyle(() => ({ opacity: lift.value }));
  const shade = useAnimatedStyle(() => ({ opacity: dim.value }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.14 * pop.value }] }));
  const disc = useAnimatedStyle(() => ({ opacity: pop.value }));
  return (
    <Animated.View accessible accessibilityLabel={a.label} style={[s.row, { left, top, width: w }, box]}>
      <Glass radius={ROW_R} />
      <Animated.View style={[s.fill, s.bright, bright]} />
      <Animated.View style={[s.btn, icon]}>
        <Animated.View style={[s.disc, disc]} />
        <View><Glyph sf={a.sf} d={a.d} size={20} /></View>
      </Animated.View>
      <Text style={s.name} numberOfLines={1}>{a.label}</Text>
      <Animated.View style={[s.fill, s.shade, shade]} />
    </Animated.View>
  );
});

/** A copy of the + drawn above the blur while the actions are up, so they stay tied to where they came from. */
function Anchor({ at, style }: { at: { x: number; y: number }; style: AnimatedStyle<ViewStyle> }) {
  return (
    <Animated.View style={[s.anchor, { left: at.x - ROUND / 2, top: at.y - ROUND / 2 }, style]}>
      <Glass radius={ROUND / 2} />
      <View><Sym name="plus" size={22} fallback={<Plus />} /></View>
    </Animated.View>
  );
}

function QuickFan({ L, at, shown: store, phase, hover, pressStyle }: {
  L: QuickLayout; at: { x: number; y: number }; shown: Shown; phase: SharedValue<number>; hover: SharedValue<number>;
  pressStyle: AnimatedStyle<ViewStyle>;
}) {
  const shown = useSyncExternalStore(store.subscribe, store.get);
  const reduce = useReducedMotion();
  // drawn only while up or on its way out: no blur sits over Today the rest of the time
  const [mounted, setMounted] = useState(false);
  if (shown && !mounted) setMounted(true);
  useEffect(() => {
    if (shown || !mounted) return;
    const id = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(id);
  }, [shown, mounted]);
  const veil = useSharedValue(0);
  useAnimatedReaction(() => phase.value, (p, prev) => {
    if (p !== prev) veil.set(withTiming(p, p ? FADE_IN : FADE_OUT));
  });
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  if (!mounted) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}
      accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[StyleSheet.absoluteFill, veilStyle]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, s.dimmer]} />
      </Animated.View>
      {QUICK.map((a, i) => (
        <Row key={a.kind} a={a} i={i} left={L.left} top={L.base - ROW_H - i * STRIDE} w={L.rowW} off={L.off} delay={i * STAGGER}
          phase={phase} hover={hover} reduce={reduce} />
      ))}
      {shown ? <Anchor at={at} style={pressStyle} /> : null}
    </View>
  );
}

/** Letting go on water: a glass goes in without the panel, with Undo on Today's toast. Mounted for that glass and
 *  its undo's reach, then it lets go; `n` counts the glasses asked for. It waits for the day's water to be read, so a
 *  glass is never added to a count it hasn't seen. */
export function QuickWater({ n, onSay, onDone }: {
  n: number; onSay?: (text: string, action?: { label: string; onPress: () => void }) => void; onDone: () => void;
}) {
  const d = useCapture();
  const latest = useRef(d);
  useEffect(() => { latest.current = d; });
  const ran = useRef(0);
  const known = d.waterKnown;
  useEffect(() => {
    if (ran.current === n || !known) return;
    ran.current = n;
    latest.current.addWater(1).then((v) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onSay?.(`Glass of water, ${litres(v)} of ${litres(latest.current.waterTarget)} L`, {
        label: 'Undo', onPress: () => { latest.current.addWater(-1).then(() => onSay?.('One glass taken back'), (e: Error) => onSay?.(e.message)); },
      });
    }, (e: Error) => onSay?.(e.message));
  }, [n, known, onSay]);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => { const id = setTimeout(() => done.current(), 8000); return () => clearTimeout(id); }, [n]);
  return null;
}

const s = StyleSheet.create({
  dimmer: { backgroundColor: 'rgba(8,8,10,0.6)' },
  row: { position: 'absolute', height: ROW_H, borderRadius: ROW_R, flexDirection: 'row', alignItems: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ROW_R },
  bright: { backgroundColor: 'rgba(255,255,255,0.08)' },
  shade: { backgroundColor: 'rgba(0,0,0,0.45)' },
  btn: { width: BTN, height: BTN, marginLeft: PAD, alignItems: 'center', justifyContent: 'center' },
  disc: { position: 'absolute', width: BTN, height: BTN, borderRadius: BTN / 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  name: { flexShrink: 1, marginLeft: 8, marginRight: 16, fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  anchor: {
    position: 'absolute', width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
  },
});
