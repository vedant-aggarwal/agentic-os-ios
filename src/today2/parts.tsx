import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion, useAnimatedProps, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { haptic, MOTION, SURF, t, tint } from '@/aspects/kit/tokens';
import type { FrameState } from '@/capture/data';
import type { Task } from '@/lib/today';
import { C, F } from '@/theme';
import { Ring, type RingPart } from './Ring';

// Today's building blocks: section head with its ring, the grouped rows that settle when done, the tick (the
// capture panel's ring: it fills on a settle spring and the check draws in), the photo slot, task cards that scroll
// sideways under their parent row.

export const NORA = '#F0457A';
export const NORA_TEXT = '#FF7AA2';
const INK = '#0B0C10';
const SETTLE = { duration: 340, dampingRatio: 0.78, reduceMotion: ReduceMotion.System } as const;
const QUICK = { duration: 260, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const layout = LinearTransition.springify().duration(700).dampingRatio(0.9).reduceMotion(ReduceMotion.System);

// ── section ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function Section({ label, parts, onOpen, onLongPress, right, finished, children }: {
  label: string; parts: RingPart[]; onOpen?: () => void; finished: boolean; children: ReactNode;
  /** hold the head: the section's edit mode */ onLongPress?: () => void;
  /** replaces the count (edit mode's Cancel / Done) */ right?: ReactNode;
}) {
  const done = parts.reduce((a, p) => a + p.done, 0), total = parts.reduce((a, p) => a + p.total, 0);
  return (
    <Animated.View layout={layout} style={s.section}>
      <View style={s.head}>
        <Pressable accessibilityRole={onOpen ? 'button' : 'header'} accessibilityLabel={`${label}, ${done} of ${total}`}
          accessibilityHint={onLongPress ? 'Hold to edit the routine' : undefined}
          disabled={!onOpen && !onLongPress} onPress={right ? undefined : onOpen} onLongPress={onLongPress} delayLongPress={450}
          style={({ pressed }) => [s.headHit, pressed && { opacity: 0.6 }]}>
          <Ring parts={parts} />
          <Text style={[t.heading, finished && { color: C.muted }]}>{label}</Text>
          {onOpen && !right ? <Chevron /> : null}
          <View style={{ flex: 1 }} />
          {total && !right ? <Text style={[s.count, t.num]}>{`${done} of ${total}`}</Text> : null}
        </Pressable>
        {right}
      </View>
      {children}
    </Animated.View>
  );
}

export function SubLabel({ children, color }: { children: string; color?: string }) {
  return <Text style={[t.section, s.subLabel, color ? { color } : null]}>{children}</Text>;
}

/** A group of rows. Open rows on top, done rows settle under them as quiet lines. */
export function Group({ children }: { children: ReactNode }) {
  return <Animated.View layout={layout} style={s.group}>{children}</Animated.View>;
}

// ── tick ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const CHECK_LEN = 17;
const CROSS_LEN = 12; // each stroke of the X
const APath = Animated.createAnimatedComponent(Path);
/** A second tap within this of a tick is a double tap: the tick (already shown and on its way) becomes a cancel. */
const DOUBLE_MS = 320;
const MUTED_RING = 'rgba(255,255,255,0.30)';

