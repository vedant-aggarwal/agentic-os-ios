import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useOrbitClock } from './kit';

// Behind the list: a fixed star field with a faint nebula over the app's warm bottom glow. Everything is drawn
// once; the star layer alone drifts a few points over three minutes.

/** Deterministic, so the sky is the same every time the page opens. */
function rand(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TINTS = ['#DCE6FF', '#DCE6FF', '#DCE6FF', '#FFE6CC', '#CDBFFF'];
type Star = { x: number; y: number; r: number; o: number; fill: string; bright: boolean };
const STARS: Star[] = (() => {
  const r = rand(20261124);
  return Array.from({ length: 120 }, () => {
    const x = r(), y = r(), m = r();
    const size = m < 0.72 ? 0.45 + r() * 0.35 : m < 0.95 ? 0.8 + r() * 0.45 : 1.3 + r() * 0.5;
    // thinner toward the bottom, where the warm glow lives
    const o = (0.16 + r() * 0.6) * (1 - 0.45 * y);
    return { x, y, r: size, o, fill: TINTS[Math.floor(r() * TINTS.length)], bright: size > 1.3 };
  });
})();

function Sky({ W, H }: { W: number; H: number }) {
  return (
    <Svg width={W} height={H}>
      <Defs>
        <RadialGradient id="orbitStarGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#DCE6FF" stopOpacity={0.3} />
          <Stop offset="0.35" stopColor="#DCE6FF" stopOpacity={0.08} />
          <Stop offset="1" stopColor="#DCE6FF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {STARS.filter((st) => st.bright).map((st, i) => (
        <Circle key={`h${i}`} cx={st.x * W} cy={st.y * H} r={st.r * 5} fill="url(#orbitStarGlow)" />
      ))}
      {STARS.map((st, i) => (
        <Circle key={i} cx={st.x * W} cy={st.y * H} r={st.r} fill={st.fill} fillOpacity={st.o} />
      ))}
    </Svg>
  );
}

export function OrbitAmbient() {
  const { width: W, height: H } = useWindowDimensions();
  const t = useOrbitClock(180_000, true);
  const drift = useAnimatedStyle(() => {
    const a = t.value * Math.PI * 2;
    return { transform: [{ translateX: Math.sin(a) * 7 }, { translateY: Math.cos(a) * 5 }] };
  });
  return (
    <View style={s.fill}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="orbitNebulaA" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#6F63FF" stopOpacity={0.16} />
            <Stop offset="0.5" stopColor="#5560E8" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#5560E8" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="orbitNebulaB" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#2F8BE0" stopOpacity={0.09} />
            <Stop offset="1" stopColor="#2F8BE0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={W * 0.72} cy={H * 0.2} rx={W * 0.78} ry={H * 0.2} fill="url(#orbitNebulaA)" />
        <Ellipse cx={W * 0.1} cy={H * 0.48} rx={W * 0.62} ry={H * 0.17} fill="url(#orbitNebulaB)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, drift]}>
        <Sky W={W} H={H} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' },
});