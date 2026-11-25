import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, type ScrollView as RNScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
// gesture handler's, so a drag along the cards keeps them and never turns Today's day (DaySwipe)
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInRight, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Check } from '@/components/Icons';
import { haptic, SURF, t, tint } from '@/aspects/kit/tokens';
import { Pictogram } from '@/today/Pictogram';
import { useSwipeBlock } from './DaySwipe';
import { C, F, type AspectKey } from '@/theme';

// The day under the hero, in two lines.
// The rail: today from morning to midnight at true scale. Every block sits where it falls, night is shaded at both
// ends and a needle stands at now, so the shape of the day reads at a glance with no scrolling.
// The cards: what is on now (or the free stretch he is in), then what comes next, each with its times. A tap on the
// rail brings that block's card to the front; a drag looks around and springs back to now three seconds after.

export type StripItem = {
  id: string; title: string; sub: string | null;
  start: number; end: number | null; // ms; end null = a point (a routine anchor)
  color: string; done?: boolean; nora?: boolean;
  /** picks the card's picture when the title names nothing */ aspect?: AspectKey | null;
};
/** A stretch of sleep from the calendar, shaded on the rail. */
export type Span = { start: number; end: number };

const IST = 5.5 * 3600_000;
const HOUR = 3600_000, MIN = 60_000;
export const hm = (ms: number) => new Date(ms + IST).toISOString().slice(11, 16);
const istHour = (ms: number) => new Date(ms + IST).getUTCHours();

const PAD = 16, GAP = 8;
const RAIL_H = 54, TRACK_Y = 22, TRACK_H = 10, PILL_W = 46;
const CARD_H = 64, CARD_W = 148;
/** A free stretch shorter than this before the next block gets no card of its own: the next block is "now". */
const MIN_FREE = 15 * MIN;
/** An open routine point (wake up not logged) stays the current card this long after its time. */
const POINT_HOLD = 2 * HOUR;

type Card =
  | { kind: 'item'; key: string; it: StripItem }
  | { kind: 'free'; key: string; start: number | null; end: number | null; bed: number | null };

