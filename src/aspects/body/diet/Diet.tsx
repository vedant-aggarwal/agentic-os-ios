import { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '@/theme';
import { fileSource } from '@/lib/mod';
import {
  Bar, Bars, Button, Card, clock, dayLabel, Empty, Failed, haptic, Icon, IconButton, Press, Ring, Row, Screen, Section, Skeleton, SP, t, today, useAspect, weekLetter,
} from '@/aspects/kit';
import { addMeal, dismissPhoto, filePath, logWater, useDiet, usePoll, type Diet, type MealPhoto, type MealRow } from '../api';
import { useNav } from '../nav';
import { List, s as u } from '../ui';
import { EditMeal } from './Log';

const SLOT: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', 'pre-workout': 'Before training', 'post-workout': 'After training' };

export function DietScreen({ open, onClose, title }: { open: boolean; onClose: () => void; title: string }) {
  const [day, setDay] = useState<string | null>(null);
  const read = useDiet(day ?? undefined);
  const nav = useNav();
  const [editing, setEditing] = useState<MealRow | null>(null);
  const { data, error, refresh } = read;
  usePoll(refresh, open && !!data?.photos.some((p) => p.status === 'reading'), 3000);
  const isToday = !day || day === today();
  return (
    <>
      <Screen open={open} onClose={onClose} title={isToday ? title : dayLabel(day!)}
        right={<IconButton label="Log a meal" size={36} onPress={() => nav.openSheet({ kind: 'meal' })}><Icon name="plus" size={18} /></IconButton>}>
        {!data && error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : null}
        {!data && !error ? <View style={u.gap16}><Skeleton height={220} radius={24} /><Skeleton height={120} radius={24} /><Skeleton height={160} radius={24} /></View> : null}
        {data ? (
          <>
            <Totals d={data} isToday={isToday} />
            {data.photos.length && isToday ? <Photos photos={data.photos} /> : null}
            <Meals d={data} isToday={isToday} onEdit={setEditing} />
            <Week d={data} day={day ?? data.today} onDay={(x) => setDay(x === data.today ? null : x)} />
            <Targets d={data} />
          </>
        ) : null}
      </Screen>
      <EditMeal meal={editing} onClose={() => setEditing(null)} />
    </>
  );
}

// ── protein first, then calories and water ──
function Totals({ d, isToday }: { d: Diet; isToday: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const p = d.totals.protein, pt = d.targets.protein.v;
  const k = d.totals.kcal, kt = d.targets.kcal.v;
  return (
    <Card style={u.gap16}>
      <View style={[u.row, { gap: SP[16] }]}>
        <Ring size={112} progress={pt ? p / pt : 0} stroke={10}>
          <Text style={[t.title2, t.num]}>{p}</Text>
          <Text style={t.caption}>{`of ${pt} g`}</Text>
        </Ring>
        <View style={[u.flex, u.gap8]}>
          <Text style={t.label}>Protein</Text>
          <Text style={t.body}>{p >= pt ? 'Target met.' : `${pt - p} g to go${isToday ? ' today' : ''}.`}</Text>
          {isToday ? <Button label="Log a meal" kind="accent" small onPress={() => nav.openSheet({ kind: 'meal' })} /> : null}
        </View>
      </View>
      <View style={u.gap8}>
        <View style={u.between}>
          <Text style={t.label}>Calories</Text>
          <Text style={[t.label, t.num]}>{`${k} of ${kt} kcal`}</Text>
        </View>
        <Bar progress={kt ? k / kt : 0} height={6} color={k > kt * 1.1 ? C.muted : a.color} />
      </View>
      {isToday ? <Water d={d} /> : null}
    </Card>
  );
}

function Water({ d }: { d: Diet }) {
  const a = useAspect();
  const [n, setN] = useState<number | null>(null);
  const have = n ?? d.water;
  const target = d.targets.water.v;
  const set = async (v: number) => {
    const next = Math.max(0, Math.min(30, v));
    setN(next);
    try { await logWater(next); } catch (e) { setN(null); a.notice((e as Error).message); }
  };
  return (
    <View style={u.gap8}>
      <View style={u.between}>
        <Text style={t.label}>Water</Text>
        <Text style={[t.label, t.num]}>{`${have} of ${target} glasses`}</Text>
      </View>
      <View style={[u.wrap, { gap: SP[4] }]}>
        {Array.from({ length: Math.max(target, have) }, (_, i) => (
          <Press key={i} label={i < have ? `Glass ${i + 1}, drunk. Remove` : `Add glass ${i + 1}`} feel="tick" onPress={() => { void set(i < have ? i : i + 1); }} hitSlop={2}
            style={{ width: 24, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: i < have ? a.color : 'rgba(255,255,255,0.18)', backgroundColor: i < have ? a.color : 'transparent' }}>
            <View />
          </Press>
        ))}
      </View>
      <View style={u.row}>
        <Button label="Add a glass" kind="soft" small onPress={() => { haptic.light(); void set(have + 1); }} />
        {have > 0 ? <Button label="Remove one" kind="quiet" small onPress={() => { void set(have - 1); }} /> : null}
      </View>
    </View>
  );
}

// ── photos being read ──
function Photos({ photos }: { photos: MealPhoto[] }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const log = async (p: MealPhoto) => {
    if (!p.estimate) return;
    setBusy(p.id);
    try {
      const e = p.estimate;
      await addMeal({ name: e.name, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, items: e.items, photo: p.id });
      a.notice(`${e.name} logged`);
    } catch (err) { a.notice((err as Error).message); }
    setBusy(null);
  };
  return (
    <Section title="Photos">
      {photos.map((p) => (
        <Card key={p.id} style={u.row}>
          <Image source={fileSource(filePath(p.id, true))} style={[u.thumb, { width: 64, height: 64 }]} contentFit="cover" accessibilityLabel="Meal photo" />
          <View style={[u.flex, u.gap4]}>
            {p.status === 'reading' ? (
              <>
                <Text style={t.strong}>Reading the photo</Text>
                <Text style={t.small}>Usually under a minute. You can leave; it waits here.</Text>
              </>
            ) : p.status === 'done' && p.estimate ? (
              <>
                <Text numberOfLines={2} style={t.strong}>{p.estimate.name}</Text>
                <Text style={[t.small, t.num]}>{`${p.estimate.protein} g protein, ${p.estimate.kcal} kcal`}</Text>
                {p.estimate.note ? <Text style={t.caption}>{p.estimate.note}</Text> : null}
                <View style={u.row}>
                  <Button label="Log it" kind="accent" small busy={busy === p.id} onPress={() => { void log(p); }} />
                  <Button label="Not this" kind="quiet" small onPress={() => { void dismissPhoto(p.id); }} />
                </View>
              </>
            ) : (
              <>
                <Text style={t.strong}>Couldn&apos;t read it</Text>
                <Text style={t.small}>{p.error ?? 'Try another photo, or type it.'}</Text>
                <Button label="Dismiss" kind="quiet" small onPress={() => { void dismissPhoto(p.id); }} />
              </>
            )}
          </View>
        </Card>
      ))}
    </Section>
  );
}

// ── the day's meals ──
function Meals({ d, isToday, onEdit }: { d: Diet; isToday: boolean; onEdit: (m: MealRow) => void }) {
  const nav = useNav();
  if (!d.meals.length) {
    return (
      <Section title="Meals">
        <Card>
          <Empty title={isToday ? 'Nothing logged today' : 'Nothing logged this day'} body="Pick a recent meal, type what you ate, or send a photo."
            action={isToday ? 'Log a meal' : undefined} onAction={isToday ? () => nav.openSheet({ kind: 'meal' }) : undefined} />
        </Card>
      </Section>
    );
  }
  return (
    <Section title="Meals">
      <List>
        {d.meals.map((m) => (
          <Row key={m.id} title={m.name} label={`${m.name}, ${m.protein} grams protein. Change`}
            sub={`${clock(m.at)}${m.slot && SLOT[m.slot] ? `, ${SLOT[m.slot]}` : ''}${m.unknown ? ', numbers unknown' : m.estimate ? ', estimated' : ''}`}
            left={m.photo ? <Image source={fileSource(filePath(m.photo, true))} style={[u.thumb, { width: 40, height: 40 }]} contentFit="cover" /> : undefined}
            right={<View style={{ alignItems: 'flex-end' }}><Text style={[t.strong, t.num]}>{`${m.protein} g`}</Text><Text style={[t.caption, t.num]}>{`${m.kcal} kcal`}</Text></View>}
            onPress={() => onEdit(m)} />
        ))}
      </List>
    </Section>
  );
}

// ── the week: protein bars against the target, no red ──
function Week({ d, day, onDay }: { d: Diet; day: string; onDay: (d: string) => void }) {
  const a = useAspect();
  const target = d.targets.protein.v;
  const met = d.week.filter((x) => x.protein >= target).length;
  const logged = d.week.filter((x) => x.meals > 0).length;
  const sel = d.week.findIndex((x) => x.date === day);
  return (
    <Section title="This week">
      <Card style={u.gap12}>
        <Bars values={d.week.map((x) => x.protein)} labels={d.week.map((x) => weekLetter(x.date))} on={sel >= 0 ? sel : undefined} max={Math.max(target, ...d.week.map((x) => x.protein))} height={88} />
        <View style={u.between}>
          {d.week.map((x) => (
            <Press key={x.date} label={`${dayLabel(x.date)}, ${x.protein} grams`} onPress={() => onDay(x.date)} feel="tick" wrap={{ flex: 1 }} style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[t.caption, t.num, x.date === day && { color: a.color }]}>{x.protein}</Text>
            </Press>
          ))}
        </View>
        <Text style={t.small}>{logged ? `Target met on ${met} of ${logged} logged days. Tap a day to see it.` : 'Logged days fill in here.'}</Text>
      </Card>
    </Section>
  );
}

function Targets({ d }: { d: Diet }) {
  const nav = useNav();
  const rows: [string, string, string][] = [
    ['Protein', `${d.targets.protein.v} g`, d.targets.protein.from], ['Calories', `${d.targets.kcal.v} kcal`, d.targets.kcal.from], ['Water', `${d.targets.water.v} glasses`, d.targets.water.from],
  ];
  return (
    <Section title="Targets" action="Change" onAction={() => nav.openSheet({ kind: 'targets' })}>
      <List>{rows.map(([k, v, from]) => <Row key={k} title={k} sub={from} right={v} />)}</List>
    </Section>
  );
}
