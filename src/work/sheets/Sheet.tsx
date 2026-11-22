import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Pressable, type StyleProp, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, ReduceMotion, useAnimatedKeyboard, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { Glass, lightTap } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import { closeSheet } from '../bus';

// The capture sheets' frame: a floating glass sheet over a dim, drawn on the first frame of the request (it rises the
// last 24 pt on a spring, so it is visible at once), the keyboard after it. Swipe it down or tap the dim to close; it
// leaves the way it came. It sits above the keyboard. Reduce Motion: it appears and fades, no travel.

const RADIUS = 32;
const PAD = 16; // inner radius = 32 - 16 = 16 for fields and boxes inside
const ENTER = { duration: 380, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
export const REC = '#FF5A5F'; // recording, as on the Voices page
export const AMBER = '#FFB547';

type Ctl = { dismiss: (after?: () => void) => void; pan: ReturnType<typeof usePanGesture>; dragAll: boolean };
const SheetCtx = createContext<Ctl | null>(null);
/** Inside a sheet: `dismiss()` slides it away, then closes the request (and runs `after`). */
export function useSheet() {
  const c = useContext(SheetCtx);
  if (!c) throw new Error('useSheet is used inside <Sheet>.');
  return c;
}

export function Sheet({ label, dragAll = false, children }: { label: string; dragAll?: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const kb = useAnimatedKeyboard();
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : 24);
  const fade = useSharedValue(1);
  const dim = useSharedValue(0);
  const h = useSharedValue(400);
  const closing = useRef(false);

  useEffect(() => {
    y.set(withSpring(0, ENTER));
    dim.set(withTiming(1, { duration: 160, easing: EASE }));
  }, [y, dim]);

  const after = useRef<(() => void) | undefined>(undefined);
  const finish = useCallback(() => { closeSheet(); after.current?.(); }, []);
  const dismiss = useCallback((then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    after.current = then;
    Keyboard.dismiss();
    dim.set(withTiming(0, { duration: 200, easing: EASE }));
    const done = (ok?: boolean) => { 'worklet'; if (ok) scheduleOnRN(finish); };
    if (reduce) fade.set(withTiming(0, { duration: 160 }, done));
    else y.set(withTiming(h.get() + insets.bottom + 40, { duration: 260, easing: EASE }, done));
  }, [dim, fade, y, h, insets.bottom, reduce, finish]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { dismiss(); return true; });
    return () => sub.remove();
  }, [dismiss]);

  const startClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Keyboard.dismiss();
  }, []);
  const pan = usePanGesture({
    activeOffsetY: 10,
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      y.set(Math.max(0, e.translationY - 10));
    },
    onDeactivate: (e) => {
      'worklet';
      const v = e.canceled ? 0 : e.velocityY;
      // where a flick would come to rest (UIScrollView's deceleration), not where the finger let go
      const rest = y.value + ((v / 1000) * 0.99) / (1 - 0.99);
      if (!e.canceled && (rest > h.value * 0.45 || y.value > 160)) {
        scheduleOnRN(startClose);
        dim.set(withTiming(0, { duration: 200 }));
        y.set(withSpring(h.value + 80, { velocity: v, duration: 320, dampingRatio: 1 }, (ok) => {
          'worklet';
          if (ok) scheduleOnRN(finish);
        }));
      } else {
        y.set(withSpring(0, { velocity: v, duration: 380, dampingRatio: 0.86 }));
      }
    },
  });

  const lift = (kh: number) => { 'worklet'; return Math.max(kh - insets.bottom, 0); };
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: y.value - lift(kb.height.value) }],
    maxHeight: screenH - insets.top - insets.bottom - 24 - lift(kb.height.value),
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * (1 - Math.min(1, y.value / Math.max(h.value, 1))) }));

  const body = (
    <Animated.View
      accessibilityViewIsModal
      accessibilityLabel={label}
      onAccessibilityEscape={() => dismiss()}
      onLayout={(e) => h.set(e.nativeEvent.layout.height)}
      style={[s.sheet, { bottom: insets.bottom + 8, width: Math.min(width - 16, 560) }, sheetStyle]}>
      <Glass radius={RADIUS} />
      {dragAll ? <Grabber /> : null}
      {children}
    </Animated.View>
  );
  return (
    <SheetCtx.Provider value={{ dismiss, pan, dragAll }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, s.dim, dimStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
        </Animated.View>
        {dragAll ? <GestureDetector gesture={pan}>{body}</GestureDetector> : body}
      </View>
    </SheetCtx.Provider>
  );
}

