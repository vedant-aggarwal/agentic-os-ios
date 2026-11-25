import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { haptic, num, SURF, t, tint, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import type { AspectKey } from '@/theme';

// Scoring the wheel: nine rows, one drag or one tap each, starting from last time's value. A white mark on each
// track shows what the data reads, so a score that parts from it is a choice he sees.

export type ScoreSection = { key: AspectKey; name: string; felt: number | null; measured: number | null; note?: string | null };

function Track({ value, measured, onChange, label }: { value: number | null; measured: number | null; onChange: (v: number) => void; label: string }) {
  const { color } = useAspect();
  const [w, setW] = useState(0);
  const set = (x: number) => {
    if (w <= 0) return;
    const v = Math.round(Math.min(Math.max(x / w, 0), 1) * 10);
    if (v !== value) { haptic.tick(); onChange(v); }
  };
  const pan = usePanGesture({ activeOffsetX: [-4, 4], failOffsetY: [-12, 12], runOnJS: true, onActivate: (e) => set(e.x), onUpdate: (e) => set(e.x) });
  const tap = useTapGesture({ runOnJS: true, onActivate: (e) => set(e.x) });
  const both = useCompetingGestures(pan, tap);
  const frac = value == null ? 0 : value / 10;
  return (
    <GestureDetector gesture={both}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
        accessibilityValue={value == null ? { text: 'not scored' } : { min: 0, max: 10, now: value }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.min(10, Math.max(0, (value ?? 5) + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        onLayout={(e) => setW(e.nativeEvent.layout.width)} style={s.hit}>
        <View style={s.track}>
          <View style={[s.fill, { width: `${frac * 100}%`, backgroundColor: value == null ? 'transparent' : tint(color, 0.7) }]} />
        </View>
        {Array.from({ length: 11 }, (_, i) => (
          <View key={i} pointerEvents="none" style={[s.stop, { left: (i / 10) * w - 1 }]} />
        ))}
        {measured != null && w > 0 ? <View pointerEvents="none" style={[s.data, { left: (Math.min(measured, 10) / 10) * w - 1.5 }]} /> : null}
        {value != null && w > 0 ? <View pointerEvents="none" style={[s.thumb, { left: frac * w - 12, borderColor: color }]} /> : null}
      </View>
    </GestureDetector>
  );
}

export function Scorer({ sections, values, onChange }: {
  sections: ScoreSection[]; values: Partial<Record<AspectKey, number>>; onChange: (key: AspectKey, v: number) => void;
}) {
  const { color } = useAspect();
  return (
    <View style={s.list}>
      {sections.map((sec) => {
        const v = values[sec.key] ?? null;
        const changed = v != null && sec.felt != null && v !== sec.felt;
        const sub = [
          sec.felt != null ? `Last time ${num(sec.felt, 1)}.` : 'Not scored before.',
          sec.measured != null ? `Data reads ${num(sec.measured, 1)}.` : sec.note ? 'Not tracked yet.' : 'No data yet.',
        ].join(' ');
        return (
          <View key={sec.key} style={s.row}>
            <View style={s.head}>
              <View style={s.names}>
                <Text style={t.callout}>{sec.name}</Text>
                <Text style={t.footnote}>{sub}</Text>
              </View>
              <Text style={[v == null ? t.subhead : t.title3, t.num, { color: v == null ? C.faint : changed ? color : C.text }]}>{v == null ? 'Not set' : num(v, 1)}</Text>
            </View>
            <Track value={v} measured={sec.measured} label={`${sec.name} score`} onChange={(n) => onChange(sec.key, n)} />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 16 },
  row: { gap: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  names: { flex: 1, gap: 2 },
  hit: { height: 44, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: SURF.track, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stop: { position: 'absolute', top: 30, width: 2, height: 4, borderRadius: 1, backgroundColor: SURF.line },
  data: { position: 'absolute', top: 12, width: 3, height: 20, borderRadius: 2, backgroundColor: C.text },
  thumb: { position: 'absolute', top: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: C.text, borderWidth: 3 },
});
