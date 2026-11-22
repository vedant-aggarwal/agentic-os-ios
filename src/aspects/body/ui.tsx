import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import { Bar, Card, Press, R, Ring, SP, SURF, t, tint, useAspect } from '@/aspects/kit';
import type { Change, Evidence } from './api';

// Small pieces the four parts share.

/** The width a chart gets inside a card on this page: the page less its padding and the card's. */
export function useInnerWidth(extra = 0) {
  const { width } = useAspect();
  return Math.max(120, width - 32 - 32 - extra);
}

/** The time now, ticking every `ms` while the page is open. */
export function useNow(ms = 1000, on = true) {
  const { open } = useAspect();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open || !on) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [open, on, ms]);
  return now;
}

/** How well a protocol is backed: three short bars, filled for strong, two for some, one for weak, none for none. */
export const EVIDENCE: Record<Evidence, { n: number; word: string; long: string }> = {
  strong: { n: 3, word: 'Strong evidence', long: 'Backed by good clinical trials.' },
  some: { n: 2, word: 'Some evidence', long: 'Small studies or strong expert agreement.' },
  weak: { n: 1, word: 'Weak evidence', long: 'Little research; people report it helps. Cheap and safe to try.' },
  none: { n: 0, word: 'No evidence', long: 'Not shown to work. Kept only where it is harmless.' },
};
export function EvidenceTag({ level }: { level: Evidence }) {
  const e = EVIDENCE[level];
  return (
    <View style={s.tag} accessibilityLabel={e.word}>
      <View style={s.ev}>
        {[0, 1, 2].map((i) => <View key={i} style={[s.evBar, { height: 6 + i * 3, backgroundColor: i < e.n ? C.textSoft : SURF.line }]} />)}
      </View>
      <Text style={t.caption}>{e.word}</Text>
    </View>
  );
}

export const CHANGE: Record<Change, string> = { yes: 'Can change', part: 'Partly changeable', no: 'Structure' };
export function Tag({ children }: { children: string }) {
  return <View style={s.tag}><Text style={t.caption}>{children}</Text></View>;
}

/** A score out of 100 with its bar. `margin` draws as "± 4" after the number. */
export function Score({ v, margin, size = 'big' }: { v: number | null; margin?: number | null; size?: 'big' | 'mid' }) {
  if (v == null) return <Text style={[size === 'big' ? t.display : t.heading, { color: C.faint }]}>–</Text>;
  return (
    <View style={s.scoreLine}>
      <Text style={[size === 'big' ? t.display : t.heading, t.num]}>{v}</Text>
      {margin != null ? <Text style={[t.label, t.num]}>{`± ${margin}`}</Text> : null}
    </View>
  );
}

/** One score row: name, value, a 0 to 100 bar, and one line of what it rests on. */
export function ScoreRow({ name, v, margin, note, right, onPress, faint }: {
  name: string; v: number | null; margin?: number | null; note?: string | null; right?: ReactNode; onPress?: () => void; faint?: boolean;
}) {
  const a = useAspect();
  const body = (
    <View style={s.scoreRow}>
      <View style={s.scoreHead}>
        <Text numberOfLines={1} style={[t.strong, s.flex]}>{name}</Text>
        {right}
        <Text style={[t.strong, t.num, v == null && { color: C.faint }]}>{v == null ? 'Not measured' : margin ? `${v} ± ${margin}` : String(v)}</Text>
      </View>
      <Bar progress={(v ?? 0) / 100} height={6} color={faint ? tint(a.color, 0.5) : a.color} />
      {note ? <Text numberOfLines={2} style={t.small}>{note}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return <Press label={`${name}, ${v == null ? 'not measured' : v}`} onPress={onPress} scale={0.99}>{body}</Press>;
}

/** A change between two measurements, shown only when it is real. */
export function Delta({ d, unit = '' }: { d: number | null | undefined; unit?: string }) {
  const a = useAspect();
  if (d == null) return null;
  if (d === 0) return <Text style={t.caption}>No real change</Text>;
  return <Text style={[t.label, t.num, d > 0 && { color: a.color }]}>{`${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)}${unit}`}</Text>;
}

/** A small progress ring with a count inside, for one-line rows. */
export function MiniRing({ done, total, size = 40, text }: { done: number; total: number; size?: number; text?: string }) {
  const full = total > 0 && done >= total;
  return (
    <Ring size={size} progress={total > 0 ? done / total : 0} stroke={4}>
      <Text style={[t.caption, t.num, { color: full ? C.text : C.muted }]}>{text ?? (total > 0 ? `${done}/${total}` : '')}</Text>
    </Ring>
  );
}

/** A stack of lines in one card with hairlines between, for lists that are a single surface. */
export function List({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  return (
    <Card style={s.list}>
      {items.map((c, i) => (
        <View key={i}>
          {i > 0 ? <View style={s.hair} /> : null}
          {c}
        </View>
      ))}
    </Card>
  );
}

export const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SP[12] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP[12] },
  gap4: { gap: SP[4] },
  gap8: { gap: SP[8] },
  gap12: { gap: SP[12] },
  gap16: { gap: SP[16] },
  tag: { flexDirection: 'row', alignItems: 'center', gap: SP[4], alignSelf: 'flex-start', height: 24, paddingHorizontal: SP[8], borderRadius: R.inner, backgroundColor: SURF.row },
  ev: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  evBar: { width: 3, borderRadius: 1.5 },
  scoreLine: { flexDirection: 'row', alignItems: 'baseline', gap: SP[8] },
  scoreRow: { gap: SP[8], paddingVertical: SP[8] },
  scoreHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  list: { paddingVertical: SP[4] },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: SURF.line },
  thumb: { borderRadius: R.inner, backgroundColor: SURF.row, overflow: 'hidden' },
  icon40: { width: 40, alignItems: 'center' },
});
