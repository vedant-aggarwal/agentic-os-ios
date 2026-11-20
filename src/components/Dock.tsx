import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';

// Bottom bar: quick add, the Nora orb in its life-wheel ring, type to Nora. Compact glass pill.
const BAR_H = 56;
const BTN = 44;
const ORB = 76; // orb canvas incl. ring
const GAP = 10; // button to orb
const PAD = 6;
const BAR_W = PAD * 2 + BTN * 2 + GAP * 2 + ORB;
const ORB_TOP = -18; // orb rises above the pill
const ORB_CY = ORB_TOP + ORB / 2;
const AURA = 240;

// Liquid Glass is iOS 26+. Older iOS, web and Android get blur plus a drawn glass rim.
const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

// Life wheel, clockwise from 12 o'clock. Ordered so each colour flows into the next,
// with People centred at the bottom: Self (warm) → People (pinks) → Work (cool) → back to Self.
const WHEEL: AspectKey[] = ['soul', 'mind', 'body', 'family', 'romance', 'friends', 'money', 'mission', 'growth'];
const SEGMENTS = 90;
const R = 34;

function rgb(hex: string) { return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); }
function lerp(a: string, b: string, k: number) {
  const x = rgb(a), y = rgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`;
}
function colorAt(deg: number) {
  // Each aspect owns 40°, its pure colour at the middle of its arc.
  const step = 360 / WHEEL.length;
  const t = (((deg - step / 2) % 360) + 360) % 360 / step;
  const i = Math.floor(t);
  return lerp(ASPECT_COLOR[WHEEL[i % WHEEL.length]], ASPECT_COLOR[WHEEL[(i + 1) % WHEEL.length]], t - i);
}
function point(deg: number, r: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(ORB / 2 + r * Math.cos(a)).toFixed(2)} ${(ORB / 2 + r * Math.sin(a)).toFixed(2)}`;
}
// Short overlapping arcs so the ring reads as one continuous sweep with no seams.
const RING = Array.from({ length: SEGMENTS }, (_, i) => {
  const a0 = (i * 360) / SEGMENTS, a1 = a0 + 360 / SEGMENTS + 0.8;
  return { d: `M ${point(a0, R)} A ${R} ${R} 0 0 1 ${point(a1, R)}`, c: colorAt(a0 + 180 / SEGMENTS) };
});

function Round({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [s.round, pressed && { transform: [{ scale: 0.92 }], backgroundColor: 'rgba(255,255,255,0.14)' }]}>
      {children}
    </Pressable>
  );
}

const FAMILY_GLOW = { self: '#FFC46B', people: '#FF6FB5', work: '#3DD9B0' } as const;

/** Soft light the orb throws around itself: warm core plus the three family hues, slowly turning and breathing. */
function Aura() {
  const reduce = useReducedMotion();
  const breath = useSharedValue(0);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    breath.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.sin) }), -1, true);
    // sway, not spin: each hue stays near its arc of the ring
    turn.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, breath, turn]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.8 + breath.value * 0.2,
    transform: [{ rotate: `${(turn.value - 0.5) * 24}deg` }, { scale: 0.92 + breath.value * 0.12 }],
  }));
  const h = AURA / 2;
  return (
    <Animated.View pointerEvents="none" style={[s.aura, style]}>
      <Svg width={AURA} height={AURA}>
        <Defs>
          <RadialGradient id="core" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFB07A" stopOpacity={0.7} />
            <Stop offset="0.3" stopColor="#F2607E" stopOpacity={0.32} />
            <Stop offset="0.62" stopColor="#B06BE0" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#B06BE0" stopOpacity={0} />
          </RadialGradient>
          {(Object.keys(FAMILY_GLOW) as (keyof typeof FAMILY_GLOW)[]).map((k) => (
            <RadialGradient key={k} id={`a-${k}`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={FAMILY_GLOW[k]} stopOpacity={0.38} />
              <Stop offset="1" stopColor={FAMILY_GLOW[k]} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Circle cx={h} cy={h} r={h} fill="url(#core)" />
        {/* same placement as the ring: Self upper right, People below, Work upper left */}
        <Circle cx={h + 26} cy={h - 18} r={58} fill="url(#a-self)" />
        <Circle cx={h} cy={h + 30} r={62} fill="url(#a-people)" />
        <Circle cx={h - 26} cy={h - 18} r={58} fill="url(#a-work)" />
      </Svg>
    </Animated.View>
  );
}

function Material() {
  if (LIQUID) {
    return <GlassView glassEffectStyle="regular" colorScheme="dark" isInteractive style={[StyleSheet.absoluteFill, s.radius]} />;
  }
  return (
    <View style={[StyleSheet.absoluteFill, s.radius, { overflow: 'hidden' }]}>
      <BlurView intensity={60} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(16,18,22,0.32)' }]} />
      {/* glass: bright top edge, sheen fading down, faint refracted light along the bottom */}
      <Svg width={BAR_W} height={BAR_H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.14} />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.02} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.05} />
          </LinearGradient>
          <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.42} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.18} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={BAR_W} height={BAR_H} rx={BAR_H / 2} fill="url(#sheen)" />
        <Rect x={0.5} y={0.5} width={BAR_W - 1} height={BAR_H - 1} rx={(BAR_H - 1) / 2} fill="none" stroke="url(#rim)" strokeWidth={1} />
      </Svg>
    </View>
  );
}

