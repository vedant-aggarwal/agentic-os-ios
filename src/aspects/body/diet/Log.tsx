import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { fileSource, invalidate, upload } from '@/lib/mod';
import { Block, Button, Field, Group, Icon, Item, Keypad, myDay, Sheet, Skeleton, Stepper, t, tint, undoable, useAspect } from '@/aspects/kit';
import { addMeal, B, estimate, filePath, putDoc, removeDoc, setTargets, useDiet, useGym, type Estimate, type MealRow, type Recent } from '../api';
import { canPick, pickPhoto } from '../pick';
import { s as u, useSeen } from '../ui';

/** Log a meal in one or two taps: a recent meal, a typed line estimated on the PC, or a photo read in the background. */
export function LogMeal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const diet = useDiet(undefined, useSeen(open));
  return (
    <Sheet open={open} onClose={onClose} title="Log a meal">
      {open ? <LogBody recent={diet.data?.recent ?? null} error={diet.error} onClose={onClose} /> : null}
    </Sheet>
  );
}

function LogBody({ recent, error, onClose }: { recent: Recent[] | null; error: string | null; onClose: () => void }) {
  const a = useAspect();
  const [text, setText] = useState('');
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [keys, setKeys] = useState(false);
  // every way in ends the same: the sheet closes and Undo takes the meal back out for a few seconds
  const logged = (name: string, id: string) => {
    onClose();
    undoable(`${name} logged`, async () => { await removeDoc('meals', id); });
  };
  const again = async (r: Recent) => {
    setBusy(r.name);
    try {
      const m = await addMeal({ name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, items: r.items });
      logged(r.name, m.item.id);
    } catch (e) { a.notice((e as Error).message); setBusy(null); }
  };
  const check = async () => {
    if (!text.trim()) return;
    setBusy('estimate');
    try { setEst(await estimate(text.trim())); } catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  const logText = async () => {
    if (!est) return;
    setBusy('log');
    const name = est.name ?? text.trim();
    try {
      const m = await addMeal({ name, kcal: est.kcal, protein: est.protein, carbs: est.carbs ?? null, fat: est.fat ?? null, items: est.items });
      logged(name, m.item.id);
    } catch (e) { a.notice((e as Error).message); setBusy(null); }
  };
  const logNumbers = async (v: Record<string, number | null>) => {
    const name = text.trim() || 'Meal';
    setKeys(false);
    try {
      const m = await addMeal({ name, protein: v.protein ?? 0, kcal: v.kcal ?? 0 });
      logged(name, m.item.id);
    } catch (e) { a.notice((e as Error).message); }
  };
  const photo = async () => {
    try {
      const p = await pickPhoto();
      if (!p) return;
      setBusy('photo');
      await upload(`${B}/meal-photo`, p.uri, p.type);
      invalidate(`${B}/`);
      a.notice('Reading the photo. It waits in Diet when it is ready.');
      onClose();
    } catch (e) { a.notice((e as Error).message); setBusy(null); }
  };
  return (
    <>
      {recent == null ? (error ? <Text style={t.footnote}>{error}</Text> : <Skeleton height={156} radius={22} />) : recent.length ? (
        <Block title="Again" sub="One tap logs it.">
          <Group>
            {recent.slice(0, 5).map((r) => (
              <Item key={r.name} title={r.name} sub={`${r.protein} g protein, ${r.kcal} kcal`} label={`Log ${r.name}`} onPress={() => { void again(r); }}
                right={busy === r.name ? <ActivityIndicator color={a.color} /> : <View style={[st.plus, { backgroundColor: tint(a.color, 0.16) }]}><Icon name="plus" size={16} color={a.color} /></View>} />
            ))}
          </Group>
        </Block>
      ) : <Text style={t.footnote}>Meals you log show here, one tap each next time.</Text>}
      <Block title="Something else">
        <Field label="What did you eat" value={text} onChangeText={(v) => { setText(v); setEst(null); }} placeholder="2 roti, dal and a bowl of curd" onSubmit={() => { void check(); }} />
        {est ? (
          <Group>
            {(est.items ?? []).map((it, i) => <Item key={i} title={it.name} sub={it.portion ?? null} value={`${it.protein} g, ${it.kcal} kcal`} />)}
            <Item title="Total" value={`${est.protein} g protein, ${est.kcal} kcal`} titleStyle={st.total} />
          </Group>
        ) : null}
        {est?.unknown?.length ? <Text style={t.footnote}>{`Not in the food list, counted as zero: ${est.unknown.join(', ')}. Change the numbers after logging.`}</Text> : null}
        {est ? <Button label="Log it" kind="accent" busy={busy === 'log'} onPress={() => { void logText(); }} />
          : <Button label="Estimate" kind="soft" busy={busy === 'estimate'} disabled={!text.trim()} onPress={() => { void check(); }} />}
        <View style={st.ways}>
          {canPick ? <Button label="Send a photo" kind="quiet" small icon={<Icon name="camera" size={16} />} busy={busy === 'photo'} onPress={() => { void photo(); }} wrap={st.way} /> : null}
          <Button label="Enter numbers" kind="quiet" small onPress={() => setKeys(true)} wrap={st.way} />
        </View>
      </Block>
      <Keypad open={keys} onClose={() => setKeys(false)} title={text.trim() || 'Enter numbers'} sub="From a label or a menu. Name it above first if you like." done="Log it"
        fields={[{ key: 'protein', label: 'Protein', unit: 'g', value: null, step: 5, max: 300 }, { key: 'kcal', label: 'Calories', unit: 'kcal', value: null, step: 50, max: 5000 }]}
        onDone={(v) => { void logNumbers(v); }} />
    </>
  );
}

/** Change or remove a logged meal. */
export function EditMeal({ meal, onClose }: { meal: MealRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!meal} onClose={onClose} title="Change meal">
      {meal ? <EditBody key={meal.id} meal={meal} onClose={onClose} /> : null}
    </Sheet>
  );
}
function EditBody({ meal, onClose }: { meal: MealRow; onClose: () => void }) {
  const a = useAspect();
  const [name, setName] = useState(meal.name);
  const [protein, setProtein] = useState(meal.protein);
  const [kcal, setKcal] = useState(meal.kcal);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await putDoc('meals', meal.id, { ...meal, date: myDay(meal.at), name: name.trim() || meal.name, protein, kcal, estimate: false, unknown: false });
      a.notice('Saved'); onClose();
    } catch (e) { a.notice((e as Error).message); setBusy(false); }
  };
  const drop = async () => {
    try { await removeDoc('meals', meal.id); a.notice(`${meal.name} removed`); onClose(); } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <>
      {/* the photo this meal was logged with (a photo sent from the app, or `agentos body log-meal --photo`) */}
      {meal.photo ? <Image source={fileSource(filePath(meal.photo))} style={[u.thumb, { width: '100%', height: 200 }]} contentFit="cover" accessibilityLabel={`Photo of ${meal.name}`} /> : null}
      <Field label="Name" value={name} onChangeText={setName} />
      <Stepper label="Protein" value={protein} onChange={setProtein} step={1} min={0} max={300} format={(v) => `${v} g protein`} />
      <Stepper label="Calories" value={kcal} onChange={setKcal} step={10} min={0} max={5000} format={(v) => `${v} kcal`} />
      <Button label="Save" kind="accent" busy={busy} onPress={() => { void save(); }} />
      <Button label="Remove meal" kind="danger" onPress={() => { void drop(); }} />
    </>
  );
}