export function Tick({ done, cancelled, color, size = 26, label, onPress, onDouble, onLongPress, disabled, passive }: {
  done: boolean; color: string; size?: number; label: string; onPress: () => void; disabled?: boolean;
  /** drawn only: the parent (a whole tile) takes the tap */ passive?: boolean;
  /** cancelled for today: an X in a muted ring. A tap brings it back (the parent's onPress decides). */ cancelled?: boolean;
  /** a second tap right after a tick: cancel for today. Single taps still apply at once. */ onDouble?: () => void;
  onLongPress?: () => void;
}) {
  const v = useSharedValue(done ? 1 : 0), draw = useSharedValue(done ? 1 : 0), x = useSharedValue(cancelled ? 1 : 0);
  useEffect(() => {
    v.set(withSpring(done ? 1 : 0, done ? SETTLE : QUICK));
    draw.set(done ? withTiming(1, { duration: 220, reduceMotion: ReduceMotion.System }) : withTiming(0, { duration: 120 }));
  }, [done, v, draw]);
  useEffect(() => {
    x.set(cancelled ? withTiming(1, { duration: 220, reduceMotion: ReduceMotion.System }) : withTiming(0, { duration: 120 }));
  }, [cancelled, x]);
  const fill = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.55 + 0.45 * v.value }] }));
  const check = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }));
  const cross1 = useAnimatedProps(() => ({ strokeDashoffset: CROSS_LEN * (1 - x.value) }));
  const cross2 = useAnimatedProps(() => ({ strokeDashoffset: CROSS_LEN * (1 - x.value) }));
  const ring = (
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: cancelled ? MUTED_RING : tint(color, done ? 1 : 0.5), overflow: 'hidden', opacity: disabled ? 0.45 : 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, fill]} />
        <Svg width={size - 3} height={size - 3} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
          <APath d="M6.8 12.4l3.4 3.4L17.4 8.6" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none"
            strokeDasharray={CHECK_LEN} animatedProps={check} />
          <APath d="M8 8l8 8" stroke={C.muted} strokeWidth={2.2} strokeLinecap="round" fill="none" strokeDasharray={CROSS_LEN} animatedProps={cross1} />
          <APath d="M16 8l-8 8" stroke={C.muted} strokeWidth={2.2} strokeLinecap="round" fill="none" strokeDasharray={CROSS_LEN} animatedProps={cross2} />
        </Svg>
      </View>
  );
  // the last tap: a tick (a quick second tap makes it a cancel) or bringing a cancelled one back (a quick second tap
  // is the rest of that double tap, so it does nothing)
  const last = useRef<{ at: number; restore: boolean } | null>(null);
  if (passive) return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{ring}</View>;
  const press = () => {
    const now = Date.now(), prev = last.current;
    const quick = !!prev && now - prev.at < DOUBLE_MS;
    if (quick && prev.restore) { last.current = null; return; }
    if (quick && onDouble) { last.current = null; haptic.warn(); onDouble(); return; }
    last.current = { at: now, restore: !!cancelled };
    if (done || cancelled) haptic.light(); else haptic.medium();
    onPress();
  };
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={cancelled ? `${label}, cancelled for today` : label}
      accessibilityState={{ checked: done, disabled: !!disabled }} accessibilityHint={cancelled ? 'Brings it back' : undefined}
      accessibilityActions={onDouble && !cancelled ? [{ name: 'cancel', label: 'Cancel for today' }] : undefined}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'cancel') onDouble?.(); }}
      hitSlop={9} disabled={disabled} onPress={press} onLongPress={onLongPress} delayLongPress={400}>
      {ring}
    </Pressable>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function Row({ title, sub, subColor, done, cancelled, color, onTick, onCancel, onRestore, onHold, onPress, right, first, tickLabel, lines = 1, children, tickDisabled }: {
  title: string; sub?: string | null; subColor?: string; done: boolean; color: string; onTick?: () => void; onPress?: () => void;
  right?: ReactNode; first?: boolean; tickLabel?: string; lines?: number; children?: ReactNode; tickDisabled?: boolean;
  /** cancelled for today: an X, struck through, settled with the done rows */ cancelled?: boolean;
  /** double tap the tick */ onCancel?: () => void;
  /** tap a cancelled row's tick */ onRestore?: () => void;
  /** hold the row or its tick: the row's menu (Cancel for today) */ onHold?: () => void;
}) {
  const settled = (done || !!cancelled) && !children;
  return (
    <Animated.View layout={layout} style={[s.row, !first && s.rowRule]}>
      {/* the words are the row's button; the right side and the tick sit beside it, never inside (no nested buttons) */}
      <View style={[s.rowInner, settled && s.rowSettled]}>
        <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress && !onHold} onPress={onPress}
          onLongPress={onHold} delayLongPress={400} accessibilityHint={onHold ? 'Hold for more' : undefined}
          style={({ pressed }) => [s.rowText, s.rowHit, pressed && onPress && { opacity: 0.7 }]}>
          <Text numberOfLines={settled ? 1 : lines} style={[settled ? s.titleSettled : s.title, cancelled && s.struck]}>{title}</Text>
          {sub && !settled ? <Text numberOfLines={2} style={[s.sub, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
        </Pressable>
        {cancelled ? null : right}
        {onTick ? <Tick done={done} cancelled={cancelled} color={color} size={settled ? 22 : 26} label={tickLabel ?? title}
          onPress={cancelled && onRestore ? onRestore : onTick} onDouble={onCancel} onLongPress={onHold} disabled={tickDisabled} /> : null}
      </View>
      {children}
    </Animated.View>
  );
}

/** Ticks tapped just now, by row or task id, with whether each was settled (done or cancelled) before the tap. Until
 *  the taps stop, those keep their place, so a double tap's second tap (cancel for today) lands on the same tick. */
export type Steady = Record<string, boolean>;

/** Open rows first, done and cancelled rows after them, each keeping its own order (a row in `steady` where it was). */
export function settleOrder<T extends { done: boolean; cancelled?: boolean; id?: string }>(rows: T[], steady: Steady = {}) {
  const shut = (r: T) => (r.id != null && r.id in steady ? steady[r.id] : r.done || !!r.cancelled);
  return [...rows.filter((r) => !shut(r)), ...rows.filter(shut)];
}

// ── photo slot ───────────────────────────────────────────────────────────────────────────────────────────────────
export function PhotoSlot({ st, label, blur, small, onPress }: { st: FrameState | undefined; label: string; blur?: boolean; small?: boolean; onPress: () => void }) {
  const [clear, setClear] = useState(false);
  if (!st || !st.src) {
    if (st?.status === 'logged') {
      return <View style={[s.frame, small && s.frameSmall, { backgroundColor: 'rgba(255,138,91,0.14)', alignItems: 'center', justifyContent: 'center' }]}><CheckMark color="#FF8A5B" /></View>;
    }
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} photo`} onPress={onPress} hitSlop={6} style={({ pressed }) => [s.camBtn, pressed && { backgroundColor: SURF.pressed }]}>
        <Camera size={18} color={C.muted} />
      </Pressable>
    );
  }
  const faded = st.status === 'sending' || st.status === 'failed';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} photo, ${st.note ?? st.status}`} hitSlop={6}
      onPress={() => { if (blur && !clear) setClear(true); else onPress(); }}>
      <View style={[s.frame, small && s.frameSmall]}>
        <Image source={st.src} style={[StyleSheet.absoluteFill, { opacity: faded ? 0.5 : 1 }]} contentFit="cover" blurRadius={blur && !clear ? 14 : 0} transition={150} />
      </View>
    </Pressable>
  );
}

