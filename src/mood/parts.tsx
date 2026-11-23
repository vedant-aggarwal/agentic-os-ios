import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, type StyleProp, StyleSheet, Text, TextInput, type TextStyle, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolateColor, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Glass, tap, useScale } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { Ball, useTurn } from '@/nora/Sphere';
import { F } from '@/theme';
import { moodInk } from './words';

// The mood logger's pieces that sit over the water: the pet's voice and the big word under it, the words that float
// on the pool, the line written on it at the end, and the few controls. Text is warm white with a soft dark halo,
// so it reads over the cave and over bright water alike; the one filled button is moonlight, the rest smoked glass.

export const INK = '#F6F1E9';
export const INK_SOFT = 'rgba(246,241,233,0.76)';
export const INK_FAINT = 'rgba(246,241,233,0.5)';
const MOON = '#F3EEE5';
export const LANTERN = '#FFE7B8'; // a word he picked, lit
const MOON_INK = '#17140F';
const HALO = { textShadowColor: 'rgba(0,0,0,0.62)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 1 } } as const;

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number; r: number };

/** Haptics the water uses beyond the kit's: a soft bump, a heavy thud, a rigid tap. Silent on web. */
export const feel = {
  soft: () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  heavy: () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  rigid: () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
};

/** A clock going 0..1 every `ms`, for things that bob. Still while `on` is false. */
export function useClock(ms: number, on: boolean) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!on) return;
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [ms, on, t]);
  return t;
}

/** Text that fades out, changes, and rises back in when `text` changes. */
function Swap({ text, style, reduce }: { text: string; style: (t: string) => StyleProp<TextStyle>; reduce: boolean }) {
  const [cur, setCur] = useState(text);
  const o = useSharedValue(text ? 1 : 0), y = useSharedValue(0);
  useEffect(() => {
    if (text === cur) return;
    o.set(withTiming(0, { duration: 130 }));
    const t = setTimeout(() => setCur(text), 140);
    return () => clearTimeout(t);
  }, [text, cur, o]);
  useEffect(() => {
    if (!cur) return;
    y.set(reduce ? 0 : 7);
    y.set(withSpring(0, { duration: 560, dampingRatio: 0.9 }));
    o.set(withTiming(1, { duration: 300 }));
  }, [cur, reduce, o, y]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }] }));
  return <Animated.Text style={[style(cur), st]}>{cur}</Animated.Text>;
}

/** The size a question gets from its length: short ones large, long ones a step down so they never crowd the pool. */
function mainType(t: string, font: string): TextStyle {
  const size = t.length <= 30 ? 28 : t.length <= 54 ? 25 : 21;
  return { fontFamily: font, fontSize: size, lineHeight: Math.round(size * 1.24), letterSpacing: size >= 25 ? -0.5 : -0.2 };
}

/** The mood word under his finger, in the light of where it is; it nudges like a dial's detent at each change. */
function LiveWord({ word, p, e, font }: { word: string; p: SharedValue<number>; e: SharedValue<number>; font: string }) {
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pop.set(withSequence(withTiming(1.05, { duration: 70 }), withSpring(1, { duration: 420, dampingRatio: 0.55 })));
  }, [word, pop]);
  const st = useAnimatedStyle(() => ({ color: moodInk(p.value, e.value, 0.38), transform: [{ scale: pop.value }] }));
  return <Animated.Text numberOfLines={1} style={[s.word, { fontFamily: font }, st]}>{word}</Animated.Text>;
}

/** Three dots that rise in turn while the pet thinks, in the pool's light. */
function Dots({ color, reduce }: { color: string; reduce: boolean }) {
  const t = useClock(1300, !reduce);
  const dot = (i: number) => () => {
    'worklet';
    const v = reduce ? 0.6 : Math.max(0, Math.sin((t.value - i * 0.16) * Math.PI * 2));
    return { opacity: 0.3 + 0.7 * v, transform: [{ translateY: -5 * v }] };
  };
  const a = useAnimatedStyle(dot(0)), b = useAnimatedStyle(dot(1)), c = useAnimatedStyle(dot(2));
  return (
    <View style={s.dots}>
      {[a, b, c].map((st, i) => <Animated.View key={i} style={[s.dot, { backgroundColor: color }, st]} />)}
    </View>
  );
}

export type SayMode = 'none' | 'text' | 'word' | 'think';

/**
 * What the pet says, right under it: a short line in its voice, then the main thing: a question, the live mood word,
 * or dots while it thinks. The voice line keeps its height, so nothing below jumps when it comes and goes.
 */