export function Dock({ bottom, onNotBuilt }: { bottom: number; onNotBuilt: (what: string) => void }) {
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(bottom, 12) + 12 }]}>
      {/* behind the pill, so the glass picks up the orb's light */}
      <Aura />
      <View style={s.bar}>
        <Material />
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={2} strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>
        </Round>
        <View style={{ width: ORB }} />
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M4.5 5.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM6.5 9.5h.01M10 9.5h.01M14 9.5h.01M17.5 9.5h.01M8 14.5h8" />
          </Svg>
        </Round>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Nora" onPress={() => onNotBuilt('Talking to Nora')}
        style={({ pressed }) => [s.orbWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
        <Svg width={ORB} height={ORB} viewBox={`0 0 ${ORB} ${ORB}`}>
          <Defs>
            <RadialGradient id="orb" cx="0.34" cy="0.28" r="0.8" fx="0.34" fy="0.28">
              <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.28" stopColor="#FFA15C" />
              <Stop offset="0.62" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
            </RadialGradient>
            <RadialGradient id="orbShade" cx="0.7" cy="0.8" r="0.6">
              <Stop offset="0" stopColor="#6E1A55" stopOpacity={0.55} /><Stop offset="1" stopColor="#6E1A55" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="spec" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.7} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {/* ring glow, then the ring itself */}
          <G opacity={0.35}>
            {RING.map((g, i) => <Path key={`g${i}`} d={g.d} stroke={g.c} strokeWidth={6} fill="none" />)}
          </G>
          {RING.map((g, i) => <Path key={i} d={g.d} stroke={g.c} strokeWidth={2.5} fill="none" />)}
          <Circle cx={ORB / 2} cy={ORB / 2} r={27} fill="url(#orb)" />
          <Circle cx={ORB / 2} cy={ORB / 2} r={27} fill="url(#orbShade)" />
          <Ellipse cx={ORB / 2 - 8} cy={ORB / 2 - 11} rx={9} ry={6} fill="url(#spec)" transform={`rotate(-30 ${ORB / 2 - 8} ${ORB / 2 - 11})`} />
        </Svg>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', width: BAR_W, height: BAR_H },
  radius: { borderRadius: BAR_H / 2 },
  aura: { position: 'absolute', width: AURA, height: AURA, left: (BAR_W - AURA) / 2, top: ORB_CY - AURA / 2 },
  bar: {
    position: 'absolute', left: 0, right: 0, top: 0, height: BAR_H, borderRadius: BAR_H / 2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: PAD,
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  round: { width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  orbWrap: { position: 'absolute', top: ORB_TOP, width: ORB, height: ORB, alignSelf: 'center' },
});