export function Camera({ size = 18, color = C.muted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z"
        stroke={color} strokeWidth={1.7} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}
export function CheckMark({ color, size = 14 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function Chevron({ color = C.faint }: { color?: string }) {
  return <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function Arrow({ color = C.muted }: { color?: string }) {
  return <Svg width={12} height={12} viewBox="0 0 24 24"><Path d="M7 17L17 7M9 7h8v8" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

/** A small text link inside a row: "Gleam", "Pick a book". */
export function Link({ text, out, onPress }: { text: string; out?: boolean; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} disabled={!onPress} hitSlop={10} style={s.link}>
      <Text style={s.linkText}>{text}</Text>
      {out ? <Arrow /> : null}
    </Pressable>
  );
}

// ── Nora working dots ────────────────────────────────────────────────────────────────────────────────────────────
export function Dots({ color = NORA }: { color?: string }) {
  const v = useSharedValue(0);
  useEffect(() => { v.set(withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(2, { duration: 400 }), withTiming(3, { duration: 400 })), -1, false)); }, [v]);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1, 2].map((i) => <Dot key={i} i={i} v={v} color={color} />)}
    </View>
  );
}
function Dot({ i, v, color }: { i: number; v: ReturnType<typeof useSharedValue<number>>; color: string }) {
  const st = useAnimatedStyle(() => { const k = (Math.floor(v.value) + 3 - i) % 3; return { opacity: k === 0 ? 1 : k === 1 ? 0.6 : 0.35 }; });
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, st]} />;
}

