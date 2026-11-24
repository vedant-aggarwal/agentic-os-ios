import { Children, Fragment, use, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable, RefreshControl, StyleSheet, Text, View,
  type ScrollViewInstance, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { C, F } from '@/theme';
import { AspectContext, useAspect } from '../context';
import { Icon, Press } from './controls';
import { AspectLight } from './light';
import { PageHeader } from './Page';
import { haptic, MOTION, R, SURF, t, tint } from './tokens';

// The life pages' layout (Nov 2026 redesign). A page is a large title in its colour, a row of tabs that sticks to
// the top, and the open tab's content: Blocks (a title over a Group of rows, or over one lead card), Metrics, and
// the page's own centrepiece. One lit control per screen: the aspect colour fills only the main action.

const useTone = (color?: string) => color ?? use(AspectContext)?.color ?? C.text;

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────
export type TabDef<K extends string> = { key: K; label: string };

/**
 * A page with tabs: the title, then the tabs, which stick under the status bar once the title scrolls away, then
 * the open tab. Each tab keeps where he had scrolled to. Render the tabs' content as `TabPanel`s.
 */
export function TabbedPage<K extends string>({ tabs, tab, onTab, title, right, children, footer, onRefresh, refreshing = false }: {
  tabs: readonly TabDef<K>[]; tab: K; onTab: (k: K) => void; title?: string; right?: ReactNode;
  children: ReactNode; footer?: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  const a = useAspect();
  const ref = useRef<ScrollViewInstance>(null);
  const y = useSharedValue(0);
  const yNow = useRef(0);
  const [stickAt, setStickAt] = useState(0);
  const saved = useRef<Partial<Record<K, number>>>({});
  const was = useRef(tab);
  const pending = useRef<number | null>(null);

  const pick = (k: K) => {
    if (k === tab) { // the open tab again: back to its top
      if (yNow.current > stickAt + 1) ref.current?.scrollTo({ y: stickAt, animated: true });
      return;
    }
    pending.current = yNow.current >= stickAt - 1 ? Math.max(stickAt, saved.current[k] ?? stickAt) : null;
    onTab(k);
  };
  useEffect(() => {
    if (was.current === tab) return;
    saved.current[was.current] = yNow.current;
    was.current = tab;
    // a tab opened from elsewhere (a link, a button on another tab) starts at its top
    const target = pending.current ?? (yNow.current > stickAt ? stickAt : null);
    pending.current = null;
    if (target == null) return;
    const id = requestAnimationFrame(() => ref.current?.scrollTo({ y: target, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [tab, stickAt]);

  return (
    <View style={s.fill}>
      <ScrollView ref={ref as never} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}
        scrollEventThrottle={16} onScroll={(e) => { const v = e.nativeEvent.contentOffset.y; yNow.current = v; y.set(v); }}
        contentContainerStyle={{ paddingTop: a.insets.top + 12, paddingBottom: a.dock + 32 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} /> : undefined}>
        <View style={s.pad}><PageHeader title={title} right={right} /></View>
        <View pointerEvents="box-none" onLayout={(e) => setStickAt(e.nativeEvent.layout.y)}
          style={{ paddingTop: a.insets.top + 8, marginTop: 12 - a.insets.top, paddingBottom: 12 }}>
          <Stuck y={y} at={stickAt} width={a.width} color={a.color} />
          <View style={s.pad}><SegTabs tabs={tabs} value={tab} onChange={pick} /></View>
        </View>
        <View style={s.pad}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}

/** Behind the stuck tabs: the page's own background and light, so content scrolling under them simply goes. */
function Stuck({ y, at, width, color }: { y: SharedValue<number>; at: number; width: number; color: string }) {
  const show = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [at - 20, at], [0, 1], Extrapolation.CLAMP) }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.clip, show]}>
      <AspectLight color={color} width={width} height={400} scene id="stuckLight" />
      <View style={s.stuckLine} />
    </Animated.View>
  );
}

/** One tab's content: mounted the first time it opens, then kept (hidden) so it comes back as he left it. */
export function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(active);
  if (active && !seen) setSeen(true);
  if (!seen) return null;
  return <View style={[s.panel, !active && s.hidden]}>{children}</View>;
}