export function SayBlock({ top, voice, mode, main, word, p, e, font, light, reduce }: {
  top: number; voice: string; mode: SayMode; main: string; word: string; p: SharedValue<number>; e: SharedValue<number>; font: string; light: string; reduce: boolean;
}) {
  const kt = useSharedValue(mode === 'text' ? 1 : 0), kw = useSharedValue(mode === 'word' ? 1 : 0), kd = useSharedValue(mode === 'think' ? 1 : 0);
  useEffect(() => {
    const d = { duration: 240 };
    kt.set(withTiming(mode === 'text' ? 1 : 0, d)); kw.set(withTiming(mode === 'word' ? 1 : 0, d)); kd.set(withTiming(mode === 'think' ? 1 : 0, d));
  }, [mode, kt, kw, kd]);
  const ts = useAnimatedStyle(() => ({ opacity: kt.value }));
  const ws = useAnimatedStyle(() => ({ opacity: kw.value, transform: [{ scale: 0.92 + 0.08 * kw.value }] }));
  const ds = useAnimatedStyle(() => ({ opacity: kd.value }));
  return (
    <View pointerEvents="none" style={[s.say, { top }]}>
      <View style={s.voiceRow}>
        <Swap text={voice} reduce={reduce} style={() => s.voice} />
      </View>
      <View style={s.mainBox}>
        <Animated.View style={ts}><Swap text={mode === 'text' ? main : ''} reduce={reduce} style={(t) => [s.main, mainType(t, font)]} /></Animated.View>
        <Animated.View style={[s.layer, ws]}>{word ? <LiveWord word={word} p={p} e={e} font={font} /> : null}</Animated.View>
        <Animated.View style={[s.layer, s.dotsLayer, ds]}>{mode === 'think' ? <Dots color={light} reduce={reduce} /> : null}</Animated.View>
      </View>
    </View>
  );
}

// A word on the water: a little out of line (the same each time), bobbing on its own swell. Picked, it brightens
// into the pool's light and swells a touch; the lamp under it is drawn by the water.
function FloatWord({ w, i, on, origin, sinking, reduce, clock, font, lit, onToggle, onSurface, onSink, onCenter }: {
  w: string; i: number; on: boolean; origin: Pt; sinking: boolean; reduce: boolean; clock: SharedValue<number>; font: string; lit: string;
  onToggle: (w: string, at: Pt | null) => void; onSurface: (at: Pt) => void; onSink: (at: Pt) => void; onCenter: (w: string, at: Pt) => void;
}) {
  const jx = ((i * 37) % 13) - 6, jy = ((i * 53) % 11) - 5;
  const enter = useSharedValue(0), sel = useSharedValue(on ? 1 : 0), press = useSharedValue(1), sink = useSharedValue(0);
  const center = useRef<Pt | null>(null);
  useEffect(() => {
    const d = 140 + i * 75;
    enter.set(withDelay(d, withSpring(1, { duration: 760, dampingRatio: 0.78 })));
    const t = setTimeout(() => { if (center.current) onSurface(center.current); }, d + 40);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sel.set(withSpring(on ? 1 : 0, { duration: 420, dampingRatio: 0.7 })); }, [on, sel]);
  useEffect(() => {
    if (!sinking) return;
    const d = i * 45;
    sink.set(withDelay(d, withTiming(1, { duration: 460, easing: Easing.in(Easing.quad) })));
    const t = setTimeout(() => { if (center.current) onSink(center.current); }, d + 300);
    return () => clearTimeout(t);
  }, [sinking]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => {
    const ph = clock.value * Math.PI * 2 + i * 1.9;
    const bob = reduce ? 0 : Math.sin(ph) * 2.6, drift = reduce ? 0 : Math.sin(ph + i * 0.7) * 1.4;
    const en = enter.value, k = sink.value;
    return {
      opacity: Math.min(1, en) * (1 - k),
      transform: [
        { translateX: jx + drift },
        { translateY: jy + bob + (1 - en) * (reduce ? 0 : 16) + k * 18 },
        { scale: (0.92 + 0.08 * en) * press.value * (1 + 0.1 * sel.value) * (1 - 0.08 * k) },
      ],
    };
  });
  const tx = useAnimatedStyle(() => ({ color: interpolateColor(sel.value, [0, 1], ['rgba(246,241,233,0.74)', lit]) }));
  const glow = useAnimatedStyle(() => ({ opacity: sel.value }));
  const shade = useAnimatedStyle(() => ({ opacity: 1 - sel.value }));
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={w} accessibilityState={{ selected: on }} hitSlop={2}
      onLayout={(ev) => {
        const l = ev.nativeEvent.layout;
        center.current = { x: origin.x + l.x + l.width / 2 + jx, y: origin.y + l.y + l.height / 2 + jy };
        onCenter(w, center.current);
      }}
      onPressIn={() => press.set(withTiming(0.9, { duration: 90 }))}
      onPressOut={() => press.set(withSpring(1, { duration: 420, dampingRatio: 0.5 }))}
      onPress={() => onToggle(w, center.current)}>
      <Animated.View style={[s.fw, st]}>
        <Animated.Text style={[s.fwText, s.fwShade, { fontFamily: font }, shade]}>{w}</Animated.Text>
        <Animated.Text style={[s.fwText, s.fwGlow, { fontFamily: font }, glow]}>{w}</Animated.Text>
        <Animated.Text style={[s.fwText, { fontFamily: font }, tx]}>{w}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/** The words floating on the pool, to tap (several at once). They surface one by one, and sink when `sinking`. */
export function FloatWords({ words, picked, rect, sinking, reduce, font, lit, onToggle, onSurface, onSink, onCenter }: {
  words: string[]; picked: string[]; rect: Rect; sinking: boolean; reduce: boolean; font: string; lit: string;
  onToggle: (w: string, at: Pt | null) => void; onSurface: (at: Pt) => void; onSink: (at: Pt) => void; onCenter: (w: string, at: Pt) => void;
}) {
  const clock = useClock(5600, !reduce);
  const origin = { x: rect.x + 18, y: rect.y + 26 };
  return (
    <View pointerEvents="box-none" style={[s.float, { left: origin.x, top: origin.y, width: rect.w - 36, height: rect.h - 52 }]}>
      {words.map((w, i) => (
        <FloatWord key={w} w={w} i={i} on={picked.includes(w)} origin={origin} sinking={sinking} reduce={reduce} clock={clock} font={font} lit={lit}
          onToggle={onToggle} onSurface={onSurface} onSink={onSink} onCenter={onCenter} />
      ))}
    </View>
  );
}

function FadeUp({ delay, reduce, children }: { delay: number; reduce: boolean; children: ReactNode }) {
  const k = useSharedValue(0);
  useEffect(() => { k.set(withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }))); }, [delay, k]);
  const st = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ translateY: reduce ? 0 : (1 - k.value) * 10 }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** The check-in, written on the water word by word once it is done. */
