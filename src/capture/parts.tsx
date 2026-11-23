import { Image } from 'expo-image';
import { forwardRef, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Animated, {
  FadeIn, FadeOut, ReduceMotion, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useScale } from '@/components/Glass';
import { Glyph, Icon } from '@/aspects/kit/controls';
import { haptic, SURF, tint } from '@/aspects/kit/tokens';
import { ASPECT_COLOR, C, F } from '@/theme';
import type { FrameState } from './data';
import type { Frame } from './moments';

// The pieces of the capture panel. One material (the panel), white at low alpha for everything inside it, colour only
// from the aspect an action belongs to. Body is orange, Mind amber, Soul gold.

export const BODY = ASPECT_COLOR.body;
const INK = '#0B0C10'; // a mark drawn on a filled aspect colour
export const QUICK = { duration: 260, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const SETTLE = { duration: 340, dampingRatio: 0.78, reduceMotion: ReduceMotion.System } as const;

// glyphs this panel uses that the kit doesn't have (24 grid, drawn on web and Android; SF Symbols on the iPhone)
export const DROP = 'M12 3.5c-3 4-6 7.4-6 10.6a6 6 0 0 0 12 0c0-3.2-3-6.6-6-10.6z';
export const BOOK = 'M5 4.5h5.5A2.5 2.5 0 0 1 13 7v13a2 2 0 0 0-2-2H5zM19 4.5h-3.5A2.5 2.5 0 0 0 13 7v13a2 2 0 0 1 2-2h4z';
export const SPARK = 'M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z';

/** Tappable with the panel's press: a quick dip, no bounce, and the haptic named. */
export function Tap({ label, hint, onPress, onLongPress, children, style, disabled, feel = 'light', role = 'button', state, hitSlop }: {
  label: string; hint?: string; onPress?: () => void; onLongPress?: () => void; children: ReactNode; style?: object | object[];
  disabled?: boolean; feel?: 'light' | 'medium' | 'tick' | 'none'; role?: 'button' | 'checkbox'; state?: { checked?: boolean; disabled?: boolean };
  hitSlop?: number;
}) {
  const p = useScale(0.96);
  return (
    <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled, ...state }} disabled={disabled}
      hitSlop={hitSlop} onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} onLongPress={onLongPress} delayLongPress={350}
      onPress={() => { if (feel !== 'none') haptic[feel](); onPress?.(); }}>
      <Animated.View style={[style, p.style, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A section's name, quiet: the content says what it is. */
export function Label({ children, right }: { children: string; right?: string | null }) {
  return (
    <View style={s.labelRow}>
      <Text style={s.label}>{children}</Text>
      {right ? <Text style={[s.labelRight, s.num]}>{right}</Text> : null}
    </View>
  );
}

// ── the roll ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const FRAME_W = 68;
export const FRAME_H = 90;
const FRAME_R = 14;

/**
 * One photo slot of the day. Empty it is a frame waiting with a camera mark; taken it holds the picture. The frame
 * for this hour wears the Body colour. While a picture flies in, `hidden` keeps the frame empty until it lands.
 */
export const RollFrame = forwardRef<ComponentRef<typeof View>, {
  frame: Frame; st: FrameState; focus: boolean; hidden: boolean; landed: number; onPress: () => void;
}>(function RollFrame({ frame, st, focus, hidden, landed, onPress }, ref) {
  const reduce = useReducedMotion();
  const pop = useSharedValue(1);
  const seen = useRef(landed);
  useEffect(() => {
    if (landed === seen.current) return;
    seen.current = landed;
    if (!reduce) pop.set(withSequence(withTiming(1.07, { duration: 90 }), withSpring(1, SETTLE)));
  }, [landed, pop, reduce]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const filled = !!st.src && !hidden;
  const done = filled || st.status === 'logged';
  const failed = st.status === 'failed';
  const words = `${frame.long} photo${st.status === 'empty' ? '' : `, ${st.note ?? st.status}`}`;
  return (
    <Tap label={words} onPress={onPress} feel="light" style={s.frameWrap}>
      <Animated.View ref={ref} collapsable={false} style={[s.frame, focus && !filled && { borderColor: tint(BODY, 0.55), backgroundColor: tint(BODY, 0.07) }, popStyle]}>
        {filled ? (
          <Animated.View entering={reduce ? FadeIn.duration(200) : undefined} style={StyleSheet.absoluteFill}>
            <Image source={st.src} style={[StyleSheet.absoluteFill, { opacity: st.status === 'sending' || failed ? 0.5 : 1 }]} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
          </Animated.View>
        ) : st.status === 'logged' ? (
          // logged without a picture (typed, or a recent meal again): done, and a photo can still go in
          <View style={[StyleSheet.absoluteFill, s.loggedFill]}><Icon name="check" size={20} color={BODY} /></View>
        ) : (
          <Glyph sf="camera" d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z"
            size={20} color={focus ? BODY : 'rgba(255,255,255,0.22)'} />
        )}
        {st.status === 'sending' && !hidden ? <View style={s.sendBar}><Sweep /></View> : null}
      </Animated.View>
      <Text numberOfLines={1} style={[s.frameLabel, (focus || done) && { color: C.text }]}>{frame.label}</Text>
      <Text numberOfLines={1} style={[s.frameNote, failed && { color: C.danger }, st.status === 'ready' && { color: BODY }]}>{hidden ? ' ' : st.note ?? ' '}</Text>
    </Tap>
  );
});

/** The thin line under a sending photo: it runs while the bytes go. */
function Sweep() {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    let on = true;
    const loop = () => { if (!on) return; x.set(0); x.set(withTiming(1, { duration: 900 })); };
    loop();
    const id = setInterval(loop, 950);
    return () => { on = false; clearInterval(id); };
  }, [x, reduce]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -FRAME_W * 0.5 + x.value * FRAME_W * 1.2 }] }));
  return <Animated.View style={[s.sweep, reduce ? { width: FRAME_W, opacity: 0.6 } : st]} />;
}

