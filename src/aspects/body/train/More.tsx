import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { call, invalidate, useGet } from '@/lib/mod';
import { Block, Button, Group, Item, Keypad, myDay, num, shortDay, Tag, t, undoable, useAspect } from '@/aspects/kit';
import { agoDays, B } from '../api';
import { muscleWords } from '../parts';

// Two parts of a gym app the server does not serve yet: tape measurements (what the scale misses) and the rotation
// (the order sessions come in). Each reads its own route and stays hidden until that route answers, so a phone talking
// to today's server simply does not show them.

type Measure = { date: string; waist: number | null; chest: number | null; arm: number | null };
type Measures = { items: Measure[] };
type Program = { split: string; next: string | null; days: { key: string; name: string; muscles: string[]; last: string | null; days: number | null }[] };

const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const PARTS: { key: 'waist' | 'chest' | 'arm'; name: string }[] = [{ key: 'waist', name: 'Waist' }, { key: 'chest', name: 'Chest' }, { key: 'arm', name: 'Arm' }];

/** Waist, chest and arm, a few times a month: the change the scale misses. */
export function Measurements({ active }: { active: boolean }) {
  const a = useAspect();
  const read = useGet<Measures>(active ? `${B}/measures` : null);
  const [open, setOpen] = useState(false);
  if (!read.data) return null; // not served yet, or still loading: nothing to show
  const items = read.data.items;
  const last = items.at(-1) ?? null;
  const first = items[0] ?? null;
  const save = async (v: Record<string, number | null>) => {
    setOpen(false);
    const day = myDay();
    const before = items.find((x) => x.date === day) ?? null;
    try {
      await call(`${B}/measures`, { date: day, waist: v.waist, chest: v.chest, arm: v.arm }, 'POST');
      invalidate(`${B}/measures`);
      undoable('Measurements saved', async () => {
        if (before) await call(`${B}/measures`, before, 'POST'); else await call(`${B}/measures/${day}`, {}, 'DELETE');
        invalidate(`${B}/measures`);
      });
    } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <Block title="Measurements" sub={last ? `Last taken ${shortDay(last.date)}` : null} action={items.length ? 'Log' : undefined} onAction={() => setOpen(true)}>
      {items.length ? (
        <Group>
          {PARTS.map((p) => {
            const now = last?.[p.key] ?? null;
            const was = first && first !== last ? first[p.key] : null;
            const d = now != null && was != null ? Math.round((now - was) * 10) / 10 : null;
            return (
              <Item key={p.key} title={p.name} value={now != null ? `${num(now)} cm` : 'Not taken'}
                sub={d ? `${d > 0 ? 'Up' : 'Down'} ${num(Math.abs(d))} cm since ${shortDay(first!.date)}` : d === 0 ? `Same as ${shortDay(first!.date)}` : null} />
            );
          })}
        </Group>
      ) : (
        <Group pad>
          <Text style={t.callout}>No measurements yet</Text>
          <Text style={t.footnote}>Waist, chest and arm with a tape, every two weeks or so. They show fat loss and growth the scale can hide.</Text>
          <View style={s.start}><Button label="Take measurements" kind="soft" small onPress={() => setOpen(true)} /></View>
        </Group>
      )}
      <Keypad open={open} onClose={() => setOpen(false)} title="Measurements" sub="In centimetres, relaxed, at the same spot each time." done="Save"
        fields={PARTS.map((p) => ({ key: p.key, label: p.name, unit: 'cm', value: last?.[p.key] ?? null, step: 0.5, decimals: 1, min: 10, max: 200 }))}
        onDone={(v) => { void save(v); }} />
    </Block>
  );
}

/** The split in order, which one comes next and when each was last done. */
export function Rotation({ active }: { active: boolean }) {
  const read = useGet<Program>(active ? `${B}/program` : null);
  const p = read.data;
  if (!p || !p.days.length) return null;
  return (
    <Block title="Rotation" sub="The order sessions come in. Tired muscles can move a day.">
      <Group>
        {p.days.map((d, i) => (
          <Item key={d.key} title={d.name} sub={muscleWords(d.muscles) || null}
            left={<Text style={[t.footnote, t.num, s.n]}>{i + 1}</Text>}
            value={d.key === p.next ? null : d.last ? cap(agoDays(d.days)) : 'Not yet'}
            right={d.key === p.next ? <Tag label="Next" tone="aspect" /> : undefined} />
        ))}
      </Group>
    </Block>
  );
}

const s = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  n: { width: 16 },
});
