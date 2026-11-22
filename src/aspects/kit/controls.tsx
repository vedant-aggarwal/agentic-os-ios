import type { SymbolViewProps } from 'expo-symbols';
import { use, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type AccessibilityState, type Insets, type KeyboardTypeOptions, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useScale } from '@/components/Glass';
import { Check } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';
import { AspectContext } from '../context';
import { haptic, MOTION, R, SURF, t, tint } from './tokens';

/** The aspect's colour where there is a page around, plain text colour where there isn't. */
const useTone = (color?: string) => color ?? use(AspectContext)?.color ?? C.text;

// ── icons ───────────────────────────────────────────────────────────────────────────────────────────────────
// On the iPhone every icon is an SF Symbol. The path is what the web preview and Android draw instead:
// a 24 grid, 1.75 line, round caps and joins.
const ICONS = {
  plus: ['plus', 'M12 5v14M5 12h14'],
  minus: ['minus', 'M5 12h14'],
  close: ['xmark', 'M6 6l12 12M18 6L6 18'],
  check: ['checkmark', 'M5 12.5l4.5 4.5L19 7.5'],
  right: ['chevron.right', 'M9 6l6 6-6 6'],
  left: ['chevron.left', 'M15 6l-6 6 6 6'],
  down: ['chevron.down', 'M6 9l6 6 6-6'],
  up: ['chevron.up', 'M6 15l6-6 6 6'],
  arrowUp: ['arrow.up', 'M12 19V5M6 11l6-6 6 6'],
  arrowDown: ['arrow.down', 'M12 5v14M6 13l6 6 6-6'],
  clock: ['clock', 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 2'],
  calendar: ['calendar', 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4'],
  play: ['play.fill', 'M8 5.5v13l11-6.5z'],
  pause: ['pause.fill', 'M8 5v14M16 5v14'],
  pencil: ['pencil', 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4'],
  trash: ['trash', 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  more: ['ellipsis', 'M5 12h.01M12 12h.01M19 12h.01'],
  camera: ['camera', 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z'],
  mic: ['mic', 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3'],
} as const satisfies Record<string, readonly [SymbolViewProps['name'], string]>;
export type IconName = keyof typeof ICONS;

/** A common icon by name. For anything else use `Glyph` with your own SF Symbol and path. */
export function Icon({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: string }) {
  const [sf, d] = ICONS[name];
  return <Glyph sf={sf} d={d} size={size} color={color} />;
}

/** An SF Symbol on the iPhone, with the path (24 grid) drawn everywhere else. `filled` fills the path instead of stroking it. */
export function Glyph({ sf, d, size = 20, color = C.text, filled = false }: {
  sf: SymbolViewProps['name']; d: string; size?: number; color?: string; filled?: boolean;
}) {
  return (
    <Sym name={sf} size={size} color={color} fallback={
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={d} fill={filled ? color : 'none'} stroke={filled ? 'none' : color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    } />
  );
}

// ── pressing ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Anything tappable. It dips to 0.97 under the finger and gives a light haptic. `style` dresses the part that
 * moves; `wrap` places the touch target in its parent (flex, alignSelf, margins).
 */
export function Press({ label, onPress, onLongPress, children, style, wrap, scale = 0.97, disabled, feel = 'light', hitSlop, role = 'button', state }: {
  label: string; onPress?: () => void; onLongPress?: () => void; children: ReactNode;
  style?: StyleProp<ViewStyle>; wrap?: StyleProp<ViewStyle>; scale?: number; disabled?: boolean;
  feel?: 'light' | 'medium' | 'tick' | 'none'; hitSlop?: number | Insets;
  role?: 'button' | 'checkbox' | 'tab' | 'link' | 'radio'; state?: AccessibilityState;
}) {
  const p = useScale(scale);
  return (
    <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, ...state }}
      disabled={disabled} hitSlop={hitSlop} style={wrap}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} onLongPress={onLongPress}
      onPress={() => { if (feel !== 'none') haptic[feel](); onPress?.(); }}>
      <Animated.View style={[style, p.style, disabled && s.off]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * The page's actions. `primary` (near white) is the one main action on a screen; `accent` fills with the aspect
 * colour for the action that IS the aspect (Start workout); `soft` is a tinted second action; `quiet` is neutral;
 * `danger` removes something.
 */
export function Button({ label, onPress, kind = 'primary', color, icon, disabled, busy, small, wrap }: {
  label: string; onPress: () => void; kind?: 'primary' | 'accent' | 'soft' | 'quiet' | 'danger'; color?: string;
  icon?: ReactNode; disabled?: boolean; busy?: boolean; small?: boolean; wrap?: StyleProp<ViewStyle>;
}) {
  const tone = useTone(color);
  const look: Record<typeof kind, { bg: string; fg: string }> = {
    primary: { bg: C.text, fg: C.scene },
    accent: { bg: tone, fg: '#14161C' },
    soft: { bg: tint(tone, 0.16), fg: tone },
    quiet: { bg: SURF.raised, fg: C.text },
    danger: { bg: tint(C.danger, 0.16), fg: C.danger },
  };
  const { bg, fg } = look[kind];
  const h = small ? 40 : 48;
  return (
    <Press label={label} onPress={onPress} disabled={disabled || busy} wrap={wrap} feel={kind === 'primary' || kind === 'accent' ? 'medium' : 'light'}
      style={[s.button, { height: h, borderRadius: h / 2, paddingHorizontal: small ? 16 : 24, backgroundColor: bg }]}>
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon}
          <Text numberOfLines={1} style={[small ? s.buttonSmall : s.buttonText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Press>
  );
}

/** A small choice or filter. Selected, it takes the aspect colour. */
export function Chip({ label, selected = false, onPress, color, icon, wrap }: {
  label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: ReactNode; wrap?: StyleProp<ViewStyle>;
}) {
  const tone = useTone(color);
  const body = (
    <>
      {icon}
      <Text numberOfLines={1} style={[s.chipText, { color: selected ? tone : C.textSoft }]}>{label}</Text>
    </>
  );
  const look = [s.chip, selected ? { backgroundColor: tint(tone, 0.16), borderColor: tint(tone, 0.5) } : null];
  if (!onPress) return <View style={[look, wrap]}>{body}</View>;
  return (
    <Press label={label} onPress={onPress} feel="tick" role="radio" state={{ selected }} wrap={wrap} hitSlop={4} style={look}>{body}</Press>
  );
}

/** A round 44 pt button holding one icon. */
export function IconButton({ label, onPress, children, size = 44, plain = false, disabled, wrap }: {
  label: string; onPress: () => void; children: ReactNode; size?: number; plain?: boolean; disabled?: boolean; wrap?: StyleProp<ViewStyle>;
}) {
  return (
    <Press label={label} onPress={onPress} disabled={disabled} scale={0.92} hitSlop={Math.max(0, (44 - size) / 2)} wrap={wrap}
      style={[s.iconButton, { width: size, height: size, borderRadius: size / 2 }, plain && s.clear]}>
      {children}
    </Press>
  );
}

// ── surfaces ────────────────────────────────────────────────────────────────────────────────────────────────
/** A raised surface. `tone` tints it with a colour for a card that is live or needs attention. Pass `onPress` to make it tappable. */
export function Card({ children, style, tone, onPress, label, wrap }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; tone?: string; onPress?: () => void; label?: string; wrap?: StyleProp<ViewStyle>;
}) {
  const look = [s.card, tone ? { backgroundColor: tint(tone, 0.1), borderColor: tint(tone, 0.28) } : null, style];
  if (!onPress) return <View style={[look, wrap]}>{children}</View>;
  return <Press label={label ?? 'Open'} onPress={onPress} scale={0.98} wrap={wrap} style={look}>{children}</Press>;
}

/** A titled group. `action` is a short text button on the right of the title ("See all", "Add"). */
export function Section({ title, action, onAction, children, gap = 12 }: {
  title?: string; action?: string; onAction?: () => void; children: ReactNode; gap?: number;
}) {
  const tone = useTone();
  return (
    <View style={{ gap }}>
      {title ? (
        <View style={s.sectionHead}>
          <Text style={t.section}>{title}</Text>
          {action && onAction ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${action}, ${title}`} onPress={() => { haptic.light(); onAction(); }}
              hitSlop={12} style={({ pressed }) => pressed && s.dim}>
              <Text style={[t.label, { color: tone }]}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const Divider = () => <View style={s.divider} />;

// ── rows and ticks ──────────────────────────────────────────────────────────────────────────────────────────
/** The app's tick: an outlined ring that fills with the colour when done (the same one as Today's task rows). */
export function CheckRing({ done, color, size = 24 }: { done: boolean; color?: string; size?: number }) {
  const tone = useTone(color);
  const fill = useAnimatedStyle(() => ({
    opacity: withTiming(done ? 1 : 0, MOTION.fade),
    transform: [{ scale: withSpring(done ? 1 : 0.6, MOTION.spring) }],
  }));
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[s.ring, shape, { borderColor: done ? tone : tint(tone, 0.45) }]}>
      <Animated.View style={[s.ringFill, shape, { backgroundColor: tone }, fill]}><Check size={size * 0.5} /></Animated.View>
    </View>
  );
}

/**
 * A list row, 56 pt or taller. `left` is usually a CheckRing or an icon; `right` a short value or a node.
 * With `onToggle` the whole row is a checkbox; with `onPress` it opens something and can show a chevron.
 */
export function Row({ title, sub, left, right, onPress, onToggle, done, chevron, color, label, style }: {
  title: string; sub?: string | null; left?: ReactNode; right?: ReactNode; onPress?: () => void;
  onToggle?: () => void; done?: boolean; chevron?: boolean; color?: string; label?: string; style?: StyleProp<ViewStyle>;
}) {
  const tone = useTone(color);
  const body = (
    <>
      {onToggle ? <CheckRing done={!!done} color={tone} /> : left}
      <View style={s.rowMid}>
        <Text numberOfLines={2} style={[s.rowTitle, done && { color: C.faint }]}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={t.small}>{sub}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={[t.label, t.num]}>{right}</Text> : right}
      {chevron ? <Icon name="right" size={16} color={C.faint} /> : null}
    </>
  );
  if (!onPress && !onToggle) return <View style={[s.row, style]}>{body}</View>;
  return (
    <Pressable accessibilityRole={onToggle ? 'checkbox' : 'button'} accessibilityLabel={label ?? title}
      accessibilityState={onToggle ? { checked: !!done } : undefined}
      onPress={() => { if (onToggle) { if (done) haptic.light(); else haptic.medium(); onToggle(); } else { haptic.light(); onPress?.(); } }}
      style={({ pressed }) => [s.row, style, pressed && s.dim]}>
      {body}
    </Pressable>
  );
}

// ── inputs ──────────────────────────────────────────────────────────────────────────────────────────────────
/** Two to four views of one thing (Week, Month, Year). Not for navigation between unrelated places. */
export function Segmented<K extends string>({ options, value, onChange, wrap }: {
  options: readonly { key: K; label: string }[]; value: K; onChange: (key: K) => void; wrap?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessibilityRole="tablist" style={[s.segments, wrap]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }}
            onPress={() => { if (!on) { haptic.tick(); onChange(o.key); } }} style={[s.segment, on && s.segmentOn]}>
            <Text numberOfLines={1} style={[s.segmentText, on && { color: C.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A number changed in steps, with the value between a minus and a plus. `format` writes the value ("72.5 kg"). */
export function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, format = String, label }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string; label: string;
}) {
  const move = (dir: 1 | -1) => {
    const next = Math.min(max, Math.max(min, Math.round((value + dir * step) * 1000) / 1000));
    if (next !== value) onChange(next);
  };
  return (
    <View style={s.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}>
      <IconButton label={`Less ${label}`} onPress={() => move(-1)} disabled={value <= min}><Icon name="minus" /></IconButton>
      <Text style={[t.heading, t.num, s.stepperValue]}>{format(value)}</Text>
      <IconButton label={`More ${label}`} onPress={() => move(1)} disabled={value >= max}><Icon name="plus" /></IconButton>
    </View>
  );
}

/** A text field. `suffix` sits inside on the right ("kg", "min"). Keep labels above fields, never as the placeholder alone. */
export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, autoFocus, suffix, maxLength, onSubmit, inputStyle }: {
  label?: string; value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions;
  multiline?: boolean; autoFocus?: boolean; suffix?: string; maxLength?: number; onSubmit?: () => void; inputStyle?: StyleProp<TextStyle>;
}) {
  const tone = useTone();
  return (
    <View style={s.fieldWrap}>
      {label ? <Text style={t.label}>{label}</Text> : null}
      <View style={[s.field, multiline && s.fieldMulti]}>
        <TextInput
          accessibilityLabel={label ?? placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder}
          placeholderTextColor={C.faint} selectionColor={tone} keyboardType={keyboardType} keyboardAppearance="dark"
          multiline={multiline} autoFocus={autoFocus} maxLength={maxLength} onSubmitEditing={onSubmit}
          returnKeyType={multiline ? 'default' : 'done'} textAlignVertical={multiline ? 'top' : 'center'}
          style={[s.input, multiline && s.inputMulti, inputStyle]} />
        {suffix ? <Text style={t.label}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  off: { opacity: 0.4 },
  dim: { opacity: 0.6 },
  clear: { backgroundColor: 'transparent' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24 },
  buttonSmall: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20 },
  chip: {
    height: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: SURF.card, borderWidth: 1, borderColor: 'transparent',
  },
  chipText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20 },
  iconButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  card: {
    borderRadius: R.card, borderCurve: 'continuous', padding: 16, backgroundColor: SURF.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: SURF.line },
  ring: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ringFill: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  rowMid: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: F.medium, fontSize: 16, lineHeight: 24, color: C.text },
  segments: { flexDirection: 'row', height: 40, borderRadius: 20, padding: 4, backgroundColor: SURF.card },
  segment: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentOn: { backgroundColor: SURF.pressed },
  segmentText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stepperValue: { flex: 1, textAlign: 'center' },
  fieldWrap: { gap: 8 },
  field: {
    minHeight: 48, borderRadius: R.row, borderCurve: 'continuous', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line,
  },
  fieldMulti: { alignItems: 'flex-start', paddingVertical: 12 },
  // outlineWidth 0 removes the browser's focus ring in the web preview; the field's own border stays
  input: { flex: 1, minHeight: 24, padding: 0, fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.text, outlineWidth: 0 },
  inputMulti: { minHeight: 96 },
});
