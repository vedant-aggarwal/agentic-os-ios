import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Keyboard, Plus } from '@/components/Icons';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey } from '@/theme';

// The Nora bar, drawn to the canvas boards (UI1-Nora, UI2-Today): a black 240 x 64 pill, quick add and
// type-to-Nora as clear 48 pt buttons, the 72 pt orb raised 16 pt above the pill's centre with the
// nine-section dial over its top. The orb is a lit sphere turning on the axis its light comes from.
const BAR_H = 64;
const BAR_W = 240;
const ORB = 100; // canvas incl. dial and its glow
const ORB_R = 36; // the ball
const ARC_R = 46;
const ORB_TOP = BAR_H / 2 - 16 - ORB / 2; // orb centre 16 above the pill's centre
const TURN = 12000; // one turn of the sphere, ms

// Liquid Glass is iOS 26+. Older iOS, web and Android get blur under a black tint.
const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

// ---- the dial: nine sections over the top of the orb, 9 o'clock to 3 o'clock, as on UI2-Today ----
const WHEEL: AspectKey[] = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
const SPAN = 180 / WHEEL.length;
const INSET = 4.5; // degrees trimmed from each end of a section, so round caps leave a clear gap

function pt(deg: number) {
  const r = ((deg - 90) * Math.PI) / 180; // 0 = 12 o'clock, clockwise
  return `${(ORB / 2 + ARC_R * Math.cos(r)).toFixed(2)} ${(ORB / 2 + ARC_R * Math.sin(r)).toFixed(2)}`;
}
const arc = (a0: number, a1: number) => `M ${pt(a0)} A ${ARC_R} ${ARC_R} 0 0 1 ${pt(a1)}`;
const SECTIONS = WHEEL.map((k, i) => {
  const a0 = 270 + i * SPAN + INSET, a1 = 270 + (i + 1) * SPAN - INSET;
  return { k, a0, a1, color: ASPECT_COLOR[k], track: arc(a0, a1) };
});

/** Each section sits dim in its aspect's colour and fills, glowing, as that aspect's lines are ticked. */
function Dial({ aspects }: { aspects: AspectProgress }) {
  return (
    <>
      {SECTIONS.map((s) => <Path key={s.k} d={s.track} stroke={s.color} strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" fill="none" />)}
      {SECTIONS.map((s) => {
        const p = aspects[s.k];
        if (!p || !p.done || !p.total) return null;
        const d = arc(s.a0, s.a0 + (s.a1 - s.a0) * Math.min(p.done / p.total, 1));
        return (
          <G key={`f${s.k}`}>
            <Path d={d} stroke={s.color} strokeOpacity={0.3} strokeWidth={8} strokeLinecap="round" fill="none" />
            <Path d={d} stroke={s.color} strokeWidth={4} strokeLinecap="round" fill="none" />
          </G>
        );
      })}
    </>
  );
}

// ---- the sphere ----
// Light comes from up-left and toward the viewer; the highlight marks it. The sphere spins about that
// same axis, so the highlight is the pole and stays put while the surface turns around it.
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
      {/* fixed lighting: bright toward the light, falling to plum on the far side */}
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
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Ellipse cx={28} cy={25} rx={10} ry={6} fill="#FFFFFF" opacity={0.32} />
      </Svg>
    </View>
  );
}

// ---- light given off by the orb ----
/** Uneven flicker, 0..1, built from two rhythms that repeat once per turn. */
function flicker(t: number, shift: number) {
  'worklet';
  return 0.5 + 0.3 * Math.sin(Math.PI * 2 * (3 * t + shift)) + 0.2 * Math.sin(Math.PI * 2 * (5 * t + shift * 1.7));
}

type Drive = { t: SharedValue<number>; boost: SharedValue<number> };

// Two glows, each riding one surface patch: as the sphere turns, its light leans that way.
const GLOWS = [
  { id: 'glowWarm', size: 136, color: '#FF9A52', o: 0.55, follow: 0, shift: 0 },
  { id: 'glowRose', size: 128, color: '#F0457A', o: 0.45, follow: 1, shift: 0.37 },
];

