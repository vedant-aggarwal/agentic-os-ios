import { use, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { AspectContext } from '../context';
import { Button, Chip, Icon, Press } from './controls';
import { Sheet } from './Sheet';
import { haptic, R, SURF, t, tint } from './tokens';

// Numbers without the phone's keyboard: big keys, the value as large as it matters, steps of the right size on
// either side. One field (a weigh-in, an amount) or a few in order (a set's weight, then its reps): "Next" walks
// through them and the last key saves. The first key typed replaces the value shown, as a calculator does.

export type KeyField = { key: string; label: string; value: number | null; step?: number; decimals?: number; min?: number; max?: number; unit?: string };

const fmt = (v: number | null, decimals: number) => (v == null ? '' : decimals > 0 ? String(Math.round(v * 10 ** decimals) / 10 ** decimals) : String(Math.round(v)));

export function Keypad({ open, onClose, title, sub, fields, presets, onDone, done = 'Save', extra }: {
  open: boolean; onClose: () => void; title: string; sub?: string | null; fields: KeyField[];
  /** One tap fills every field: last time's set, a common amount. */
  presets?: { label: string; values: Record<string, number> }[];
  onDone: (values: Record<string, number | null>) => void; done?: string;
  /** Anything under the keys: a second action ("Mark done without weight" is not one; "Remove set" is). */
  extra?: React.ReactNode;
}) {
  const tone = use(AspectContext)?.color ?? C.text;
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState(0);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) {
      setTexts(Object.fromEntries(fields.map((f) => [f.key, fmt(f.value, f.decimals ?? 0)])));
      setFresh(Object.fromEntries(fields.map((f) => [f.key, true])));
      setFocus(0);
    }
  }
  const f = fields[Math.min(focus, fields.length - 1)];
  if (!f) return null;
  const dec = f.decimals ?? 0;
  const cur = texts[f.key] ?? '';
  const valueOf = (k: KeyField) => { const v = parseFloat(texts[k.key] ?? ''); return Number.isFinite(v) ? v : null; };
  const clamp = (k: KeyField, v: number) => Math.min(k.max ?? Infinity, Math.max(k.min ?? 0, v));
  const setText = (k: string, v: string) => { setTexts((x) => ({ ...x, [k]: v })); setFresh((x) => ({ ...x, [k]: false })); };
  const press = (key: string) => {
    haptic.tick();
    const start = fresh[f.key] ? '' : cur;
    if (key === 'back') { setText(f.key, start.slice(0, -1)); return; }
    if (key === '.') { if (dec === 0 || start.includes('.')) return; setText(f.key, (start || '0') + '.'); return; }
    const next = start === '0' ? key : start + key;
    const [, frac] = next.split('.');
    if (frac && frac.length > dec) return;
    if (next.replace('.', '').length > 6) return;
    setText(f.key, next);
  };
  const stepBy = (dir: 1 | -1) => {
    const step = f.step ?? 1;
    const base = valueOf(f) ?? f.value ?? 0;
    const v = clamp(f, Math.round((base + dir * step) * 1000) / 1000);
    haptic.tick();
    setText(f.key, fmt(v, dec));
  };
  const last = focus >= fields.length - 1;
  const finish = () => {
    if (!last) { setFocus(focus + 1); return; }
    onDone(Object.fromEntries(fields.map((k) => { const v = valueOf(k); return [k.key, v == null ? null : clamp(k, v)]; })));
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {sub ? <Text style={[t.footnote, s.sub]}>{sub}</Text> : null}
      <View style={s.fields}>
        {fields.map((k, i) => {
          const on = i === focus;
          const text = texts[k.key] ?? '';
          return (
            <Press key={k.key} label={`${k.label}, ${text || 'empty'}`} onPress={() => setFocus(i)} feel="tick" wrap={s.fieldWrap}
              style={[s.field, on && { borderColor: tint(tone, 0.7), backgroundColor: tint(tone, 0.08) }]}>
              <Text style={[t.footnote, on && { color: tone }]}>{k.label}</Text>
              <View style={s.fieldLine}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[s.big, t.num, !text && { color: C.faint }, on && fresh[k.key] && text ? s.selected : null]}>{text || '0'}</Text>
                {k.unit ? <Text style={[t.headline, s.unit]}>{k.unit}</Text> : null}
              </View>
            </Press>
          );
        })}
      </View>
      <View style={s.steps}>
        <Press label={`Less ${f.label}`} onPress={() => stepBy(-1)} feel="none" wrap={s.stepWrap} style={s.step}>
          <Icon name="minus" size={16} color={C.textSoft} />
          <Text style={[t.callout, t.num]}>{fmt(f.step ?? 1, 2)}</Text>
        </Press>
        <Press label={`More ${f.label}`} onPress={() => stepBy(1)} feel="none" wrap={s.stepWrap} style={s.step}>
          <Icon name="plus" size={16} color={C.textSoft} />
          <Text style={[t.callout, t.num]}>{fmt(f.step ?? 1, 2)}</Text>
        </Press>
      </View>
      {presets?.length ? (
        <View style={s.presets}>
          {presets.map((p) => (
            <Chip key={p.label} label={p.label} onPress={() => {
              setTexts((x) => ({ ...x, ...Object.fromEntries(fields.map((k) => [k.key, p.values[k.key] != null ? fmt(p.values[k.key], k.decimals ?? 0) : x[k.key] ?? ''])) }));
              setFresh((x) => ({ ...x, ...Object.fromEntries(fields.map((k) => [k.key, false])) }));
            }} />
          ))}
        </View>
      ) : null}
      <View style={s.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => (
          k === '.' && dec === 0 ? <View key={k} style={s.keyWrap} /> : (
            <Press key={k} label={k === 'back' ? 'Delete' : k === '.' ? 'Point' : k} onPress={() => press(k)} feel="none" scale={0.94} wrap={s.keyWrap} style={s.key}>
              {k === 'back' ? <Icon name="left" size={20} color={C.textSoft} /> : <Text style={s.keyText}>{k}</Text>}
            </Press>
          )
        ))}
      </View>
      <Button label={last ? done : 'Next'} kind="accent" onPress={finish} />
      {extra}
    </Sheet>
  );
}

const s = StyleSheet.create({
  sub: { marginTop: -8 },
  fields: { flexDirection: 'row', gap: 8 },
  fieldWrap: { flex: 1 },
  field: {
    borderRadius: R.tile, borderCurve: 'continuous', padding: 12, gap: 2, backgroundColor: SURF.row,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  fieldLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  big: { fontFamily: F.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: C.text, flexShrink: 1 },
  selected: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 6 },
  unit: { color: C.muted },
  steps: { flexDirection: 'row', gap: 8 },
  stepWrap: { flex: 1 },
  step: {
    height: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: SURF.card,
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  keyWrap: { width: '33.333%', padding: 4 },
  key: { height: 52, borderRadius: R.row, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  keyText: { fontFamily: F.medium, fontSize: 24, lineHeight: 30, color: C.text },
});
