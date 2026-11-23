import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic, MOTION, tint } from '@/aspects/kit/tokens';

// A section's progress: a 24 pt ring that fills as its items are ticked and lights when full. Financial passes three
// parts (Mission, Money, Growth); each arc fills on its own with a small gap between them. Only full rings glow.

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

export type RingPart = { color: string; done: number; total: number };

const SIZE = 24, STROKE = 3.5, R = (SIZE - STROKE) / 2, LEN = 2 * Math.PI * R;
const GAP = 14; // degrees between parts

function arcPath(a0: number, a1: number) {
  const p = (a: number) => {
    const r = ((a - 90) * Math.PI) / 180;
    return `${SIZE / 2 + R * Math.cos(r)} ${SIZE / 2 + R * Math.sin(r)}`;
  };
  return `M ${p(a0)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}

function Whole({ part }: { part: RingPart }) {
  const k = part.total ? part.done / part.total : 0;
  const v = useSharedValue(k);
  useEffect(() => { v.set(withSpring(k, MOTION.spring)); }, [k, v]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: LEN * (1 - v.value) }));
  return (
    <>
      <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={tint(part.color, 0.24)} strokeWidth={STROKE} fill="none" />
      <ACircle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={part.color} strokeWidth={STROKE} fill="none" strokeLinecap={k >= 1 ? 'butt' : 'round'}
        strokeDasharray={LEN} animatedProps={ap} transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />
    </>
  );
}

function Arc({ part, a0, a1 }: { part: RingPart; a0: number; a1: number }) {
  const k = part.total ? part.done / part.total : 0;
  const len = ((a1 - a0) / 360) * LEN;
  const v = useSharedValue(k);
  useEffect(() => { v.set(withSpring(k, MOTION.spring)); }, [k, v]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - v.value) }));
  return (
    <>
      <Path d={arcPath(a0, a1)} stroke={tint(part.color, 0.24)} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
      <APath d={arcPath(a0, a1)} stroke={part.color} strokeWidth={STROKE} fill="none" strokeLinecap="round" strokeDasharray={len} animatedProps={ap} />
    </>
  );
}

export function Ring({ parts }: { parts: RingPart[] }) {
  const full = parts.length > 0 && parts.every((p) => p.total > 0 && p.done >= p.total);
  const glow = useSharedValue(full ? 1 : 0);
  const pop = useSharedValue(1);
  const was = useRef(full);
  useEffect(() => {
    glow.set(withTiming(full ? 1 : 0, MOTION.fade));
    if (full && !was.current) {
      pop.set(withSequence(withSpring(1.08, MOTION.spring), withSpring(1, MOTION.spring)));
      haptic.success();
    }
    was.current = full;
  }, [full, glow, pop]);
  const c = parts[0]?.color ?? '#FFFFFF';
  const lit = parts.length > 1 ? 0.5 / parts.length + 0.12 : 0.62;
  const st = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    boxShadow: `0 0 ${9 * glow.value}px ${tint(c, lit * glow.value)}`,
    borderRadius: SIZE / 2,
  }));
  const span = 360 / Math.max(1, parts.length);
  return (
    <Animated.View style={[{ width: SIZE, height: SIZE }, st]}>
      <View pointerEvents="none">
        <Svg width={SIZE} height={SIZE}>
          {parts.length <= 1
            ? <Whole part={parts[0] ?? { color: c, done: 0, total: 0 }} />
            : parts.map((p, i) => <Arc key={i} part={p} a0={i * span + GAP / 2} a1={(i + 1) * span - GAP / 2} />)}
        </Svg>
      </View>
    </Animated.View>
  );
}