// ── water ────────────────────────────────────────────────────────────────────────────────────────────────────────
const litres = (glasses: number) => {
  const l = (glasses * 250) / 1000;
  return Number.isInteger(l) ? `${l}` : l.toFixed(2).replace(/0$/, '');
};

/** Glasses as a row of marks, one per 250 ml of the day's target. The new one rises into place. */
export function WaterRow({ glasses, target, onAdd, onTakeBack }: { glasses: number; target: number; onAdd: () => void; onTakeBack: () => void }) {
  const n = Math.max(1, Math.min(target, 30));
  return (
    <View style={s.waterRow}>
      <View style={s.waterText}>
        <Text style={[s.waterValue, s.num]}>{`${litres(glasses)} L`}</Text>
        <Text style={[s.waterOf, s.num]}>{`of ${litres(target)} L water`}</Text>
      </View>
      <View style={s.marks} accessible accessibilityLabel={`${glasses} of ${target} glasses`}>
        {Array.from({ length: n }, (_, i) => <Mark key={i} on={i < glasses} />)}
      </View>
      <Tap label="Add 250 ml of water" hint="Hold to take one back" onPress={onAdd} onLongPress={onTakeBack} feel="medium" style={s.waterBtn}>
        <Text style={s.waterBtnText}>+250</Text>
      </Tap>
    </View>
  );
}
function Mark({ on }: { on: boolean }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => { v.set(withSpring(on ? 1 : 0, QUICK)); }, [on, v]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }], opacity: 0.35 + 0.65 * v.value }));
  return (
    <View style={s.mark}>
      <Animated.View style={[StyleSheet.absoluteFill, s.markFill, fill]} />
    </View>
  );
}

// ── ticks ────────────────────────────────────────────────────────────────────────────────────────────────────────
const APath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 17;

/** A habit line: a ring in the aspect's colour that fills, and a check that draws itself in after the fill. */
export function TickRow({ label, meta, color, done, onPress, disabled, hint }: {
  label: string; meta?: string | null; color: string; done: boolean; onPress: () => void; disabled?: boolean; hint?: string;
}) {
  const v = useSharedValue(done ? 1 : 0);
  const draw = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    v.set(withSpring(done ? 1 : 0, done ? SETTLE : QUICK));
    draw.set(done ? withTiming(1, { duration: 220, reduceMotion: ReduceMotion.System }) : withTiming(0, { duration: 120 }));
  }, [done, v, draw]);
  const fill = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.55 + 0.45 * v.value }] }));
  const check = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }));
  return (
    <Tap label={`${label}${meta ? `, ${meta}` : ''}`} role="checkbox" state={{ checked: done }} onPress={onPress} disabled={disabled} feel="none" style={s.tick}>
      <View style={[s.ring, { borderColor: tint(color, done ? 1 : 0.5) }]}>
        <Animated.View style={[StyleSheet.absoluteFill, s.ringFill, { backgroundColor: color }, fill]} />
        <Svg width={22} height={22} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
          <APath d="M6.8 12.4l3.4 3.4L17.4 8.6" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none"
            strokeDasharray={CHECK_LEN} animatedProps={check} />
        </Svg>
      </View>
      <View style={s.tickText}>
        <Text numberOfLines={1} style={[s.tickLabel, done && { color: C.muted }]}>{label}</Text>
        {meta ? <Text numberOfLines={1} style={[s.tickMeta, s.num, { color: done ? C.faint : tint(color, 0.9) }]}>{meta}</Text> : null}
        {!meta && hint ? <Text numberOfLines={1} style={s.tickMeta}>{hint}</Text> : null}
      </View>
    </Tap>
  );
}

// ── now ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One of the moment's actions: big enough to hit without looking, its mark in the colour of what it logs. */
export function NowCard({ title, sub, color, glyph, onPress }: {
  title: string; sub: string; color: string; glyph: ReactNode; onPress: () => void;
}) {
  return (
    <View style={s.nowCell}>
      <Tap label={`${title}, ${sub}`} onPress={onPress} feel="light" style={s.now}>
        <View>{glyph}</View>
        <View style={s.nowText}>
          <Text numberOfLines={1} style={s.nowTitle}>{title}</Text>
          <Text numberOfLines={1} style={[s.nowSub, { color: tint(color, 0.85) }]}>{sub}</Text>
        </View>
      </Tap>
    </View>
  );
}

