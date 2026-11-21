import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { Home, Nora, Scan, Work } from '@/components/Icons';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';

// The Nora bar, from the canvas boards (UI1-Nora, UI2-Today): a black 208 x 64 pill between two floating
// 64 pt orbs (Home, Work). Scan and Nora's chat sit in the pill as clear 48 pt buttons, the 72 pt orb raised
// 16 pt above the pill's centre with the
// nine-section ring over its top. Tap the orb to talk; hold it and the ring opens into the dial.
const BAR_H = 64;
const BAR_W = 208;
const SIDE = BAR_H; // the floating orbs either side of the pill, as tall as it
const SIDE_GAP = 8;
const ORB = 100; // canvas incl. ring and its glow
const ORB_R = 36; // the ball
const ARC_R = 46;
const ORB_TOP = BAR_H / 2 - 16 - ORB / 2; // orb centre 16 above the pill's centre
const TURN = 12000; // one turn of the sphere, ms
const HOLD = 280; // ms before a press held still becomes a hold
const SWIPE = 8; // pt of travel that turns a press into a swipe

// The dial the ring opens into (board: wedges at r140, 36 thick, labels at r172)
const DIAL_R = 140;
const DIAL_W = 36;
const PICK_W = 44;
const LABEL_R = 172;
const CAN = 200; // half-size of each wedge's canvas, centred on the orb
const PICK_MIN = 60; // finger must be this far from the orb's centre to choose

// Liquid Glass is iOS 26+. Older iOS, web and Android get blur under a black tint.
const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

const tap = (fn: () => Promise<void>) => { if (Platform.OS !== 'web') fn().catch(() => {}); };

// ---- the ring: nine sections over the top of the orb, 9 o'clock to 3 o'clock, as on UI2-Today ----
const WHEEL: AspectKey[] = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
const LABEL: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth',
  family: 'Family', romance: 'Romance', friends: 'Friends',
};
const SPAN = 180 / WHEEL.length;

