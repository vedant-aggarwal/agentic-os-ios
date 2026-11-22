import { useState } from 'react';
import { Text, View } from 'react-native';
import { invalidate, upload } from '@/lib/mod';
import { Button, Card, Chip, dayOf, Field, Section, Sheet, Skeleton, Stepper, t, useAspect } from '@/aspects/kit';
import { addMeal, B, estimate, putDoc, removeDoc, setTargets, useDiet, useGym, type Estimate, type MealRow, type Recent } from '../api';
import { canPick, pickPhoto } from '../pick';
import { s as u } from '../ui';

/** Log a meal in one or two taps: a recent meal, a typed line estimated on the PC, or a photo read in the background. */
export function LogMeal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const diet = useDiet();
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
  const done = (msg: string) => { a.notice(msg); onClose(); };
  const again = async (r: Recent) => {
    setBusy(r.name);
    try { await addMeal({ name: r.name, kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, items: r.items }); done(`${r.name} logged`); }
    catch (e) { a.notice((e as Error).message); setBusy(null); }
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
    try { await addMeal({ name: est.name ?? text.trim(), kcal: est.kcal, protein: est.protein, carbs: est.carbs ?? null, fat: est.fat ?? null, items: est.items }); done(`${est.name ?? text.trim()} logged`); }
    catch (e) { a.notice((e as Error).message); setBusy(null); }
  };
  const photo = async () => {
    try {
      const p = await pickPhoto();
      if (!p) return;
      setBusy('photo');
      await upload(`${B}/meal-photo`, p.uri, p.type);
      invalidate(`${B}/`);
      done('Reading the photo. It waits in Diet when it is ready.');
    } catch (e) { a.notice((e as Error).message); setBusy(null); }
  };
  return (
    <>
      <Section title="Again">
        {recent == null ? (error ? <Text style={t.small}>{error}</Text> : <Skeleton height={36} />) : recent.length ? (
          <View style={u.wrap}>
            {recent.map((r) => <Chip key={r.name} label={busy === r.name ? 'Logging' : `${r.name}, ${r.protein} g`} onPress={() => { void again(r); }} />)}
          </View>
        ) : <Text style={t.small}>Meals you log show here for one tap next time.</Text>}
      </Section>
      <Field label="What did you eat" value={text} onChangeText={(v) => { setText(v); setEst(null); }} placeholder="2 roti, dal and a bowl of curd" onSubmit={() => { void check(); }} />
      {est ? (
        <Card style={u.gap8}>
          {(est.items ?? []).map((it, i) => (
            <View key={i} style={u.between}><Text numberOfLines={1} style={[t.body, u.flex]}>{it.name}</Text><Text style={[t.label, t.num]}>{`${it.protein} g, ${it.kcal} kcal`}</Text></View>
          ))}
          <View style={u.between}><Text style={t.strong}>Total</Text><Text style={[t.strong, t.num]}>{`${est.protein} g protein, ${est.kcal} kcal`}</Text></View>
          {est.unknown?.length ? <Text style={t.caption}>{`Not in the food list, counted as zero: ${est.unknown.join(', ')}. Change the numbers after logging.`}</Text> : null}
          <Button label="Log it" kind="accent" busy={busy === 'log'} onPress={() => { void logText(); }} />
        </Card>
      ) : (
        <Button label="Estimate" kind="soft" busy={busy === 'estimate'} disabled={!text.trim()} onPress={() => { void check(); }} />
      )}
      {canPick ? <Button label="Send a photo instead" kind="quiet" busy={busy === 'photo'} onPress={() => { void photo(); }} /> : null}
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
      await putDoc('meals', meal.id, { ...meal, date: dayOf(meal.at), name: name.trim() || meal.name, protein, kcal, estimate: false, unknown: false });
      a.notice('Saved'); onClose();
    } catch (e) { a.notice((e as Error).message); setBusy(false); }
  };
  const drop = async () => {
    try { await removeDoc('meals', meal.id); a.notice(`${meal.name} removed`); onClose(); } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <>
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
  const diet = useDiet();
  const gym = useGym();
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
      <Stepper label="Training days" value={train} onChange={setTrain} step={1} min={1} max={7} format={(v) => `${v} days a week`} />
      <Button label="Save" kind="accent" busy={busy} onPress={() => { void save(); }} />
    </>
  );
}
