import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

// Nora's sphere: the dock's orb and the call screen's. Light comes from up-left and toward the viewer. The sphere
// spins about that same axis, so the surface turns around the light while the highlight drifts with it.
const TURN = 12000; // one turn, ms
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

// Colour on the surface: warm near the pole, rose and plum further round. Sizes are for a 36 pt radius.
const PATCHES = [
  { lat: 0.7, phase: 0, size: 30, color: '#FFE2AE', o: 0.55 },
  { lat: 1.2, phase: 2.2, size: 34, color: '#FF4F86', o: 0.55 },
  { lat: 1.0, phase: 4.3, size: 28, color: '#FFB067', o: 0.5 },
  { lat: 1.45, phase: 1.1, size: 38, color: '#7A1F5C', o: 0.5 },
  { lat: 0.4, phase: 3.4, size: 18, color: '#FFD49A', o: 0.35 },
];

/** A patch of colour riding the surface, foreshortened toward the limb and hidden round the back. */
function Patch({ t, i, r }: { t: SharedValue<number>; i: number; r: number }) {
  const p = PATCHES[i];
  const size = (p.size * r) / 36;
  const style = useAnimatedStyle(() => {
    const [x, y, z] = surface(p.lat, p.phase, t.value);
    return {
      opacity: p.o * Math.min(Math.max(z * 2.5, 0), 1),
      transform: [
        { translateX: x * r }, { translateY: y * r },
        { rotate: `${Math.atan2(y, x)}rad` }, { scaleX: Math.max(z, 0.08) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[s.abs, { width: size, height: size, left: r - size / 2, top: r - size / 2 }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`patch${i}-${r}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={p.color} stopOpacity={1} /><Stop offset="1" stopColor={p.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#patch${i}-${r})`} />
      </Svg>
    </Animated.View>
  );
}

/** The ball, `r` points in radius, turning with the clock `t` (useTurn). */
export function Ball({ t, r = 36 }: { t: SharedValue<number>; r?: number }) {
  const D = r * 2;
  return (
    <View style={[s.clip, { borderRadius: r }]}>
      {/* lighting: bright toward the light, falling to plum on the far side */}
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`orb-${r}`} cx="0.36" cy="0.32" r="0.72">
            <Stop offset="0" stopColor="#FFE3B0" /><Stop offset="0.32" stopColor="#FFA15C" />
            <Stop offset="0.72" stopColor="#F0457A" /><Stop offset="1" stopColor="#6E1A55" />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#orb-${r})`} />
      </Svg>
      {PATCHES.map((p, i) => <Patch key={p.color} t={t} i={i} r={r} />)}
    </View>
  );
}

/** The sphere's clock, 0..1 per turn. Holds still under Reduce Motion, and while `on` is false. */
export function useTurn(on = true) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0.12);
  useEffect(() => {
    if (reduce || !on) return;
    t.set(t.get() % 1);
    t.set(withRepeat(withTiming(t.get() + 1, { duration: TURN, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [reduce, on, t]);
  return t;
}

const s = StyleSheet.create({
  abs: { position: 'absolute' },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
