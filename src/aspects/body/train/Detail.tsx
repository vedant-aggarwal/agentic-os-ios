import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '@/theme';
import { invalidate, useCollection, useGet } from '@/lib/mod';
import {
  Block, Button, Failed, Group, Item, Metric, Metrics, num, Screen, shortDay, Skeleton, Spark, t, Tag, undoable, useAspect,
} from '@/aspects/kit';
import { agoDays, B, goalOf, removeDoc, useGym, usePrev, useSession } from '../api';
import type { WorkoutDoc } from '../gym/workout';
import { useNav, type Detail } from '../nav';
import { muscleWords, s as u, volumeText } from '../parts';

// The screens one level down in Train: a session he did, one lift (how to do it and how it has gone), and his weight.

export function DetailScreens() {
  const nav = useNav();
  const d = nav.detail;
  const close = () => nav.openDetail(null);
  return (
    <>
      <SessionScreen id={d?.kind === 'session' ? d.id : null} onClose={close} />
      <ExerciseScreen ex={d?.kind === 'exercise' ? d.ex : null} onClose={close} />
      <WeightScreen open={d?.kind === 'weight'} onClose={close} />
    </>
  );
}
export type { Detail };

// ── a session ──
function SessionScreen({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useAspect();
  const [kept, setKept] = useState<string | null>(id);
  if (id && id !== kept) setKept(id);
  const read = useSession(kept);
  const d = read.data;
  const col = useCollection<WorkoutDoc>('body', 'workouts');
  const del = async () => {
    if (!d) return;
    const doc = col.items?.find((w) => w.id === d.id) ?? null;
    try {
      if (doc) await col.remove(d.id); else await removeDoc('workouts', d.id);
      invalidate(`${B}/`);
      onClose();
      if (doc) undoable(`${d.name} deleted`, async () => { await col.put(doc); invalidate(`${B}/`); });
    } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <Screen open={!!id} onClose={onClose} title={d?.name ?? 'Session'}>
      {!d && read.error ? <Failed message={read.error} onRetry={() => { void read.refresh(); }} /> : null}
      {!d && !read.error ? <Skeleton height={300} radius={22} /> : null}
      {d ? (
        <>
          <Text style={t.footnote}>{`${shortDay(d.date)}${d.started_at ? `, started ${new Date(d.started_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}` : ''}`}</Text>
          <Group pad>
            <Metrics>
              <Metric size="m" label="Time" value={d.minutes != null ? `${d.minutes}` : 'None'} unit={d.minutes != null ? 'min' : null} />
              <Metric size="m" label="Sets" value={String(d.sets)} />
              <Metric size="m" label="Volume" value={d.volume ? volumeText(d.volume) : 'None'} />
            </Metrics>
          </Group>
          {d.records.length ? (
            <Block title="Bests">
              <Group>{d.records.map((r, i) => <Item key={i} title={r.name} sub={r.was ? `Up from ${num(r.was.w ?? 0)} × ${r.was.r ?? 0}` : 'First logged'} right={<Text style={[t.headline, t.num, { color: a.color }]}>{`${num(r.set.w ?? 0)} × ${r.set.r ?? 0}`}</Text>} />)}</Group>
            </Block>
          ) : null}
          {d.items.length ? (
            <Block title="Exercises">
              <Group>{d.items.map((it) => (
                <Item key={it.ex} title={it.name} sub={it.sets.map((x) => (x.w != null ? `${num(x.w)} × ${x.r ?? 0}` : x.t != null ? `${x.t} s` : x.min != null ? `${x.min} min` : `${x.r ?? 0} reps`)).join(', ')}
                  right={it.sets.some((x) => x.pr) ? <Tag label="Best" tone="aspect" /> : undefined} lines={3} />
              ))}</Group>
            </Block>
          ) : <Text style={t.subhead}>A timed session, no sets.</Text>}
          <Button label="Delete session" kind="danger" onPress={() => { void del(); }} />
        </>
      ) : null}
    </Screen>
  );
}

// ── one lift ──
function ExerciseScreen({ ex, onClose }: { ex: string | null; onClose: () => void }) {
  const [kept, setKept] = useState<string | null>(ex);
  if (ex && ex !== kept) setKept(ex);
  const prev = usePrev(kept);
  const gym = useGym(!!ex);
  const lib = useGet<{ item: { img?: string | null; images?: string[] }; img: string }>(kept ? `${B}/library/${encodeURIComponent(kept)}` : null);
  const p = prev.data;
  const lift = gym.data?.lifts.find((l) => l.ex === kept) ?? null;
  const img = lib.data?.item?.img ?? lib.data?.item?.images?.[0] ?? null;
  return (
    <Screen open={!!ex} onClose={onClose} title={p?.name ?? 'Exercise'}>
      {!p && prev.error ? <Failed message={prev.error} onRetry={() => { void prev.refresh(); }} /> : null}
      {!p && !prev.error ? <Skeleton height={300} radius={22} /> : null}
      {p ? (
        <>
          {img && lib.data ? (
            <View style={s.hero}><Image source={{ uri: `${lib.data.img}/${img}` }} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} /></View>
          ) : null}
          <Text style={t.subhead}>{[muscleWords(p.p), p.s.length ? `helped by ${muscleWords(p.s).toLowerCase()}` : null, p.equip].filter(Boolean).join(', ')}</Text>
          {lift ? (
            <Group pad>
              <Metrics>
                <Metric size="m" label="Best set" value={lift.set.w != null ? `${num(lift.set.w)} × ${lift.set.r ?? 0}` : lift.set.t != null ? `${lift.set.t} s` : `${lift.set.r ?? 0}`} />
                {lift.est ? <Metric size="m" label="Estimated max" value={num(lift.est)} unit="kg" /> : null}
                <Metric size="m" label="Sessions" value={String(lift.sessions)} />
              </Metrics>
              {lift.trend.length > 1 ? <LiftTrend values={lift.trend} /> : null}
            </Group>
          ) : null}
          {p.prev ? (
            <Block title={`Last time, ${shortDay(p.prev.date)}`}>
              <Group>{p.prev.sets.map((x, i) => <Item key={i} title={`Set ${i + 1}`} value={x.w != null ? `${num(x.w)} kg × ${x.r ?? 0}` : x.t != null ? `${x.t} s` : `${x.r ?? 0} reps`} />)}</Group>
            </Block>
          ) : null}
          {p.how.length ? (
            <Block title="How to do it">
              <Group>{p.how.map((h, i) => <Item key={i} title={h} lines={4} left={<Text style={[t.footnote, t.num, s.n]}>{i + 1}</Text>} />)}</Group>
              {p.cue ? <Text style={t.footnote}>{p.cue}</Text> : null}
            </Block>
          ) : null}
          {p.swaps.length ? (
            <Block title="Works the same muscles">
              <Group>{p.swaps.slice(0, 5).map((x) => <Item key={x.ex} title={x.name} sub={x.equip} />)}</Group>
            </Block>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
function LiftTrend({ values }: { values: number[] }) {
  const { width } = useAspect();
  return (
    <View style={s.trend}>
      <Text style={t.footnote}>Estimated max over the last sessions</Text>
      <Spark values={values} width={width - 64} height={72} minSpan={10} />
    </View>
  );
}

// ── weight ──
function WeightScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNav();
  const gym = useGym(open);
  const { width } = useAspect();
  const w = gym.data?.weight;
  const goal = goalOf(w ?? null);
  return (
    <Screen open={open} onClose={onClose} title="Body weight">
      {!w && gym.error ? <Failed message={gym.error} onRetry={() => { void gym.refresh(); }} /> : null}
      {!w && !gym.error ? <Skeleton height={260} radius={22} /> : null}
      {w ? (
        <>
          <Metric size="xl" value={w.now != null ? num(w.now) : 'None'} unit={w.now != null ? 'kg' : null}
            sub={w.date ? `Weighed ${agoDays(w.days)}, ${shortDay(w.date)}${goal ? `. Goal ${num(goal)} kg` : ''}` : 'Not weighed yet'} />
          {w.trail.length > 1 ? (
            <Group pad>
              <Spark values={w.trail.map((x) => x.v)} width={width - 64} height={140} minSpan={5} goal={goal ?? undefined} />
              <View style={u.between}>
                <Text style={[t.micro, t.num]}>{shortDay(w.trail[0].date)}</Text>
                {goal ? <Text style={[t.micro, t.num]}>{`Dashed line: goal ${num(goal)} kg`}</Text> : null}
                <Text style={[t.micro, t.num]}>{shortDay(w.trail.at(-1)!.date)}</Text>
              </View>
            </Group>
          ) : null}
          <Button label="Weigh in" kind="accent" onPress={() => nav.openSheet({ kind: 'weigh' })} />
          {w.trail.length ? (
            <Block title="Weigh ins">
              <Group>{[...w.trail].reverse().slice(0, 12).map((x, i, all) => {
                const next = all[i + 1];
                const d = next ? Math.round((x.v - next.v) * 10) / 10 : null;
                return <Item key={x.date} title={`${num(x.v)} kg`} sub={shortDay(x.date)} value={d ? `${d > 0 ? 'Up' : 'Down'} ${num(Math.abs(d))}` : undefined} />;
              })}</Group>
            </Block>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { height: 200, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  n: { width: 16, color: C.muted },
  trend: { gap: 8, marginTop: 16 },
});
