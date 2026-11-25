import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { call } from '@/lib/mod';
import { addDays, Button, Chip, Field, haptic, Icon, myDay, Press, R, rupees, Sheet, SURF, t, undoable, useAspect } from '@/aspects/kit';
import { act, refresh, useTx, type TxDoc } from './data';
import type { Home } from './types';

// Amounts on big keys, in rupees as he would write them. Log a spend is the main use: the amount, a category (the one
// he uses most is already picked), Log. Two taps for most spends. What it was for and the day are optional, under the
// button. Undo takes it back out for a few seconds.

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

/** The digits being typed and what a key does to them. Seven digits at most: up to ₹99,99,999. */
export function useDigits() {
  const [digits, setDigits] = useState('');
  const press = (k: Key) => {
    haptic.tick();
    if (k === 'back') { setDigits((d) => d.slice(0, -1)); return; }
    setDigits((d) => {
      if ((k === '00' || k === '0') && !d) return d;
      const next = d + k;
      return next.length > 7 ? d : next;
    });
  };
  return { digits, setDigits, amount: Number(digits) || 0, press };
}

/** The amount, as large as it matters. */
export function AmountShown({ amount, what = 'Amount' }: { amount: number; what?: string }) {
  return (
    <View style={s.amount} accessible accessibilityLabel={amount ? `${what} ${rupees(amount)}` : `${what}, none yet`}>
      <Text style={[s.big, t.num, !amount && { color: C.faint }]} numberOfLines={1}>{amount ? rupees(amount) : '₹0'}</Text>
    </View>
  );
}

/** The number keys. */
export function AmountKeys({ onKey }: { onKey: (k: Key) => void }) {
  return (
    <View style={s.keys}>
      {KEYS.map((k) => (
        <Press key={k} label={k === 'back' ? 'Delete' : k === '00' ? 'Two zeros' : k} onPress={() => onKey(k)} feel="none" scale={0.94} wrap={s.keyWrap} style={s.key}>
          {k === 'back' ? <Icon name="left" size={20} color={C.textSoft} /> : <Text style={s.keyText}>{k}</Text>}
        </Press>
      ))}
    </View>
  );
}

/**
 * One amount on big keys in a sheet: a plan, a target, a put in. Quick amounts sit as chips over the keys; `extra`
 * goes under the button (remove, take out).
 */
export function AmountSheet({ open, onClose, title, sub, start, presets, done, withAmount = false, onDone, extra }: {
  open: boolean; onClose: () => void; title: string; sub?: string | null; start?: number | null;
  presets?: { label: string; amount: number }[]; done: string; withAmount?: boolean; onDone: (n: number) => void; extra?: ReactNode;
}) {
  const k = useDigits();
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) k.setDigits(start && start > 0 ? String(Math.round(start)) : '');
  }
  const go = () => { if (k.amount) onDone(k.amount); };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {sub ? <Text style={t.subhead}>{sub}</Text> : null}
      <AmountShown amount={k.amount} />
      {presets?.length ? (
        <View style={s.chips}>
          {presets.map((p) => <Chip key={p.label} label={p.label} selected={k.amount === p.amount} onPress={() => k.setDigits(String(Math.round(p.amount)))} />)}
        </View>
      ) : null}
      <AmountKeys onKey={k.press} />
      <Button label={withAmount && k.amount ? `${done} ${rupees(k.amount)}` : done} kind="accent" disabled={!k.amount} onPress={go} />
      {extra}
    </Sheet>
  );
}

/** Categories in the order he uses them this month, the rest after in their usual order. Bills stay out: they log themselves. */
export function catsByUse(home: Home) {
  const n = new Map<string, number>();
  for (const x of home.spend.recent) if (!x.bill) n.set(x.category, (n.get(x.category) ?? 0) + 1);
  return [...home.spend.cats].sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
}

export function SpendPad({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const k = useDigits();
  const [cat, setCat] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [busy, setBusy] = useState(false);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { k.setDigits(''); setCat(null); setNote(''); setDay('today'); setBusy(false); }
  }
  const cats = catsByUse(home);
  const pick = cat ?? cats[0]?.id ?? 'other';
  const pickName = cats.find((c) => c.id === pick)?.name ?? 'Other';
  const { amount } = k;
  const log = async () => {
    if (!amount || busy) return;
    setBusy(true);
    const merchant = note.trim().slice(0, 60);
    try {
      let id: string;
      if (day === 'today') {
        // the same route the one line log uses, so the PC files it against today's allowance and his default account
        const r = await call<{ item: TxDoc & { id: string } }>('/mod/money/log', { amount, merchant, category: pick, source: 'app' });
        id = r.item.id;
      } else {
        const r = await tx.put({ kind: 'out', amount, category: pick, merchant: merchant || null, at: `${addDays(myDay(), -1)}T06:30:00.000Z`, source: 'app' });
        id = r.id;
      }
      refresh();
      haptic.success();
      onClose();
      undoable(`${rupees(amount)} logged${merchant ? ` for ${merchant}` : ''}, ${pickName}`, () => void act(tx.remove(id), a.notice, "Couldn't undo that"));
    } catch (e) {
      a.notice(`Couldn't log that. ${(e as Error).message}`);
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log a spend">
      <AmountShown amount={amount} />
      <View style={s.chips}>
        {cats.map((c) => <Chip key={c.id} label={c.name} selected={c.id === pick} onPress={() => setCat(c.id)} />)}
      </View>
      <AmountKeys onKey={k.press} />
      <Button label={amount ? `Log ${rupees(amount)}` : 'Log'} kind="accent" busy={busy} disabled={!amount} onPress={() => void log()} />
      <Field label="What for" value={note} onChangeText={setNote} placeholder="Optional, like chai or the metro" maxLength={60} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.days}>
        <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
        <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
      </ScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  amount: { alignItems: 'center', justifyContent: 'center', minHeight: 72 },
  big: { fontFamily: F.semibold, fontSize: 56, lineHeight: 64, letterSpacing: -2, color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  keyWrap: { width: '33.333%', padding: 4 },
  key: { height: 52, borderRadius: R.row, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  keyText: { fontFamily: F.medium, fontSize: 24, lineHeight: 30, color: C.text },
  days: { gap: 8 },
});
