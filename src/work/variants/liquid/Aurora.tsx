import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useClock } from './motion';

// Behind the list: an aurora of slow colour fields, teal and violet at the top and a breath of rose lower down, over
// the app's warm glow from the bottom edge. Drawn once; one 30 s loop drifts the whole layer a few points.

const DRIFT_MS = 30_000;

/** Fields in fractions of the layer: centre, radii, tilt in degrees, colour and peak opacity. */
const FIELDS = [
  { id: 'a', cx: 0.24, cy: 0.08, rx: 0.8, ry: 0.15, rot: -14, color: '#25D0BC', o: 0.24 },
  { id: 'b', cx: 0.86, cy: 0.04, rx: 0.64, ry: 0.13, rot: 16, color: '#6E6BFF', o: 0.2 },
  { id: 'c', cx: 0.58, cy: 0.26, rx: 0.62, ry: 0.1, rot: -7, color: '#2E9BFF', o: 0.09 },
  { id: 'd', cx: 0.1, cy: 0.66, rx: 0.52, ry: 0.18, rot: 12, color: '#C04C9A', o: 0.05 },
] as const;

export function Aurora() {
  const { width: W, height: H } = useWindowDimensions();
  const { t } = useClock(DRIFT_MS);
  const drift = useAnimatedStyle(() => {
    const a = t.value * Math.PI * 2;
    return { transform: [{ translateX: Math.sin(a) * 18 }, { translateY: Math.cos(a) * 8 }] };
  });
  const w = W + 80;
  const h = H * 0.85;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[s.layer, { width: w, height: h }, drift]}>
        <Svg width={w} height={h}>
          <Defs>
            {FIELDS.map((f) => (
              <RadialGradient key={f.id} id={`lqAurora${f.id}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={f.color} stopOpacity={f.o} />
                <Stop offset="0.5" stopColor={f.color} stopOpacity={f.o * 0.4} />
                <Stop offset="1" stopColor={f.color} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {FIELDS.map((f) => {
            const cx = f.cx * w;
            const cy = f.cy * h;
            return (
              <Ellipse key={f.id} cx={cx} cy={cy} rx={f.rx * w} ry={f.ry * h} fill={`url(#lqAurora${f.id})`}
                transform={`rotate(${f.rot} ${cx} ${cy})`} />
            );
          })}
        </Svg>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  layer: { position: 'absolute', left: -40, top: -30 },
});
