import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip, Glyph, IconButton, Icon, Press, SURF, t, tint, useAspect } from '@/aspects/kit';
import { C, F } from '@/theme';
import type { CleanNow } from './data';
import { G } from './words';

/** One of Soul's own icons. */
export const Gl = ({ k, size = 20, color = C.text }: { k: keyof typeof G; size?: number; color?: string }) => (
  <Glyph sf={G[k][0] as never} d={G[k][1]} size={size} color={color} />
);

/** Chips that wrap. Single choice by default (tap again to clear); `multi` keeps a set. */
export function Choice({ options, value, onChange, multi = false, max }: {
  options: readonly string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean; max?: number;
}) {
  return (
    <View style={s.wrap}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <Chip key={o} label={o} selected={on} onPress={() => {
            if (!multi) return onChange(on ? [] : [o]);
            if (on) return onChange(value.filter((x) => x !== o));
            if (max && value.length >= max) return onChange([...value.slice(1), o]);
            onChange([...value, o]);
          }} />
        );
      })}
    </View>
  );
}

type Strip = Extract<CleanNow, { setup: true }>['strip'];
/**
 * Days as dots, a week to a column, oldest on the left. A kept day fills with the colour; a slip day is an open
 * ring in grey (never red); before the start is a faint dot; today is ringed in the colour.
 */
export function DayDots({ strip, color, size = 12, gap = 4 }: { strip: Strip; color: string; size?: number; gap?: number }) {
  const cols: Strip[] = [];
  for (let i = 0; i < strip.length; i += 7) cols.push(strip.slice(i, i + 7));
  const kept = strip.filter((d) => d.s === 'kept').length, slips = strip.filter((d) => d.s === 'slip').length;
  return (
    <View accessible accessibilityLabel={`Last ${strip.length} days: ${kept} kept, ${slips} with a slip`} style={[s.cols, { gap }]}>
      {cols.map((col, i) => (
        <View key={i} style={{ gap }}>
          {col.map((d) => (
            <View key={d.d} style={[{ width: size, height: size, borderRadius: size / 2 },
              d.s === 'kept' ? { backgroundColor: color }
                : d.s === 'slip' ? { borderWidth: 1.5, borderColor: C.muted }
                  : d.s === 'today' ? { borderWidth: 1.5, borderColor: color, backgroundColor: tint(color, 0.25) }
                    : { backgroundColor: SURF.track }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Twenty-four bars, one per hour of the day: urges in a soft tint, slips stacked in full colour on top. */
export function Hours({ counts, slips, color, height = 64 }: { counts: number[]; slips: number[]; color: string; height?: number }) {
  const top = Math.max(1, ...counts);
  const peak = counts.indexOf(Math.max(...counts));
  return (
    <View accessible accessibilityLabel={`Urges by hour. Most at ${String(peak).padStart(2, '0')}:00.`} style={{ gap: 8 }}>
      <View style={[s.hours, { height }]}>
        {counts.map((n, h) => {
          const all = (n / top) * height, sl = ((slips[h] ?? 0) / top) * height;
          return (
            <View key={h} style={s.hourCol}>
              <View style={{ height: Math.max(all, n ? 3 : 0), borderRadius: 3, backgroundColor: tint(color, 0.35), justifyContent: 'flex-end', overflow: 'hidden' }}>
                {sl > 0 ? <View style={{ height: sl, backgroundColor: color }} /> : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={s.hourLabels}>
        {['00', '06', '12', '18', '24'].map((l) => <Text key={l} style={t.caption}>{l}</Text>)}
      </View>
    </View>
  );
}

/** An editable list of his own lines (reasons, things that help): each row removable, one field to add. */
export function Lines({ items, onChange, placeholder, max = 12, limit = 400, suggestions = [] }: {
  items: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number; limit?: number; suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => {
    const x = v.trim().slice(0, limit);
    if (!x || items.includes(x) || items.length >= max) return;
    onChange([...items, x]); setDraft('');
  };
  const left = suggestions.filter((x) => !items.includes(x)).slice(0, 8);
  return (
    <View style={{ gap: 8 }}>
      {items.map((x) => (
        <View key={x} style={s.line}>
          <Text style={[t.body, s.lineText]}>{x}</Text>
          <IconButton label={`Remove ${x}`} size={32} plain onPress={() => onChange(items.filter((y) => y !== x))}><Icon name="close" size={14} color={C.muted} /></IconButton>
        </View>
      ))}
      {items.length < max ? <AddLine value={draft} onChange={setDraft} onAdd={() => add(draft)} placeholder={placeholder} limit={limit} /> : null}
      {left.length ? (
        <View style={s.wrap}>
          {left.map((x) => <Chip key={x} label={x} icon={<Icon name="plus" size={12} color={C.muted} />} onPress={() => add(x)} />)}
        </View>
      ) : null}
    </View>
  );
}

function AddLine({ value, onChange, onAdd, placeholder, limit }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string; limit: number }) {
  const { color } = useAspect();
  return (
    <View style={s.add}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.faint} maxLength={limit}
        selectionColor={color} keyboardAppearance="dark" returnKeyType="done" onSubmitEditing={onAdd} accessibilityLabel={placeholder}
        style={s.addInput} />
      <Press label="Add" onPress={onAdd} disabled={!value.trim()} style={[s.addBtn, { backgroundColor: tint(color, 0.16) }]}>
        <Icon name="plus" size={16} color={color} />
      </Press>
    </View>
  );
}

/** A small label and value, for a row of numbers. */
export function Fig({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={s.fig}>
      <Text style={[t.heading, t.num, color ? { color } : null]}>{value}</Text>
      <Text style={t.caption}>{label}</Text>
    </View>
  );
}

/**
 * Covers the page while the app is in the app switcher or the background, so a glance at the switcher shows
 * nothing. The web preview never leaves the foreground, so it never shows there.
 */
export function PrivacyCover() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (st) => setHidden(st !== 'active'));
    return () => sub.remove();
  }, []);
  if (!hidden) return null;
  return <View style={[StyleSheet.absoluteFill, s.cover]} pointerEvents="none" />;
}

export const pct = (k: { kept: number; of: number }) => (k.of ? `${Math.round((k.kept / k.of) * 100)}%` : '–');
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cols: { flexDirection: 'row' },
  hours: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  hourCol: { flex: 1, justifyContent: 'flex-end' },
  hourLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, minHeight: 48, borderRadius: 16, backgroundColor: SURF.row },
  lineText: { flex: 1, paddingVertical: 12 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: 16, paddingLeft: 16, paddingRight: 6, backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line },
  addInput: { flex: 1, minHeight: 44, color: C.text, fontFamily: F.regular, fontSize: 16, outlineWidth: 0 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  fig: { flex: 1, gap: 2 },
  cover: { backgroundColor: C.scene },
});
