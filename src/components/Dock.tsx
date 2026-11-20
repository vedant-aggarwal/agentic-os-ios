import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { Keyboard, Plus } from '@/components/Icons';
import type { AspectProgress } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey } from '@/theme';

// The Nora bar, drawn to the canvas boards (UI1-Nora, UI2-Today): a black 240 x 64 pill, quick add and
// type-to-Nora as clear 48 pt buttons, the 72 pt orb raised 16 pt above the pill's centre, wearing
// the nine-section life wheel and giving off its own light.
const BAR_H = 64;
const BAR_W = 240;
const ORB = 100; // canvas incl. arc and its glow
const ORB_R = 36; // the ball
const ARC_R = 44;
const ORB_TOP = BAR_H / 2 - 16 - ORB / 2; // orb centre 16 above the pill's centre
const AMBIENT = 200;
const GLOW = 136;

// Liquid Glass is iOS 26+. Older iOS, web and Android get blur under a black tint.
const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

// Life wheel, clockwise from 12, nine sections. Self (warm) flows into People (centred at the bottom),
// then Work back up to Self.
const WHEEL: AspectKey[] = ['soul', 'mind', 'body', 'family', 'romance', 'friends', 'money', 'mission', 'growth'];
const STEP = 360 / WHEEL.length;
const GAP = 6; // degrees between sections

function pt(deg: number) {
  const r = ((deg - 90) * Math.PI) / 180;
  return `${(ORB / 2 + ARC_R * Math.cos(r)).toFixed(2)} ${(ORB / 2 + ARC_R * Math.sin(r)).toFixed(2)}`;
}
const arc = (a0: number, a1: number) => `M ${pt(a0)} A ${ARC_R} ${ARC_R} 0 0 1 ${pt(a1)}`;
const SECTIONS = WHEEL.map((k, i) => {
  const a0 = i * STEP + GAP / 2, a1 = a0 + STEP - GAP;
  return { k, a0, a1, color: ASPECT_COLOR[k], track: arc(a0, a1) };
});

/** Nine sections, each dim in its aspect's colour; it fills and glows as that aspect's lines are ticked. */
function Arc({ aspects }: { aspects: AspectProgress }) {
  return (
    <>
      {SECTIONS.map((s) => <Path key={s.k} d={s.track} stroke={s.color} strokeOpacity={0.24} strokeWidth={4} fill="none" />)}
      {SECTIONS.map((s) => {
        const p = aspects[s.k];
        if (!p || !p.done || !p.total) return null;
        const d = arc(s.a0, s.a0 + (s.a1 - s.a0) * Math.min(p.done / p.total, 1));
        return (
          <G key={`f${s.k}`}>
            <Path d={d} stroke={s.color} strokeOpacity={0.3} strokeWidth={10} fill="none" />
            <Path d={d} stroke={s.color} strokeWidth={4} fill="none" />
          </G>
        );
      })}
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

/** A slow 0..1 loop for Nora's breathing light; holds still under Reduce Motion. */
function useLoop(duration: number, reverse: boolean) {
  const reduce = useReducedMotion();
  const t = useSharedValue(reverse ? 0.5 : 0);
  useEffect(() => {
    if (reduce) return;
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration, easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear }), -1, reverse));
  }, [reduce, t, duration, reverse]);
  return t;
}

/** Light given off by the orb: a wide warm ambient behind the bar, and a breathing ring right at the ball's edge. */
function Light({ which }: { which: 'ambient' | 'glow' }) {
  const breath = useLoop(2000, true);
  const wide = which === 'ambient';
  const style = useAnimatedStyle(() => (wide
    ? { opacity: 0.8 + breath.value * 0.2 }
    : { opacity: 0.55 + breath.value * 0.45, transform: [{ scale: 0.94 + breath.value * 0.12 }] }));
  const size = wide ? AMBIENT : GLOW;
  return (
    <Animated.View pointerEvents="none" style={[s.light, { width: size, height: size, top: ORB_TOP + ORB / 2 - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          {wide ? (
            <RadialGradient id="ambient" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FF7A59" stopOpacity={0.3} />
              <Stop offset="1" stopColor="#FF7A59" stopOpacity={0} />
            </RadialGradient>
          ) : (
            // starts at the ball's edge (36 of 68), so the light reads as coming off the orb
            <RadialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0.5" stopColor="#FF8A4C" stopOpacity={0.55} />
              <Stop offset="0.72" stopColor="#F0457A" stopOpacity={0.2} />
              <Stop offset="1" stopColor="#F0457A" stopOpacity={0} />
            </RadialGradient>
          )}
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={wide ? 'url(#ambient)' : 'url(#glow)'} />
      </Svg>
    </Animated.View>
  );
}

/** The ball: the board's gradient, warm light slowly turning inside it, and a fixed highlight on top. */
function Ball() {
  const spin = useLoop(9000, false);
  const swirl = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const D = ORB_R * 2;
  return (
    <View style={s.clip}>
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orb" cx="0.36" cy="0.32" r="0.72">
            <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.32" stopColor="#FFA15C" />
            <Stop offset="0.72" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
          </RadialGradient>
        </Defs>
        <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#orb)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, swirl]}>
        <Svg width={D} height={D}>
          <Defs>
            <RadialGradient id="swirlWarm" cx="0.3" cy="0.74" r="0.42">
              <Stop offset="0" stopColor="#FFC27A" stopOpacity={0.55} /><Stop offset="1" stopColor="#FFC27A" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="swirlRose" cx="0.76" cy="0.36" r="0.4">
              <Stop offset="0" stopColor="#FF5C8A" stopOpacity={0.45} /><Stop offset="1" stopColor="#FF5C8A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#swirlWarm)" />
          <Circle cx={ORB_R} cy={ORB_R} r={ORB_R} fill="url(#swirlRose)" />
        </Svg>
      </Animated.View>
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Ellipse cx={28} cy={25} rx={10} ry={6} fill="#FFFFFF" opacity={0.32} />
      </Svg>
    </View>
  );
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
  return (
    <View pointerEvents="box-none" style={[s.wrap, { width: w, bottom: Math.max(bottom, 12) + 12 }]}>
      <Light which="ambient" />
      <View style={[s.bar, { width: w }]}>
        <Material />
        <Round label="Quick add" onPress={() => onNotBuilt('Quick add')}><Plus /></Round>
        <Round label="Type to Nora" onPress={() => onNotBuilt('Typing to Nora')}><Keyboard /></Round>
      </View>
      {/* over the bar, so the orb's light falls on the black glass */}
      <Light which="glow" />
      <Pressable accessibilityRole="button" accessibilityLabel="Nora" style={s.orbWrap}
        onPress={() => onNotBuilt('Talking to Nora')}
        onPressIn={() => { orb.onPressIn(); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
        onPressOut={orb.onPressOut}>
        <Svg width={ORB} height={ORB} style={StyleSheet.absoluteFill}><Arc aspects={aspects} /></Svg>
        <Animated.View style={[s.ball, orb.style]}><Ball /></Animated.View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', height: BAR_H, alignItems: 'center' },
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