export function Summary({ rect, line, label, font, reduce }: { rect: Rect; line: string; label: string; font: string; reduce: boolean }) {
  const words = line.split(/\s+/).filter(Boolean);
  return (
    <View pointerEvents="none" style={[s.sum, { left: rect.x + 30, top: rect.y, width: rect.w - 60, height: rect.h }]}>
      <FadeUp delay={0} reduce={reduce}><Text style={s.sumLabel}>{label}</Text></FadeUp>
      <View style={s.sumRow}>
        {words.map((w, i) => (
          <FadeUp key={`${i}-${w}`} delay={260 + i * 60} reduce={reduce}><Text style={[s.sumWord, { fontFamily: font }]}>{w}</Text></FadeUp>
        ))}
      </View>
    </View>
  );
}

const Arrow = ({ color, size = 20 }: { color: string; size?: number }) => (
  <Sym name="arrow.right" size={size - 2} color={color} fallback={
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M4.5 12h14M13 5.5l6.5 6.5-6.5 6.5" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
  } />
);
const XMark = ({ color, size = 16 }: { color: string; size?: number }) => (
  <Sym name="xmark" size={size} color={color} fallback={
    <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke={color} strokeWidth={2.6} strokeLinecap="round" fill="none" /></Svg>
  } />
);

/** The one filled button: warm moonlight, dark type. */
export function MoonButton({ label, onPress, arrow, grow }: { label: string; onPress: () => void; arrow?: boolean; grow?: boolean }) {
  const p = useScale(0.95);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} style={grow ? s.grow : undefined}>
      <Animated.View style={[s.moon, p.style]}>
        <Text style={s.moonText}>{label}</Text>
        {arrow ? <Arrow color={MOON_INK} size={19} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Smoked glass, like the top bar's. */
export function GlassButton({ label, onPress, grow, children }: { label: string; onPress: () => void; grow?: boolean; children?: ReactNode }) {
  const p = useScale(0.95);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} style={grow ? s.grow : undefined}>
      <Animated.View style={[s.glassBtn, p.style]}>
        <Glass radius={26} />
        {children}
        <Text style={s.glassText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The round go-on button beside the note field. */
export function RoundGo({ onPress, label }: { onPress: () => void; label: string }) {
  const p = useScale(0.9);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} hitSlop={4}>
      <Animated.View style={[s.go, p.style]}><Arrow color={MOON_INK} size={22} /></Animated.View>
    </Pressable>
  );
}