function dur(ms: number) {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function NowStrip({ items, night = [], now, day0, onCamera, onType, onPick }: {
  items: StripItem[]; night?: Span[]; now: number;
  /** today's midnight (ms): the rail's day */
  day0: number;
  onCamera: () => void; onPick: (it: StripItem) => void;
  /** the + beside the camera: log a meal in words */ onType?: () => void;
}) {
  const { width } = useWindowDimensions();
  const curW = Math.min(252, width - 2 * PAD - GAP - 96); // the next card always peeks out beside it
  const sorted = useMemo(() => items.slice().sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start)), [items]);

  // ── which card is "now": a block running now, an open routine point just past, or the free stretch he is in ──
  const { cards, cur } = useMemo(() => {
    const live = sorted.filter((it) => it.end != null && it.start <= now && now < it.end);
    let current: StripItem | null = live.length ? live[live.length - 1] : null;
    if (!current) {
      current = sorted.find((it) => it.end == null && !it.done && it.start <= now && now - it.start < POINT_HOLD) ?? null;
    }
    const nextUp = sorted.find((it) => it.start > now) ?? null;
    if (!current && nextUp && nextUp.start - now < MIN_FREE) current = nextUp;
    const out: Card[] = sorted.map((it) => ({ kind: 'item', key: it.id, it }));
    let idx = current ? sorted.indexOf(current) : -1;
    if (idx < 0) {
      // free: the card goes between what ended and what comes next
      const before = sorted.filter((it) => (it.end ?? it.start) <= now);
      const prevEnd = before.length ? Math.max(...before.map((it) => it.end ?? it.start)) : null;
      const bed = night.find((n) => n.start > now)?.start ?? null;
      idx = nextUp ? sorted.indexOf(nextUp) : sorted.length;
      out.splice(idx, 0, { kind: 'free', key: 'free', start: prevEnd, end: nextUp?.start ?? null, bed });
    }
    return { cards: out, cur: idx };
  }, [sorted, now, night]);

  const next = sorted.find((it) => it.start > now && it.start - now <= HOUR && cards[cur]?.key !== it.id) ?? null;

  // card x positions, inside the row's padding
  const xs = useMemo(() => {
    const out: number[] = [];
    let x = 0;
    cards.forEach((c, i) => { out.push(x); x += (i === cur ? curW : CARD_W) + GAP; });
    return out;
  }, [cards, cur, curW]);

  // ── the cards row: stays on now; after a drag or a rail tap it comes back three seconds later ──
  const ref = useRef<ComponentRef<typeof RNScrollView>>(null);
  const block = useSwipeBlock();
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [touched, setTouched] = useState(false);
  const [focus, setFocus] = useState(cur); // the card at the row's left edge, outlined on the rail
  const [flash, setFlash] = useState<string | null>(null);
  const goTo = useCallback((i: number, animated: boolean) => {
    ref.current?.scrollTo({ x: xs[Math.max(0, Math.min(i, xs.length - 1))] ?? 0, animated });
  }, [xs]);
  useEffect(() => { if (!touched) goTo(cur, true); }, [cur, goTo, touched]);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  const comeBack = (ms = 3000) => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { setTouched(false); setFlash(null); goTo(cur, true); }, ms);
  };
  const onScroll = (x: number) => {
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    if (best !== focus) setFocus(best);
  };

  // ── the rail's scale: from an hour before the earlier of 06:00 and the first thing on it, to midnight ──
  const [rw, setRw] = useState(0);
  const { r0, r1 } = useMemo(() => {
    const starts = [...sorted.map((it) => it.start), ...night.map((n) => n.end).filter((e) => e > day0 && e < day0 + 14 * HOUR)];
    let a = day0 + 6 * HOUR;
    for (const st of starts) if (st < a) a = st;
    a = Math.max(day0, day0 + Math.floor((a - day0) / HOUR) * HOUR - HOUR);
    return { r0: a, r1: day0 + 24 * HOUR };
  }, [sorted, night, day0]);
  const X = useCallback((ms: number) => ((Math.min(Math.max(ms, r0), r1) - r0) / (r1 - r0)) * rw, [r0, r1, rw]);

  const railTap = (x: number) => {
    if (!rw) return;
    const at = r0 + (x / rw) * (r1 - r0);
    // the block under the finger, else the nearest one
    let best = -1, bestD = Infinity;
    cards.forEach((c, i) => {
      if (c.kind !== 'item') return;
      const { start, end } = c.it;
      const d = end != null && at >= start && at <= end ? 0 : Math.min(Math.abs(at - start), Math.abs(at - (end ?? start)));
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return;
    haptic.tick();
    setTouched(true);
    setFlash(cards[best].key);
    goTo(best, true);
    comeBack(4000);
  };

  const focused = cards[focus];
  const liveCard = cards[cur];
  const liveColor = liveCard?.kind === 'item' && liveCard.it.end != null && liveCard.it.start <= now ? liveCard.it.color : null;
  const hours = [6, 9, 12, 15, 18, 21].map((h) => day0 + h * HOUR).filter((ms) => ms > r0 + 20 * MIN && ms < r1 - 20 * MIN);
  const summary = `Today's schedule, ${sorted.filter((it) => it.end != null).length} blocks. Now ${hm(now)}.`;

  return (
    <View style={s.wrap}>
      <View style={s.railRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={summary} accessibilityHint="Tap a block to bring its card up"
          style={s.rail} onLayout={(e) => setRw(e.nativeEvent.layout.width)} onPress={(e) => railTap(e.nativeEvent.locationX)}>
          {rw > 0 ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Sky w={rw} X={X} day0={day0} />
              {night.map((n, i) => {
                const l = X(n.start), w = X(n.end) - l;
                return w > 1 ? <View key={`n${i}`} style={[s.night, { left: l, width: w }]} /> : null;
              })}
              {hours.map((ms) => <View key={`h${ms}`} style={[s.hourTick, { left: X(ms) - 0.5 }]} />)}
              {sorted.map((it) => {
                const live = cards[cur]?.key === it.id;
                if (it.end == null) {
                  return (
                    <View key={it.id} style={[s.point, { left: X(it.start) - 4, borderColor: it.color },
                      (it.done || live) && { backgroundColor: it.color }]} />
                  );
                }
                const l = X(it.start), w = Math.max(4, X(it.end) - l - 1);
                return (
                  <View key={it.id} style={[s.seg, { left: l, width: w, backgroundColor: it.color }]}>
                    {live ? <Pulse color={it.color} /> : null}
                    <View style={s.segShine} />
                  </View>
                );
              })}
              {/* everything before now sits under a veil, so what is left of the day stands out */}
              <View style={[s.veil, { width: X(now) }]} />
              {focused && touched ? <Outline card={focused} X={X} now={now} /> : null}
              <View style={[s.needle, { left: X(now) - 1 }]} />
              <View style={[s.knob, { left: X(now) - 6, borderColor: liveColor ?? C.text }]} />
              <View style={[s.pill, { left: Math.min(Math.max(0, X(now) - PILL_W / 2), rw - PILL_W) }]}>
                <Text style={s.pillText}>{hm(now)}</Text>
              </View>
              {hours.map((ms) => (
                <Text key={`l${ms}`} style={[s.hourText, { left: X(ms) - 12 }]}>{String(istHour(ms)).padStart(2, '0')}</Text>
              ))}
            </View>
          ) : null}
        </Pressable>
        {onType ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Log a meal by text" accessibilityHint="Type what you ate; it goes under the meal for now"
            onPress={() => { haptic.tick(); onType(); }} hitSlop={6} style={({ pressed }) => [s.cam, pressed && { backgroundColor: SURF.pressed }]}>
            <PlusIcon />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Smart photo" accessibilityHint="Take or pick a photo; it files itself where it belongs"
          onPress={onCamera} hitSlop={6} style={({ pressed }) => [s.cam, pressed && { backgroundColor: SURF.pressed }]}>
          <CameraIcon />
        </Pressable>
      </View>

      <View style={s.rowWrap}>
        <ScrollView ref={ref} horizontal block={block} showsHorizontalScrollIndicator={false} decelerationRate="fast"
          snapToOffsets={xs} snapToEnd={false} disableIntervalMomentum
          onLayout={() => goTo(cur, false)} scrollEventThrottle={32}
          onScroll={(e) => onScroll(e.nativeEvent.contentOffset.x)}
          onScrollBeginDrag={() => { setTouched(true); setFlash(null); if (idle.current) clearTimeout(idle.current); }}
          onScrollEndDrag={() => comeBack()} onMomentumScrollEnd={() => { if (touched) comeBack(); }}
          contentContainerStyle={{ paddingHorizontal: PAD, gap: GAP, height: CARD_H }}>
          {cards.map((c, i) => (
            <Animated.View key={c.key} entering={FadeInRight.delay(Math.min(Math.abs(i - cur), 5) * 50).duration(360).reduceMotion(ReduceMotion.System)}>
              {c.kind === 'free'
                ? <FreeCard c={c} now={now} w={i === cur ? curW : CARD_W} />
                : <ItemCard it={c.it} now={now} w={i === cur ? curW : CARD_W} current={i === cur}
                    next={next?.id === c.it.id} flash={flash === c.key} onPress={() => onPick(c.it)} />}
            </Animated.View>
          ))}
        </ScrollView>
        <Fade side="left" w={PAD} />
        <Fade side="right" w={28} />
      </View>
    </View>
  );
}

/** The card at the row's left edge, outlined where it sits on the rail while he looks around. */
function Outline({ card, X, now }: { card: Card; X: (ms: number) => number; now: number }) {
  const a = card.kind === 'item' ? card.it.start : card.start ?? now;
  const b = card.kind === 'item' ? card.it.end ?? card.it.start : card.end ?? now;
  const l = X(a) - 3, w = Math.max(10, X(b) - X(a) + 6);
  return <View style={[s.outline, { left: l, width: w }]} />;
}

function ItemCard({ it, now, w, current, next, flash, onPress }: {
  it: StripItem; now: number; w: number; current: boolean; next: boolean; flash: boolean; onPress: () => void;
}) {
  const c = it.color;
  const timed = it.end != null;
  const past = !current && (timed ? now >= it.end! : !!it.done || now >= it.start);
  const running = current && timed && now >= it.start;
  const time = timed ? `${hm(it.start)}–${hm(it.end!)}` : hm(it.start);
  let cap: string;
  if (running) cap = `Now · until ${hm(it.end!)}`;
  else if (current && !timed && now >= it.start) cap = it.done ? `Now · ${hm(it.start)}` : `Now · ${it.sub ?? hm(it.start)}`;
  else if (current || next) cap = `In ${dur(it.start - now)} · ${hm(it.start)}`;
  else cap = it.sub ? `${time} · ${it.sub}` : time;
  const live = current && now >= it.start;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${it.title}, ${cap}${running ? `, ${dur(it.end! - now)} left` : ''}${it.done ? ', done' : ''}`} onPress={onPress}
      style={({ pressed }) => [s.card, { width: w }, past && s.past,
        current && { borderColor: tint(c, 0.55), boxShadow: `0 6px 20px ${tint(c, 0.22)}` },
        next && !current && { borderColor: tint(c, 0.32) },
        flash && { borderColor: 'rgba(255,255,255,0.6)' },
        pressed && { transform: [{ scale: 0.97 }] }]}>
      {current ? <Wash color={c} w={w} /> : null}
      <View style={[s.badge, { backgroundColor: tint(c, current ? 0.26 : 0.14) }]}>
        <Pictogram title={it.title} aspect={it.aspect ?? null} color={c} done={!!it.done} size={22} />
      </View>
      <View style={[s.cardText, (it.done || running) && { paddingRight: running ? 4 : 34 }]}>
        <View style={s.titleRow}>
          {live ? <LiveDot color={c} /> : null}
          <Text numberOfLines={1} style={[s.cap, (current || next) && { color: current ? c : C.textSoft }]}>{cap}</Text>
        </View>
        <View style={s.titleRow}>
          {it.nora ? <View style={s.noraDot} /> : null}
          <Text numberOfLines={1} style={[s.title, it.done && { color: C.muted }]}>{it.title}</Text>
        </View>
      </View>
      {running ? <Countdown color={c} left={it.end! - now} share={(it.end! - now) / (it.end! - it.start)} /> : null}
      {it.done ? <View style={s.check}><Check size={12} color={C.scene} /></View> : null}
    </Pressable>
  );
}

function FreeCard({ c, now, w }: { c: Extract<Card, { kind: 'free' }>; now: number; w: number }) {
  const title = c.end != null ? `Free for ${dur(c.end - now)}` : 'Nothing else today';
  const cap = c.end != null ? `Now · until ${hm(c.end)}` : c.bed != null ? `Now · bed at ${hm(c.bed)}` : `Now · ${hm(now)}`;
  const elapsed = c.start != null && c.end != null ? Math.min(1, Math.max(0, (now - c.start) / (c.end - c.start))) : 0;
  return (
    <View accessible accessibilityLabel={`${title}, ${cap}`} style={[s.card, s.free, { width: w }]}>
      <View style={[s.badge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}><Leaf /></View>
      <View style={s.cardText}>
        <View style={s.titleRow}>
          <LiveDot color="#FFFFFF" />
          <Text numberOfLines={1} style={[s.cap, { color: C.textSoft }]}>{cap}</Text>
        </View>
        <Text numberOfLines={1} style={s.title}>{title}</Text>
      </View>
      {elapsed > 0 ? <View style={[s.progress, { width: `${elapsed * 100}%`, backgroundColor: 'rgba(255,255,255,0.45)' }]} /> : null}
    </View>
  );
}

// ── the fancy bits ──────────────────────────────────────────────────────────────────────────────────────────────

/** The rail's track as the sky over the day: night blue, dawn amber at six, pale day blue at noon, dusk violet at
 *  half past six, night again by nine. Faint, so the blocks read on top of it. */
function Sky({ w, X, day0 }: { w: number; X: (ms: number) => number; day0: number }) {
  const at = (h: number) => Math.min(1, Math.max(0, X(day0 + h * HOUR) / w));
  const stops: [number, string, number][] = [
    [0, '#2E3A8C', 0.8], [at(5), '#2E3A8C', 0.8], [at(6.3), '#FFB067', 0.8], [at(9), '#9CC8FF', 0.55],
    [at(12.5), '#CDE6FF', 0.5], [at(16.5), '#FFC98A', 0.6], [at(18.6), '#C77DFF', 0.7], [at(20.5), '#2E3A8C', 0.8], [1, '#212A6E', 0.85],
  ];
  return (
    <View style={s.track}>
      <Svg width={w} height={TRACK_H}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="1" y2="0">
            {stops.map(([o, col, a], i) => <Stop key={i} offset={o} stopColor={col} stopOpacity={a} />)}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={TRACK_H} rx={TRACK_H / 2} fill="url(#sky)" />
      </Svg>
    </View>
  );
}

/** A soft glow that breathes round the block running now. */
function Pulse({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0.5);
  useEffect(() => {
    if (reduce) return;
    v.set(withRepeat(withSequence(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1));
  }, [reduce, v]);
  const st = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 3, boxShadow: `0 0 10px 1px ${tint(color, 0.85)}` }, st]} />;
}

/** The small dot before "Now" that beats like a live indicator. */
function LiveDot({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    v.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
  }, [reduce, v]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - v.value), transform: [{ scale: 1 + v.value * 1.6 }] }));
  return (
    <View style={s.liveDot}>
      <Animated.View style={[s.liveRing, { backgroundColor: color }, ring]} />
      <View style={[s.liveCore, { backgroundColor: color }]} />
    </View>
  );
}

/** Minutes left in the running block, inside a ring that empties as it goes. */
function Countdown({ color, left, share }: { color: string; left: number; share: number }) {
  const R = 14, L = 2 * Math.PI * R, k = Math.min(1, Math.max(0, share));
  const m = Math.max(1, Math.round(left / MIN));
  const label = m < 60 ? `${m}m` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return (
    <View style={s.count}>
      <Svg width={34} height={34}>
        <Circle cx={17} cy={17} r={R} stroke={tint(color, 0.22)} strokeWidth={3} fill="none" />
        <Circle cx={17} cy={17} r={R} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round"
          strokeDasharray={`${L}`} strokeDashoffset={L * (1 - k)} transform="rotate(-90 17 17)" />
      </Svg>
      <Text style={s.countText}>{label}</Text>
    </View>
  );
}

/** The current card's colour, washing in from its left edge. */
function Wash({ color, w }: { color: string; w: number }) {
  const id = `wash${color.slice(1, 7)}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={CARD_H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.3} />
            <Stop offset="0.6" stopColor={color} stopOpacity={0.1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.04} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={CARD_H} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function Leaf() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M5 19c0-8 5-13 14-14c0 9-5 14-13 14M5 19l7-7" stroke={C.textSoft} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The scene colour fading over the row's edges (svg, no native gradient module in this build). */
function Fade({ side, w }: { side: 'left' | 'right'; w: number }) {
  const id = `sf-${side}`;
  return (
    <View pointerEvents="none" style={[s.fade, side === 'left' ? { left: 0 } : { right: 0 }, { width: w }]}>
      <Svg width={w} height={CARD_H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={C.scene} stopOpacity={side === 'left' ? 1 : 0} />
            <Stop offset="1" stopColor={C.scene} stopOpacity={side === 'left' ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={CARD_H} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function PlusIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={C.text} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function CameraIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z"
        stroke={C.text} strokeWidth={1.7} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  railRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: RAIL_H },
  rail: { flex: 1, height: RAIL_H },
  track: { position: 'absolute', left: 0, right: 0, top: TRACK_Y, height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden', backgroundColor: SURF.track },
  night: { position: 'absolute', top: TRACK_Y, height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: 'rgba(10,12,30,0.35)' },
  hourTick: { position: 'absolute', top: TRACK_Y + 2, height: TRACK_H - 4, width: 1, backgroundColor: 'rgba(255,255,255,0.10)' },
  seg: { position: 'absolute', top: TRACK_Y, height: TRACK_H, borderRadius: 3 },
  segShine: { position: 'absolute', left: 1, right: 1, top: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  point: {
    position: 'absolute', top: TRACK_Y + TRACK_H / 2 - 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5,
    backgroundColor: C.scene,
  },
  veil: { position: 'absolute', left: 0, top: TRACK_Y - 1, height: TRACK_H + 2, backgroundColor: 'rgba(17,20,28,0.55)' },
  outline: {
    position: 'absolute', top: TRACK_Y - 3, height: TRACK_H + 6, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)',
  },
  needle: {
    position: 'absolute', top: 17, height: TRACK_Y - 17, width: 2, borderRadius: 1, backgroundColor: C.text,
  },
  knob: {
    position: 'absolute', top: TRACK_Y + TRACK_H / 2 - 6, width: 12, height: 12, borderRadius: 6, borderWidth: 2.5,
    backgroundColor: '#FFFFFF', boxShadow: '0 0 10px rgba(255,255,255,0.75)',
  },
  pill: {
    position: 'absolute', top: 0, width: PILL_W, height: 18, borderRadius: 9, backgroundColor: C.text,
    alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
  pillText: { fontFamily: F.semibold, fontSize: 11, lineHeight: 14, color: C.scene, ...t.num },
  hourText: { position: 'absolute', top: TRACK_Y + TRACK_H + 6, width: 24, textAlign: 'center', ...t.caption, fontSize: 11, lineHeight: 14, ...t.num },
  rowWrap: { height: CARD_H, marginHorizontal: -PAD },
  card: {
    height: CARD_H, borderRadius: 16, backgroundColor: SURF.card, borderWidth: 1, borderColor: 'transparent',
    overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
  },
  past: { opacity: 0.45 },
  free: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.14)', borderStyle: 'dashed' },
  badge: { width: 36, height: 36, borderRadius: 12, marginLeft: 12, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  liveCore: { width: 6, height: 6, borderRadius: 3 },
  count: { width: 34, height: 34, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  countText: { position: 'absolute', fontFamily: F.semibold, fontSize: 10, lineHeight: 12, color: C.text, ...t.num },
  cardText: { flex: 1, paddingLeft: 10, paddingRight: 12, gap: 2 },
  cap: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint, ...t.num },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  title: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text, flexShrink: 1 },
  noraDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F0457A' },
  check: {
    position: 'absolute', right: 10, top: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: C.textSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 3 },
  fade: { position: 'absolute', top: 0, bottom: 0 },
  cam: {
    width: 40, height: 40, borderRadius: 20, marginTop: 0,
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
});