function Glow({ t, boost, g }: Drive & { g: (typeof GLOWS)[number] }) {
  const p = PATCHES[g.follow];
  const style = useAnimatedStyle(() => {
    const [x, y] = surface(p.lat, p.phase, t.value);
    const k = flicker(t.value, g.shift);
    return {
      opacity: Math.min(1, 0.45 + 0.4 * k + 0.35 * boost.value),
      transform: [{ translateX: x * ORB_R * 0.22 }, { translateY: y * ORB_R * 0.22 }, { scale: 0.94 + 0.1 * k + 0.1 * boost.value }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[s.light, { width: g.size, height: g.size, top: ORB_TOP + ORB / 2 - g.size / 2 }, style]}>
      <Svg width={g.size} height={g.size}>
        <Defs>
          {/* starts at the ball's edge, so the light reads as coming off the orb */}
          <RadialGradient id={g.id} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0.5" stopColor={g.color} stopOpacity={g.o} />
            <Stop offset="1" stopColor={g.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={g.size / 2} cy={g.size / 2} r={g.size / 2} fill={`url(#${g.id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Wide warm light thrown onto what's behind the bar; it blends into the screen's bottom glow. */
function Ambient({ t, boost }: Drive) {
  const size = 210;
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, 0.7 + 0.3 * flicker(t.value, 0.15) + 0.2 * boost.value) }));
  return (
    <Animated.View pointerEvents="none" style={[s.light, { width: size, height: size, top: ORB_TOP + ORB / 2 - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="ambient" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FF7A45" stopOpacity={0.32} /><Stop offset="1" stopColor="#FF7A45" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#ambient)" />
      </Svg>
    </Animated.View>
  );
}

/** The orb's light landing on the black glass: brightest at the top edge under the orb, flickering with it. */
function Spill({ w, t, boost }: Drive & { w: number }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, 0.5 + 0.5 * flicker(t.value, 0) + 0.3 * boost.value) }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.radius, { overflow: 'hidden' }, style]}>
      <Svg width={w} height={BAR_H}>
        <Defs>
          <RadialGradient id="spill" cx="0.5" cy="0.1" r="0.5">
            <Stop offset="0" stopColor="#FF8A4C" stopOpacity={0.34} />
            <Stop offset="0.55" stopColor="#F0457A" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#F0457A" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={BAR_H} fill="url(#spill)" />
      </Svg>
    </Animated.View>
  );
}

// ---- controls ----
function usePress(to: number) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const spring = { duration: 260, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
  return {
    style,
    onPressIn: () => { scale.set(withSpring(to, spring)); },
    onPressOut: () => { scale.set(withSpring(1, spring)); },
  };
}

function Round({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const p = usePress(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={p.onPressIn} onPressOut={p.onPressOut} hitSlop={6}>
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

function Material() {
  if (LIQUID) {
    return <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor="rgba(0,0,0,0.6)" isInteractive style={[StyleSheet.absoluteFill, s.radius]} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, s.radius, { overflow: 'hidden' }]}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.radius, s.black]} />
    </View>
  );
}

export function Dock({ bottom, width, aspects, onNotBuilt }: {
  bottom: number; width: number; aspects: AspectProgress; onNotBuilt: (what: string) => void;
}) {
  const w = Math.min(width - 32, BAR_W);
  const orb = usePress(0.93);
  const t = useTurn();
  const boost = useSharedValue(0); // the light swells while the orb is held
  return (
    <View pointerEvents="box-none" style={[s.wrap, { width: w, bottom: Math.max(bottom, 12) + 12 }]}>
      <Ambient t={t} boost={boost} />
      <View style={[s.bar, { width: w }]}>
        <Material />
        <Spill w={w} t={t} boost={boost} />
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}><Plus /></Round>
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}><Keyboard /></Round>
      </View>
      {GLOWS.map((g) => <Glow key={g.id} t={t} boost={boost} g={g} />)}
      <Pressable accessibilityRole="button" accessibilityLabel="Nora" style={s.orbWrap}
        onPress={() => onNotBuilt('Talking to Nora')}
        onPressIn={() => {
          orb.onPressIn();
          boost.set(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }));
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }}
        onPressOut={() => { orb.onPressOut(); boost.set(withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) })); }}>
        <Svg width={ORB} height={ORB} style={StyleSheet.absoluteFill}><Dial aspects={aspects} /></Svg>
        <Animated.View style={[s.ball, orb.style]}><Ball t={t} /></Animated.View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', height: BAR_H, alignItems: 'center' },
  abs: { position: 'absolute' },
  radius: { borderRadius: BAR_H / 2 },
  black: { backgroundColor: 'rgba(8,8,10,0.82)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  light: { position: 'absolute', alignSelf: 'center' },
  bar: {
    position: 'absolute', top: 0, height: BAR_H, borderRadius: BAR_H / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ball: {
    width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R, backgroundColor: '#F0457A',
    boxShadow: '0 0 32px rgba(240,69,122,0.45)',
  },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: ORB_R, overflow: 'hidden' },
});