/** The day's targets, each saying it was set by you once changed. */
export function TargetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const seen = useSeen(open);
  const diet = useDiet(undefined, seen);
  const gym = useGym(seen);
  const d = diet.data;
  return (
    <Sheet open={open} onClose={onClose} title="Targets">
      {open && d ? <TargetsBody key={`${d.targets.protein.v}-${d.targets.kcal.v}`} p={d.targets.protein.v} k={d.targets.kcal.v} w={d.targets.water.v} days={gym.data?.week.target ?? 5} onClose={onClose} />
        : open ? <Skeleton height={240} radius={24} /> : null}
    </Sheet>
  );
}
function TargetsBody({ p, k, w, days, onClose }: { p: number; k: number; w: number; days: number; onClose: () => void }) {
  const a = useAspect();
  const [protein, setProtein] = useState(p);
  const [kcal, setKcal] = useState(k);
  const [water, setWater] = useState(w);
  const [train, setTrain] = useState(days);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await setTargets({ protein, kcal, water, days: train }); a.notice('Targets saved'); onClose(); }
    catch (e) { a.notice((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <Stepper label="Protein" value={protein} onChange={setProtein} step={5} min={20} max={400} format={(v) => `${v} g protein`} />
      <Stepper label="Calories" value={kcal} onChange={setKcal} step={50} min={800} max={6000} format={(v) => `${v} kcal`} />
      <Stepper label="Water" value={water} onChange={setWater} step={1} min={1} max={30} format={(v) => `${v} glasses`} />
      <Stepper label="Training days" value={train} onChange={setTrain} step={1} min={1} max={7} format={(v) => `${v} training days a week`} />
      <Button label="Save" kind="accent" busy={busy} onPress={() => { void save(); }} />
    </>
  );
}

const st = StyleSheet.create({
  plus: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  total: { fontFamily: 'Geist_600SemiBold' },
  ways: { flexDirection: 'row', gap: 8 },
  way: { flex: 1 },
});