// ── task cards under a parent ────────────────────────────────────────────────────────────────────────────────────
type CardActs = {
  /** double tap a card's tick: cancel for today */ onCancel?: (x: Task) => void;
  /** tap a cancelled card's tick */ onRestore?: (x: Task) => void;
  /** hold a card: its menu */ onHold?: (x: Task) => void;
  /** tap a card (not its tick): the task's full view */ onOpen?: (x: Task) => void;
};
export function CardRow({ tasks, color, today, onTick, more, onMore, steady, ...acts }: {
  tasks: Task[]; color: string; today: string; onTick: (id: string) => void; more?: number; onMore?: () => void;
  /** ticks tapped just now: the cards keep the order they had until the taps stop */ steady?: Steady;
} & CardActs) {
  const { width } = useWindowDimensions();
  const w = Math.round((width - 32) / 2.7);
  const ids = tasks.map((x) => x.id).join(' ');
  const [shown, setShown] = useState(ids);
  const still = !!steady && Object.keys(steady).length > 0;
  if (!still && shown !== ids) setShown(ids);
  const at = new Map(shown.split(' ').map((id, i) => [id, i]));
  const list = still ? [...tasks].sort((a, b) => (at.get(a.id) ?? 1e6) - (at.get(b.id) ?? 1e6)) : tasks;
  if (!tasks.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cards} style={s.cardScroll}>
      {list.map((x) => <Card key={x.id} x={x} w={w} color={color} today={today} onTick={onTick} {...acts} />)}
      {more ? (
        <Pressable accessibilityRole="button" onPress={onMore} style={[s.card, { width: w, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[t.label, { textAlign: 'center' }]}>{`${more} more on Home`}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Card({ x, w, color, today, onTick, onCancel, onRestore, onHold, onOpen }: { x: Task; w: number; color: string; today: string; onTick: (id: string) => void } & CardActs) {
  const done = x.status === 'done', cancelled = x.status === 'dropped'; // Today only holds dropped tasks cancelled today
  // a repeating one was skipped (its next one is filed); a one-off was dropped
  const due = cancelled ? (x.next || x.repeat ? 'Skipped' : 'Cancelled')
    : !x.due ? 'No date' : x.due === today ? 'Today' : x.due < today ? 'Late' : x.due.slice(5);
  const hold = onHold ? () => onHold(x) : undefined;
  return (
    // a tap on the card opens the task, a hold its menu; the tick is its own button (the card stays out of the screen
    // reader's way so the tick keeps its own focus)
    <Pressable accessible={false} onPress={onOpen ? () => onOpen(x) : undefined} onLongPress={hold} delayLongPress={400} style={({ pressed }) => [s.card, { width: w }, (done || cancelled) && { opacity: 0.5 }, pressed && !!onOpen && { transform: [{ scale: 0.98 }] }]}>
      <Text numberOfLines={3} style={[s.cardTitle, cancelled && s.struck]}>{x.title}</Text>
      <View style={s.cardFoot}>
        <Text style={[t.caption, t.num, due === 'Today' && { color: C.textSoft }, due === 'Late' && { color: C.danger }]}>{due}</Text>
        <Tick done={done} cancelled={cancelled} color={color} size={22} label={x.title}
          onPress={() => (cancelled ? onRestore?.(x) : onTick(x.id))} onDouble={onCancel ? () => onCancel(x) : undefined} onLongPress={hold} />
      </View>
    </Pressable>
  );
}

// ── segmented Cold / Hot ─────────────────────────────────────────────────────────────────────────────────────────
export function Segmented({ value, options, onChange }: { value: string; options: { key: string; label: string }[]; onChange: (k: string) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => (
        <Pressable key={o.key} accessibilityRole="button" accessibilityState={{ selected: value === o.key }} accessibilityLabel={o.label}
          onPress={() => { if (value !== o.key) { haptic.tick(); onChange(o.key); } }} style={[s.segItem, value === o.key && s.segOn]}>
          <Text style={[s.segText, value === o.key && { color: C.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  section: { gap: 12 },
  head: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headHit: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 10 },
  count: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  subLabel: { marginTop: 4, marginBottom: -4, marginLeft: 4 },
  group: { borderRadius: 20, backgroundColor: C.glass, overflow: 'hidden' },
  row: { paddingLeft: 16 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  rowInner: { minHeight: 56, paddingVertical: 8, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowSettled: { minHeight: 44, paddingVertical: 6 },
  rowText: { flex: 1, gap: 2 },
  rowHit: { alignSelf: 'stretch', justifyContent: 'center' },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  titleSettled: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted },
  struck: { textDecorationLine: 'line-through', color: C.faint },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, fontVariant: ['tabular-nums'] },
  camBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 30, height: 40, borderRadius: 8, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.10)' },
  frameSmall: { width: 24, height: 32, borderRadius: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
  linkText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  cardScroll: { marginBottom: 12 },
  cards: { gap: 8, paddingRight: 16 },
  card: { height: 108, borderRadius: 16, backgroundColor: C.glass, padding: 12, justifyContent: 'space-between' },
  cardTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: C.text },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seg: { flexDirection: 'row', height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', padding: 2 },
  segItem: { paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
  segOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  segText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint },
});

export { MOTION };
