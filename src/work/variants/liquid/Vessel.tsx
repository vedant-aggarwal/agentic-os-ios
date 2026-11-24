import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Tone } from './palette';

// A glass vessel holding glowing liquid up to a level. The liquid is two wave strips one period wider than the
// vessel; each slides sideways by a period per turn of the clock, so it loops without a seam, and the level is one
// vertical translate. Only transforms move, on the UI thread; the paths are drawn once.

/** The fill rises with a little slosh, and jumps straight to the level under Reduce Motion. */
const FILL = { duration: 1200, dampingRatio: 0.7, reduceMotion: ReduceMotion.System } as const;

/** SVG ids must be unique in the page on web, where every Svg shares one document. */
export const svgId = (raw: string) => `lq${raw.replace(/[^A-Za-z0-9]/g, '')}`;

/** A wave's crest from x 0 to past `span` (mean height `m`, amplitude `a`), closed down to `bottom` when given. */
export function wavePath(span: number, period: number, m: number, a: number, bottom?: number, flip = false) {
  const half = period / 2;
  const n = Math.ceil(span / half);
  let d = `M0 ${m} Q${half / 2} ${flip ? m + 2 * a : m - 2 * a} ${half} ${m}`;
  for (let i = 2; i <= n; i++) d += ` T${i * half} ${m}`;
  return bottom === undefined ? d : `${d} V${bottom} H0 Z`;
}

const clamp = (p: number) => Math.min(100, Math.max(0, p));

/** How far under the surface the light in a tube's liquid reaches. */
const LIGHT_H = 56;

/** Small bubbles rising through a tube: across at `x` of its width, `d` across, `turns` rises per lap. */
const BUBBLES = [
  { x: 0.32, d: 3.4, turns: 3, off: 0.1 },
  { x: 0.6, d: 2.4, turns: 4, off: 0.55 },
  { x: 0.72, d: 3, turns: 2, off: 0.8 },
] as const;

type VesselProps = {
  w: number; h: number; pct: number; tone: Tone; clock: SharedValue<number>;
  /** Wave height, in points. */
  amp: number;
  /** 'tube': a capsule with a back wave and bubbles. 'ball': a small glass bead with one wave. */
  shape: 'tube' | 'ball';
  /** False under Reduce Motion or off screen: bubbles hide (the waves hold still with the clock). */
  moving: boolean;
};

export function Vessel({ w, h, pct, tone, clock, amp, shape, moving }: VesselProps) {
  const id = svgId(useId());
  const tube = shape === 'tube';
  const r = w / 2;
  const period = w;
  const head = amp * 2 + 2; // room above the mean surface for the crest and its sheen
  const span = w + period;
  const tall = h + head + 4;
  const turns = 3;

  const level = useSharedValue(0);
  useEffect(() => {
    level.set(withSpring(clamp(pct) / 100, FILL));
  }, [pct, level]);

  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: h * (1 - level.value) - head }] }));
  const front = useAnimatedStyle(() => ({ transform: [{ translateX: -((clock.value * turns) % 1) * period }] }));

  const paths = useMemo(() => ({
    fill: wavePath(span, period, head, amp, tall),
    line: wavePath(span, period, head, amp),
    back: wavePath(span, period, head - amp * 0.6, amp * 0.8, tall, true),
  }), [span, period, head, amp, tall]);

  return (
    <View style={[s.glass, { width: w, height: h, borderRadius: r }]}>
      <Animated.View style={[s.abs, { width: span, height: tall }, rise]}>
        {tube ? <BackWave d={paths.back} span={span} tall={tall} period={period} turns={turns - 1} color={tone.surface} clock={clock} /> : null}
        <Animated.View style={[s.abs, front]}>
          <Svg width={span} height={tall}>
            <Defs>
              <LinearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tone.surface} stopOpacity={0.96} />
                <Stop offset={tube ? 0.08 : 0.3} stopColor={tone.body} stopOpacity={0.94} />
                <Stop offset="0.45" stopColor={tone.body} stopOpacity={0.84} />
                <Stop offset="1" stopColor={tone.deep} stopOpacity={0.96} />
              </LinearGradient>
            </Defs>
            <Path d={paths.fill} fill={`url(#${id}l)`} />
            <Path d={paths.line} fill="none" stroke={tone.surface} strokeOpacity={0.95} strokeWidth={tube ? 1.3 : 0.9} />
          </Svg>
        </Animated.View>
        {tube ? (
          <Svg pointerEvents="none" width={w} height={LIGHT_H} style={[s.abs, { top: head - 2 }]}>
            <Defs>
              <RadialGradient id={`${id}i`} cx="0.5" cy="0.3" r="0.5">
                <Stop offset="0" stopColor="#fff" stopOpacity={0.26} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={w} height={LIGHT_H} fill={`url(#${id}i)`} />
          </Svg>
        ) : null}
      </Animated.View>
      {tube ? BUBBLES.map((b) => (
        <Bubble key={b.x} x={b.x} d={b.d} turns={b.turns} off={b.off} w={w} h={h} amp={amp} level={level} clock={clock} moving={moving} />
      )) : null}
      {tube ? <TubeFace w={w} h={h} r={r} id={id} /> : <BallFace size={w} id={id} />}
    </View>
  );
}

