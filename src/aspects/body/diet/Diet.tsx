import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '@/theme';
import { fileSource } from '@/lib/mod';
import {
  Bar, Bars, Block, Button, clock, dayLabel, Failed, Group, haptic, Head, Icon, Item, Lead, myDay, Press, R, Ring, Skeleton, SURF, t, tint, undoable,
  useAspect, weekLetter,
} from '@/aspects/kit';
import { addMeal, dismissPhoto, filePath, logWater, removeDoc, useDiet, usePoll, type Diet, type MealPhoto, type MealRow, type Recent } from '../api';
import { useNav } from '../nav';
import { s as u } from '../parts';
import { useSeen } from '../ui';
import { EditMeal } from './Log';

const SLOT: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', 'pre-workout': 'Before training', 'post-workout': 'After training' };

/**
 * Diet: protein first. The lead says how much is left today and logs a meal; meals he eats often are one tap away
 * under it; the day's meals read like a diary; water, the week and the targets sit below. Tap a day in the week to
 * see that day.
 */
export function DietTab({ active }: { active: boolean }) {
  const [day, setDay] = useState<string | null>(null);
  const read = useDiet(day ?? undefined, useSeen(active));
  const [editing, setEditing] = useState<MealRow | null>(null);
  const { data, error, refresh } = read;
  usePoll(refresh, active && !!data?.photos.some((p) => p.status === 'reading'), 3000);
  if (!data) {
    return error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : (
      <View style={u.gap16}><Skeleton height={248} radius={28} /><Skeleton height={104} radius={18} /><Skeleton height={220} radius={22} /></View>
    );
  }
  const today = data.today ?? myDay();
  const isToday = !day || day === today;
  return (
    <>
      {!isToday ? (
        <Head title={dayLabel(day!, today)} sub="A past day. Its meals can still be changed." action="Back to today" onAction={() => setDay(null)} />
      ) : null}
      <Fuel d={data} isToday={isToday} />
      {isToday && data.recent.length ? <Again recent={data.recent} /> : null}
      {isToday && data.photos.length ? <Photos photos={data.photos} /> : null}
      <Meals d={data} isToday={isToday} onEdit={setEditing} />
      <Water d={data} isToday={isToday} />
      <Week d={data} day={day ?? today} onDay={(x) => setDay(x === today ? null : x)} />
      <Targets d={data} />
      <EditMeal meal={editing} onClose={() => setEditing(null)} />
    </>
  );
}

// ── protein, then calories, carbs and fat ──
function Fuel({ d, isToday }: { d: Diet; isToday: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const p = d.totals.protein, pt = d.targets.protein.v;
  const k = d.totals.kcal, kt = d.targets.kcal.v;
  const left = Math.max(0, pt - p);
  const over = k > kt * 1.1;
  return (
    <Lead>
      <View style={[u.row, s.fuelTop]}>
        <Ring size={128} progress={pt ? Math.min(1, p / pt) : 0} stroke={11} color={a.color}>
          <Text style={[t.large, t.num]}>{p}</Text>
          <Text style={[t.micro, t.num]}>{`of ${pt} g`}</Text>
        </Ring>
        <View style={[u.flex, u.gap4]}>
          <Text style={[t.footnote, { color: a.color }]}>Protein</Text>
          <Text style={[t.title3, t.num]}>{left ? `${left} g to go` : 'Target met'}</Text>
          <Text style={[t.footnote, t.num]}>
            {d.totals.n ? `${d.totals.n} ${d.totals.n === 1 ? 'meal' : 'meals'} logged${isToday ? ' today' : ''}` : isToday ? 'Nothing logged yet today' : 'Nothing logged this day'}
          </Text>
        </View>
      </View>
      <View style={u.gap8}>
        <View style={u.between}>
          <Text style={t.subhead}>Calories</Text>
          <Text style={[t.subhead, t.num]}>{`${k.toLocaleString('en-IN')} of ${kt.toLocaleString('en-IN')} kcal`}</Text>
        </View>
        <Bar progress={kt ? Math.min(1, k / kt) : 0} height={6} color={over ? C.muted : a.color} />
        <View style={u.row}>
          <Text style={[t.footnote, t.num]}>{`Carbs ${d.totals.carbs} g`}</Text>
          <Text style={[t.footnote, t.num]}>{`Fat ${d.totals.fat} g`}</Text>
        </View>
      </View>
      {isToday ? <Button label="Log a meal" kind="accent" onPress={() => nav.openSheet({ kind: 'meal' })} /> : null}
    </Lead>
  );
}

// ── meals he has before, one tap each ──
function Again({ recent }: { recent: Recent[] }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const log = async (r: Recent) => {
    if (busy) return;
    setBusy(r.name);
    try {
      const m = await addMeal({ name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, items: r.items });
      haptic.success();
      undoable(`${r.name} logged`, async () => { await removeDoc('meals', m.item.id); });
    } catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  return (
    <Block title="Log again" sub="One tap adds it to today.">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.againRow} style={s.bleed}>
        {recent.slice(0, 8).map((r) => (
          <Press key={r.name} label={`Log ${r.name}, ${r.protein} grams protein`} onPress={() => { void log(r); }} style={[s.again, busy === r.name && s.dim]} scale={0.96}>
            <Text numberOfLines={2} style={[t.callout, s.againName]}>{r.name}</Text>
            <View style={u.between}>
              <Text style={[t.footnote, t.num]}>{`${r.protein} g, ${r.kcal} kcal`}</Text>
              <View style={[s.plus, { backgroundColor: tint(a.color, 0.16) }]}><Icon name="plus" size={14} color={a.color} /></View>
            </View>
          </Press>
        ))}
      </ScrollView>
    </Block>
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
      const m = await addMeal({ name: e.name, kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat, items: e.items, photo: p.id });
      undoable(`${e.name} logged`, async () => { await removeDoc('meals', m.item.id); });
    } catch (err) { a.notice((err as Error).message); }
    setBusy(null);
  };
  return (
    <Block title="Photos">
      <Group inset={76}>
        {photos.map((p) => (
          <View key={p.id} style={s.photoRow}>
            <Image source={fileSource(filePath(p.id, true))} style={s.photo} contentFit="cover" accessibilityLabel="Meal photo" />
            <View style={[u.flex, u.gap4]}>
              {p.status === 'reading' ? (
                <>
                  <Text style={t.callout}>Reading the photo</Text>
                  <Text style={t.footnote}>Usually under a minute. It waits here if you leave.</Text>
                </>
              ) : p.status === 'done' && p.estimate ? (
                <>
                  <Text numberOfLines={2} style={t.callout}>{p.estimate.name}</Text>
                  <Text style={[t.footnote, t.num]}>{`${p.estimate.protein} g protein, ${p.estimate.kcal} kcal`}</Text>
                  {p.estimate.note ? <Text numberOfLines={3} style={t.footnote}>{p.estimate.note}</Text> : null}
                  <View style={[u.row, s.photoActs]}>
                    <Button label="Log it" kind="accent" small busy={busy === p.id} onPress={() => { void log(p); }} />
                    <Button label="Not this" kind="quiet" small onPress={() => { void dismissPhoto(p.id); }} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={t.callout}>Couldn&apos;t read it</Text>
                  <Text style={t.footnote}>{p.error ?? 'Try another photo, or type it.'}</Text>
                  <View style={[u.row, s.photoActs]}><Button label="Dismiss" kind="quiet" small onPress={() => { void dismissPhoto(p.id); }} /></View>
                </>
              )}
            </View>
          </View>
        ))}
      </Group>
    </Block>
  );
}

