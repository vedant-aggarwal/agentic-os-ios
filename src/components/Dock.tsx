import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';

// The Nora bar from the Today prototype: quick add, the orb in its life-wheel arc, type to Nora.
// Prototype sizes (64 bar, 48 buttons, 96 orb); width trimmed from 360 so the buttons sit nearer the orb.
const BAR_H = 64;
const BAR_MAX_W = 320;
const BTN = 48;
const ORB = 96; // canvas incl. arc
const ORB_R = 34; // the ball
const ARC_R = 44;
const ORB_TOP = -30; // rises out of the bar
const HALO = 240;
const GLOW = 120;

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
      <G opacity={0.26}>{SLICES.map((s) => <Path key={s.a0} d={s.d} stroke={s.c} strokeWidth={3} fill="none" />)}</G>
      <G opacity={0.22}>{lit.map((s) => <Path key={`h${s.a0}`} d={s.d} stroke={s.c} strokeWidth={9} fill="none" />)}</G>
      {lit.map((s) => <Path key={`l${s.a0}`} d={s.d} stroke={s.c} strokeWidth={3} fill="none" />)}
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
        <Animated.View style={[s.round, p.style, pressed && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>{children}</Animated.View>
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
      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,38,34,0.5)' }]} />
      {/* light catching the material: bright top edge, faint sheen, a softer return along the bottom */}
      <Svg width={w} height={BAR_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.08} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.05} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.1} />
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
  const w = Math.min(width - 32, BAR_MAX_W);
  const orb = usePress(0.93);
  return (
    <View pointerEvents="box-none" style={[s.wrap, { width: w, bottom: Math.max(bottom, 12) + 12 }]}>
      {/* behind the bar, so the glass carries the orb's light */}
      <Light which="halo" />
      <View style={[s.bar, { width: w }]}>
        <Material w={w} />
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
        </Round>
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M8 14.5h8" />
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
              <RadialGradient id="orb" cx="0.34" cy="0.28" r="0.8" fx="0.34" fy="0.28">
                <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.28" stopColor="#FFA15C" />
                <Stop offset="0.62" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
              </RadialGradient>
              <RadialGradient id="orbShade" cx="0.72" cy="0.82" r="0.62">
                <Stop offset="0" stopColor="#6E1A55" stopOpacity={0.6} /><Stop offset="1" stopColor="#6E1A55" stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="orbLift" cx="0.3" cy="0.24" r="0.42">
                <Stop offset="0" stopColor="#FFE3B0" stopOpacity={0.55} /><Stop offset="1" stopColor="#FFE3B0" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orb)" />
            <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orbShade)" />
            <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orbLift)" />
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
    // deep shadow under the whole bar plus the orb's warm under-glow (prototype values)
    boxShadow: '0 28px 56px -10px rgba(0,0,0,0.8), 0 10px 24px rgba(0,0,0,0.5), 0 20px 56px -14px rgba(255,138,76,0.45)',
  },
  round: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ball: {
    width: ORB_R * 2, height: ORB_R * 2, borderRadius: ORB_R, backgroundColor: '#F0457A',
    boxShadow: '0 0 22px rgba(255,138,76,0.6), 0 10px 24px rgba(0,0,0,0.5)',
  },
});
