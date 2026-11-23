import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Check } from '@/components/Icons';
import { SURF, t, tint } from '@/aspects/kit/tokens';
import { C, F } from '@/theme';

// The day as one line under a fixed marker. Calendar events and routine anchors slide under the same spot, so where
// the day stands never needs reading. 86 pt tall: about half the old Now card. A drag looks around; two seconds
// after the finger lifts it springs back to now.

export type StripItem = {
  id: string; title: string; sub: string | null;
  start: number; end: number | null; // ms; end null = a point (a routine anchor)
  color: string; done?: boolean; nora?: boolean;
};

const H = 86, BLOCK_Y = 26, BLOCK_H = 52, GAP = 6;
const IST = 5.5 * 3600_000;
export const hm = (ms: number) => new Date(ms + IST).toISOString().slice(11, 16);

type Placed = { it: StripItem; x: number; w: number } | { gap: true; x: number; w: number; start: number; end: number };

function widthOf(it: StripItem) {
  const text = Math.max(it.title.length * 7.6, (it.sub?.length ?? 0) * 6.6) + 24 + (it.done ? 22 : 0);
  if (it.end == null) return Math.min(200, Math.max(84, text));
  const mins = (it.end - it.start) / 60000;
  return Math.min(210, Math.max(60 + Math.min(mins, 150), Math.min(text, 210)));
}
const gapWidth = (mins: number) => (mins >= 240 ? 80 : mins < 60 ? 46 : 46 + ((mins - 60) / 180) * 34);

export function NowStrip({ items, now, onCamera, onPick }: {
  items: StripItem[]; now: number; onCamera: () => void; onPick: (it: StripItem) => void;
}) {
  const { width } = useWindowDimensions();
  const marker = Math.round(width * 0.29);
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [touched, setTouched] = useState(false);

  const placed = useMemo(() => {
    const out: Placed[] = [];
    let x = 0, lastEnd: number | null = null;
    const sorted = items.slice().sort((a, b) => a.start - b.start);
    for (const it of sorted) {
      if (lastEnd != null && it.start - lastEnd >= 20 * 60000) {
        const w = gapWidth((it.start - lastEnd) / 60000);
        out.push({ gap: true, x, w, start: lastEnd, end: it.start });
        x += w + GAP;
      }
      const w = widthOf(it);
      out.push({ it, x, w });
      x += w + GAP;
      lastEnd = Math.max(lastEnd ?? 0, it.end ?? it.start);
    }
    return { out, total: x };
  }, [items]);

  // the point under the marker: inside a timed block its elapsed point, in a free stretch its share of the gap,
  // a past point that isn't logged yet stays current at its left edge
  const anchor = useMemo(() => {
    for (const p of placed.out) {
      if ('gap' in p) {
        if (now >= p.start && now < p.end) return p.x + Math.min(p.w - 12, (p.w * (now - p.start)) / (p.end - p.start));
        continue;
      }
      const { it } = p;
      if (it.end == null) {
        if (!it.done && now >= it.start) return p.x + 1;
        if (now < it.start) return p.x;
        continue;
      }
      if (now >= it.start && now < it.end) return p.x + (p.w * (now - it.start)) / (it.end - it.start);
      if (now < it.start) return p.x;
    }
    return Math.max(0, placed.total - 40);
  }, [placed, now]);

  const current = useMemo(() => {
    let cur: string | null = null;
    for (const p of placed.out) {
      if ('gap' in p) continue;
      const { it } = p;
      if (it.end == null ? (!it.done && now >= it.start) : now >= it.start && now < it.end) { cur = it.id; break; }
    }
    return cur;
  }, [placed, now]);
  const next = useMemo(() => {
    const n = items.filter((i) => i.start > now && i.start - now <= 60 * 60000).sort((a, b) => a.start - b.start)[0];
    return n?.id ?? null;
  }, [items, now]);

  const home = useCallback((animated: boolean) => {
    ref.current?.scrollTo({ x: Math.max(0, anchor - marker), animated });
  }, [anchor, marker]);
  useEffect(() => { if (!touched) home(true); }, [home, touched]);
  useEffect(() => () => { if (idle.current) clearTimeout(idle.current); }, []);
  const release = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { setTouched(false); home(true); }, 2000);
  };

  return (
    <View style={[s.wrap, { width }]}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} decelerationRate={0.998}
        onLayout={() => home(false)}
        onScrollBeginDrag={() => { setTouched(true); if (idle.current) clearTimeout(idle.current); }}
        onScrollEndDrag={release} onMomentumScrollEnd={release}
        contentContainerStyle={{ paddingLeft: marker, paddingRight: width - marker, height: H }}>
        <View style={{ width: placed.total, height: H }}>
          {placed.out.map((p) => ('gap' in p ? (
            <View key={`g${p.x}`} style={[s.gap, { left: p.x, width: p.w }]}>
              {Array.from({ length: Math.max(2, Math.floor(p.w / 9)) }, (_, i) => <View key={i} style={s.dot} />)}
            </View>
          ) : (
            <Block key={p.it.id} p={p} now={now} current={current === p.it.id} next={next === p.it.id} onPress={() => onPick(p.it)} />
          )))}
        </View>
      </ScrollView>

      {/* the marker never crosses a block's words: a stub above the row and one below */}
      <View pointerEvents="none" style={[s.pill, { left: marker - 26 }]}>
        <Text style={s.pillText}>{hm(now)}</Text>
      </View>
      <View pointerEvents="none" style={[s.tickLine, { left: marker - 1, top: 20, height: 6 }]} />
      <View pointerEvents="none" style={[s.tickLine, { left: marker - 1, top: BLOCK_Y + BLOCK_H, height: H - BLOCK_Y - BLOCK_H }]} />

      <Fade side="left" w={16} />
      <Fade side="right" w={124} />
      <Pressable accessibilityRole="button" accessibilityLabel="Smart photo" accessibilityHint="Take or pick a photo; it files itself where it belongs"
        onPress={onCamera} hitSlop={6} style={({ pressed }) => [s.cam, pressed && { backgroundColor: SURF.pressed }]}>
        <CameraIcon />
      </Pressable>
    </View>
  );
}