// ── the line at the bottom ───────────────────────────────────────────────────────────────────────────────────────
export type Mode = { kind: 'task' } | { kind: 'journal' } | { kind: 'page' } | { kind: 'wake'; hm: string };

/** The field every typed capture shares. A mode other than a task wears its name on the left; tap it to go back. */
export const Field = forwardRef<ComponentRef<typeof TextInput>, {
  value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; tag: { text: string; color: string } | null;
  onTag: () => void; onFocus: () => void; onBlur: () => void; keyboard: KeyboardTypeOptions; busy: boolean;
}>(function Field({ value, onChange, onSubmit, placeholder, tag, onTag, onFocus, onBlur, keyboard, busy }, ref) {
  return (
    <View style={s.field}>
      {tag ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${tag.text}: back to adding a task`} onPress={onTag} hitSlop={8}
          style={[s.tag, { backgroundColor: tint(tag.color, 0.16) }]}>
          <Text style={[s.tagText, { color: tag.color }]}>{tag.text}</Text>
          <Icon name="close" size={12} color={tag.color} />
        </Pressable>
      ) : null}
      <TextInput ref={ref} value={value} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder={placeholder}
        placeholderTextColor={C.faint} keyboardType={keyboard} returnKeyType="done" submitBehavior="submit" editable={!busy}
        onFocus={onFocus} onBlur={onBlur} selectionColor={BODY} keyboardAppearance="dark" style={s.input}
        accessibilityLabel={placeholder} />
      {value.trim() ? (
        <Tap label="Save" onPress={onSubmit} feel="medium" style={s.send} disabled={busy}>
          <Icon name="arrowUp" size={18} color={INK} />
        </Tap>
      ) : null}
    </View>
  );
});

/** A chip under the field: an area, Today, or Nora. */
export function Chip({ text, on, color, onPress, glyph }: { text: string; on: boolean; color: string; onPress: () => void; glyph?: ReactNode }) {
  return (
    <Tap label={text} role="checkbox" state={{ checked: on }} onPress={onPress} feel="tick"
      style={[s.chip, on ? { backgroundColor: tint(color, 0.2), borderColor: tint(color, 0.5) } : null]}>
      {glyph}
      <Text style={[s.chipText, on && { color }]}>{text}</Text>
    </Tap>
  );
}

/** The panel's own status line, over its top edge. */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Animated.View key={text} entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)} pointerEvents="none" accessibilityLiveRegion="polite" style={s.toast}>
      <Text style={s.toastText}>{text}</Text>
    </Animated.View>
  );
}

export const s = StyleSheet.create({
  num: { fontVariant: ['tabular-nums'] },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted },
  labelRight: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint },

  frameWrap: { width: FRAME_W },
  frame: {
    width: FRAME_W, height: FRAME_H, borderRadius: FRAME_R, borderCurve: 'continuous', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  frameLabel: { marginTop: 8, fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.muted },
  frameNote: { fontFamily: F.regular, fontSize: 11, lineHeight: 14, color: C.faint },
  loggedFill: { alignItems: 'center', justifyContent: 'center', backgroundColor: tint(BODY, 0.1) },
  sendBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  sweep: { width: FRAME_W * 0.5, height: 2, backgroundColor: BODY },

  waterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  waterText: { width: 84 },
  waterValue: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: C.text },
  waterOf: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint },
  marks: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 20 },
  mark: { width: 4, height: 18, borderRadius: 2, backgroundColor: SURF.track, overflow: 'hidden' },
  markFill: { borderRadius: 2, backgroundColor: BODY, transformOrigin: 'bottom' },
  waterBtn: {
    height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tint(BODY, 0.16),
  },
  waterBtnText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: BODY, fontVariant: ['tabular-nums'] },

  tick: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38, paddingVertical: 3 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, overflow: 'hidden' },
  ringFill: { borderRadius: 11 },
  tickText: { flex: 1, minWidth: 0 },
  tickLabel: { fontFamily: F.medium, fontSize: 15, lineHeight: 19, color: C.text },
  tickMeta: { fontFamily: F.regular, fontSize: 12, lineHeight: 15, color: C.faint },

  nowCell: { flex: 1 },
  now: {
    height: 80, borderRadius: 20, borderCurve: 'continuous', padding: 12, justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.065)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  nowText: { gap: 1 },
  nowTitle: { fontFamily: F.semibold, fontSize: 15, lineHeight: 19, letterSpacing: -0.1, color: C.text },
  nowSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 15 },

  field: {
    flex: 1, minWidth: 0, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 6, gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  input: { flex: 1, minWidth: 0, height: 48, paddingHorizontal: 10, fontFamily: F.regular, fontSize: 16, color: C.text, outlineStyle: 'none' } as object,
  tag: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: 16, marginLeft: 2 },
  tagText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 16 },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  chipText: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.textSoft },
  toast: {
    alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16,
    backgroundColor: 'rgba(30,31,35,0.96)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  toastText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
});