/** Point on a circle around (c, c); 0 deg = 12 o'clock, clockwise. */
function at(c: number, r: number, deg: number) {
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
/** A ring segment between radii ri..ro and angles a0..a1, with its four corners rounded by rc. */
function sector(c: number, ri: number, ro: number, a0: number, a1: number, rc: number) {
  const deg = (r: number) => (rc / r) * (180 / Math.PI);
  const P = (r: number, a: number) => at(c, r, a).map((v) => v.toFixed(2)).join(' ');
  const o = deg(ro), n = deg(ri);
  return [
    `M ${P(ro, a0 + o)}`, `A ${ro} ${ro} 0 0 1 ${P(ro, a1 - o)}`, `Q ${P(ro, a1)} ${P(ro - rc, a1)}`,
    `L ${P(ri + rc, a1)}`, `Q ${P(ri, a1)} ${P(ri, a1 - n)}`, `A ${ri} ${ri} 0 0 0 ${P(ri, a0 + n)}`,
    `Q ${P(ri, a0)} ${P(ri + rc, a0)}`, `L ${P(ro - rc, a0)}`, `Q ${P(ro, a0)} ${P(ro, a0 + o)}`, 'Z',
  ].join(' ');
}
const DIAL = WHEEL.map((k, i) => {
  const a0 = 270 + i * SPAN + 1.5, a1 = 270 + (i + 1) * SPAN - 1.5, mid = (a0 + a1) / 2;
  const [lx, ly] = at(CAN, LABEL_R, mid);
  // chosen, a wedge spreads into its hidden neighbours' room: twice the span and thicker
  const d = sector(CAN, DIAL_R - DIAL_W / 2, DIAL_R + DIAL_W / 2, a0, a1, 6);
  const dp = sector(CAN, DIAL_R - PICK_W / 2, DIAL_R + PICK_W / 2, mid - SPAN * 0.85, mid + SPAN * 0.85, 12);
  // the ring is narrower than the dial, so each wedge starts turned to its ring section and fans out
  const turn = RING_START + (i + 0.5) * RING_SPAN - mid;
  return { k, color: ASPECT_COLOR[k], d, dp, lx, ly: ly + 4, turn };
});

/** Which section a finger at (vx, vy) from the orb's centre is over, or -1. */
function sectionAt(vx: number, vy: number) {
  if (Math.hypot(vx, vy) < PICK_MIN) return -1;
  const deg = ((Math.atan2(vy, vx) * 180) / Math.PI + 90 + 360) % 360;
  let u = (deg - 270 + 360) % 360; // 0 at 9 o'clock, 180 at 3 o'clock, over the top
  if (u > 180) u = vx < 0 ? 0 : 179.9;
  return Math.min(WHEEL.length - 1, Math.floor(u / SPAN));
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
const OPEN = { duration: 380, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const SWAP = { duration: 260, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;

/** One wedge. It grows out of its ring section as the dial opens; chosen, it swells and the rest fall away. */
function Wedge({ i, open, state, progress }: {
  i: number; open: SharedValue<number>; state: 'idle' | 'picked' | 'hidden'; progress?: { done: number; total: number };
}) {
  const w = DIAL[i];
  const e = useSharedValue(0); // -1 hidden, 0 idle, 1 chosen
  useEffect(() => { e.set(withSpring(state === 'picked' ? 1 : state === 'hidden' ? -1 : 0, SWAP)); }, [state, e]);
  const outer = useAnimatedStyle(() => {
    const o = open.value, pick = Math.max(e.value, 0), hide = Math.max(-e.value, 0);
    const grow = ARC_R / DIAL_R + (1 - ARC_R / DIAL_R) * o; // from the ring's radius out to the dial's
    return {
      opacity: o * (1 - hide),
      transform: [{ rotate: `${w.turn * (1 - o)}deg` }, { scale: grow * (1 + 0.08 * pick - 0.1 * hide) }],
    };
  });
  const idle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(e.value, 0) }));
  const chosen = useAnimatedStyle(() => ({ opacity: Math.max(e.value, 0) }));
  const has = !!progress?.total, got = !!progress?.done;
  return (
    <Animated.View pointerEvents="none" style={[s.wedge, outer]}>
      <Animated.View style={[StyleSheet.absoluteFill, idle]}>
        <Svg width={CAN * 2} height={CAN * 2}>
          <Path d={w.d} fill={w.color} fillOpacity={got ? 0.85 : 0.3} />
          <SvgText x={w.lx} y={w.ly} textAnchor="middle" fontFamily={F.semibold} fontSize={12}
            fill={got ? w.color : has ? C.muted : C.faint}>{LABEL[w.k]}</SvgText>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, chosen]}>
        <Svg width={CAN * 2} height={CAN * 2}>
          {/* soft light around the chosen wedge; the title above names it */}
          <Path d={w.dp} fill={w.color} stroke={w.color} strokeOpacity={0.22} strokeWidth={16} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

function DialLayer({ cx, cy, open, pick, aspects }: {
  cx: number; cy: number; open: SharedValue<number>; pick: number; aspects: AspectProgress;
}) {
  const fade = useAnimatedStyle(() => ({ opacity: open.value }));
  const k = pick >= 0 ? WHEEL[pick] : null;
  const p = k ? aspects[k] : undefined;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, fade]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,8,10,0.72)' }]} />
      </Animated.View>
      <View style={{ position: 'absolute', left: cx - CAN, top: cy - CAN, width: CAN * 2, height: CAN * 2 }}>
        {WHEEL.map((key, i) => (
          <Wedge key={key} i={i} open={open} progress={aspects[key]} state={pick < 0 ? 'idle' : pick === i ? 'picked' : 'hidden'} />
        ))}
      </View>
      <Animated.View style={[s.dialTitle, { top: cy - LABEL_R - 84 }, fade]}>
        <Text style={s.dialHead}>{k ? `Release to open ${LABEL[k]}` : 'Slide to an aspect'}</Text>
        <Text style={s.dialSub}>{k ? (p?.total ? `${p.done} of ${p.total} done today` : 'Nothing due today') : 'Let go to close'}</Text>
      </Animated.View>
    </View>
  );
}

// ---- the sphere ----
// Light comes from up-left and toward the viewer. The sphere spins about that same axis, so the
// surface turns around the light while the highlight drifts with it.
const AX = (() => { const v = [-0.26, -0.34, 0.9], n = Math.hypot(...v); return v.map((c) => c / n); })();
const E1 = (() => { const n = Math.hypot(AX[1], AX[0]); return [AX[1] / n, -AX[0] / n, 0]; })();
const E2 = [AX[1] * E1[2] - AX[2] * E1[1], AX[2] * E1[0] - AX[0] * E1[2], AX[0] * E1[1] - AX[1] * E1[0]];

