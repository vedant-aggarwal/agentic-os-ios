import { StyleSheet } from 'react-native';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { CORNER } from './words';

// Colour as light, not paint: four soft lights, one per corner colour, stacked at the same spot and weighted by
// where he sits on the grid, so the light takes the blended colour with no banding. Used for the finger's glow on
// the grid and the pool of light the pet sits in.

const ACircle = Animated.createAnimatedComponent(Circle);
const KEYS = ['tl', 'tr', 'bl', 'br'] as const;

/** How much of each corner colour is in a point (p across, e up), bilinear. */
export function cornerWeight(k: (typeof KEYS)[number], p: number, e: number) {
  'worklet';
  const x = Math.min(1, Math.max(0, (p + 1) / 2)), y = Math.min(1, Math.max(0, (1 - e) / 2));
  return (k[1] === 'l' ? 1 - x : x) * (k[0] === 't' ? 1 - y : y);
}

function One({ k, id, x, y, r, pv, pe, on }: {
  k: (typeof KEYS)[number]; id: string; x: SharedValue<number> | number; y: SharedValue<number> | number; r: number;
  pv: SharedValue<number>; pe: SharedValue<number>; on: SharedValue<number>;
}) {
  const ap = useAnimatedProps(() => ({
    cx: typeof x === 'number' ? x : x.value,
    cy: typeof y === 'number' ? y : y.value,
    opacity: cornerWeight(k, pv.value, pe.value) * on.value,
  }));
  return <ACircle animatedProps={ap} r={r} fill={`url(#${id}-${k})`} />;
}

export function MoodLight({ id, w, h, x, y, r, pv, pe, on, strength = 0.55 }: {
  id: string; w: number; h: number; x: SharedValue<number> | number; y: SharedValue<number> | number; r: number;
  pv: SharedValue<number>; pe: SharedValue<number>; on: SharedValue<number>; strength?: number;
}) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {KEYS.map((k) => (
          <RadialGradient key={k} id={`${id}-${k}`} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={`rgb(${CORNER[k].join(',')})`} stopOpacity={strength} />
            <Stop offset="0.45" stopColor={`rgb(${CORNER[k].join(',')})`} stopOpacity={strength * 0.35} />
            <Stop offset="1" stopColor={`rgb(${CORNER[k].join(',')})`} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {KEYS.map((k) => <One key={k} k={k} id={id} x={x} y={y} r={r} pv={pv} pe={pe} on={on} />)}
    </Svg>
  );
}
