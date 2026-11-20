import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';

// The Nora bar, drawn to the canvas board "C. Nora" (UI1-Nora): a 240 x 64 glass pill, quick add and
// type-to-Nora as clear 48 pt buttons, the 72 pt orb raised 16 pt above the pill's centre.
// The orb keeps its life-wheel arc and Nora's light.
const BAR_H = 64;
const BAR_W = 240;
const BTN = 48;
const ORB = 96; // canvas incl. arc
const ORB_R = 36; // the ball
const ARC_R = 42;
const ORB_TOP = BAR_H / 2 - 16 - ORB / 2; // orb centre 16 above the pill's centre
const HALO = 220;
const GLOW = 112;

// Liquid Glass is iOS 26+. Older iOS, web and Android get blur with a drawn rim.
const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

// Life wheel, clockwise from 12. Self (warm) flows into People (pinks, centred at the bottom),
// then Work (greens) back up to Self, so neighbouring colours always blend.
const WHEEL: AspectKey[] = ['soul', 'mind', 'body', 'family', 'romance', 'friends', 'money', 'mission', 'growth'];
const STEP = 360 / WHEEL.length;
const SEG = 4; // degrees per drawn slice

function rgb(hex: string) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
function colorAt(deg: number) {
  const t = ((((deg - STEP / 2) % 360) + 360) % 360) / STEP;
  const i = Math.floor(t), k = t - i;
  const a = rgb(ASPECT_COLOR[WHEEL[i % 9]]), b = rgb(ASPECT_COLOR[WHEEL[(i + 1) % 9]]);
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
}
function pt(deg: number) {
  const r = ((deg - 90) * Math.PI) / 180;
  return `${(ORB / 2 + ARC_R * Math.cos(r)).toFixed(2)} ${(ORB / 2 + ARC_R * Math.sin(r)).toFixed(2)}`;
}
// One continuous track: thin overlapping slices, each tinted for where it sits on the wheel.
const SLICES = Array.from({ length: 360 / SEG }, (_, i) => {
  const a0 = i * SEG;
  return { a0, d: `M ${pt(a0)} A ${ARC_R} ${ARC_R} 0 0 1 ${pt(a0 + SEG + 0.6)}`, c: colorAt(a0 + SEG / 2) };
});

/** The arc: dim everywhere, lit and glowing only where today's lines for that aspect are ticked. */
function Arc({ aspects }: { aspects: AspectProgress }) {
  const lit = SLICES.filter(({ a0 }) => {
    const idx = Math.floor(a0 / STEP);
    const p = aspects[WHEEL[idx]];
    if (!p || !p.done) return false;
    return a0 + SEG / 2 - idx * STEP <= (STEP * p.done) / p.total;
  });
  return (
    <>
      {/* group opacity, so overlapping slices don't stack into dots at their joints */}
      <G opacity={0.26}>{SLICES.map((s) => <Path key={s.a0} d={s.d} stroke={s.c} strokeWidth={2.5} fill="none" />)}</G>
      <G opacity={0.22}>{lit.map((s) => <Path key={`h${s.a0}`} d={s.d} stroke={s.c} strokeWidth={8} fill="none" />)}</G>
      {lit.map((s) => <Path key={`l${s.a0}`} d={s.d} stroke={s.c} strokeWidth={2.5} fill="none" />)}
    </>
  );
}

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

