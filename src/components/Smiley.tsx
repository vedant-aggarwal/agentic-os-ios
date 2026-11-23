import { type ComponentRef, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, ReduceMotion, type SharedValue, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { gaze } from '@/lib/gaze';
import { onHeart, pet, useSadness } from '@/lib/pet';

// A small 3D smiley for logging mood, and a pet. The ball is lit from the top left and stays put; the face rides
// its surface: it turns and tilts to look around (foreshortening toward the edge), the eyes lead the head, it
// blinks now and then, and the smile widens when it looks back at you. While a finger is on the screen it
// watches the finger instead, eyes first, head following.
// Rubbed (lib/pet), it shuts its eyes into happy arcs, grins open-mouthed, blushes, leans into the finger and
// hearts float up; the glow lasts a while after. The longer since a mood was logged, the sadder it gets: duller
// colour, drooping lids, worried brows, a frown, looking down, and past three days a tear now and then.
const HEAD = { duration: 900, dampingRatio: 0.82, reduceMotion: ReduceMotion.System } as const;
const EYES = { duration: 420, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
const SMILE = { duration: 700, dampingRatio: 0.85, reduceMotion: ReduceMotion.System } as const;
// following a finger: quick, so it feels like it is really watching
const FOLLOW = { duration: 420, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
const GLANCE = { duration: 200, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const REACH_X = 170; // pt sideways from the smiley at which it looks fully left or right
const REACH_Y = 300; // pt down at which it looks fully down
const RESUME = 1400; // ms after the finger lifts before it goes back to looking around
const HEARTS = 4;

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
const AEllipse = Animated.createAnimatedComponent(Ellipse);
const ACircle = Animated.createAnimatedComponent(Circle);
const AView = Animated.View;

// The mouth from how happy a rub made it (joy, rub), how sad it is and the idle smile: half-width, corner height
// and how far the middle dips (negative: a frown).
function mouthGeom(joy: number, rub: number, sad: number, smile: number) {
  'worklet';
  const j = Math.max(joy, rub);
  const f = Math.min(1, sad * 1.4) * (1 - j); // the frown leads the rest of the sadness a little
  const m = smile * (1 - f) * (1 - j) + j;
  const hw = 13 + 7 * m + 5 * j - 2 * f, y = 61 - 2 * m + 7 * f, dip = (6 + 14 * m) * (1 - f) - 15 * f + 6 * j;
  return { j, hw, y, dip };
}

// one heart floating up off its head
function Heart({ p, x, size }: { p: SharedValue<number>; x: SharedValue<number>; size: number }) {
  const st = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: v <= 0 || v >= 1 ? 0 : v < 0.2 ? v / 0.2 : 1 - (v - 0.2) / 0.8,
      transform: [{ translateX: x.value + Math.sin(v * 7) * 3 }, { translateY: -v * size * 0.9 }, { scale: 0.55 + 0.6 * v }],
    };
  });
  const w = size * 0.42;
  return (
    <AView pointerEvents="none" style={[{ position: 'absolute', left: (size - w) / 2, top: -w * 0.4, width: w, height: w }, st]}>
      <Svg width={w} height={w} viewBox="0 0 24 24">
        <Defs>
          <RadialGradient id="htFill" cx="0.36" cy="0.3" r="0.8">
            <Stop offset="0" stopColor="#FF9DB8" /><Stop offset="0.45" stopColor="#F2335F" /><Stop offset="1" stopColor="#8E0F2E" />
          </RadialGradient>
          <RadialGradient id="htGloss" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d="M12 21 C 5 15.5 1.5 12 1.5 7.6 C 1.5 4.5 4 2.2 7 2.2 C 9 2.2 10.9 3.3 12 5 C 13.1 3.3 15 2.2 17 2.2 C 20 2.2 22.5 4.5 22.5 7.6 C 22.5 12 19 15.5 12 21 Z" fill="url(#htFill)" />
        <Ellipse cx={7.2} cy={6.8} rx={3.4} ry={2.2} fill="url(#htGloss)" />
        <Circle cx={17.5} cy={7.5} r={1} fill="#FFFFFF" opacity={0.6} />
      </Svg>
    </AView>
  );
}

export function Smiley({ size = 30 }: { size?: number }) {
  const reduce = useReducedMotion();
  const sadNow = useSadness();
  const yaw = useSharedValue(0), pitch = useSharedValue(0), roll = useSharedValue(0);
  const ex = useSharedValue(0), ey = useSharedValue(0); // the eyes, a step ahead of the head
  const smile = useSharedValue(1), lid = useSharedValue(1);
  const sad = useSharedValue(0), tear = useSharedValue(0), hop = useSharedValue(0);
  const center = useSharedValue({ x: 0, y: 0 });
  const box = useRef<ComponentRef<typeof View>>(null);
  const sadRef = useRef(0);
  sadRef.current = sadNow;
  const h0 = useSharedValue(0), h1 = useSharedValue(0), h2 = useSharedValue(0), h3 = useSharedValue(0);
  const x0 = useSharedValue(0), x1 = useSharedValue(0), x2 = useSharedValue(0), x3 = useSharedValue(0);
  const hp = [h0, h1, h2, h3], hx = [x0, x1, x2, x3];
  const slot = useRef(0);

  useEffect(() => { sad.set(withTiming(sadNow, { duration: 1200 })); }, [sadNow, sad]);

  // a tear now and then once it is really sad: it wells up, runs down the cheek and is gone
  useEffect(() => {
    if (reduce || sadNow < 0.7) { tear.set(0); return; }
    tear.set(withRepeat(withSequence(withTiming(0, { duration: 2600 }), withTiming(1, { duration: 1700, easing: Easing.in(Easing.quad) })), -1));
  }, [reduce, sadNow, tear]);

  // hearts while it is being rubbed
  useEffect(() => onHeart(() => {
    if (reduce) return;
    const i = slot.current++ % HEARTS;
    hx[i].set((Math.random() - 0.5) * size * 0.7);
    hp[i].set(0);
    hp[i].set(withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) }));
  }), [reduce, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // the end of a rub: a happy little hop
  useAnimatedReaction(() => pet.rub.value > 0.5, (on, was) => {
    if (was && !on && !reduce) hop.value = withSequence(withTiming(1, { duration: 140 }), withSpring(0, { duration: 500, dampingRatio: 0.45 }));
  }, [reduce]);

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
      if (g.active || Date.now() - g.at < RESUME || pet.rub.get() > 0.05) { timer = setTimeout(step, 400); return; } // busy with a finger
      i = (i + 1 + Math.floor(Math.random() * (LOOKS.length - 1))) % LOOKS.length; // never the same look twice
      const l = LOOKS[i], s = sadRef.current;
      // a sad one looks around less and keeps its eyes down
      const yw = l.yaw * (1 - 0.5 * s), pt = Math.min(1, l.pitch * (1 - s) + 0.55 * s);
      ex.set(withSpring(yw, EYES)); ey.set(withSpring(pt, EYES));
      yaw.set(withSpring(yw, HEAD)); pitch.set(withSpring(pt, HEAD)); roll.set(withSpring(l.roll * (1 - 0.6 * s), HEAD));
      smile.set(withSpring(l.smile, SMILE));
      if (Math.random() < 0.55) lid.set(withSequence(withTiming(1, { duration: 260 }), withTiming(0.08, { duration: 70 }), withTiming(1, { duration: 120 })));
      timer = setTimeout(step, (1700 + Math.random() * 1500) * (1 + s));
    };
    timer = setTimeout(step, 1200);
    return () => { alive = false; clearTimeout(timer); };
  }, [reduce, yaw, pitch, roll, ex, ey, smile, lid]);

  // the whole ball leans into the finger and squishes while rubbed, hops after, sinks a little when sad
  const body = useAnimatedStyle(() => {
    const r = pet.rub.value, s = sad.value * (1 - Math.max(pet.joy.value, r));
    return {
      transform: [
        { translateX: pet.fx.value * size * 0.06 * r }, { translateY: -hop.value * size * 0.16 + s * size * 0.04 },
        { rotate: `${pet.fx.value * 12 * r}deg` },
        { scaleX: 1 + 0.07 * r - 0.03 * s }, { scaleY: 1 - 0.07 * r - 0.03 * s },
      ],
    };
  });
  const face = useAnimatedStyle(() => {
    const r = pet.rub.value;
    const yw = yaw.value * (1 - r), pt = pitch.value * (1 - r) - 0.25 * r; // rubbed, it tips its face up to you
    return {
      transform: [
        { translateX: yw * size * 0.17 }, { translateY: pt * size * 0.13 },
        { rotate: `${roll.value * (1 - r)}deg` },
        { scaleX: 1 - 0.2 * Math.abs(yw) }, { scaleY: 1 - 0.14 * Math.abs(pt) },
      ],
    };
  });
  // open eyes: hidden behind happy arcs while rubbed; heavy-lidded when sad
  const eyes = useAnimatedStyle(() => {
    const r = pet.rub.value, s = sad.value * (1 - Math.max(pet.joy.value, r));
    return {
      opacity: 1 - Math.min(1, r * 1.6),
      transform: [
        { translateX: (ex.value - yaw.value) * size * 0.06 }, { translateY: (ey.value - pitch.value) * size * 0.05 + s * size * 0.03 },
        { scaleY: lid.value * (1 - 0.38 * s) },
      ],
    };
  });
  const arcs = useAnimatedProps(() => ({ opacity: Math.min(1, pet.rub.value * 1.6) }));
  const arcsLit = useAnimatedProps(() => ({ opacity: Math.min(1, pet.rub.value * 1.6) * 0.5 }));
  const brows = useAnimatedProps(() => {
    const s = sad.value * (1 - Math.max(pet.joy.value, pet.rub.value));
    return { opacity: Math.min(1, s * 1.8), d: `M 25 ${29 - 2 * s} L 42 ${28 - 9 * s} M 58 ${28 - 9 * s} L 75 ${29 - 2 * s}` };
  });
  const cheeks = useAnimatedProps(() => ({ opacity: Math.max(pet.joy.value, pet.rub.value) * 0.8 }));
  const dull = useAnimatedProps(() => ({ opacity: sad.value * (1 - Math.max(pet.joy.value, pet.rub.value)) * 0.42 }));
  // the mouth: smile, grin or frown (each updater reads the shared values itself, so it reruns when they move)
  const mouth = useAnimatedProps(() => {
    const { hw, y, dip } = mouthGeom(pet.joy.value, pet.rub.value, sad.value, smile.value);
    return { d: `M ${50 - hw} ${y} Q 50 ${y + dip} ${50 + hw} ${y}` };
  });
  const lip = useAnimatedProps(() => { // light catching the lower edge of the mouth's groove
    const { j, hw, y, dip } = mouthGeom(pet.joy.value, pet.rub.value, sad.value, smile.value);
    const o = 0.45 * (1 - Math.min(1, j * 1.4));
    return { opacity: o, d: `M ${50 - hw * 0.75} ${y + 3.6 + dip * 0.12} Q 50 ${y + dip + 3.6} ${50 + hw * 0.75} ${y + 3.6 + dip * 0.12}` };
  });
  const open = useAnimatedProps(() => {
    const { j, hw, y, dip } = mouthGeom(pet.joy.value, pet.rub.value, sad.value, smile.value);
    return { opacity: Math.min(1, j * 1.4), d: `M ${50 - hw} ${y} Q 50 ${y + dip + 9} ${50 + hw} ${y} Q 50 ${y + 3} ${50 - hw} ${y} Z` };
  });
  const teeth = useAnimatedProps(() => {
    const { j, hw, y } = mouthGeom(pet.joy.value, pet.rub.value, sad.value, smile.value);
    return { opacity: Math.min(1, j * 1.4) * 0.95, d: `M ${50 - hw * 0.7} ${y + 1.4} Q 50 ${y + 6} ${50 + hw * 0.7} ${y + 1.4} Q 50 ${y + 2.6} ${50 - hw * 0.7} ${y + 1.4} Z` };
  });
  const tongue = useAnimatedProps(() => {
    const { j, y, dip } = mouthGeom(pet.joy.value, pet.rub.value, sad.value, smile.value);
    return { opacity: Math.min(1, j * 1.4), cy: y + dip * 0.5 + 6 };
  });
  const tearDrop = useAnimatedProps(() => {
    const v = tear.value, s = sad.value * (1 - Math.max(pet.joy.value, pet.rub.value));
    return { opacity: v <= 0.02 ? 0 : (v < 0.15 ? v / 0.15 : 1 - Math.max(0, v - 0.75) / 0.25) * Math.min(1, Math.max(0, (s - 0.6) * 4)), cy: 50 + v * 30 };
  });

  const d = size;
  return (
    <View ref={box} style={{ width: d, height: d }}
      onLayout={() => box.current?.measureInWindow((x, y, w, h) => center.set({ x: x + w / 2, y: y + h / 2 }))}>
      <AView style={[StyleSheet.absoluteFill, body]}>
        <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="smBall" cx="0.38" cy="0.3" r="0.75">
              <Stop offset="0" stopColor="#FFF4B8" /><Stop offset="0.4" stopColor="#FFD54A" />
              <Stop offset="0.82" stopColor="#F5A623" /><Stop offset="1" stopColor="#C46A16" />
            </RadialGradient>
            <RadialGradient id="smBounce" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FFF0B0" stopOpacity={0.45} /><Stop offset="1" stopColor="#FFF0B0" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill="url(#smBall)" />
          {/* light bouncing up from below, and the warm glow where light passes through the rim */}
          <Ellipse cx={50} cy={86} rx={34} ry={13} fill="url(#smBounce)" />
          <Circle cx={50} cy={50} r={48.5} fill="none" stroke="#FF8A2A" strokeWidth={3} opacity={0.35} />
          {/* sad: the colour drains toward a dull grey-blue */}
          <ACircle cx={50} cy={50} r={50} fill="#5D6B8A" animatedProps={dull} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { borderRadius: d / 2, overflow: 'hidden' }]}>
          <AView style={[StyleSheet.absoluteFill, face]}>
            <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
              <Defs>
                <RadialGradient id="smBlush" cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor="#FF4F7B" stopOpacity={0.8} /><Stop offset="1" stopColor="#FF4F7B" stopOpacity={0} />
                </RadialGradient>
                <LinearGradient id="smInk" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#2B1104" /><Stop offset="1" stopColor="#6A3810" />
                </LinearGradient>
              </Defs>
              {/* soft blush, as if it glows from under the skin */}
              <AEllipse cx={23} cy={58} rx={13} ry={8.5} fill="url(#smBlush)" animatedProps={cheeks} />
              <AEllipse cx={77} cy={58} rx={13} ry={8.5} fill="url(#smBlush)" animatedProps={cheeks} />
              <APath animatedProps={brows} stroke="url(#smInk)" strokeWidth={5} strokeLinecap="round" fill="none" />
            </Svg>
            <AView style={[StyleSheet.absoluteFill, eyes]}>
              <Svg width={d} height={d} viewBox="0 0 100 100">
                <Defs>
                  {/* each eye a glossy dark dome set into the face, lighter low down where light passes through */}
                  <RadialGradient id="smEye" cx="0.5" cy="0.74" r="0.72">
                    <Stop offset="0" stopColor="#8A5220" /><Stop offset="0.5" stopColor="#3A1A06" /><Stop offset="1" stopColor="#170801" />
                  </RadialGradient>
                  <RadialGradient id="smGlint" cx="0.5" cy="0.5" r="0.5">
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} /><Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.9} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                {/* the shallow socket each eye sits in */}
                <Ellipse cx={35} cy={41.5} rx={9.5} ry={12.5} fill="#A9560B" opacity={0.3} />
                <Ellipse cx={65} cy={41.5} rx={9.5} ry={12.5} fill="#A9560B" opacity={0.3} />
                <Ellipse cx={35} cy={40} rx={7} ry={10} fill="url(#smEye)" />
                <Ellipse cx={65} cy={40} rx={7} ry={10} fill="url(#smEye)" />
                <Ellipse cx={32.4} cy={35.2} rx={3.2} ry={3.8} fill="url(#smGlint)" />
                <Ellipse cx={62.4} cy={35.2} rx={3.2} ry={3.8} fill="url(#smGlint)" />
                <Circle cx={37.6} cy={45.4} r={1.1} fill="#FFFFFF" opacity={0.6} />
                <Circle cx={67.6} cy={45.4} r={1.1} fill="#FFFFFF" opacity={0.6} />
              </Svg>
            </AView>
            <Svg width={d} height={d} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="smInk2" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#2B1104" /><Stop offset="1" stopColor="#6A3810" />
                </LinearGradient>
                <RadialGradient id="smMouth" cx="0.5" cy="0.2" r="0.85">
                  <Stop offset="0" stopColor="#240502" /><Stop offset="0.7" stopColor="#5C1409" /><Stop offset="1" stopColor="#86281A" />
                </RadialGradient>
                <RadialGradient id="smTongue" cx="0.5" cy="0.3" r="0.65">
                  <Stop offset="0" stopColor="#FFA3B0" /><Stop offset="1" stopColor="#CF3E57" />
                </RadialGradient>
                <RadialGradient id="smTear" cx="0.35" cy="0.3" r="0.7">
                  <Stop offset="0" stopColor="#F4FCFF" /><Stop offset="0.45" stopColor="#8FD3FF" /><Stop offset="1" stopColor="#2F7FC4" />
                </RadialGradient>
              </Defs>
              {/* rubbed: eyes squeezed shut in happy arcs, light along their lower rim */}
              <APath animatedProps={arcs} d="M 27 43 Q 35 32 43 43 M 57 43 Q 65 32 73 43" stroke="url(#smInk2)" strokeWidth={6} strokeLinecap="round" fill="none" />
              <G transform="translate(0 3.4)">
                <APath animatedProps={arcsLit} d="M 29.5 43 Q 35 35.5 40.5 43 M 59.5 43 Q 65 35.5 70.5 43" stroke="#FFF3B8" strokeWidth={1.6} strokeLinecap="round" fill="none" />
              </G>
              <APath animatedProps={open} fill="url(#smMouth)" />
              <APath animatedProps={teeth} fill="#FFF8EE" />
              <AEllipse animatedProps={tongue} cx={50} rx={8.5} ry={5.2} fill="url(#smTongue)" />
              <APath animatedProps={mouth} stroke="url(#smInk2)" strokeWidth={7} strokeLinecap="round" fill="none" />
              <APath animatedProps={lip} stroke="#FFF3B8" strokeWidth={1.6} strokeLinecap="round" fill="none" />
              <AEllipse animatedProps={tearDrop} cx={31} rx={3.8} ry={5.2} fill="url(#smTear)" />
            </Svg>
          </AView>
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
      </AView>
      {hp.map((p, i) => <Heart key={i} p={p} x={hx[i]} size={d} />)}
    </View>
  );
}
