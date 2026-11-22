import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { C } from '@/theme';
import { api } from '@/lib/api';
import { useCollection } from '@/lib/mod';
import {
  Button, Card, CheckRing, Chip, Empty, Failed, Field, haptic, Icon, IconButton, num, Press, Row, Screen, Section, Sheet, shortDay, Skeleton, SP, Stepper, SURF, t, timer, useAspect,
} from '@/aspects/kit';
import { B, useLibrary, usePrev, useSession, type LibItem, type Prev, type SetRow } from '../api';
import { List, s as u, useNow } from '../ui';
import { allSets, doneSets, itemFrom, restFor, setText, startSet, type WItem, type WorkoutDoc } from './workout';

type Edit = { i: number; j: number } | null;
/** The clock time `s` seconds from now. */
const later = (s: number) => Date.now() + s * 1000;

/** The live workout: every set prefilled from last time, one tap marks it done and starts the rest timer. */
export function LiveWorkout({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const col = useCollection<WorkoutDoc>('body', 'workouts');
  const live = (col.items ?? []).find((w) => w.status === 'live') ?? null;
  const [finished, setFinished] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const now = useNow(rest ? 250 : 1000, open);
  const left = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  const rang = useRef(false);

  useEffect(() => {
    if (!rest) { rang.current = false; return; }
    if (left <= 0 && !rang.current) { rang.current = true; haptic.success(); setRest(null); }
  }, [rest, left]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setRest(null); setFinished(null); } }

  const save = async (next: WorkoutDoc) => {
    try { await col.put(next); } catch (e) { a.notice(`Not saved: ${(e as Error).message}`); }
  };
  const setItems = (items: WItem[]) => { if (live) void save({ ...live, items }); };
  const changeSet = (i: number, j: number, change: Partial<SetRow>) => {
    if (!live) return;
    setItems(live.items.map((it, x) => (x !== i ? it : { ...it, sets: it.sets.map((s, y) => (y === j ? { ...s, ...change } : s)) })));
  };
  const toggle = (i: number, j: number) => {
    if (!live) return;
    const it = live.items[i]; const s = it.sets[j];
    const on = !s.done;
    changeSet(i, j, { done: on, at: on ? new Date().toISOString() : null });
    const last = i === live.items.length - 1 && j === it.sets.length - 1;
    const r = restFor(it);
    if (on && !last && r > 0) setRest({ until: later(r), total: r });
    if (!on) setRest(null);
  };
  const finish = async () => {
    if (!live) return;
    setEnding(false);
    const id = live.id;
    await save({ ...live, status: 'done', ended_at: new Date().toISOString() });
    setRest(null);
    setFinished(id);
    haptic.success();
  };
  const discard = async () => {
    if (!live) return;
    setEnding(false);
    try {
      if (live.id.startsWith('plan-')) await col.put({ ...live, status: 'planned', started_at: null, items: live.items.map((it) => ({ ...it, sets: it.sets.map((s) => ({ ...s, done: false, at: null })) })) });
      else await col.remove(live.id);
      onClose();
    } catch (e) { a.notice((e as Error).message); }
  };

  const started = live?.started_at ? Date.parse(live.started_at) : now;
  const title = finished ? 'Finished' : live?.name ?? 'Workout';
  return (
    <>
      <Screen open={open} onClose={onClose} title={title} immersive
        right={live && !finished ? <Button label="Finish" kind="quiet" small onPress={() => setEnding(true)} /> : undefined}>
        {finished ? <Summary id={finished} onDone={onClose} /> : null}
        {!finished && !live && col.items == null && !col.error ? <Skeleton height={320} radius={24} /> : null}
        {!finished && !live && col.error && col.items == null ? <Failed message={col.error} onRetry={() => { void col.refresh(); }} /> : null}
        {!finished && !live && col.items != null ? <Empty title="No workout in progress" body="Start one from Gym." action="Back" onAction={onClose} /> : null}
        {!finished && live ? (
          <>
            <View style={u.between}>
              <View>
                <Text style={[t.display, t.num]}>{timer((now - started) / 1000)}</Text>
                <Text style={[t.small, t.num]}>{`${doneSets(live)} of ${allSets(live)} sets`}</Text>
              </View>
            </View>
            {rest ? <RestBar left={left} total={rest.total} onAdd={(d) => setRest({ ...rest, until: rest.until + d * 1000, total: Math.max(rest.total, rest.total + d) })} onSkip={() => setRest(null)} /> : null}
            {live.items.map((it, i) => (
              <ExerciseCard key={`${it.ex}-${i}`} it={it} onToggle={(j) => toggle(i, j)} onEdit={(j) => setEdit({ i, j })} onMenu={() => setMenu(i)}
                onAddSet={() => setItems(live.items.map((x, k) => (k !== i ? x : { ...x, sets: [...x.sets, { ...startSet(x.kind, x.sets.length, x.sets.at(-1), undefined, x.target ?? null), done: false }] })))} />
            ))}
            <Button label="Add exercise" kind="quiet" icon={<Icon name="plus" size={16} />} onPress={() => setPicking(true)} />
          </>
        ) : null}
      </Screen>
      <Picker open={picking} onClose={() => setPicking(false)} onPick={async (ex) => {
        setPicking(false);
        if (!live) return;
        try { const p = await api<Prev>(`${B}/prev?ex=${encodeURIComponent(ex)}&reps=10`); setItems([...live.items, itemFrom(p)]); }
        catch (e) { a.notice((e as Error).message); }
      }} />
      <EditSheet live={live} edit={edit} onClose={() => setEdit(null)} onSave={(i, j, change, follow) => {
        if (!live) return;
        const it = live.items[i]; const old = it.sets[j];
        const same = (s: SetRow) => !s.done && s.w === old.w && s.r === old.r && s.t === old.t && s.min === old.min;
        setItems(live.items.map((x, k) => (k !== i ? x : { ...x, sets: x.sets.map((s, y) => (y === j || (follow && y > j && same(s)) ? { ...s, ...change } : s)) })));
        setEdit(null);
      }} />
      <MenuSheet live={live} index={menu} onClose={() => setMenu(null)} onSwap={(p) => {
        if (!live || menu == null) return;
        const keep = live.items[menu].sets.length;
        setItems(live.items.map((x, k) => (k === menu ? itemFrom(p, keep) : x)));
        setMenu(null);
      }} onRemove={() => {
        if (!live || menu == null) return;
        setItems(live.items.filter((_, k) => k !== menu));
        setMenu(null);
      }} />
      <Sheet open={ending} onClose={() => setEnding(false)} title="Finish workout">
        <Text style={t.body}>{live ? `${doneSets(live)} of ${allSets(live)} sets done. Sets not ticked are left out.` : ''}</Text>
        <Button label="Finish and save" kind="accent" onPress={() => { void finish(); }} />
        <Button label="Keep going" kind="quiet" onPress={() => setEnding(false)} />
        <Button label="Discard this workout" kind="danger" onPress={() => { void discard(); }} />
      </Sheet>
    </>
  );
}

