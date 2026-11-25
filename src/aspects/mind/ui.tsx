import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Bar, CheckRing, Glyph, SURF, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';

// Small pieces the Mind screens share. Icons are SF Symbols on the iPhone with these paths drawn elsewhere.

export const G = {
  book: ['book', 'M12 6.5C10.5 5.3 8.4 4.75 4 4.75v13c4.4 0 6.5.55 8 1.75 1.5-1.2 3.6-1.75 8-1.75v-13c-4.4 0-6.5.55-8 1.75zM12 6.5v13'],
  course: ['play.rectangle', 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM10 9.25v5.5l4.5-2.75z'],
  stop: ['stop.fill', 'M7 7h10v10H7z'],
  open: ['arrow.up.right', 'M8 16L16 8M9.5 8H16v6.5'],
  again: ['arrow.clockwise', 'M19 12a7 7 0 1 1-2.05-4.95M19 4.5V9h-4.5'],
  wave: ['waveform', 'M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3'],
  bulb: ['lightbulb', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  trash: ['trash', 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  play: ['play.fill', 'M8 5.5v13l10.5-6.5z'],
  video: ['video', 'M3.5 7.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zM15.5 10.5l5-3v9l-5-3'],
  dice: ['dice', 'M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01'],
  talk: ['bubble.left.and.bubble.right', 'M3.5 5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9l-3 3v-3H4.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM18 9h1.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H18v3l-3-3h-3.5'],
  phone: ['phone', 'M5 4h3l1.5 4-2 1.5a11 11 0 0 0 7 7l1.5-2 4 1.5v3a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z'],
} as const;

export function Sym({ name, size = 20, color = C.text, filled }: { name: keyof typeof G; size?: number; color?: string; filled?: boolean }) {
  const [sf, d] = G[name];
  return <Glyph sf={sf} d={d} size={size} color={color} filled={filled} />;
}

/** The last value that wasn't null, so a screen keeps its content while it slides away. */
export function useLast<T>(v: T | null): T | null {
  const [last, setLast] = useState<T | null>(v);
  if (v != null && v !== last) setLast(v);
  return v ?? last;
}

/** Now, ticking every `ms` while `on` (a timer on screen). */
export function useNow(ms: number, on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms, on]);
  return now;
}

/** Calls `fn` every `ms` while `on`. */
export function usePoll(fn: () => void, ms: number, on: boolean) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms, on]);
}

/** "1 h 10 min", "35 min". */
export function minutes(m: number) {
  const r = Math.round(m);
  const h = Math.floor(r / 60), mm = r % 60;
  return h ? (mm ? `${h} h ${mm} min` : `${h} h`) : `${mm} min`;
}

/** A lesson's length as the course lists it ("8:50", "1:05:00", "12 min") in plain words: "9 min", "1 h 5 min". */
export function durWords(d: string | null) {
  if (!d) return null;
  const p = d.trim().split(':').map(Number);
  if (p.length < 2 || p.some((x) => !Number.isFinite(x))) return d;
  const secs = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  return minutes(Math.max(1, Math.round(secs / 60)));
}

/** A take's length in plain words: "66 seconds", "2 minutes". Takes stop at two minutes, so seconds read best. */
export function secsWords(s: number) {
  const r = Math.round(s);
  return r === 120 ? '2 minutes' : r === 1 ? '1 second' : `${r} seconds`;
}

/** A step in a wait the page is honest about: done, happening now, or still to come. */
export function Steps({ items }: { items: { label: string; state: 'done' | 'now' | 'next' | 'failed'; note?: string | null }[] }) {
  const a = useAspect();
  return (
    <View style={s.steps}>
      {items.map((it) => (
        <View key={it.label} style={s.step} accessibilityLabel={`${it.label}, ${it.state === 'done' ? 'done' : it.state === 'now' ? 'in progress' : it.state === 'failed' ? 'failed' : 'waiting'}`}>
          <View style={s.stepMark}>
            {it.state === 'done' ? <CheckRing done size={20} /> : it.state === 'now' ? <ActivityIndicator size="small" color={a.color} />
              : <View style={[s.dot, it.state === 'failed' && { borderColor: C.danger }]} />}
          </View>
          <View style={s.stepText}>
            <Text style={[t.callout, it.state === 'next' && { color: C.faint }, it.state === 'failed' && { color: C.danger }]}>{it.label}</Text>
            {it.note ? <Text style={t.footnote}>{it.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** One scored dimension: its name, the number, a bar and the line that explains it. */
export function ScoreRow({ name, value, note, before }: { name: string; value: number | null; note?: string | null; before?: number | null }) {
  const a = useAspect();
  const delta = value != null && before != null ? value - before : null;
  return (
    <View style={s.score} accessibilityLabel={`${name} ${value ?? 'not scored'}${delta ? `, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}` : ''}`}>
      <View style={s.scoreHead}>
        <Text style={[t.callout, s.flex]}>{name}</Text>
        {delta ? <Text style={[t.footnote, t.num, delta > 0 && { color: a.color }]}>{delta > 0 ? `Up ${delta}` : `Down ${-delta}`}</Text> : null}
        <Text style={[t.headline, t.num, s.scoreNum]}>{value ?? 'None yet'}</Text>
      </View>
      <Bar progress={(value ?? 0) / 100} height={6} color={a.color} />
      {note ? <Text style={t.footnote}>{note}</Text> : null}
    </View>
  );
}

/** A line he said, set apart. */
export function Quote({ children }: { children: ReactNode }) {
  const a = useAspect();
  return (
    <View style={[s.quote, { borderLeftColor: a.color }]}>
      <Text style={[t.headline, s.quoteText]} selectable>{children}</Text>
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={t.footnote}>{children}</Text>;
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  steps: { gap: 16 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepMark: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: SURF.line },
  score: { gap: 8 },
  scoreHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  scoreNum: { minWidth: 32, textAlign: 'right' },
  quote: { borderLeftWidth: 2, paddingLeft: 12, paddingVertical: 2 },
  quoteText: { color: C.text, lineHeight: 26 },
});
