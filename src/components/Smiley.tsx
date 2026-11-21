import { type ComponentRef, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  ReduceMotion, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { gaze } from '@/lib/gaze';

// A small 3D smiley for logging mood. The ball is lit from the top left and stays put; the face rides its
// surface: it turns and tilts to look around (foreshortening toward the edge), the eyes lead the head, it
// blinks now and then, and the smile widens when it looks back at you. While a finger is on the screen it
// watches the finger instead, eyes first, head following. Still under Reduce Motion.
const HEAD = { duration: 900, dampingRatio: 0.82, reduceMotion: ReduceMotion.System } as const;
const EYES = { duration: 420, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
const SMILE = { duration: 700, dampingRatio: 0.85, reduceMotion: ReduceMotion.System } as const;
// following a finger: quick, so it feels like it is really watching
const FOLLOW = { duration: 420, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
const GLANCE = { duration: 200, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const REACH_X = 170; // pt sideways from the smiley at which it looks fully left or right
const REACH_Y = 300; // pt down at which it looks fully down
const RESUME = 1400; // ms after the finger lifts before it goes back to looking around

// Where it looks next: yaw and pitch from -1 to 1, roll in degrees, smile from 0 to 1.
const LOOKS = [
  { yaw: 0, pitch: 0, roll: 0, smile: 1 },
  { yaw: -0.85, pitch: -0.2, roll: -6, smile: 0.55 },
  { yaw: 0.8, pitch: 0.15, roll: 5, smile: 0.6 },
  { yaw: 0.1, pitch: -0.75, roll: 0, smile: 0.7 },
  { yaw: 0, pitch: 0.1, roll: 8, smile: 1 },
  { yaw: -0.5, pitch: 0.5, roll: -4, smile: 0.45 },
];

const APath = Animated.createAnimatedComponent(Path);

export function Smiley({ size = 30 }: { size?: number }) {
  const reduce = useReducedMotion();
  const yaw = useSharedValue(0), pitch = useSharedValue(0), roll = useSharedValue(0);
  const ex = useSharedValue(0), ey = useSharedValue(0); // the eyes, a step ahead of the head
  const smile = useSharedValue(1), lid = useSharedValue(1);
  const center = useSharedValue({ x: 0, y: 0 });
  const box = useRef<ComponentRef<typeof View>>(null);

  // Watch the finger: eyes snap toward it, the head turns after.
  useAnimatedReaction(() => gaze.value, (g, prev) => {
    if (reduce || (!g.active && !prev?.active)) return;
    if (!g.active) { smile.value = withSpring(1, SMILE); return; } // lifted: a smile, then back to idle
    const c = center.value;
    const yw = Math.max(-1, Math.min(1, (g.x - c.x) / REACH_X));
    const pt = Math.max(-1, Math.min(1, (g.y - c.y) / REACH_Y));
    ex.value = withSpring(yw, GLANCE); ey.value = withSpring(pt, GLANCE);
    yaw.value = withSpring(yw * 0.85, FOLLOW); pitch.value = withSpring(pt * 0.8, FOLLOW); roll.value = withSpring(yw * 5, FOLLOW);
    if (!prev?.active) smile.value = withSpring(0.7, SMILE);
  }, [reduce]);

  useEffect(() => {
    if (reduce) return;
    let alive = true, i = 0, timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (!alive) return;
      const g = gaze.get();
      if (g.active || Date.now() - g.at < RESUME) { timer = setTimeout(step, 400); return; } // watching a finger
      i = (i + 1 + Math.floor(Math.random() * (LOOKS.length - 1))) % LOOKS.length; // never the same look twice
      const l = LOOKS[i];
      ex.set(withSpring(l.yaw, EYES)); ey.set(withSpring(l.pitch, EYES));
      yaw.set(withSpring(l.yaw, HEAD)); pitch.set(withSpring(l.pitch, HEAD)); roll.set(withSpring(l.roll, HEAD));
      smile.set(withSpring(l.smile, SMILE));
      if (Math.random() < 0.55) lid.set(withSequence(withTiming(1, { duration: 260 }), withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 120 })));
      timer = setTimeout(step, 1700 + Math.random() * 1500);
    };
    timer = setTimeout(step, 1200);
    return () => { alive = false; clearTimeout(timer); };
  }, [reduce, yaw, pitch, roll, ex, ey, smile, lid]);

  const face = useAnimatedStyle(() => ({
    transform: [
      { translateX: yaw.value * size * 0.17 }, { translateY: pitch.value * size * 0.13 },
      { rotate: `${roll.value}deg` },
      { scaleX: 1 - 0.2 * Math.abs(yaw.value) }, { scaleY: 1 - 0.14 * Math.abs(pitch.value) },
    ],
  }));
  const eyes = useAnimatedStyle(() => ({
    transform: [{ translateX: (ex.value - yaw.value) * size * 0.06 }, { translateY: (ey.value - pitch.value) * size * 0.05 }, { scaleY: lid.value }],
  }));
  const mouth = useAnimatedProps(() => {
    const m = smile.value, hw = 13 + 7 * m, y = 61 - 2 * m, dip = 6 + 14 * m;
    return { d: `M ${50 - hw} ${y} Q 50 ${y + dip} ${50 + hw} ${y}` };
  });

  const d = size;
  return (
    <View ref={box} style={{ width: d, height: d }}
      onLayout={() => box.current?.measureInWindow((x, y, w, h) => center.set({ x: x + w / 2, y: y + h / 2 }))}>
      <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="smBall" cx="0.38" cy="0.3" r="0.75">
            <Stop offset="0" stopColor="#FFF4B8" /><Stop offset="0.4" stopColor="#FFD54A" />
            <Stop offset="0.82" stopColor="#F5A623" /><Stop offset="1" stopColor="#C46A16" />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill="url(#smBall)" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }]}>
        <Animated.View style={[StyleSheet.absoluteFill, face]}>
          <Animated.View style={[StyleSheet.absoluteFill, eyes]}>
            <Svg width={d} height={d} viewBox="0 0 100 100">
              <Ellipse cx={35} cy={40} rx={7} ry={10} fill="#4A2508" />
              <Ellipse cx={65} cy={40} rx={7} ry={10} fill="#4A2508" />
              <Circle cx={33} cy={36} r={2.6} fill="#FFFFFF" opacity={0.85} />
              <Circle cx={63} cy={36} r={2.6} fill="#FFFFFF" opacity={0.85} />
            </Svg>
          </Animated.View>
          <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <APath animatedProps={mouth} stroke="#4A2508" strokeWidth={7} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      </View>
      {/* shading over the face, so features darken as they turn toward the edge; then the fixed highlight */}
      <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="smShade" cx="0.42" cy="0.38" r="0.62">
            <Stop offset="0.6" stopColor="#7A3A00" stopOpacity={0} /><Stop offset="1" stopColor="#7A3A00" stopOpacity={0.45} />
          </RadialGradient>
          <RadialGradient id="smGloss" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={50} fill="url(#smShade)" />
        <Ellipse cx={34} cy={22} rx={20} ry={11} fill="url(#smGloss)" />
      </Svg>
    </View>
  );
}