/** The tabs: a capsule with a thumb that slides to the open one. Also usable inside a screen for two to five views. */
export function SegTabs<K extends string>({ tabs, value, onChange, wrap }: {
  tabs: readonly TabDef<K>[]; value: K; onChange: (k: K) => void; wrap?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const i = Math.max(0, tabs.findIndex((x) => x.key === value));
  const x = useSharedValue(i);
  useEffect(() => { x.set(withSpring(i, MOTION.spring)); }, [i, x]);
  const seg = w > 0 ? (w - 8) / tabs.length : 0;
  const thumb = useAnimatedStyle(() => ({ width: seg, transform: [{ translateX: x.value * seg }] }));
  return (
    <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[s.tabs, wrap]}>
      {seg > 0 ? <Animated.View style={[s.thumb, thumb]} /> : null}
      {tabs.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityLabel={o.label} accessibilityState={{ selected: on }}
            onPress={() => { if (!on) haptic.tick(); onChange(o.key); }} style={s.tab}>
            <Text numberOfLines={1} style={[s.tabText, on && s.tabOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── blocks and groups ────────────────────────────────────────────────────────────────────────────────────────
/** A titled part of a tab: a Head over its content. */
export function Block({ title, sub, action, onAction, right, children, gap = 10 }: {
  title?: string; sub?: string | null; action?: string; onAction?: () => void; right?: ReactNode; children: ReactNode; gap?: number;
}) {
  return (
    <View style={{ gap }}>
      {title ? <Head title={title} sub={sub} action={action} onAction={onAction} right={right} /> : null}
      {children}
    </View>
  );
}

/** A block's title, with an optional short action on the right ("History", "Add"). */
export function Head({ title, sub, action, onAction, right }: { title: string; sub?: string | null; action?: string; onAction?: () => void; right?: ReactNode }) {
  const tone = useTone();
  return (
    <View style={s.head}>
      <View style={s.headText}>
        <Text accessibilityRole="header" numberOfLines={1} style={t.headline}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={t.footnote}>{sub}</Text> : null}
      </View>
      {right}
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${action}, ${title}`} hitSlop={12}
          onPress={() => { haptic.light(); onAction(); }} style={({ pressed }) => [s.headAction, pressed && s.dim]}>
          <Text style={[t.subhead, { color: tone }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * One surface holding many rows (Items), with a hairline between them, inset from the left by `inset` (put it where
 * the row text starts). `pad` is for content that is not rows (a chart, a lead): padding, a gap of 12, no hairlines.
 */
export function Group({ children, inset = 16, pad = false, style, tone }: {
  children: ReactNode; inset?: number; pad?: boolean; style?: StyleProp<ViewStyle>; tone?: string;
}) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.group, pad && s.groupPad, tone ? { backgroundColor: tint(tone, 0.09), borderColor: tint(tone, 0.22) } : null, style]}>
      {items.map((c, i) => (
        <Fragment key={i}>
          {i && !pad ? <View style={[s.sep, { marginLeft: inset }]} /> : null}
          {c}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * A row in a Group: 52 pt or taller. `left` is an icon, a ring or an avatar; `value` a short text on the right; `right`
 * any control. With `onPress` the row opens something (add `chevron`).
 */
export function Item({ title, sub, left, value, right, action, onPress, onLongPress, chevron, done, label, titleStyle, lines = 2, style }: {
  title: string; sub?: string | null; left?: ReactNode; value?: string | null; right?: ReactNode;
  /** A control of its own on the right ("Start", "Log"): it sits beside the row's tap area, not inside it. */
  action?: ReactNode;
  onPress?: () => void; onLongPress?: () => void;
  chevron?: boolean; done?: boolean; label?: string; titleStyle?: StyleProp<TextStyle>; lines?: number; style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      {left}
      <View style={s.itemMid}>
        <Text numberOfLines={lines} style={[t.callout, done && s.doneText, titleStyle]}>{title}</Text>
        {sub ? <Text numberOfLines={lines} style={t.footnote}>{sub}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={[t.subhead, t.num, s.value]}>{value}</Text> : null}
      {right}
      {chevron ? <Icon name="right" size={14} color={C.faint} /> : null}
    </>
  );
  if (!onPress && !onLongPress) return <View style={[s.item, style]}>{body}{action}</View>;
  const tap = (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} onLongPress={onLongPress}
      onPress={() => { haptic.light(); onPress?.(); }} style={({ pressed }) => [s.item, action ? s.itemMain : style, pressed && s.pressed]}>
      {body}
    </Pressable>
  );
  if (!action) return tap;
  return <View style={[s.itemSplit, style]}>{tap}<View style={s.itemAction}>{action}</View></View>;
}

/** The lead of a tab: the one card that is lit, tinted with the page's colour. */
export function Lead({ children, style, onPress, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const tone = useTone();
  const look = [s.lead, { backgroundColor: tint(tone, 0.1), borderColor: tint(tone, 0.24) }, style];
  if (!onPress) return <View style={look}>{children}</View>;
  return <Press label={label ?? 'Open'} onPress={onPress} scale={0.985} style={look}>{children}</Press>;
}

// ── numbers ──────────────────────────────────────────────────────────────────────────────────────────────────
/** A number that matters, its unit, what it is, and when it was true. `xl` is the screen's one hero number. */
export function Metric({ value, unit, label, sub, size = 'm', color, style, align = 'left' }: {
  value: string; unit?: string | null; label?: string | null; sub?: string | null; size?: 'xl' | 'l' | 'm' | 's';
  color?: string; style?: StyleProp<ViewStyle>; align?: 'left' | 'center';
}) {
  const big = size === 'xl' ? t.hero : size === 'l' ? t.large : size === 'm' ? t.title3 : t.headline;
  const small = size === 'xl' ? t.title3 : size === 'l' ? t.headline : t.footnote;
  const centre = align === 'center' ? s.centre : null;
  return (
    <View style={[s.metric, align === 'center' && s.metricCentre, style]}>
      {label ? <Text numberOfLines={1} style={[t.footnote, centre]}>{label}</Text> : null}
      <View style={[s.metricLine, align === 'center' && s.metricLineCentre]}>
        <Text numberOfLines={1} style={[big, t.num, color ? { color } : null]}>{value}</Text>
        {unit ? <Text numberOfLines={1} style={[small, s.unit]}>{unit}</Text> : null}
      </View>
      {sub ? <Text numberOfLines={2} style={[t.footnote, centre]}>{sub}</Text> : null}
    </View>
  );
}

/** Two to four Metrics side by side, split by hairlines. */
export function Metrics({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.metrics, style]}>
      {items.map((c, i) => (
        <Fragment key={i}>
          {i ? <View style={s.vsep} /> : null}
          <View style={s.metricsCell}>{c}</View>
        </Fragment>
      ))}
    </View>
  );
}

// ── days ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** How a day went: done (full colour), part (soft), planned (a ring), missed (faint), none. */
export type DayMark = 'done' | 'part' | 'planned' | 'missed' | 'none';
const LETTER = 'SMTWTFS';

/** A week (or any run of days): the weekday letter over the date, marked by how the day went. Today wears a white ring. */
export function WeekStrip({ days, color, onPress, size = 36 }: {
  days: { day: string; mark: DayMark; today?: boolean; label?: string }[]; color?: string; onPress?: (day: string) => void; size?: number;
}) {
  const tone = useTone(color);
  return (
    <View style={s.week}>
      {days.map((d) => {
        const [y, m, dd] = d.day.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
        const fill = d.mark === 'done' ? tone : d.mark === 'part' ? tint(tone, 0.32) : d.mark === 'missed' ? SURF.row : 'transparent';
        const ring = d.today ? C.text : d.mark === 'planned' ? tint(tone, 0.6) : d.mark === 'none' ? SURF.line : 'transparent';
        const fg = d.mark === 'done' ? '#14161C' : d.mark === 'missed' ? C.faint : d.mark === 'none' ? C.muted : C.text;
        const cell = (
          <>
            <Text style={[t.micro, d.today && { color: C.text }]}>{LETTER[wd]}</Text>
            <View style={[s.dayDot, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderColor: ring }]}>
              <Text style={[s.dayNum, t.num, { color: fg }]}>{dd}</Text>
            </View>
          </>
        );
        const label = d.label ?? `${d.day}, ${d.mark === 'done' ? 'done' : d.mark === 'part' ? 'partly' : d.mark === 'planned' ? 'planned' : d.mark === 'missed' ? 'missed' : 'nothing'}`;
        return onPress
          ? <Press key={d.day} label={label} onPress={() => onPress(d.day)} feel="tick" wrap={s.dayCol} style={s.dayInner}>{cell}</Press>
          : <View key={d.day} accessibilityLabel={label} style={[s.dayCol, s.dayInner]}>{cell}</View>;
      })}
    </View>
  );
}

// ── small parts ──────────────────────────────────────────────────────────────────────────────────────────────
/** A short status word in a capsule: "Record", "Due", "Late". `aspect` tints it with the page's colour. */
export function Tag({ label, tone = 'neutral', color }: { label: string; tone?: 'neutral' | 'aspect' | 'solid'; color?: string }) {
  const c = useTone(color);
  const look = tone === 'aspect' ? { bg: tint(c, 0.16), fg: c } : tone === 'solid' ? { bg: c, fg: '#14161C' } : { bg: SURF.raised, fg: C.textSoft };
  return (
    <View style={[s.tag, { backgroundColor: look.bg }]}>
      <Text numberOfLines={1} style={[s.tagText, { color: look.fg }]}>{label}</Text>
    </View>
  );
}

/** A person: their photo, or their initials on the page's colour. */
export function Avatar({ name, size = 40, color, source }: {
  name: string; size?: number; color?: string; source?: { uri: string; headers?: Record<string, string> } | null;
}) {
  const c = useTone(color);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint(c, 0.16), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" /> : (
        <Text style={{ fontFamily: F.semibold, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.5), color: c }}>{initials}</Text>
      )}
    </View>
  );
}

/** A round button that holds one glyph and a word under it, for a row of quick actions ("Water", "Weigh in"). */
export function QuickAction({ label, icon, onPress, onLongPress, active, sub }: {
  label: string; icon: ReactNode; onPress: () => void; onLongPress?: () => void; active?: boolean; sub?: string | null;
}) {
  const tone = useTone();
  return (
    <Press label={sub ? `${label}, ${sub}` : label} onPress={onPress} onLongPress={onLongPress} wrap={s.quickWrap} style={s.quick} scale={0.94}>
      <View style={[s.quickDisc, active && { backgroundColor: tint(tone, 0.18), borderColor: tint(tone, 0.4) }]}>{icon}</View>
      <Text numberOfLines={1} style={[t.footnote, s.quickLabel]}>{label}</Text>
      {sub ? <Text numberOfLines={1} style={[t.micro, t.num]}>{sub}</Text> : null}
    </Press>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: 16 },
  panel: { gap: 24 },
  hidden: { display: 'none' },
  dim: { opacity: 0.6 },
  centre: { textAlign: 'center' },
  clip: { overflow: 'hidden' },
  stuckLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: SURF.hair },
  tabs: { flexDirection: 'row', height: 40, borderRadius: 20, padding: 4, backgroundColor: SURF.card, borderCurve: 'continuous' },
  thumb: {
    position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.13)',
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: SURF.edge,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  tabOn: { fontFamily: F.semibold, color: C.text },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, minHeight: 24 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  headAction: { minHeight: 24, justifyContent: 'flex-end' },
  group: {
    borderRadius: R.group, borderCurve: 'continuous', backgroundColor: SURF.group, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  groupPad: { padding: 16, gap: 12 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: SURF.hair },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 10 },
  itemMid: { flex: 1, minWidth: 0, gap: 2 },
  itemSplit: { flexDirection: 'row', alignItems: 'center' },
  itemMain: { flex: 1, minWidth: 0, paddingRight: 12 },
  itemAction: { paddingRight: 16 },
  value: { color: C.muted },
  doneText: { color: C.faint },
  pressed: { backgroundColor: SURF.row },
  lead: { borderRadius: R.card + 4, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 16 },
  metric: { gap: 2 },
  metricCentre: { alignItems: 'center' },
  metricLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricLineCentre: { justifyContent: 'center' },
  unit: { color: C.muted },
  metrics: { flexDirection: 'row', alignItems: 'stretch' },
  metricsCell: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  vsep: { width: StyleSheet.hairlineWidth, backgroundColor: SURF.hair, marginHorizontal: 8 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { flex: 1 },
  dayInner: { alignItems: 'center', gap: 6, paddingVertical: 2 },
  dayDot: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  dayNum: { fontFamily: F.medium, fontSize: 13, lineHeight: 16 },
  tag: { height: 22, borderRadius: 11, paddingHorizontal: 8, justifyContent: 'center', alignSelf: 'flex-start' },
  tagText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16 },
  quickWrap: { flex: 1 },
  quick: { alignItems: 'center', gap: 6, paddingVertical: 4 },
  quickDisc: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card,
    borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  quickLabel: { color: C.textSoft },
});
