import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  ReduceMotion, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { Glass, tap, useScale } from '@/components/Glass';
import { Home, Nora, Plus, Work } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { router } from 'expo-router';
import { useWorkOrb } from '@/work/useWorkOrb';
import { Capture, type CaptureStart } from '@/capture/Capture';
import { QuickWater, useQuickPlus } from '@/capture/QuickFan';
import { NoraOver, NoraUnder } from '@/nora/NoraHost';
import { Ball, useTurn } from '@/nora/Sphere';
import { noraUi, useNora } from '@/nora/state';
import { useLineCounts } from '@/lib/line';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, C, F, FAMILY_LABEL, type AspectKey, type FamilyKey } from '@/theme';

// The Nora bar, from the canvas boards (UI1-Nora, UI2-Today): a see-through glass 64 pt pill between two floating
// 64 pt orbs (Home, Work). Scan and Nora's chat sit in the pill as clear 48 pt buttons, the 72 pt orb raised
// 16 pt above the pill's centre with the nine-section ring over its top. One gap G sets every space in the
// row: side orb to pill, pill edge to icon, icon to orb. Tap the orb to talk; hold it and the ring opens into the dial.
// Home, chat and calls are Nora's (src/nora): the dock mounts them, Home under the bar, chat and calls over it.
const BAR_H = 64;
const SIDE = BAR_H; // the floating orbs either side of the pill, as tall as it
const ICON = 24; // the glyph inside each 48 pt button
const ORB = 100; // canvas incl. ring and its glow
const ORB_R = 36; // the ball
const ARC_R = 46;
const ORB_TOP = BAR_H / 2 - 16 - ORB / 2; // orb centre 16 above the pill's centre
const TAP = 280; // let go sooner than this, without sliding or choosing, and it was a tap: talk to Nora
const SWIPE = 8; // pt of travel that turns a press into a swipe

/** The orb's centre, measured up from the screen's bottom edge; the backdrop glow rises from here. */
export function orbFromBottom(bottom: number) {
  return Math.max(bottom, 12) + 12 + BAR_H / 2 + 16;
}

// The dial the ring opens into: each ring section grows out along its own angle into a wedge at r140, 36 thick
const DIAL_R = 140;
const DIAL_W = 36;
const PICK_W = 42; // chosen: a little thicker than an idle wedge, not a new shape
const LABEL_R = 178;
const CAN = 200; // half-size of each wedge's canvas, centred on the orb
const PICK_MOVE = 12; // pt of travel from where the finger landed before it starts choosing

// ---- the ring: nine sections over the top of the orb, 9 o'clock to 3 o'clock, as on UI2-Today ----
// Grouped Self, Work, People. Inside each group the aspects are ordered so the colours run as one spectrum
// round the arc: orange, amber, gold | green, mint, teal | violet, magenta, pink.
const WHEEL: AspectKey[] = ['body', 'mind', 'soul', 'money', 'mission', 'growth', 'friends', 'romance', 'family'];
const GROUPS: { key: FamilyKey; from: number }[] = [{ key: 'self', from: 0 }, { key: 'work', from: 3 }, { key: 'people', from: 6 }];
const LABEL: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth',
  family: 'Family', romance: 'Romance', friends: 'Friends',
};

