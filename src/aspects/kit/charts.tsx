import { use, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C } from '@/theme';
import { AspectContext } from '../context';
import { MOTION, SURF, t, tint } from './tokens';

const useTone = (color?: string) => color ?? use(AspectContext)?.color ?? C.text;
const clamp01 = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), 1);
const ACircle = Animated.createAnimatedComponent(Circle);

/** A ring that fills clockwise from 12 o'clock as `progress` goes 0 to 1. Children sit in its centre. */
export function Ring({ size, progress, stroke = 8, color, track = SURF.track, children }: {
  size: number; progress: number; stroke?: number; color?: string; track?: string; children?: ReactNode;
}) {
  const tone = useTone(color);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const p = useSharedValue(0);
  useEffect(() => { p.set(withSpring(clamp01(progress), MOTION.slow)); }, [progress, p]);
  // at zero a round-capped stroke would still leave a dot, so the arc is hidden until there is something to show
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value), strokeOpacity: p.value > 0.004 ? 1 : 0 }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={mid} cy={mid} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <ACircle cx={mid} cy={mid} r={r} stroke={tone} strokeWidth={stroke} strokeLinecap="round" fill="none"
          strokeDasharray={`${c} ${c}`} animatedProps={arc} transform={`rotate(-90 ${mid} ${mid})`} />
      </Svg>
      {children}
    </View>
  );
}

/** A horizontal bar that fills from the left as `progress` goes 0 to 1. */
export function Bar({ progress, color, height = 8, track = SURF.track }: { progress: number; color?: string; height?: number; track?: string }) {
  const tone = useTone(color);
  const p = useSharedValue(0);
  useEffect(() => { p.set(withSpring(clamp01(progress), MOTION.slow)); }, [progress, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: tone }, fill]} />
    </View>
  );
}

/**
 * A trend line through `values` (oldest first; null leaves a gap), with a dot on the latest. `goal` draws a dashed
 * line at that value. It scales to its own data, padded so the line never touches the edges.
 */
export function Spark({ values, width, height = 64, color, goal, stroke = 2, minSpan = 0, range }: {
  values: (number | null)[]; width: number; height?: number; color?: string; goal?: number; stroke?: number;
  /** The smallest range the line is drawn on (5 for kilos, 20 for a score), so a small change never draws as a cliff. */
  minSpan?: number;
  /** A fixed scale, [0, 100] for a score. */
  range?: [number, number];
}) {
  const tone = useTone(color);
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0 || width <= 0) return <View style={{ width, height }} />;
  const all = goal != null ? [...nums, goal] : nums;
  let lo = range ? range[0] : Math.min(...all), hi = range ? range[1] : Math.max(...all);
  if (!range && hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const span = hi - lo || 1;
  const pad = 6, w = width - pad * 2, h = height - pad * 2;
  const x = (i: number) => pad + (values.length > 1 ? (i / (values.length - 1)) * w : w / 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * h;
  let d = '', pen = false, last: [number, number] | null = null;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
    last = [x(i), y(v)];
  });
  const end = last as [number, number] | null;
  return (
    <Svg width={width} height={height}>
      {goal != null ? <Line x1={pad} x2={width - pad} y1={y(goal)} y2={y(goal)} stroke={C.faint} strokeWidth={1} strokeDasharray="3 5" /> : null}
      <Path d={d} stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {end ? <Circle cx={end[0]} cy={end[1]} r={stroke + 1.5} fill={tone} /> : null}
    </Svg>
  );
}

/**
 * Small bars, one per value (a week of days, a set of weeks). `labels` go under the bars; `on` marks the bar that
 * is "now" at full colour while the others sit softer. Bars scale to `max` (default: the largest value).
 */
export function Bars({ values, labels, on, max, height = 72, color }: {
  values: number[]; labels?: string[]; on?: number; max?: number; height?: number; color?: string;
}) {
  const tone = useTone(color);
  const top = max ?? Math.max(...values, 0);
  return (
    <View style={s.bars}>
      {values.map((v, i) => {
        const frac = top > 0 ? clamp01(v / top) : 0;
        const live = on == null || on === i;
        return (
          <View key={i} style={s.barCol}>
            <View style={[s.barTrack, { height }]}>
              <View style={{ height: Math.max(frac * height, v > 0 ? 4 : 0), borderRadius: 4, backgroundColor: live ? tone : tint(tone, 0.4) }} />
            </View>
            {labels ? <Text style={[t.caption, live && on != null && { color: C.text }]}>{labels[i]}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** A big number with a unit and a label under it. */
export function Stat({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  return (
    <View style={s.stat}>
      <View style={s.statLine}>
        <Text style={[t.title2, t.num, color ? { color } : null]}>{value}</Text>
        {unit ? <Text style={t.label}>{unit}</Text> : null}
      </View>
      <Text style={t.caption}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  barCol: { flex: 1, alignItems: 'center', gap: 8 },
  barTrack: { alignSelf: 'stretch', justifyContent: 'flex-end', borderRadius: 4, backgroundColor: SURF.row },
  stat: { gap: 2 },
  statLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
});
