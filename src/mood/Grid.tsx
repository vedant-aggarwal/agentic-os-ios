import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, type SharedValue, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { haptic } from '@/aspects/kit';
import { C, F } from '@/theme';
import { MoodLight } from './Light';
import { cornerOf, moodColor, moodRgb, moodWord } from './words';

// The mood grid: energy up, pleasant across. A dark instrument: a fine hairline lattice and a field of tiny dots
// that sit almost invisible. The finger is the only light. Where it lands the colour of that spot blooms out, the
// dots under it wake, swell and part like a lens, and a faint ring runs out from the touch. Nothing else is coloured.

const N = 12; // dots per side
const ACircle = Animated.createAnimatedComponent(Circle);

type Field = {
  fx: SharedValue<number>; fy: SharedValue<number>; on: SharedValue<number>; touch: SharedValue<number>;
  rip: SharedValue<number>; rx: SharedValue<number>; ry: SharedValue<number>; wave: SharedValue<number>;
};

function Dot({ x, y, color, f, w }: { x: number; y: number; color: string; f: Field; w: number }) {
  const sig2 = (w * 0.12) ** 2, rmax = w * 1.1;
  const ap = useAnimatedProps(() => {
    const dx = x - f.fx.value, dy = y - f.fy.value, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
    const near = Math.exp(-d2 / (2 * sig2)) * f.on.value;
    const push = near * (4 + 6 * f.touch.value);
    const rp = f.rip.value;
    const ring = rp > 0 && rp < 1 ? Math.exp(-((Math.hypot(x - f.rx.value, y - f.ry.value) - rp * rmax) ** 2) / 220) * (1 - rp) : 0;
    const shimmer = 0.5 + 0.5 * Math.sin((x - y) / w * 4 - f.wave.value * Math.PI * 2);
    return { cx: x + (dx / d) * push, cy: y + (dy / d) * push, r: 0.9 + 2.6 * near + 1.2 * ring, opacity: 0.1 + 0.08 * shimmer + 0.85 * near + 0.45 * ring };
  });
  return <ACircle animatedProps={ap} fill={color} />;
}

export type GridPoint = { pleasant: number; energy: number; word: string };