/** Point on a circle around (c, c); 0 deg = 12 o'clock, clockwise. */
function at(c: number, r: number, deg: number) {
  'worklet';
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
function arcAt(c: number, r: number, a0: number, a1: number) {
  const [x0, y0] = at(c, r, a0), [x1, y1] = at(c, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
// The resting ring stays clear of the pill: the orb's centre sits 16 below the pill's top edge, so at
// r46 the ring may reach 66 deg either side of 12 o'clock before its ends (and their glow) touch that edge.
const RING_HALF = 66;
const RING_SPAN = (RING_HALF * 2) / WHEEL.length;
const RING_START = 360 - RING_HALF;
const RING = WHEEL.map((k, i) => {
  const s0 = RING_START + i * RING_SPAN, a0 = s0 + 4.5, a1 = s0 + RING_SPAN - 4.5; // trimmed so round caps leave a gap
  return { k, a0, a1, color: ASPECT_COLOR[k], track: arcAt(ORB / 2, ARC_R, a0, a1) };
});
/** A ring segment between radii ri..ro and angles a0..a1, corners rounded by up to rc (half its width = round caps). */
function sector(c: number, ri: number, ro: number, a0: number, a1: number, rc: number) {
  'worklet';
  const r = Math.max(0.01, Math.min(rc, (ro - ri) / 2, ((((a1 - a0) * Math.PI) / 180) * ri) / 2));
  const deg = (rr: number) => (r / rr) * (180 / Math.PI);
  const P = (rr: number, a: number) => { const q = at(c, rr, a); return `${q[0].toFixed(2)} ${q[1].toFixed(2)}`; };
  const o = deg(ro), n = deg(ri);
  return `M ${P(ro, a0 + o)} A ${ro} ${ro} 0 0 1 ${P(ro, a1 - o)} Q ${P(ro, a1)} ${P(ro - r, a1)} `
    + `L ${P(ri + r, a1)} Q ${P(ri, a1)} ${P(ri, a1 - n)} A ${ri} ${ri} 0 0 0 ${P(ri, a0 + n)} `
    + `Q ${P(ri, a0)} ${P(ri + r, a0)} L ${P(ro - r, a0)} Q ${P(ro, a0)} ${P(ro, a0 + o)} Z`;
}

// A wedge keeps its ring section's angle and only grows outward: radius 46 -> 140, width 4.5 -> 36.
// Closed, it is drawn exactly like its ring section, so the ring can hand over to it the moment it opens.
const LINE = 4.5;
const GAP = 4.5 - (LINE / 2 / ARC_R) * (180 / Math.PI); // where a round-capped ring stroke visually ends
const DIAL = WHEEL.map((k, i) => {
  const mid = RING_START + (i + 0.5) * RING_SPAN;
  const [lx, ly] = at(CAN, LABEL_R + (i % 2 ? 18 : 0), mid); // every other label sits further out, so neighbours never touch
  return { k, color: ASPECT_COLOR[k], mid, lx, ly: ly + 4 };
});

/** The wedge at dial openness o and state ev (-1 hidden, 0 idle, 1 chosen). */
function wedgeShape(mid: number, o: number, ev: number) {
  'worklet';
  const pick = Math.max(ev, 0), hide = Math.max(-ev, 0);
  const r = ARC_R + (DIAL_R - ARC_R) * o - 12 * hide + 4 * pick;
  const wd = LINE + (DIAL_W - LINE) * o + (PICK_W - DIAL_W) * pick;
  const rest = RING_SPAN / 2 - GAP;
  const half = rest + 2.5 * pick; // chosen, it widens a touch; its neighbours fall away
  const rc = LINE / 2 + (6 - LINE / 2) * o + 2 * pick;
  return { ri: r - wd / 2, ro: r + wd / 2, a0: mid - half, a1: mid + half, rc };
}

/** Which section the direction (vx, vy) points at, or -1. Just past either end counts as the end; down is none. */
function sectionAt(vx: number, vy: number) {
  const deg = (Math.atan2(vx, -vy) * 180) / Math.PI; // 0 at 12 o'clock, clockwise, -180..180
  if (Math.abs(deg) > 100) return -1;
  if (Math.abs(deg) > 90) return vx < 0 ? 0 : WHEEL.length - 1;
  return Math.min(WHEEL.length - 1, Math.max(0, Math.floor((deg + RING_HALF) / RING_SPAN)));
}

/** Each section sits dim in its aspect's colour and fills, glowing, as that aspect's lines are ticked. */
function Ring({ aspects }: { aspects: AspectProgress }) {
  return (
    <>
      {RING.map((s) => <Path key={s.k} d={s.track} stroke={s.color} strokeOpacity={0.6} strokeWidth={4.5} strokeLinecap="round" fill="none" />)}
      {RING.map((s) => {
        const p = aspects[s.k];
        if (!p || !p.done || !p.total) return null;
        const d = arcAt(ORB / 2, ARC_R, s.a0, s.a0 + (s.a1 - s.a0) * Math.min(p.done / p.total, 1));
        return (
          <G key={`f${s.k}`}>
            <Path d={d} stroke={s.color} strokeOpacity={0.3} strokeWidth={8} strokeLinecap="round" fill="none" />
            <Path d={d} stroke={s.color} strokeWidth={4.5} strokeLinecap="round" fill="none" />
          </G>
        );
      })}
    </>
  );
}

// ---- the dial ----
// Springs re-target from where they are, velocity kept, so every change mid-motion stays continuous.
const OPEN = { duration: 360, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 380, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const SWAP = { duration: 340, dampingRatio: 0.96, reduceMotion: ReduceMotion.System } as const;
const POP = { duration: 480, dampingRatio: 0.7, reduceMotion: ReduceMotion.System } as const; // the chosen wedge springs out a little past its size
const SLIDE = { duration: 520, dampingRatio: 0.92, reduceMotion: ReduceMotion.System } as const; // the title glides, barely settles

const APath = Animated.createAnimatedComponent(Path);
const clamp01 = (v: number) => { 'worklet'; return Math.min(Math.max(v, 0), 1); };

/**
 * One wedge: its ring section, grown outward along the same angle as the dial opens. The lit part (how much of
 * that aspect is done) grows with it. Chosen, it swells into its neighbours' room and the rest fall away.
 */
function Wedge({ i, open, state, pick, progress }: {
  i: number; open: SharedValue<number>; state: 'idle' | 'picked' | 'hidden'; pick: number; progress?: { done: number; total: number };
}) {
  const w = DIAL[i];
  const e = useSharedValue(0); // -1 hidden, 0 idle, 1 chosen
  useEffect(() => {
    // chosen pops out; the rest fall away in a ripple outward from it
    if (state === 'picked') e.set(withSpring(1, POP));
    else if (state === 'hidden') e.set(withDelay(Math.abs(i - pick) * 18, withSpring(-1, SWAP)));
    else e.set(withSpring(0, SWAP));
  }, [state, pick, i, e]);
  const frac = progress?.total ? Math.min(progress.done / progress.total, 1) : 0;
  const has = !!progress?.total;
  const track = useAnimatedProps(() => {
    const o = open.value, pick = Math.max(e.value, 0), g = wedgeShape(w.mid, o, e.value);
    const dim = 0.6; // the ring's track, and the wedge's: every colour reads, lit parts at full
    return { d: sector(CAN, g.ri, g.ro, g.a0, g.a1, g.rc), fillOpacity: dim + (1 - dim) * pick, strokeOpacity: 0.28 * pick };
  });
  const lit = useAnimatedProps(() => {
    const o = open.value, g = wedgeShape(w.mid, o, e.value);
    // the ring draws its lit part from just inside the section's start; match it closed, plain fraction open
    const fRest = (2 * (4.5 - GAP) + (RING_SPAN - 9) * frac) / (RING_SPAN - 2 * GAP);
    const f = fRest + (frac - fRest) * o;
    return { d: sector(CAN, g.ri, g.ro, g.a0, g.a0 + (g.a1 - g.a0) * f, g.rc), strokeOpacity: 0.3 * (1 - o) };
  });
  // visible only while the dial is open at all; closed, the ring in the dock draws the same shape
  const wrap = useAnimatedStyle(() => ({ opacity: open.value > 0.001 ? 1 - Math.max(-e.value, 0) : 0 }));
  const label = useAnimatedStyle(() => ({ opacity: clamp01((open.value - 0.55) / 0.45) * (1 - Math.abs(e.value)) }));
  return (
    <Animated.View pointerEvents="none" style={[s.wedge, wrap]}>
      <Svg width={CAN * 2} height={CAN * 2}>
        <APath animatedProps={track} fill={w.color} stroke={w.color} strokeWidth={8} strokeLinejoin="round" />
        {frac > 0 ? <APath animatedProps={lit} fill={w.color} stroke={w.color} strokeWidth={3.5} strokeLinejoin="round" /> : null}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, label]}>
        <Svg width={CAN * 2} height={CAN * 2}>
          <SvgText x={w.lx} y={w.ly} textAnchor="middle" fontFamily={F.semibold} fontSize={12}
            fill={frac > 0 ? w.color : has ? C.muted : C.faint}>{LABEL[w.k]}</SvgText>
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// The three groups, as bands inside the wedges: each spans its three aspects, coloured across their hues.
const GROUP_R = 90;
const GROUP_W = 24;

/** One group band. It grows out of the ring with the dial; while one of its aspects is chosen it stays lit. */
function GroupBand({ g, open, state, progress }: {
  g: { key: FamilyKey; from: number }; open: SharedValue<number>; state: 'idle' | 'active' | 'dim';
  progress: { done: number; total: number };
}) {
  const e = useSharedValue(0); // 0 idle or active, 1 dimmed
  useEffect(() => { e.set(withSpring(state === 'dim' ? 1 : 0, SWAP)); }, [state, e]);
  const a0 = RING_START + g.from * RING_SPAN + GAP, a1 = RING_START + (g.from + 3) * RING_SPAN - GAP, mid = (a0 + a1) / 2;
  const band = useAnimatedProps(() => {
    const o = open.value, r = ARC_R + (GROUP_R - ARC_R) * o, wd = LINE + (GROUP_W - LINE) * o;
    return { d: sector(CAN, r - wd / 2, r + wd / 2, a0, a1, 10) };
  });
  const wrap = useAnimatedStyle(() => ({ opacity: open.value > 0.001 ? clamp01(open.value * 1.5) * (1 - 0.7 * e.value) : 0 }));
  const label = useAnimatedStyle(() => ({ opacity: clamp01((open.value - 0.55) / 0.45) }));
  const [x0, y0] = at(CAN, GROUP_R, a0), [x1, y1] = at(CAN, GROUP_R, a1), [lx, ly] = at(CAN, GROUP_R, mid);
  const colors = WHEEL.slice(g.from, g.from + 3).map((k) => ASPECT_COLOR[k]);
  const id = `group-${g.key}`;
  return (
    <Animated.View pointerEvents="none" style={[s.wedge, wrap]}>
      <Svg width={CAN * 2} height={CAN * 2}>
        <Defs>
          <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={x0} y1={y0} x2={x1} y2={y1}>
            {colors.map((c, j) => <Stop key={c} offset={j / 2} stopColor={c} />)}
          </LinearGradient>
        </Defs>
        <APath animatedProps={band} fill={`url(#${id})`} fillOpacity={progress.done ? 0.75 : 0.45} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, label]}>
        <Svg width={CAN * 2} height={CAN * 2}>
          {/* set along the band, so it reads as part of it */}
          <SvgText x={lx} y={ly + 4} textAnchor="middle" fontFamily={F.semibold} fontSize={11} fill={C.text}
            transform={`rotate(${mid > 180 ? mid - 360 : mid} ${lx} ${ly})`}>
            {FAMILY_LABEL[g.key]}
          </SvgText>
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** One aspect's name in the title row. It sits centred when chosen and slides off sideways as the choice moves. */
function TitleWord({ i, pos, shown }: { i: number; pos: SharedValue<number>; shown: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const d = i - pos.value, near = 1 - Math.exp(-d * d * 2);
    return {
      // bell-shaped falloff (no kink at the centre), so a name eases in and out as it passes
      opacity: shown.value * Math.exp(-d * d * 5),
      transform: [{ translateX: d * 76 }, { translateY: (1 - shown.value) * 10 }, { scale: (0.92 + 0.08 * shown.value) * (1 - 0.1 * near) }],
    };
  });
  const k = WHEEL[i];
  return <Animated.Text style={[s.dialWord, { color: ASPECT_COLOR[k] }, st]}>{LABEL[k]}</Animated.Text>;
}

function DialLayer({ cx, cy, open, pick, aspects }: {
  cx: number; cy: number; open: SharedValue<number>; pick: number; aspects: AspectProgress;
}) {
  // the scrim and title come in over the second half, so a quick tap only nudges the ring
  const fade = useAnimatedStyle(() => ({ opacity: clamp01((open.value - 0.5) / 0.5) }));
  // the chosen aspect's name, big above the dial; switching slides the names along like the finger
  const pos = useSharedValue(0), shown = useSharedValue(0);
  useEffect(() => {
    if (pick < 0) { shown.set(withSpring(0, CLOSE)); return; }
    if (shown.get() < 0.05) pos.set(pick); else pos.set(withSpring(pick, SLIDE));
    shown.set(withSpring(1, SLIDE));
  }, [pick, pos, shown]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.72)' }]} />
      </Animated.View>
      <View style={{ position: 'absolute', left: cx - CAN, top: cy - CAN, width: CAN * 2, height: CAN * 2 }}>
        {GROUPS.map((g) => {
          const sum = WHEEL.slice(g.from, g.from + 3).reduce((t, k) => ({
            done: t.done + (aspects[k]?.done ?? 0), total: t.total + (aspects[k]?.total ?? 0),
          }), { done: 0, total: 0 });
          const mine = pick >= g.from && pick < g.from + 3;
          return <GroupBand key={g.key} g={g} open={open} progress={sum} state={pick < 0 ? 'idle' : mine ? 'active' : 'dim'} />;
        })}
        {WHEEL.map((key, i) => (
          <Wedge key={key} i={i} open={open} pick={pick} progress={aspects[key]} state={pick < 0 ? 'idle' : pick === i ? 'picked' : 'hidden'} />
        ))}
      </View>
      <View style={[s.dialTitle, { top: cy - LABEL_R - 72 }]}>
        {WHEEL.map((key, i) => <TitleWord key={key} i={i} pos={pos} shown={shown} />)}
      </View>
    </View>
  );
}

// ---- controls ----
function Round({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const p = useScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} hitSlop={6}>
      {({ pressed }) => (
        <Animated.View style={[s.round, p.style, pressed && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>{children}</Animated.View>
      )}
    </Pressable>
  );
}

/** The + in the pill: a tap opens quick capture, a hold its quick actions (src/capture/QuickFan.tsx). */
function PlusRound({ quick }: { quick: ReturnType<typeof useQuickPlus> }) {
  const [down, setDown] = useState(false);
  const h = quick.handlers;
  return (
    <View {...h} hitSlop={6}
      onResponderGrant={(e) => { setDown(true); h.onResponderGrant?.(e); }}
      onResponderRelease={(e) => { setDown(false); h.onResponderRelease?.(e); }}
      onResponderTerminate={(e) => { setDown(false); h.onResponderTerminate?.(e); }}>
      <Animated.View style={[s.round, quick.pressStyle, down && { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
        <Sym name="plus" size={22} fallback={<Plus />} />
      </Animated.View>
    </View>
  );
}

/** A floating orb beside the pill: the same glass, detached, a true circle, holding one page. `badge` counts what
 *  waits on him behind it (Home: the calls on Nora's line that need him). */
function SideOrb({ label, side, onPress, on = false, badge = 0, children }: {
  label: string; side: 'left' | 'right'; onPress: () => void; on?: boolean; badge?: number; children: React.ReactNode;
}) {
  const p = useScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={onPress} hitSlop={6}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} style={[s.side, side === 'left' ? s.sideLeft : s.sideRight]}>
      {({ pressed }) => (
        <Animated.View style={[s.sideBody, p.style]}>
          <Glass radius={SIDE / 2} />
          {on ? <View style={[StyleSheet.absoluteFill, s.sideOn]} /> : null}
          {pressed ? <View style={[StyleSheet.absoluteFill, s.sidePressed]} /> : null}
          {/* own view, so the icon stacks above the glass on web too */}
          <View>{children}</View>
          {badge > 0 ? (
            <View pointerEvents="none" style={s.badge}><Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** The Work orb: tap opens the projects hub, hold opens the projects fan (src/work/useWorkOrb.ts). */
function WorkOrb({ fan }: { fan: ReturnType<typeof useWorkOrb> }) {
  return (
    <View {...fan.handlers} style={[s.side, s.sideRight]}>
      <Animated.View pointerEvents="none" style={[s.sideBody, fan.orbStyle]}>
        <Glass radius={SIDE / 2} />
        <View><Sym name="briefcase.fill" size={22} fallback={<Work />} /></View>
      </Animated.View>
    </View>
  );
}

export function Dock({ bottom, width, aspects, onNotBuilt, onAspect, onHome, onMood, onSay, hidden = false }: {
  bottom: number; width: number; aspects: AspectProgress; onNotBuilt: (what: string) => void;
  /** the +'s quick action Log mood: the mood logger, flying out of the + */ onMood?: (from: { x: number; y: number }) => void;
  /** a quick action's toast (a glass of water, with Undo) */ onSay?: (text: string, action?: { label: string; onPress: () => void }) => void;
  /** Let go on a wedge: open that aspect's page. */
  onAspect: (key: AspectKey) => void;
  /** Set while an aspect page is open: Home goes back to Today. */
  onHome?: () => void;
  /** A full-screen flow (a live workout, a timer) has the screen: the bar drops out of the way. */
  hidden?: boolean;
}) {
  const { height } = useWindowDimensions();
  // fixed parts: two side orbs, the ball, two icons; the rest is six equal gaps, 8 to 18 pt
  const G = Math.round(Math.max(8, Math.min(18, (width - 32 - 2 * SIDE - 2 * ORB_R - 2 * ICON) / 6)));
  const w = 2 * (ORB_R + ICON + 2 * G); // pill: gap, icon, gap, ball, gap, icon, gap
  const total = w + 2 * (SIDE + G);
  const lift = Math.max(bottom, 12) + 12;
  const cx = width / 2, cy = height - lift - BAR_H + 16; // the orb's centre on screen
  const orb = useScale(0.93);
  const ui = useNora();
  const t = useTurn(!ui.call && !ui.chat); // still while a call or chat covers it
  // where Nora's pages grow from: the Home orb, the chat button, the orb itself
  const left = (width - total) / 2, rowY = height - lift - BAR_H / 2;
  const homeAt = { x: left + SIDE / 2, y: rowY };
  const chatAt = { x: left + SIDE + G + w - Math.max(0, G - (48 - ICON) / 2) - 24, y: rowY };
  const plusAt = { x: left + SIDE + G + Math.max(0, G - (48 - ICON) / 2) + 24, y: rowY }; // quick capture grows from here
  const [capture, setCapture] = useState(false);
  const [start, setStart] = useState<CaptureStart | null>(null); // what a hold on the + asked the panel for
  const [glasses, setGlasses] = useState(0); // glasses of water asked for from the + (QuickWater adds them)
  const quick = useQuickPlus({
    at: plusAt,
    onTap: () => { noraUi.closeHome(); setStart(null); setCapture(true); },
    onAct: (kind) => {
      noraUi.closeHome();
      if (kind === 'water') setGlasses((n) => n + 1);
      else if (kind === 'mood') onMood?.(plusAt);
      else { setStart({ kind, n: Date.now() }); setCapture(true); }
    },
  });
  const open = useSharedValue(0); // the dial
  const ringFade = useAnimatedStyle(() => ({ opacity: open.value > 0.001 ? 0 : 1 })); // the wedges take over
  const [pick, setPick] = useState(-1);
  const away = useSharedValue(0); // 1 = dropped below the screen edge
  useEffect(() => { away.set(withSpring(hidden ? 1 : 0, CLOSE)); }, [hidden, away]);
  const awayStyle = useAnimatedStyle(() => ({ opacity: 1 - away.value, transform: [{ translateY: away.value * 180 }] }));
  // gesture bookkeeping, read and written only inside the touch handlers
  const g = useRef({ ox: 0, oy: 0, x0: 0, y0: 0, t0: 0, ts: 0, moved: false, pick: -1 });
  const fan = useWorkOrb({ onTap: () => router.push('/work') });
  const needsYou = useLineCounts().needsYou ?? 0;

  const release = () => {
    const st = g.current;
    st.pick = -1;
    setPick(-1);
    open.set(withSpring(0, CLOSE));
    orb.set(1);
  };

  // The dial starts opening the moment the orb is touched; the ring sections grow straight out.
  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    st.ox = n.pageX - n.locationX + ORB / 2; // orb centre in page coordinates
    st.oy = n.pageY - n.locationY + ORB / 2;
    st.x0 = n.pageX; st.y0 = n.pageY; st.t0 = Date.now(); st.ts = n.timestamp || 0; st.moved = false; st.pick = -1;
    open.set(withSpring(1, OPEN));
    orb.set(1.04);
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  };

  const onMove = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    if (!st.moved && Math.hypot(n.pageX - st.x0, n.pageY - st.y0) >= SWIPE) st.moved = true;
    // A nudge of PICK_MOVE from where the finger landed starts choosing, by its direction. The longer the slide,
    // the more the angle is taken from the orb's centre, so far out it is the wedge under the finger.
    const travel = Math.hypot(n.pageX - st.x0, n.pageY - st.y0);
    let i = -1;
    if (travel >= PICK_MOVE) {
      const t = clamp01((travel - PICK_MOVE) / 100);
      i = sectionAt(n.pageX - (st.x0 + (st.ox - st.x0) * t), n.pageY - (st.y0 + (st.oy - st.y0) * t));
    }
    if (i !== st.pick) {
      st.pick = i;
      setPick(i);
      if (i >= 0) tap(() => Haptics.selectionAsync());
    }
  };

  // a tap is timed by the touches' own timestamps, so a busy moment on the JS thread can't turn it into a hold
  const onRelease = (e: GestureResponderEvent) => {
    const st = g.current, chosen = st.pick, ts = e.nativeEvent.timestamp || 0;
    const held = st.ts && ts ? ts - st.ts : Date.now() - st.t0;
    const quick = !st.moved && held < TAP;
    release();
    if (chosen >= 0) {
      tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      noraUi.closeHome(); // the aspect page opens under the dock, where Home sits
      onAspect(WHEEL[chosen]);
    } else if (quick) noraUi.call(); // a call: in the app, or her SIM line where this build has no call audio
  };

  return (
    <>
      <NoraUnder home={homeAt} />
      <DialLayer cx={cx} cy={cy} open={open} pick={pick} aspects={aspects} />
      <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[s.wrap, { width: total, bottom: lift }, awayStyle]}>
        <SideOrb label={`${onHome ? 'Home: back to Today' : ui.home ? 'Close Home' : 'Home: what Nora has ready for you'}${needsYou ? `. ${needsYou === 1 ? '1 call needs' : `${needsYou} calls need`} you` : ''}`}
          side="left" on={!onHome && ui.home} badge={ui.home ? 0 : needsYou}
          onPress={() => (onHome ? onHome() : noraUi.toggleHome())}><Sym name="house.fill" size={22} fallback={<Home />} /></SideOrb>
        <View style={[s.bar, { width: w, paddingHorizontal: Math.max(0, G - (48 - ICON) / 2) }]}>
          <Glass radius={BAR_H / 2} />
          {/* quick capture (src/capture): photos, water, habits, a task or a line, a voice note to Nora */}
          <PlusRound quick={quick} />
          <Round label="Chat with Nora" onPress={() => noraUi.openChat()}><Sym name="sparkle" size={22} fallback={<Nora />} /></Round>
        </View>
        <WorkOrb fan={fan} />
        <View accessible accessibilityRole="button" accessibilityLabel="Nora"
          accessibilityHint="Tap to talk. Hold and slide to open an aspect."
          onAccessibilityTap={() => noraUi.call()}
          style={s.orbWrap}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminate={release}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ringFade]}>
            <Svg width={ORB} height={ORB}><Ring aspects={aspects} /></Svg>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[s.ball, orb.style]}><Ball t={t} /></Animated.View>
        </View>
      </Animated.View>
      {fan.overlay}
      {quick.overlay}
      {/* clear of the orb's ring, which rises above the bar */}
      <Capture open={capture} from={plusAt} floor={cy - ARC_R - 12} start={start} onClose={() => setCapture(false)} />
      {glasses ? <QuickWater n={glasses} onSay={onSay} onDone={() => setGlasses(0)} /> : null}
      <NoraOver chat={chatAt} orb={{ x: cx, y: cy }} />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', height: BAR_H, alignItems: 'center' },
  abs: { position: 'absolute' },
  bar: {
    position: 'absolute', top: 0, height: BAR_H, borderRadius: BAR_H / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', top: (BAR_H - SIDE) / 2, width: SIDE, height: SIDE },
  sideLeft: { left: 0 },
  sideRight: { right: 0 },
  sideBody: {
    width: SIDE, height: SIDE, borderRadius: SIDE / 2, alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
  },
  sidePressed: { borderRadius: SIDE / 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  sideOn: { borderRadius: SIDE / 2, backgroundColor: 'rgba(255,255,255,0.16)' }, // Home is open
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0457A', borderWidth: 2, borderColor: C.scene,
  },
  badgeText: { fontFamily: F.semibold, fontSize: 11, lineHeight: 13, color: '#fff', fontVariant: ['tabular-nums'] },
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ball: {
    width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R, backgroundColor: '#F0457A',
    boxShadow: '0 6px 14px rgba(0,0,0,0.45)', // depth only, no coloured glow
  },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ORB_R, overflow: 'hidden' },
  wedge: { position: 'absolute', left: 0, top: 0, width: CAN * 2, height: CAN * 2 },
  dialTitle: { position: 'absolute', left: 0, right: 0, height: 44 },
  dialWord: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontFamily: F.semibold, fontSize: 34, lineHeight: 44, letterSpacing: -0.8,
  },
});