/** Where a surface point at `lat` (radians from the pole) and `phase` sits at time t, in unit-sphere coords. */
function surface(lat: number, phase: number, t: number) {
  'worklet';
  const th = phase + t * Math.PI * 2, s = Math.sin(lat), c = Math.cos(lat), ct = Math.cos(th), st = Math.sin(th);
  return [
    c * AX[0] + s * (ct * E1[0] + st * E2[0]),
    c * AX[1] + s * (ct * E1[1] + st * E2[1]),
    c * AX[2] + s * (ct * E1[2] + st * E2[2]),
  ];
}

// Colour on the sphere's surface: warm near the pole, rose and plum further round.
const PATCHES = [
  { lat: 0.7, phase: 0, size: 30, color: '#FFE2AE', o: 0.55 },
  { lat: 1.2, phase: 2.2, size: 34, color: '#FF4F86', o: 0.55 },
  { lat: 1.0, phase: 4.3, size: 28, color: '#FFB067', o: 0.5 },
  { lat: 1.45, phase: 1.1, size: 38, color: '#7A1F5C', o: 0.5 },
  { lat: 0.4, phase: 3.4, size: 18, color: '#FFD49A', o: 0.35 },
];

/** A patch of colour riding the surface, foreshortened toward the limb and hidden round the back. */
function Patch({ t, i }: { t: SharedValue<number>; i: number }) {
  const p = PATCHES[i];
  const style = useAnimatedStyle(() => {
    const [x, y, z] = surface(p.lat, p.phase, t.value);
    return {
      opacity: p.o * Math.min(Math.max(z * 2.5, 0), 1),
      transform: [
        { translateX: x * ORB_R }, { translateY: y * ORB_R },
        { rotate: `${Math.atan2(y, x)}rad` }, { scaleX: Math.max(z, 0.08) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[s.abs, { width: p.size, height: p.size, left: ORB_R - p.size / 2, top: ORB_R - p.size / 2 }, style]}>
      <Svg width={p.size} height={p.size}>
        <Defs>
          <RadialGradient id={`patch${i}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={p.color} stopOpacity={1} /><Stop offset="1" stopColor={p.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={p.size / 2} cy={p.size / 2} r={p.size / 2} fill={`url(#patch${i})`} />
      </Svg>
    </Animated.View>
  );
}

function Ball({ t }: { t: SharedValue<number> }) {
  const D = ORB_R * 2;
  return (
    <View style={s.clip}>
      {/* lighting: bright toward the light, falling to plum on the far side */}
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orb" cx="0.36" cy="0.32" r="0.72">
            <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.32" stopColor="#FFA15C" />
            <Stop offset="0.72" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
          </RadialGradient>
        </Defs>
        <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orb)" />
      </Svg>
      {PATCHES.map((p, i) => <Patch key={p.color} t={t} i={i} />)}
    </View>
  );
}

// ---- controls ----
function useScale(to: number) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const spring = { duration: 260, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
  return { style, set: (v: number) => { scale.set(withSpring(v, spring)); }, to };
}

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

/** The sphere's clock, 0..1 per turn. Holds still under Reduce Motion. */
function useTurn() {
  const reduce = useReducedMotion();
  const t = useSharedValue(0.12);
  useEffect(() => {
    if (reduce) return;
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: TURN, easing: Easing.linear }), -1, false));
  }, [reduce, t]);
  return t;
}

function Material({ radius = BAR_H / 2 }: { radius?: number }) {
  const r = { borderRadius: radius };
  if (LIQUID) {
    return <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor="rgba(0,0,0,0.6)" isInteractive style={[StyleSheet.absoluteFill, r]} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, r, { overflow: 'hidden' }]}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, r, s.black]} />
    </View>
  );
}

/** A floating orb beside the pill: the same black glass, detached, holding one page. */
function SideOrb({ label, side, onPress, children }: {
  label: string; side: 'left' | 'right'; onPress: () => void; children: React.ReactNode;
}) {
  const p = useScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} style={[s.side, side === 'left' ? s.sideLeft : s.sideRight]}>
      {({ pressed }) => (
        <Animated.View style={[s.sideBody, p.style]}>
          <Material radius={SIDE / 2} />
          {pressed ? <View style={[StyleSheet.absoluteFill, s.sidePressed]} /> : null}
          {/* own view, so the icon stacks above the glass on web too */}
          <View>{children}</View>
        </Animated.View>
      )}
    </Pressable>
  );
}

