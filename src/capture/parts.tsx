import { Image } from 'expo-image';
import { forwardRef, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useScale } from '@/components/Glass';
import { LOCK } from '@/components/Sealed';
import { Glyph, Icon } from '@/aspects/kit/controls';
import { haptic, SURF, tint } from '@/aspects/kit/tokens';
import { openSealed } from '@/lib/seal';
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
const CAMERA = 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z';
const RESTART = 'M5 12a7 7 0 1 0 2.05-4.95M5 4.5v3.2h3.2';
export const STOP = 'M7.5 7.5h9v9h-9z';

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

// ── the photos ───────────────────────────────────────────────────────────────────────────────────────────────────
/** The day's photo slots, all at once: two rows of four. */
export const TILE_H = 60;
const TILE_R = 14;
export const TILE_GAP = 8;

/**
 * One photo slot of the day. Empty it waits with a camera mark; taken it holds the picture with its name over a soft
 * shade. The slot for this hour wears the Body colour. While a picture flies in, `hidden` keeps it empty until it lands.
 */
export const PhotoTile = forwardRef<ComponentRef<typeof View>, {
  frame: Frame; st: FrameState; focus: boolean; hidden: boolean; landed: number; onPress: () => void;
}>(function PhotoTile({ frame, st, focus, hidden, landed, onPress }, ref) {
  const reduce = useReducedMotion();
  const pop = useSharedValue(1);
  const seen = useRef(landed);
  useEffect(() => {
    if (landed === seen.current) return;
    seen.current = landed;
    if (!reduce) pop.set(withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, SETTLE)));
  }, [landed, pop, reduce]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const filled = !!st.src && !hidden;
  // a body or face photo: a lock where the picture would be; a tap asks for Face ID and opens it, Take again from there
  const sealed = !!st.sealed && !hidden && (filled || st.status === 'kept');
  const logged = st.status === 'logged' && !filled && !hidden;
  const failed = st.status === 'failed';
  const words = `${frame.long} photo${st.status === 'empty' ? '' : `, ${st.note ?? st.status}`}${sealed ? ', sealed' : ''}`;
  const note = hidden ? null : st.note;
  const press = sealed && st.status === 'kept'
    ? () => { void openSealed({ title: frame.long, photos: [{ source: st.src, label: `${frame.long} photo` }], action: { label: 'Take again', run: onPress } }); }
    : onPress;
  return (
    // Tap puts its style on the view inside its Pressable, so the share of the row is taken by this outer view.
    <View style={s.tileWrap}>
      <Tap label={words} hint={sealed && st.status === 'kept' ? 'Opens with Face ID' : undefined} onPress={press} feel="light">
        <Animated.View ref={ref} collapsable={false}
          style={[s.tile, focus && !filled && !logged && !sealed && { borderColor: tint(BODY, 0.55), backgroundColor: tint(BODY, 0.07) }, logged && s.loggedFill, sealed && s.sealedFill, popStyle]}>
          {filled && !sealed ? (
            <Animated.View entering={reduce ? FadeIn.duration(200) : undefined} style={StyleSheet.absoluteFill}>
              <Image source={st.src} style={[StyleSheet.absoluteFill, { opacity: st.status === 'sending' || failed ? 0.5 : 1 }]} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
              <Shade />
            </Animated.View>
          ) : (
            <View style={s.tileMark}>
              {sealed ? <Glyph sf="lock.fill" d={LOCK} size={16} color={C.muted} />
                : logged ? <Icon name="check" size={16} color={BODY} />
                : <Glyph sf="camera" d={CAMERA} size={16} color={focus ? BODY : 'rgba(255,255,255,0.24)'} />}
            </View>
          )}
          <View style={s.tileText}>
            <Text numberOfLines={1} style={[s.tileLabel, (focus || filled || logged || sealed) && { color: C.text }]}>{frame.label}</Text>
            {note ? <Text numberOfLines={1} style={[s.tileNote, filled && !sealed && { color: 'rgba(255,255,255,0.78)' }, failed && { color: C.danger }, st.status === 'ready' && { color: BODY }]}>{note}</Text> : null}
          </View>
          {st.status === 'sending' && !hidden ? <View style={s.sendBar}><Sweep /></View> : null}
        </Animated.View>
      </Tap>
    </View>
  );
});