function Block({ p, now, current, next, onPress }: { p: { it: StripItem; x: number; w: number }; now: number; current: boolean; next: boolean; onPress: () => void }) {
  const { it } = p;
  const past = it.end == null ? !!it.done || (now >= it.start && !current) : now >= it.end;
  const c = it.color;
  const elapsed = current && it.end != null ? Math.min(1, (now - it.start) / (it.end - it.start)) : 0;
  const mins = Math.round((it.start - now) / 60000);
  const sub = next && it.sub ? `${hm(it.start)}, in ${mins} min` : it.sub;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${it.title}${sub ? `, ${sub}` : ''}`} onPress={onPress}
      style={[s.block, { left: p.x, width: p.w }, past && { opacity: 0.4 },
        current && { backgroundColor: tint(c, 0.14), borderColor: tint(c, 0.55) },
        next && !current && { borderColor: tint(c, 0.32) }, it.done && { paddingRight: 34 }]}>
      {elapsed > 0 ? <View style={[s.fill, { width: p.w * elapsed, backgroundColor: tint(c, 0.26) }]} /> : null}
      <View style={s.titleRow}>
        {it.nora ? <View style={s.noraDot} /> : null}
        <Text numberOfLines={1} style={s.title}>{it.title}</Text>
      </View>
      {sub ? <Text numberOfLines={1} style={[s.sub, current && { color: C.textSoft }]}>{sub}</Text> : null}
      {it.done ? <View style={s.check}><Check size={14} color={C.textSoft} /></View> : null}
    </Pressable>
  );
}

/** The scene colour fading over the row's edges (svg, no native gradient module in this build). */
function Fade({ side, w }: { side: 'left' | 'right'; w: number }) {
  const id = `sf-${side}`;
  return (
    <View pointerEvents="none" style={[s.fade, side === 'left' ? { left: 0 } : { right: 0 }, { width: w }]}>
      <Svg width={w} height={H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            {side === 'left'
              ? [<Stop key="a" offset="0" stopColor={C.scene} stopOpacity={1} />, <Stop key="b" offset="1" stopColor={C.scene} stopOpacity={0} />]
              : [<Stop key="a" offset="0" stopColor={C.scene} stopOpacity={0} />, <Stop key="b" offset="0.42" stopColor={C.scene} stopOpacity={1} />, <Stop key="c" offset="1" stopColor={C.scene} stopOpacity={1} />]}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={H} fill={`url(#${id})`} />
      </Svg>
    </View>
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
  wrap: { height: H, overflow: 'hidden', marginHorizontal: -16 },
  block: {
    position: 'absolute', top: BLOCK_Y, height: BLOCK_H, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12,
    backgroundColor: SURF.card, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden', justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text, flexShrink: 1 },
  sub: { ...t.caption, ...t.num },
  noraDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F0457A' },
  check: { position: 'absolute', right: 12, top: 18 },
  gap: { position: 'absolute', top: BLOCK_Y, height: BLOCK_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  pill: { position: 'absolute', top: 0, height: 20, width: 52, borderRadius: 10, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 20, color: C.scene, fontVariant: ['tabular-nums'] },
  tickLine: { position: 'absolute', width: 2, backgroundColor: 'rgba(255,255,255,0.92)' },
  fade: { position: 'absolute', top: 0, bottom: 0 },
  cam: {
    position: 'absolute', right: 16, top: BLOCK_Y + (BLOCK_H - 44) / 2, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
});