function RestBar({ left, total, onAdd, onSkip }: { left: number; total: number; onAdd: (d: number) => void; onSkip: () => void }) {
  const a = useAspect();
  return (
    <Card tone={a.color} style={u.gap12}>
      <View style={u.between}>
        <View>
          <Text style={[t.label, { color: a.color }]}>Rest</Text>
          <Text style={[t.big, t.num]} accessibilityLiveRegion="polite">{timer(Math.max(0, left))}</Text>
        </View>
        <View style={u.row}>
          <Button label="Less 15 s" kind="quiet" small onPress={() => onAdd(-15)} />
          <Button label="More 15 s" kind="quiet" small onPress={() => onAdd(15)} />
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: SURF.track, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${Math.max(0, Math.min(1, left / Math.max(1, total))) * 100}%`, backgroundColor: a.color }} />
      </View>
      <Button label="Skip rest" kind="soft" small onPress={onSkip} />
    </Card>
  );
}

function ExerciseCard({ it, onToggle, onEdit, onMenu, onAddSet }: { it: WItem; onToggle: (j: number) => void; onEdit: (j: number) => void; onMenu: () => void; onAddSet: () => void }) {
  const a = useAspect();
  const prev = usePrev(it.ex, it.target?.r ?? 10).data?.prev;
  const all = it.sets.length > 0 && it.sets.every((s) => s.done);
  return (
    <Card style={u.gap12} tone={all ? a.color : undefined}>
      <View style={u.row}>
        <View style={[u.flex, u.gap4]}>
          <Text style={t.heading}>{it.name}</Text>
          {it.note ? <Text style={t.small}>{it.note}</Text> : null}
          {prev ? <Text style={[t.caption, t.num]}>{`Last time, ${shortDay(prev.date)}: ${prev.sets.map((s) => setText(it.kind, s).replace(' kg', '')).join(', ')}`}</Text> : null}
        </View>
        <IconButton label={`More for ${it.name}`} size={36} onPress={onMenu}><Icon name="more" size={18} /></IconButton>
      </View>
      <View>
        {it.sets.map((s, j) => (
          <View key={j} style={[u.row, { minHeight: 52 }]}>
            <Text style={[t.label, t.num, { width: 20 }]}>{j + 1}</Text>
            <Press label={`Set ${j + 1}, ${setText(it.kind, s)}. Change`} onPress={() => onEdit(j)} wrap={u.flex}
              style={{ height: 44, borderRadius: 12, justifyContent: 'center', paddingHorizontal: SP[12], backgroundColor: s.done ? 'transparent' : SURF.row }}>
              <Text style={[t.strong, t.num, s.done && { color: C.muted }, it.kind === 'weight' && s.w == null && { color: C.faint }]}>{setText(it.kind, s)}</Text>
            </Press>
            <Press label={`Set ${j + 1} done`} role="checkbox" state={{ checked: s.done }} onPress={() => onToggle(j)} feel={s.done ? 'light' : 'medium'} hitSlop={6}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <CheckRing done={s.done} size={30} />
            </Press>
          </View>
        ))}
      </View>
      <Press label={`Add a set to ${it.name}`} onPress={onAddSet} wrap={{ alignSelf: 'flex-start' }} hitSlop={8}>
        <Text style={[t.label, { color: a.color, paddingVertical: SP[4] }]}>Add set</Text>
      </Press>
    </Card>
  );
}

function EditSheet({ live, edit, onClose, onSave }: { live: WorkoutDoc | null; edit: Edit; onClose: () => void; onSave: (i: number, j: number, change: Partial<SetRow>, follow: boolean) => void }) {
  const it = edit && live ? live.items[edit.i] : null;
  const s = it && edit ? it.sets[edit.j] : null;
  return (
    <Sheet open={!!edit && !!s} onClose={onClose} title={it ? `${it.name}, set ${edit!.j + 1}` : ''}>
      {it && s && edit ? <EditBody key={`${edit.i}-${edit.j}`} it={it} s={s} onSave={(c, f) => onSave(edit.i, edit.j, c, f)} /> : null}
    </Sheet>
  );
}
function EditBody({ it, s, onSave }: { it: WItem; s: SetRow; onSave: (c: Partial<SetRow>, follow: boolean) => void }) {
  const [w, setW] = useState(s.w ?? (it.kind === 'weight' ? 20 : 0));
  const [r, setR] = useState(s.r ?? 10);
  const [sec, setSec] = useState(s.t ?? 30);
  const [min, setMin] = useState(s.min ?? 20);
  const step = it.step ?? 2.5;
  const change: Partial<SetRow> = it.kind === 'weight' ? { w, r } : it.kind === 'bw' ? { r } : it.kind === 'time' ? { t: sec } : { min };
  return (
    <>
      {it.kind === 'weight' ? <Stepper label="Weight" value={w} onChange={setW} step={step} min={0} max={500} format={(v) => `${num(v)} kg`} /> : null}
      {it.kind === 'weight' || it.kind === 'bw' ? <Stepper label="Reps" value={r} onChange={setR} step={1} min={1} max={100} format={(v) => `${v} reps`} /> : null}
      {it.kind === 'time' ? <Stepper label="Seconds" value={sec} onChange={setSec} step={5} min={5} max={600} format={(v) => `${v} s`} /> : null}
      {it.kind === 'cardio' ? <Stepper label="Minutes" value={min} onChange={setMin} step={1} min={1} max={300} format={(v) => `${v} min`} /> : null}
      <Button label="Save, and the sets after it" kind="accent" onPress={() => onSave(change, true)} />
      <Button label="Only this set" kind="quiet" onPress={() => onSave(change, false)} />
    </>
  );
}

function MenuSheet({ live, index, onClose, onSwap, onRemove }: { live: WorkoutDoc | null; index: number | null; onClose: () => void; onSwap: (p: Prev) => void; onRemove: () => void }) {
  const it = live && index != null ? live.items[index] : null;
  const prev = usePrev(it?.ex ?? null);
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const swap = async (ex: string) => {
    setBusy(ex);
    try { onSwap(await api<Prev>(`${B}/prev?ex=${encodeURIComponent(ex)}&reps=${it?.target?.r ?? 10}`)); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  return (
    <Sheet open={!!it} onClose={onClose} title={it?.name}>
      {prev.data?.cue ? <Text style={t.small}>{prev.data.cue}</Text> : null}
      <Section title="Swap for the same muscles">
        {prev.data ? (
          prev.data.swaps.length ? (
            <List>{prev.data.swaps.map((x) => <Row key={x.ex} title={x.name} sub={x.equip} onPress={() => { void swap(x.ex); }} right={busy === x.ex ? <Text style={t.caption}>Swapping</Text> : undefined} />)}</List>
          ) : <Text style={t.small}>No close swaps for this one.</Text>
        ) : prev.error ? <Text style={t.small}>{prev.error}</Text> : <Skeleton height={120} radius={24} />}
      </Section>
      <Button label="Remove from today" kind="danger" onPress={onRemove} />
    </Sheet>
  );
}

const GROUPS: { key: string; label: string; m: string[] }[] = [
  { key: 'all', label: 'All', m: [] }, { key: 'chest', label: 'Chest', m: ['chest'] }, { key: 'back', label: 'Back', m: ['upperback', 'lowerback', 'traps'] },
  { key: 'shoulders', label: 'Shoulders', m: ['shoulders'] }, { key: 'arms', label: 'Arms', m: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Legs', m: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'] }, { key: 'core', label: 'Core', m: ['abs', 'obliques'] },
];
/** Add any of the 876 moves in the library. */
function Picker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (ex: string) => void }) {
  const lib = useLibrary(open);
  const [q, setQ] = useState('');
  const [g, setG] = useState('all');
  const list = useMemo(() => {
    const items = lib.data?.items ?? [];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const group = GROUPS.find((x) => x.key === g)!;
    return items.filter((x: LibItem) => (!group.m.length || x.p.some((m) => group.m.includes(m))) && words.every((w) => x.name.toLowerCase().includes(w) || x.equip.toLowerCase().includes(w))).slice(0, 60);
  }, [lib.data, q, g]);
  return (
    <Screen open={open} onClose={onClose} title="Add exercise">
      <Field value={q} onChangeText={setQ} placeholder="Search 876 moves" />
      <View style={u.wrap}>{GROUPS.map((x) => <Chip key={x.key} label={x.label} selected={g === x.key} onPress={() => setG(x.key)} />)}</View>
      {!lib.data && lib.error ? <Failed message={lib.error} onRetry={() => { void lib.refresh(); }} /> : null}
      {!lib.data && !lib.error ? <Skeleton height={300} radius={24} /> : null}
      {lib.data ? (list.length ? <List>{list.map((x) => <Row key={x.id} title={x.name} sub={`${x.equip}, ${x.p.join(' and ')}`} onPress={() => onPick(x.id)} />)}</List>
        : <Empty title="Nothing matches" body="Try one word, like row or press." />) : null}
    </Screen>
  );
}

/** After Finish: time, sets, volume and any records. */
function Summary({ id, onDone }: { id: string; onDone: () => void }) {
  const a = useAspect();
  const read = useSession(id);
  const d = read.data;
  if (!d) return read.error ? <Failed message={read.error} onRetry={() => { void read.refresh(); }} /> : <Skeleton height={240} radius={24} />;
  return (
    <>
      <Card tone={a.color} style={u.gap16}>
        <Text style={[t.label, { color: a.color }]}>Saved</Text>
        <Text style={t.title2}>{d.name}</Text>
        <View style={[u.row, { gap: SP[24] }]}>
          <Big v={d.minutes != null ? String(d.minutes) : '0'} unit="min" />
          <Big v={String(d.sets)} unit="sets" />
          {d.volume ? <Big v={num(d.volume / 1000)} unit="tonnes" /> : null}
        </View>
      </Card>
      {d.records.length ? (
        <Section title="Records">
          <List>{d.records.map((r, i) => <Row key={i} title={r.name} sub={r.was ? `Up from ${setText('weight', r.was)}` : 'Your first logged set'} right={<Text style={[t.strong, t.num, { color: a.color }]}>{setText('weight', r.set)}</Text>} />)}</List>
        </Section>
      ) : <Text style={t.small}>No records this time. Steady sessions are what make the next ones heavier.</Text>}
      <Button label="Done" kind="primary" onPress={onDone} />
    </>
  );
}
function Big({ v, unit }: { v: string; unit: string }) {
  return <View style={u.gap4}><Text style={[t.title, t.num]}>{v}</Text><Text style={t.caption}>{unit}</Text></View>;
}