/** The shade under a photo's name, so white text reads on any picture. */
function Shade() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10" pointerEvents="none">
      <Defs>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.2" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="10" height="10" fill="url(#shade)" />
    </Svg>
  );
}

/**
 * The smart photo: one button for any photo; the PC works out what it is and files it. While it reads, the picture
 * waits in the button, and from there it flies to wherever it was filed.
 */
export const SmartButton = forwardRef<ComponentRef<typeof View>, { reading: string | null; onPress: () => void }>(function SmartButton({ reading, onPress }, ref) {
  return (
    <Tap label={reading ? 'Smart photo, reading it' : 'Smart photo'} hint="Pick any photo; it is filed where it belongs" onPress={onPress} disabled={!!reading} feel="light"
      style={[s.smart, reading && { opacity: 1 }]}>
      {reading ? (
        <View ref={ref} collapsable={false} style={s.smartThumb}>
          <Image source={{ uri: reading }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} accessibilityIgnoresInvertColors />
        </View>
      ) : <Glyph sf="sparkles" d={SPARK} size={14} color={BODY} filled />}
      <Text style={s.smartText}>{reading ? 'Reading' : 'Smart photo'}</Text>
      {reading ? <ActivityIndicator size="small" color={BODY} style={s.smartSpin} /> : null}
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
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: -40 + x.value * 110 }] }));
  return <Animated.View style={[s.sweep, reduce ? { width: '100%', opacity: 0.6 } : st]} />;
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

const HOLD_MS = 650;
const RING = 2 * Math.PI * 10;
const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * Clean's slip, next to its tick: logged by holding, so a brush past it does nothing. The ring draws round while the
 * finger stays; let go early and it runs back. A plain tap only says how.
 */
export function SlipRow({ onConfirm, onTap }: { onConfirm: () => void; onTap: () => void }) {
  const v = useSharedValue(0);
  const fired = useRef(false);
  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - v.value) }));
  const p = useScale(0.96);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Slipped" accessibilityHint="Hold to log a slip. The run starts again."
      delayLongPress={HOLD_MS}
      onPressIn={() => { fired.current = false; p.set(p.to); v.set(withTiming(1, { duration: HOLD_MS, easing: Easing.linear })); }}
      onPressOut={() => { p.set(1); if (!fired.current) v.set(withTiming(0, { duration: 200, easing: Easing.bezier(0.23, 1, 0.32, 1) })); }}
      onLongPress={() => { fired.current = true; v.set(withTiming(0, { duration: 260 })); onConfirm(); }}
      onPress={() => { if (!fired.current) onTap(); }}>
      <Animated.View style={[s.tick, p.style]}>
        <View style={s.slipRing}>
          <Svg width={22} height={22} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
            <Circle cx={12} cy={12} r={10} stroke="rgba(255,255,255,0.16)" strokeWidth={1.5} fill="none" />
            <ACircle cx={12} cy={12} r={10} stroke={C.danger} strokeWidth={2} fill="none" strokeLinecap="round"
              strokeDasharray={RING} animatedProps={ring} transform="rotate(-90 12 12)" />
          </Svg>
          <Glyph sf="arrow.counterclockwise" d={RESTART} size={12} color={C.muted} />
        </View>
        <View style={s.tickText}>
          <Text numberOfLines={1} style={[s.tickLabel, { color: C.textSoft }]}>Slipped</Text>
          <Text numberOfLines={1} style={s.tickMeta}>Hold</Text>
        </View>
      </Animated.View>
    </Pressable>
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
export type Mode = { kind: 'describe' } | { kind: 'task' } | { kind: 'journal' } | { kind: 'page' } | { kind: 'wake'; hm: string };