// ── the day's meals, as a diary ──
function Meals({ d, isToday, onEdit }: { d: Diet; isToday: boolean; onEdit: (m: MealRow) => void }) {
  const nav = useNav();
  const meals = [...d.meals].sort((x, y) => x.at.localeCompare(y.at));
  if (!meals.length) {
    return (
      <Block title="Meals">
        <Group pad>
          <Text style={t.callout}>{isToday ? 'Nothing logged today' : 'Nothing logged this day'}</Text>
          <Text style={t.footnote}>{isToday ? 'Tap a meal above, type what you ate, or send a photo.' : 'Meals logged on a day show up under it.'}</Text>
          {isToday ? <View style={s.emptyAct}><Button label="Log a meal" kind="soft" small onPress={() => nav.openSheet({ kind: 'meal' })} /></View> : null}
        </Group>
      </Block>
    );
  }
  return (
    <Block title="Meals" sub={isToday ? 'Tap one to change it.' : null}>
      <Group inset={72}>
        {meals.map((m) => (
          <Item key={m.id} title={m.name} label={`${m.name}, ${m.protein} grams protein. Change`} onPress={() => onEdit(m)}
            sub={[m.slot && SLOT[m.slot] ? SLOT[m.slot] : null, m.unknown ? 'numbers unknown' : m.estimate ? 'estimated' : null].filter(Boolean).join(', ') || null}
            left={<Text style={[t.footnote, t.num, s.time]}>{clock(m.at)}</Text>}
            right={(
              <View style={[u.row, s.mealRight]}>
                {m.photo ? <Image source={fileSource(filePath(m.photo, true))} style={s.mealPhoto} contentFit="cover" /> : null}
                <View style={s.mealNums}>
                  <Text style={[t.headline, t.num]}>{`${m.protein} g`}</Text>
                  <Text style={[t.footnote, t.num]}>{`${m.kcal} kcal`}</Text>
                </View>
              </View>
            )} />
        ))}
      </Group>
    </Block>
  );
}