function Grabber() {
  return <View style={s.grabber} />;
}

/** Title row. In sheets that scroll, this (with the grabber) is where the sheet is dragged down. */
export function SheetHeader({ title, sub, right }: { title: string; sub?: string | null; right?: ReactNode }) {
  const { pan, dragAll } = useSheet();
  const row = (
    <View style={s.headWrap}>
      {dragAll ? null : <Grabber />}
      <View style={s.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
  return dragAll ? row : <GestureDetector gesture={pan}>{row}</GestureDetector>;
}

/** The bottom row: tools on the left, the primary action on the right. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <View style={s.footer}>{children}</View>;
}

// ---- small parts, one look for every sheet ----

/** Press feedback for anything tappable: 0.97 in 120 ms, back on release. */
export function Press({ onPress, disabled, style, children, label, hint, selected, hitSlop = 4 }: {
  onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode; label: string; hint?: string;
  selected?: boolean; hitSlop?: number;
}) {
  const sc = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const t = { duration: 120, easing: EASE, reduceMotion: ReduceMotion.System } as const;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, selected }} disabled={disabled} hitSlop={hitSlop}
      onPressIn={() => sc.set(withTiming(0.97, t))} onPressOut={() => sc.set(withTiming(1, t))}
      onPress={() => { lightTap(); onPress(); }}>
      <Animated.View style={[style, disabled && { opacity: 0.4 }, st]}>{children}</Animated.View>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, disabled, busy, tone = 'light' }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; tone?: 'light' | 'danger';
}) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled || busy} style={[s.primary, tone === 'danger' && { backgroundColor: C.danger }]}>
      {busy ? <ActivityIndicator size="small" color="#0B0C10" /> : <Text style={s.primaryText}>{label}</Text>}
    </Press>
  );
}

export function SecondaryButton({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled} style={s.secondary}>
      <Text style={[s.secondaryText, danger && { color: C.danger }]}>{label}</Text>
    </Press>
  );
}

export function Chip({ label, selected, onPress, trailing, a11y }: {
  label: string; selected?: boolean; onPress: () => void; trailing?: ReactNode; a11y?: string;
}) {
  return (
    <Press label={a11y ?? label} selected={selected} onPress={onPress} style={[s.chip, selected && s.chipOn]}>
      <Text style={[s.chipText, selected && s.chipTextOn]} numberOfLines={1}>{label}</Text>
      {trailing}
    </Press>
  );
}

/** One of a few, side by side (due, permission mode). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
            style={[s.segOpt, on && s.segOn]} onPress={() => { if (!on) { lightTap(); onChange(o.value); } }}>
            <Text style={[s.segText, on && { color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}

/** A glyph: the SF Symbol on iOS, a plain character on web and older builds. */
export function Glyph({ name, size = 16, color = C.text, alt }: { name: Parameters<typeof Sym>[0]['name']; size?: number; color?: string; alt: string }) {
  return <Sym name={name} size={size} color={color} fallback={<Text style={{ fontSize: size, lineHeight: size + 4, color, fontFamily: F.semibold }}>{alt}</Text>} />;
}

export const sheetStyles = StyleSheet.create({
  pad: { paddingHorizontal: PAD },
  titleField: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text, paddingVertical: 4 },
  bodyField: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.textSoft, paddingVertical: 4, minHeight: 32, maxHeight: 160 },
  box: {
    borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  note: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint },
  error: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.danger },
});

const s = StyleSheet.create({
  dim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', alignSelf: 'center', borderRadius: RADIUS, borderCurve: 'continuous',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)', paddingBottom: PAD,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.24)' },
  headWrap: { paddingBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: PAD, paddingTop: 12, minHeight: 44 },
  title: { fontFamily: F.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2, color: C.text },
  sub: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: PAD, paddingTop: 12 },
  primary: { height: 40, minWidth: 80, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  primaryText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: '#0B0C10' },
  secondary: { height: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  secondaryText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  chip: {
    height: 32, maxWidth: 220, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: { backgroundColor: C.text },
  chipText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text, flexShrink: 1 },
  chipTextOn: { color: '#0B0C10' },
  seg: {
    height: 40, flexDirection: 'row', padding: 2, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)',
  },
  segOpt: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  segText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint },
  label: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
});