export function Dock({ bottom, width, aspects, onNotBuilt }: {
  bottom: number; width: number; aspects: AspectProgress; onNotBuilt: (what: string) => void;
}) {
  const { height } = useWindowDimensions();
  const w = Math.min(width - 32 - 2 * (SIDE + SIDE_GAP), BAR_W);
  const total = w + 2 * (SIDE + SIDE_GAP);
  const lift = Math.max(bottom, 12) + 12;
  const cx = width / 2, cy = height - lift - BAR_H + 16; // the orb's centre on screen
  const orb = useScale(0.93);
  const t = useTurn();
  const open = useSharedValue(0); // the dial
  const ringFade = useAnimatedStyle(() => ({ opacity: 1 - open.value }));
  const [pick, setPick] = useState(-1);
  // gesture bookkeeping, read and written only inside the touch handlers
  const g = useRef({ ox: 0, oy: 0, x0: 0, y0: 0, moved: false, open: false, pick: -1, timer: null as ReturnType<typeof setTimeout> | null });

  const release = () => {
    const st = g.current;
    if (st.timer) clearTimeout(st.timer);
    st.timer = null;
    st.open = false;
    st.pick = -1;
    setPick(-1);
    open.set(withSpring(0, CLOSE));
    orb.set(1);
  };

  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    st.ox = n.pageX - n.locationX + ORB / 2; // orb centre in page coordinates
    st.oy = n.pageY - n.locationY + ORB / 2;
    st.x0 = n.pageX; st.y0 = n.pageY; st.moved = false; st.open = false; st.pick = -1;
    orb.set(orb.to);
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    st.timer = setTimeout(openDial, HOLD); // holding still also opens it
  };

  const openDial = () => {
    const st = g.current;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    if (st.open) return;
    st.open = true;
    open.set(withSpring(1, OPEN));
    orb.set(1.04);
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  };

  const onMove = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    if (!st.open) {
      // a swipe off the orb opens the dial straight away; a small wobble still counts as a tap
      if (Math.hypot(n.pageX - st.x0, n.pageY - st.y0) < SWIPE) return;
      st.moved = true;
      openDial();
    }
    const i = sectionAt(n.pageX - st.ox, n.pageY - st.oy);
    if (i !== st.pick) {
      st.pick = i;
      setPick(i);
      if (i >= 0) tap(() => Haptics.selectionAsync());
    }
  };

  const onRelease = () => {
    const st = g.current, wasOpen = st.open, chosen = st.pick, moved = st.moved;
    release();
    if (wasOpen) {
      if (chosen >= 0) {
        tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        onNotBuilt(`${LABEL[WHEEL[chosen]]} page`);
      }
    } else if (!moved) onNotBuilt('Talking to Nora');
  };

  return (
    <>
      <DialLayer cx={cx} cy={cy} open={open} pick={pick} aspects={aspects} />
      <View pointerEvents="box-none" style={[s.wrap, { width: total, bottom: lift }]}>
        <SideOrb label="Home: what Nora has ready for you" side="left" onPress={() => onNotBuilt('Home')}><Home /></SideOrb>
        <View style={[s.bar, { width: w }]}>
          <Material />
          <Round label="Scan" onPress={() => onNotBuilt('Scan')}><Scan /></Round>
          <Round label="Chat with Nora" onPress={() => onNotBuilt('Nora chat')}><Nora /></Round>
        </View>
        <SideOrb label="Work" side="right" onPress={() => onNotBuilt('Work')}><Work /></SideOrb>
        <View accessible accessibilityRole="button" accessibilityLabel="Nora"
          accessibilityHint="Tap to talk. Hold and slide to open an aspect."
          onAccessibilityTap={() => onNotBuilt('Talking to Nora')}
          style={s.orbWrap}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => !g.current.open}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminate={release}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ringFade]}>
            <Svg width={ORB} height={ORB}><Ring aspects={aspects} /></Svg>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[s.ball, orb.style]}><Ball t={t} /></Animated.View>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', height: BAR_H, alignItems: 'center' },
  abs: { position: 'absolute' },
  black: { backgroundColor: 'rgba(8,8,10,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  bar: {
    position: 'absolute', top: 0, height: BAR_H, borderRadius: BAR_H / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
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
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ball: {
    width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R, backgroundColor: '#F0457A',
    boxShadow: '0 6px 14px rgba(0,0,0,0.45)', // depth only, no coloured glow
  },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ORB_R, overflow: 'hidden' },
  wedge: { position: 'absolute', left: 0, top: 0, width: CAN * 2, height: CAN * 2 },
  dialTitle: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 4 },
  dialHead: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  dialSub: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
});
