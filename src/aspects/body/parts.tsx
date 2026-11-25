import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { C } from '@/theme';
import { Ring, Spark, t, tint, useAspect } from '@/aspects/kit';
import type { ShortPlan } from './api';

// Pieces the redesigned Body tabs share.

/** A trend line that takes the width it is given. */
export function Trend({ values, height = 40, minSpan, range, goal, color }: {
  values: (number | null)[]; height?: number; minSpan?: number; range?: [number, number]; goal?: number; color?: string;
}) {
  const [w, setW] = useState(0);
  return (
    <View style={{ height, flex: 1 }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? <Spark values={values} width={w} height={height} minSpan={minSpan} range={range} goal={goal} color={color} stroke={2} /> : null}
    </View>
  );
}

/** A small ring for a row: how much of today's thing is done. Full shows a tick-like solid ring. */
export function Progress({ done, total, size = 36, label }: { done: number; total: number; size?: number; label?: string }) {
  const a = useAspect();
  const full = total > 0 && done >= total;
  return (
    <Ring size={size} progress={total > 0 ? Math.min(1, done / total) : 0} stroke={3.5} color={a.color}>
      <Text style={[s.ringText, t.num, { color: full ? a.color : C.muted }]}>{label ?? (total > 0 ? `${Math.round(Math.min(1, done / total) * 100)}` : '')}</Text>
    </Ring>
  );
}

/** About how long a session takes: two and a half minutes a set, a little less for holds. */
export function minutesFor(p: Pick<ShortPlan, 'items'> | null | undefined) {
  if (!p) return 0;
  const sets = p.items.reduce((n, it) => n + (it.sets ?? 3), 0);
  return Math.max(10, Math.round((sets * 2.6) / 5) * 5);
}

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
/** What goes on each side of the bar for `w` kg: "20 + 2.5". Null when it can't be made or there is no bar. */
export function platesFor(w: number | null | undefined, bar: number | null | undefined) {
  if (w == null || !bar || w <= bar) return null;
  let side = Math.round(((w - bar) / 2) * 100) / 100;
  const out: number[] = [];
  for (const p of PLATES) while (side >= p - 1e-6) { out.push(p); side = Math.round((side - p) * 100) / 100; }
  if (side > 0.01) return null;
  return out.join(' + ');
}

/** Estimated one rep max (Epley), the number records compare. */
export const e1rm = (w: number | null | undefined, r: number | null | undefined) => (w && r ? w * (1 + Math.min(r, 15) / 30) : 0);

/** "2.4 t" for volume over a tonne, else "850 kg". */
export const volumeText = (kg: number) => (kg >= 1000 ? `${(Math.round(kg / 100) / 10).toString()} t` : `${Math.round(kg)} kg`);

/** A muscle list as plain words: "Back and biceps". */
export function muscleWords(ms: string[]) {
  const names: Record<string, string> = { upperback: 'back', lowerback: 'lower back', abs: 'core', obliques: 'core' };
  const uniq = [...new Set(ms.map((m) => names[m] ?? m))];
  if (!uniq.length) return '';
  const txt = uniq.length > 1 ? `${uniq.slice(0, -1).join(', ')} and ${uniq.at(-1)}` : uniq[0];
  return txt[0].toUpperCase() + txt.slice(1);
}

export const s = StyleSheet.create({
  ringText: { fontFamily: 'Geist_600SemiBold', fontSize: 11, lineHeight: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
});

export const soft = (c: string) => tint(c, 0.16);