// ── water: a glass per tap ──
function Water({ d, isToday }: { d: Diet; isToday: boolean }) {
  const a = useAspect();
  const [n, setN] = useState<number | null>(null);
  const have = n ?? d.water;
  const target = d.targets.water.v;
  const count = Math.max(target, have);
  const set = async (v: number, undo = true) => {
    const prev = have;
    const next = Math.max(0, Math.min(30, v));
    setN(next);
    try {
      await logWater(next);
      if (undo && next > prev) undoable(`Glass ${next} added`, async () => { setN(prev); await logWater(prev); });
    } catch (e) { setN(null); a.notice((e as Error).message); }
  };
  return (
    <Block title="Water" right={<Text style={[t.subhead, t.num]}>{`${have} of ${target} glasses`}</Text>}>
      <Group pad>
        <View style={s.glasses}>
          {Array.from({ length: count }, (_, i) => {
            const full = i < have;
            const glass = <View style={[s.glass, { borderColor: full ? a.color : SURF.edge, backgroundColor: full ? a.color : 'transparent' }]} />;
            return isToday ? (
              <Press key={i} label={full ? `Glass ${i + 1}, drunk. Remove` : `Add glass ${i + 1}`} feel="tick" onPress={() => { void set(full ? i : i + 1, !full); }}
                hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }} wrap={u.flex} style={s.glassHit}>{glass}</Press>
            ) : <View key={i} style={[u.flex, s.glassHit]}>{glass}</View>;
          })}
        </View>
        {isToday ? (
          <View style={[u.row, s.waterActs]}>
            <Button label="Add a glass" kind="soft" small icon={<Icon name="plus" size={16} color={a.color} />} onPress={() => { void set(have + 1); }} />
            {have > 0 ? <Button label="Remove one" kind="quiet" small onPress={() => { void set(have - 1, false); }} /> : null}
          </View>
        ) : null}
      </Group>
    </Block>
  );
}

// ── the week: protein against the target, no red ──
function Week({ d, day, onDay }: { d: Diet; day: string; onDay: (d: string) => void }) {
  const a = useAspect();
  const target = d.targets.protein.v;
  const logged = d.week.filter((x) => x.meals > 0);
  const met = logged.filter((x) => x.protein >= target).length;
  const avg = logged.length ? Math.round(logged.reduce((n, x) => n + x.protein, 0) / logged.length) : null;
  const sel = d.week.findIndex((x) => x.date === day);
  return (
    <Block title="This week" sub={logged.length ? `Target met on ${met} of ${logged.length} logged ${logged.length === 1 ? 'day' : 'days'}${avg != null ? `, ${avg} g a day on average` : ''}.` : 'Logged days fill in here.'}>
      <Group pad>
        <Bars values={d.week.map((x) => x.protein)} labels={d.week.map((x) => weekLetter(x.date))} on={sel >= 0 ? sel : undefined} max={Math.max(target, ...d.week.map((x) => x.protein))} height={96} />
        <View style={s.weekNums}>
          {d.week.map((x) => (
            <Press key={x.date} label={`${dayLabel(x.date, myDay())}, ${x.protein} grams. Show this day`} onPress={() => onDay(x.date)} feel="tick" hitSlop={{ top: 8, bottom: 8 }} wrap={u.flex} style={s.weekNum}>
              <Text style={[t.footnote, t.num, x.date === day && { color: a.color }]}>{x.meals ? x.protein : 'None'}</Text>
            </Press>
          ))}
        </View>
        <Text style={t.micro}>{`Grams of protein each day. Tap a day to see it. Target ${target} g.`}</Text>
      </Group>
    </Block>
  );
}

function Targets({ d }: { d: Diet }) {
  const nav = useNav();
  return (
    <Block title="Targets" action="Change" onAction={() => nav.openSheet({ kind: 'targets' })}>
      <Group>
        <Item title="Protein" sub={d.targets.protein.from} value={`${d.targets.protein.v} g`} />
        <Item title="Calories" sub={d.targets.kcal.from} value={`${d.targets.kcal.v.toLocaleString('en-IN')} kcal`} />
        <Item title="Water" sub={d.targets.water.from} value={`${d.targets.water.v} glasses`} />
      </Group>
    </Block>
  );
}

const s = StyleSheet.create({
  fuelTop: { gap: 20 },
  dim: { opacity: 0.5 },
  bleed: { marginHorizontal: -16 },
  againRow: { paddingHorizontal: 16, gap: 8 },
  again: {
    width: 156, minHeight: 96, padding: 12, gap: 8, justifyContent: 'space-between', borderRadius: R.tile, borderCurve: 'continuous',
    backgroundColor: SURF.group, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  againName: { minHeight: 44 },
  plus: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  photoRow: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'flex-start' },
  photo: { width: 52, height: 52, borderRadius: 12, backgroundColor: SURF.raised },
  photoActs: { marginTop: 4, gap: 8 },
  emptyAct: { alignSelf: 'flex-start' },
  time: { width: 44, color: C.muted },
  mealRight: { gap: 10 },
  mealPhoto: { width: 36, height: 36, borderRadius: 9, backgroundColor: SURF.raised },
  mealNums: { alignItems: 'flex-end', minWidth: 56 },
  glasses: { flexDirection: 'row', gap: 4 },
  glassHit: { height: 40, alignItems: 'center', justifyContent: 'center' },
  glass: { width: '100%', maxWidth: 26, height: 34, borderRadius: 7, borderWidth: 1.5, borderCurve: 'continuous' },
  waterActs: { gap: 8 },
  weekNums: { flexDirection: 'row', marginTop: -8 },
  weekNum: { height: 32, alignItems: 'center', justifyContent: 'center' },
});