/** Nora's light: a wide soft halo behind the glass and a tighter breathing glow at the ball. */
function Light({ which }: { which: 'halo' | 'glow' }) {
  const reduce = useReducedMotion();
  const breath = useSharedValue(0.5);
  useEffect(() => {
    if (reduce) return;
    breath.value = 0;
    breath.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, breath]);
  const big = which === 'halo';
  const style = useAnimatedStyle(() => (big
    ? { opacity: 0.85 + breath.value * 0.15, transform: [{ scale: 0.96 + breath.value * 0.06 }] }
    : { opacity: 0.6 + breath.value * 0.4, transform: [{ scale: 0.9 + breath.value * 0.2 }] }));
  const size = big ? HALO : GLOW;
  return (
    <Animated.View pointerEvents="none" style={[s.light, { width: size, height: size, top: ORB_TOP + ORB / 2 - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {big ? (
            <RadialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FF8A4C" stopOpacity={0.42} />
              <Stop offset="0.38" stopColor="#F0457A" stopOpacity={0.16} />
              <Stop offset="0.7" stopColor="#6E1A55" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#6E1A55" stopOpacity={0} />
            </RadialGradient>
          ) : (
            <RadialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FF8A4C" stopOpacity={0.75} />
              <Stop offset="0.45" stopColor="#F0457A" stopOpacity={0.32} />
              <Stop offset="0.7" stopColor="#F0457A" stopOpacity={0} />
            </RadialGradient>
          )}
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={big ? 'url(#halo)' : 'url(#glow)'} />
      </Svg>
    </Animated.View>
  );
}

function Material({ w }: { w: number }) {
  if (LIQUID) {
    return <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive style={[StyleSheet.absoluteFill, s.radius]} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, s.radius, { overflow: 'hidden' }]}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(31,31,31,0.6)' }]} />
      {/* the board's hairline edge, a touch brighter where light catches the top */}
      <Svg width={w} height={BAR_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.05} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={BAR_H} rx={BAR_H / 2} fill="url(#sheen)" />
        <Rect x={0.5} y={0.5} width={w - 1} height={BAR_H - 1} rx={(BAR_H - 1) / 2} fill="none" stroke="url(#rim)" />
      </Svg>
    </View>
  );
}

export function Dock({ bottom, width, aspects, onNotBuilt }: {
  bottom: number; width: number; aspects: AspectProgress; onNotBuilt: (what: string) => void;
}) {
  const w = Math.min(width - 32, BAR_W);
  const orb = usePress(0.93);
  return (
    <View pointerEvents="box-none" style={[s.wrap, { width: w, bottom: Math.max(bottom, 12) + 12 }]}>
      {/* behind the bar, so the glass carries the orb's light */}
      <Light which="halo" />
      <View style={[s.bar, { width: w }]}>
        <Material w={w} />
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}>
          <Svg width={24} height={24} viewBox="0 0 256 256" fill="none" stroke={C.text} strokeWidth={20} strokeLinecap="round">
            <Path d="M40 128h176M128 40v176" />
          </Svg>
        </Round>
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}>
          <Svg width={24} height={24} viewBox="0 0 256 256" fill="none" stroke={C.text} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={24} y={56} width={208} height={144} rx={8} />
            <Path d="M64 96h8M104 96h8M144 96h8M184 96h8M80 160h96" />
          </Svg>
        </Round>
      </View>
      <Light which="glow" />
      <Pressable accessibilityRole="button" accessibilityLabel="Nora" style={s.orbWrap}
        onPress={() => onNotBuilt('Talking to Nora')}
        onPressIn={() => { orb.onPressIn(); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
        onPressOut={orb.onPressOut}>
        <Svg width={ORB} height={ORB} style={StyleSheet.absoluteFill}><Arc aspects={aspects} /></Svg>
        <Animated.View style={[s.ball, orb.style]}>
          <Svg width={ORB_R * 2} height={ORB_R * 2}>
            <Defs>
              <RadialGradient id="orb" cx="0.36" cy="0.32" r="0.72">
                <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.32" stopColor="#FFA15C" />
                <Stop offset="0.72" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
              </RadialGradient>
            </Defs>
            <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orb)" />
            <Ellipse cx={ORB_R * (28 / 36)} cy={ORB_R * (25 / 36)} rx={10} ry={6} fill="#FFFFFF" opacity={0.32} />
          </Svg>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', height: BAR_H, alignItems: 'center' },
  radius: { borderRadius: BAR_H / 2 },
  light: { position: 'absolute', alignSelf: 'center' },
  bar: {
    position: 'absolute', top: 0, height: BAR_H, borderRadius: BAR_H / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8,
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
  },
  round: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center' },
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ball: {
    width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R, backgroundColor: '#F0457A',
    boxShadow: '0 8px 24px rgba(240,69,122,0.35)',
  },
});