/** The field every typed capture shares. A mode other than Describe anything wears its name on the left; tap it to go back. */
export const Field = forwardRef<ComponentRef<typeof TextInput>, {
  value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; tag: { text: string; color: string } | null;
  onTag: () => void; onFocus: () => void; onBlur: () => void; keyboard: KeyboardTypeOptions; busy: boolean;
  /** dictating: the words so far, shown in place of the input ('' while nothing is heard yet) */ live?: string | null;
}>(function Field({ value, onChange, onSubmit, placeholder, tag, onTag, onFocus, onBlur, keyboard, busy, live = null }, ref) {
  const talking = live != null;
  return (
    <View style={s.field}>
      {tag ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${tag.text}: back to Describe anything`} onPress={onTag} hitSlop={8}
          style={[s.tag, { backgroundColor: tint(tag.color, 0.16) }]}>
          <Text style={[s.tagText, { color: tag.color }]}>{tag.text}</Text>
          <Icon name="close" size={12} color={tag.color} />
        </Pressable>
      ) : null}
      {talking ? (
        <Text numberOfLines={1} ellipsizeMode="head" accessibilityLiveRegion="polite" style={[s.input, s.live, !live && !value.trim() && { color: C.faint }]}>
          {value.trim() ? `${value.trim()} ` : ''}{live || (value.trim() ? '' : 'Listening')}
        </Text>
      ) : (
        <TextInput ref={ref} value={value} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder={placeholder}
          placeholderTextColor={C.faint} keyboardType={keyboard} returnKeyType="done" submitBehavior="submit" editable={!busy}
          onFocus={onFocus} onBlur={onBlur} selectionColor={BODY} keyboardAppearance="dark" style={s.input}
          accessibilityLabel={placeholder} />
      )}
      {value.trim() || live ? (
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

/** The panel's own status line, over its top edge; with an action (Undo) it can be tapped. */
export function Toast({ text, action }: { text: string | null; action?: { label: string; onPress: () => void } | null }) {
  if (!text) return null;
  return (
    <Animated.View key={text} entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)} pointerEvents={action ? 'auto' : 'none'}
      accessibilityLiveRegion="polite" style={[s.toast, action && s.toastWithAction]}>
      <Text style={[s.toastText, action && s.toastTextShrink]} numberOfLines={2}>{text}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={10} style={s.toastAction}>
          <Text style={s.toastActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export const s = StyleSheet.create({
  num: { fontVariant: ['tabular-nums'] },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 18 },
  label: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted },
  labelRight: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint },

  tileWrap: { flex: 1, minWidth: 0 },
  tile: {
    height: TILE_H, borderRadius: TILE_R, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  tileMark: { paddingTop: 8, paddingLeft: 8 },
  tileText: { position: 'absolute', left: 8, right: 6, bottom: 6 },
  tileLabel: { fontFamily: F.medium, fontSize: 12, lineHeight: 15, color: C.muted },
  tileNote: { fontFamily: F.regular, fontSize: 10, lineHeight: 12, color: C.faint },
  loggedFill: { backgroundColor: tint(BODY, 0.1), borderColor: tint(BODY, 0.22) },
  sealedFill: { backgroundColor: 'rgba(255,255,255,0.08)' },
  smart: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 10, paddingRight: 12, borderRadius: 14,
    backgroundColor: tint(BODY, 0.14),
  },
  smartThumb: { width: 26, height: 20, borderRadius: 6, overflow: 'hidden', marginLeft: -4, backgroundColor: SURF.track },
  smartText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 16, color: BODY },
  smartSpin: { transform: [{ scale: 0.7 }], marginRight: -4 },
  slipRing: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  live: { lineHeight: 48, color: C.text },
  sendBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  sweep: { width: 40, height: 2, backgroundColor: BODY },

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
  toastWithAction: { flexDirection: 'row', alignItems: 'center', gap: 14, maxWidth: 360, paddingRight: 8 },
  toastTextShrink: { flexShrink: 1 },
  toastAction: { height: 32, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  toastActionText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: BODY },
});
