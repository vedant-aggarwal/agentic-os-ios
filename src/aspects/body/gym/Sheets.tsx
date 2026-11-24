import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, num, Segmented, Sheet, shortDay, Stepper, t, useAspect } from '@/aspects/kit';
import { agoDays, logWeight, quickLog, useHome, yesterday } from '../api';
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

/** A weigh in, starting from the last value so it is a couple of taps. */
export function WeighSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const home = useHome();
  const w = home.data?.proof.weight;
  return (
    <Sheet open={open} onClose={onClose} title="Weigh in">
      {open ? <WeighBody key={String(w?.now)} last={w?.now ?? null} date={w?.date ?? null} days={w?.days ?? null} onClose={onClose} /> : null}
    </Sheet>
  );
}
function WeighBody({ last, date, days, onClose }: { last: number | null; date: string | null; days: number | null; onClose: () => void }) {
  const a = useAspect();
  const [v, setV] = useState(last ?? 70);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await logWeight(v); a.notice(`${num(v)} kg saved`); onClose(); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <Text style={t.small}>{last != null && date ? `Last: ${num(last)} kg, ${shortDay(date)}, ${agoDays(days)}. Same time of day each week keeps it comparable.` : 'Same time of day each week keeps it comparable.'}</Text>
      <Stepper label="Weight" value={v} onChange={setV} step={0.1} min={30} max={300} format={(x) => `${num(x)} kg`} />
      <View style={u.row}>
        <Button label="Less 1 kg" kind="quiet" small onPress={() => setV(Math.round((v - 1) * 10) / 10)} wrap={u.flex} />
        <Button label="More 1 kg" kind="quiet" small onPress={() => setV(Math.round((v + 1) * 10) / 10)} wrap={u.flex} />
      </View>
      <Button label="Save" kind="accent" busy={busy} onPress={() => { void save(); }} />
    </>
  );
}