export function MoodGrid({ size, onChange, onPlace }: { size: number; onChange: (p: GridPoint) => void; onPlace: (p: GridPoint) => void }) {
  const reduce = useReducedMotion();
  const f: Field = {
    fx: useSharedValue(size / 2), fy: useSharedValue(size / 2), on: useSharedValue(0), touch: useSharedValue(0),
    rip: useSharedValue(0), rx: useSharedValue(0), ry: useSharedValue(0), wave: useSharedValue(0),
  };
  const pv = useSharedValue(0), pe = useSharedValue(0);
  const idle = useSharedValue(1); // the waiting light in the middle, until the first touch
  const breathe = useSharedValue(0);
  const [word, setWord] = useState<string | null>(null);
  const last = useRef({ word: '', corner: '' });

  useEffect(() => {
    if (reduce) return;
    f.wave.set(withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false));
    breathe.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const dots = useMemo(() => {
    const out: { x: number; y: number; color: string; k: string }[] = [];
    const gap = size / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = gap * (i + 0.5), y = gap * (j + 0.5);
      out.push({ x, y, color: moodColor(x / size * 2 - 1, 1 - y / size * 2), k: `${i}-${j}` });
    }
    return out;
  }, [size]);
  const lattice = useMemo(() => Array.from({ length: 7 }, (_, i) => (size / 8) * (i + 1)), [size]);

  const pointAt = (x: number, y: number): GridPoint => {
    const pleasant = Math.min(size, Math.max(0, x)) / size * 2 - 1, energy = 1 - Math.min(size, Math.max(0, y)) / size * 2;
    return { pleasant, energy, word: moodWord(pleasant, energy) };
  };
  const move = (x: number, y: number) => {
    const cx = Math.min(size, Math.max(0, x)), cy = Math.min(size, Math.max(0, y));
    f.fx.set(cx); f.fy.set(cy);
    const p = pointAt(cx, cy);
    pv.set(p.pleasant); pe.set(p.energy);
    const corner = cornerOf(p.pleasant, p.energy);
    if (p.word !== last.current.word) {
      if (last.current.word) { if (corner !== last.current.corner) haptic.light(); else haptic.tick(); }
      last.current = { word: p.word, corner };
      setWord(p.word);
    }
    onChange(p);
  };

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => {
      f.on.set(withTiming(1, { duration: 260 }));
      idle.set(withTiming(0, { duration: 400 }));
      f.touch.set(withSpring(1, { duration: 300, dampingRatio: 0.85 }));
      f.rx.set(e.x); f.ry.set(e.y); f.rip.set(0);
      if (!reduce) f.rip.set(withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));
      haptic.light();
      move(e.x, e.y);
    },
    onUpdate: (e) => move(e.x, e.y),
    onFinalize: () => {
      f.touch.set(withSpring(0, { duration: 500, dampingRatio: 0.8 }));
      if (last.current.word) onPlace(pointAt(f.fx.get(), f.fy.get()));
    },
  });

  const bead = useAnimatedStyle(() => {
    const [r, g, b] = moodRgb(pv.value, pe.value);
    const c = `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
    return {
      opacity: f.on.value,
      backgroundColor: `rgb(${c})`,
      boxShadow: `0 0 ${10 + 14 * f.touch.value}px rgba(${c},0.85)`,
      transform: [{ translateX: f.fx.value - 9 }, { translateY: f.fy.value - 9 }, { scale: 1 + 0.35 * f.touch.value }],
    };
  });
  const label = useAnimatedStyle(() => {
    const below = f.fy.value < 64;
    return {
      opacity: f.on.value,
      transform: [
        { translateX: Math.min(size - 120, Math.max(0, f.fx.value - 60)) },
        { translateY: f.fy.value + (below ? 22 : -46) + (below ? 4 : -4) * f.touch.value },
      ],
    };
  });
  const idleProps = useAnimatedProps(() => ({ opacity: idle.value * (0.5 + 0.5 * breathe.value), r: size * (0.16 + 0.04 * breathe.value) }));
  const hintText = useAnimatedStyle(() => ({ opacity: idle.value }));

  return (
    <GestureDetector gesture={pan}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={`Mood grid${word ? `: ${word}` : ''}`}
        accessibilityHint="Energy goes up, pleasant goes right. Touch where you are."
        style={[s.grid, { width: size, height: size }]}>
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="mg-idle" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FFF4E0" stopOpacity={0.22} /><Stop offset="1" stopColor="#FFF4E0" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {lattice.map((v) => (
            <Line key={`v${v}`} x1={v} y1={0} x2={v} y2={size} stroke="#FFFFFF" strokeOpacity={v === size / 2 ? 0.09 : 0.035} strokeWidth={StyleSheet.hairlineWidth * 2} />
          ))}
          {lattice.map((v) => (
            <Line key={`h${v}`} x1={0} y1={v} x2={size} y2={v} stroke="#FFFFFF" strokeOpacity={v === size / 2 ? 0.09 : 0.035} strokeWidth={StyleSheet.hairlineWidth * 2} />
          ))}
          <ACircle animatedProps={idleProps} cx={size / 2} cy={size / 2} fill="url(#mg-idle)" />
        </Svg>
        <MoodLight id="mg-l" w={size} h={size} x={f.fx} y={f.fy} r={size * 0.62} pv={pv} pe={pe} on={f.on} strength={0.5} />
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          {dots.map((d) => <Dot key={d.k} x={d.x} y={d.y} color={d.color} f={f} w={size} />)}
        </Svg>
        <Text pointerEvents="none" style={[s.axis, s.axTop, { width: size }]}>More energy</Text>
        <Text pointerEvents="none" style={[s.axis, s.axBottom, { width: size }]}>Less energy</Text>
        <Text pointerEvents="none" style={[s.axis, s.axLeft, { top: size / 2 - 22 }]}>Unpleasant</Text>
        <Text pointerEvents="none" style={[s.axis, s.axRight, { top: size / 2 - 22 }]}>Pleasant</Text>
        <Animated.Text pointerEvents="none" style={[s.hintText, { top: size / 2 + size * 0.2 + 8, width: size }, hintText]}>Touch where you are</Animated.Text>
        <Animated.View pointerEvents="none" style={[s.bead, bead]} />
        <Animated.View pointerEvents="none" style={[s.label, label]}>
          <Text style={s.labelText} numberOfLines={1}>{word ?? ''}</Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  grid: {
    borderRadius: 32, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  axis: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: 'rgba(255,255,255,0.34)' },
  axTop: { position: 'absolute', top: 12, left: 0, textAlign: 'center' },
  axBottom: { position: 'absolute', bottom: 12, left: 0, textAlign: 'center' },
  axLeft: { position: 'absolute', left: 14 },
  axRight: { position: 'absolute', right: 14 },
  bead: { position: 'absolute', left: 0, top: 0, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' },
  label: { position: 'absolute', left: 0, top: 0, width: 120, alignItems: 'center' },
  labelText: {
    fontFamily: F.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  hintText: { position: 'absolute', left: 0, textAlign: 'center', fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
});
