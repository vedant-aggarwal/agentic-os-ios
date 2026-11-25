import { useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Keypad, myDay, num, Segmented, Sheet, shortDay, Stepper, undoable, useAspect } from '@/aspects/kit';
import { agoDays, logWeight, quickLog, removeDoc, useHome, yesterday } from '../api';
import { s as u } from '../ui';

const KINDS = [{ key: 'boxing', label: 'Boxing' }, { key: 'run', label: 'Run' }, { key: 'walk', label: 'Walk' }, { key: 'cycle', label: 'Cycle' }];

/** Log boxing, a run, a walk or a ride: the length and the day. */
export function QuickSheet({ open, quick, onClose }: { open: boolean; quick: string; onClose: () => void }) {
  const home = useHome();
  return (
    <Sheet open={open} onClose={onClose} title="Log other training">
      {open ? <QuickBody key={quick} quick={quick} last={home.data?.gym.quick ?? []} onClose={onClose} /> : null}
    </Sheet>
  );
}
function QuickBody({ quick, last, onClose }: { quick: string; last: { kind: string; min: number }[]; onClose: () => void }) {
  const a = useAspect();
  const [kind, setKind] = useState(quick);
  const minOf = (k: string) => last.find((q) => q.kind === k)?.min ?? 30;
  const [min, setMin] = useState(() => minOf(quick));
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await quickLog(kind, min, day === 'today' ? undefined : yesterday());
      a.notice(`${KINDS.find((k) => k.key === kind)?.label}, ${min} min logged`);
      onClose();
    } catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <View style={u.wrap}>
        {KINDS.map((k) => <Chip key={k.key} label={k.label} selected={kind === k.key} onPress={() => { setKind(k.key); setMin(minOf(k.key)); }} />)}
      </View>
      <Stepper label="Minutes" value={min} onChange={setMin} step={5} min={5} max={300} format={(v) => `${v} min`} />
      <Segmented options={[{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }]} value={day} onChange={setDay} />
      <Button label="Log it" kind="accent" busy={busy} onPress={() => { void save(); }} />
    </>
  );
}

/** A weigh in on big keys, starting from the last value: usually one or two taps on the steps, then Save. */
export function WeighSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const home = useHome();
  const w = home.data?.proof.weight;
  const last = w?.now ?? null;
  return (
    <Keypad open={open} onClose={onClose} title="Weigh in"
      sub={last != null && w?.date ? `Last ${num(last)} kg, ${shortDay(w.date)}, ${agoDays(w.days)}. The same time of day keeps it comparable.` : 'The same time of day keeps it comparable.'}
      fields={[{ key: 'kg', label: 'Weight', unit: 'kg', value: last ?? 70, step: 0.1, decimals: 1, min: 30, max: 300 }]}
      presets={last != null ? [{ label: `${num(last - 0.5)}`, values: { kg: Math.round((last - 0.5) * 10) / 10 } }, { label: `${num(last + 0.5)}`, values: { kg: Math.round((last + 0.5) * 10) / 10 } }] : undefined}
      onDone={async (v) => {
        const kg = v.kg;
        if (kg == null) return;
        try {
          await logWeight(kg);
          onClose();
          undoable(`${num(kg)} kg saved`, () => { if (last != null && w?.date === myDay()) void logWeight(last); else void removeDoc('readings', `weight:${myDay()}`); });
        } catch (e) { a.notice((e as Error).message); }
      }} />
  );
}