const WEB_INPUT = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

/** A few words of his own, in smoked glass. */
export function NoteField({ value, onChangeText, placeholder, onFocus, onBlur }: {
  value: string; onChangeText: (v: string) => void; placeholder: string; onFocus?: () => void; onBlur?: () => void;
}) {
  return (
    <View style={s.field}>
      <Glass radius={26} />
      <View style={s.grow}>
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={INK_FAINT}
          style={[s.input, WEB_INPUT]} keyboardAppearance="dark" returnKeyType="done" submitBehavior="blurAndSubmit" maxLength={240}
          selectionColor="#F3D9A8" onFocus={onFocus} onBlur={onBlur} accessibilityLabel={placeholder} />
      </View>
    </View>
  );
}

export function CloseButton({ onPress }: { onPress: () => void }) {
  const p = useScale(0.88);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} hitSlop={8}>
      <Animated.View style={[s.close, p.style]}>
        <Glass radius={22} />
        <View><XMark color={INK} /></View>
      </Animated.View>
    </Pressable>
  );
}

/** Nora's orb, turning, in a glass capsule: ask her to call. */
export function NoraButton({ onPress, label = 'Call Nora' }: { onPress: () => void; label?: string }) {
  const t = useTurn(true);
  const p = useScale(0.93);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ask Nora to call you" onPress={onPress} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} hitSlop={6}>
      <Animated.View style={[s.nora, p.style]}>
        <Glass radius={22} />
        <View style={s.orb}><Ball t={t} r={10} /></View>
        <Text style={s.noraText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The same orb for a glass button's leading edge. */
export function NoraOrb() {
  const t = useTurn(true);
  return <View style={s.orb}><Ball t={t} r={10} /></View>;
}

const s = StyleSheet.create({
  say: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  voiceRow: { minHeight: 24, justifyContent: 'flex-end', alignItems: 'center' },
  voice: { fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: INK_SOFT, textAlign: 'center', ...HALO },
  mainBox: { marginTop: 6, alignSelf: 'stretch', alignItems: 'center', minHeight: 60 },
  main: { color: INK, textAlign: 'center', maxWidth: 360, ...HALO },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center' },
  dotsLayer: { top: 22 },
  word: { fontSize: 48, lineHeight: 58, letterSpacing: -1.6, textAlign: 'center', ...HALO },
  dots: { flexDirection: 'row', gap: 12, height: 24, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, boxShadow: '0 0 12px rgba(255,236,200,0.55)' },
  float: { position: 'absolute', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center' },
  fw: { paddingHorizontal: 11, paddingVertical: 11 },
  fwText: { fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  fwShade: { position: 'absolute', left: 11, top: 11, color: 'rgba(0,0,0,0.01)', ...HALO, textShadowColor: 'rgba(0,0,0,0.75)' },
  fwGlow: { position: 'absolute', left: 11, top: 11, color: LANTERN, textShadowColor: 'rgba(255,186,96,0.9)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  sum: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  sumLabel: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: INK_FAINT, letterSpacing: 0.2, ...HALO },
  sumRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 7 },
  sumWord: { fontSize: 25, lineHeight: 34, letterSpacing: -0.4, color: INK, ...HALO },
  grow: { flex: 1 },
  moon: {
    height: 52, borderRadius: 26, paddingHorizontal: 28, backgroundColor: MOON, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: '0 12px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
  },
  moonText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 20, color: MOON_INK, letterSpacing: -0.1 },
  glassBtn: { height: 52, borderRadius: 26, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.4)' },
  glassText: { fontFamily: F.medium, fontSize: 16, lineHeight: 20, color: INK },
  go: { width: 52, height: 52, borderRadius: 26, backgroundColor: MOON, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)' },
  field: { flex: 1, height: 52, borderRadius: 26, justifyContent: 'center', boxShadow: '0 12px 30px rgba(0,0,0,0.4)' },
  input: { fontFamily: F.regular, fontSize: 16, color: INK, paddingHorizontal: 20, height: 52 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 26px rgba(0,0,0,0.4)' },
  nora: { height: 44, borderRadius: 22, paddingLeft: 12, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 9, boxShadow: '0 10px 26px rgba(0,0,0,0.4)' },
  orb: { width: 20, height: 20 },
  noraText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: INK },
});