/** The far side of a tube's surface: fainter, and sliding the other way, so the two waves slosh. */
function BackWave({ d, span, tall, period, turns, color, clock }: {
  d: string; span: number; tall: number; period: number; turns: number; color: string; clock: SharedValue<number>;
}) {
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: ((clock.value * turns) % 1) * period - period }] }));
  return (
    <Animated.View style={[s.abs, slide]}>
      <Svg width={span} height={tall}>
        <Path d={d} fill={color} fillOpacity={0.26} />
      </Svg>
    </Animated.View>
  );
}

function Bubble({ x, d, turns, off, w, h, amp, level, clock, moving }: {
  x: number; d: number; turns: number; off: number; w: number; h: number; amp: number;
  level: SharedValue<number>; clock: SharedValue<number>; moving: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const ph = (clock.value * turns + off) % 1;
    const top = h * (1 - level.value) + amp + 4; // just under the surface
    const bottom = h - 12;
    const travel = bottom - top;
    const fade = Math.min(1, ph / 0.12) * Math.min(1, (1 - ph) / 0.22);
    return {
      opacity: moving && travel > 18 ? 0.62 * fade : 0,
      transform: [{ translateX: Math.sin((ph + off) * Math.PI * 4) * 1.6 }, { translateY: bottom - ph * travel }],
    };
  });
  return <Animated.View style={[s.bubble, { left: w * x - d / 2, width: d, height: d, borderRadius: d / 2 }, style]} />;
}

/** The glass over a tube: rounded shading at the sides, a shine at the top, a long highlight and the rim. */
function TubeFace({ w, h, r, id }: { w: number; h: number; r: number; id: string }) {
  const sw = Math.max(3, w * 0.08);
  return (
    <Svg pointerEvents="none" width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0.34} />
          <Stop offset="0.24" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.7" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.4} />
        </LinearGradient>
        <LinearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.12} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity={0.62} />
          <Stop offset="0.6" stopColor="#fff" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={w} height={h} fill={`url(#${id}e)`} />
      <Rect width={w} height={h * 0.42} fill={`url(#${id}t)`} />
      <Rect x={w * 0.17} y={r * 0.62} width={sw} height={h * 0.6} rx={sw / 2} fill={`url(#${id}s)`} />
      <Rect x={w * 0.76} y={r * 0.9} width={2} height={h * 0.18} rx={1} fill="#fff" fillOpacity={0.22} />
      <Rect x={2.5} y={2.5} width={w - 5} height={h - 5} rx={r - 2.5} fill="none" stroke="#fff" strokeOpacity={0.06} />
      <Rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={r - 0.5} fill="none" stroke="#fff" strokeOpacity={0.22} />
    </Svg>
  );
}

/** The glass over a bead: darker towards the rim so it reads round, and one bright glint. */
function BallFace({ size, id }: { size: number; id: string }) {
  return (
    <Svg pointerEvents="none" width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={`${id}r`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0.5" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.42} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id}r)`} />
      <Ellipse cx={size * 0.36} cy={size * 0.3} rx={size * 0.17} ry={size * 0.11} fill="#fff" fillOpacity={0.72} />
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill="none" stroke="#fff" strokeOpacity={0.26} />
    </Svg>
  );
}

/** An empty tube: no account, nothing read yet, or Orca away. */
export function EmptyTube({ w, h }: { w: number; h: number }) {
  const id = svgId(useId());
  return (
    <View style={[s.glass, { width: w, height: h, borderRadius: w / 2 }]}>
      <TubeFace w={w} h={h} r={w / 2} id={id} />
    </View>
  );
}

/** The light a vessel's liquid throws around it, centred on the liquid. Sits behind the vessel. */
export function Glow({ w, h, pct, tone }: { w: number; h: number; pct: number; tone: Tone }) {
  const id = svgId(useId());
  const gw = w * 2.5;
  const gh = h * 1.15;
  const cy = h * (1 - Math.max(8, clamp(pct)) / 200);
  return (
    <Svg pointerEvents="none" width={gw} height={gh} style={[s.abs, { left: (w - gw) / 2, top: cy - gh / 2 }]}>
      <Defs>
        <RadialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={tone.glow} stopOpacity={0.3} />
          <Stop offset="0.45" stopColor={tone.glow} stopOpacity={0.11} />
          <Stop offset="1" stopColor={tone.glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={gw} height={gh} fill={`url(#${id}g)`} />
    </Svg>
  );
}

const s = StyleSheet.create({
  glass: { overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  abs: { position: 'absolute', left: 0, top: 0 },
  bubble: { position: 'absolute', top: 0, backgroundColor: 'rgba(255,255,255,0.8)' },
});
