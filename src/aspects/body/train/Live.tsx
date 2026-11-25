import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { C, F } from '@/theme';
import { fetchOnce, useCollection } from '@/lib/mod';
import {
  Block, Button, CheckRing, Chip, Empty, Failed, Field, Group, haptic, Icon, IconButton, Item, Keypad, Metric, Metrics, num, Press, R, Screen, Sheet,
  shortDay, Skeleton, SURF, t, Tag, timer, tint, useAspect, useKeepAwake, type KeyField,
} from '@/aspects/kit';
import { B, gymChanged, useGym, useLibrary, usePrev, useSession, type LibItem, type Prev, type SetRow } from '../api';
import { allSets, doneSets, itemFrom, restFor, startSet, volumeOf, type WItem, type WorkoutDoc } from '../gym/workout';
import { e1rm, muscleWords, platesFor, s as u, volumeText } from '../parts';
import { alertRestEnd, cancelRestAlert } from './restAlert';

// The live workout, built for the gym floor: every set prefilled from last time in a table (set, last time, kg,
// reps, tick); one tap ticks a set and starts the rest, which sits pinned at the bottom where the thumb is; numbers
// change on big keys, never the phone's keyboard; a set that beats his best says so. The rest's end is kept in the
// workout record, so leaving and coming back keeps it, and the screen stays on while this is open.

type Edit = { i: number; j: number; field: number; tick?: boolean } | null;
type Live = WorkoutDoc & { rest_until?: number | null; rest_total?: number | null };

/** The time now, for what a tap writes (a rest's end, a hold's end); drawing reads the time through a ticking clock. */
const tapTime = () => Date.now();

export function LiveWorkout({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const col = useCollection<Live>('body', 'workouts');
  const gym = useGym(open);
  const live = (col.items ?? []).find((w) => w.status === 'live') ?? null;
  const [finished, setFinished] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [ending, setEnding] = useState(false);
  const [hold, setHold] = useState<{ i: number; j: number; until: number } | null>(null);
  const [restGone, setRestGone] = useState<number | null>(null); // a rest that ran out on screen
  const [saving, setSaving] = useState(false); // Finish was tapped: the record is on its way, the summary follows
  useKeepAwake(open && !!live, 'body-live');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setHold(null); setFinished(null); } }

  // his best estimated max per lift, so a set that beats it can say so as it is ticked
  const best = useMemo(() => new Map((gym.data?.lifts ?? []).filter((l) => l.est).map((l) => [l.ex, l.est as number])), [gym.data]);
  // a rest that ran out while the workout was closed ends quietly as the bar mounts (RestBar)
  const rest = live?.rest_until && live.rest_until !== restGone ? { until: live.rest_until, total: live.rest_total ?? 90 } : null;

  // every change goes to the PC as the whole record; Home's gym card and Body's Today and Train read it again after
  const save = async (next: Live, now = false) => {
    try { await col.put(next); gymChanged(now); } catch (e) { a.notice(`Not saved: ${(e as Error).message}`); }
  };
  const withSet = (w: Live, i: number, j: number, change: Partial<SetRow>, follow = false): Live => {
    const old = w.items[i].sets[j];
    const same = (x: SetRow) => !x.done && x.w === old.w && x.r === old.r && x.t === old.t && x.min === old.min;
    return { ...w, items: w.items.map((it, x) => (x !== i ? it : { ...it, sets: it.sets.map((st, y) => (y === j ? { ...st, ...change } : follow && y > j && same(st) ? { ...st, ...change, done: st.done, at: st.at } : st)) })) };
  };
  /** The rest after set j of exercise i, folded into the same write, unless it was the workout's last set. */
  const withRest = (w: Live, i: number, j: number): Live => {
    const it = w.items[i];
    const last = i === w.items.length - 1 && j === it.sets.length - 1;
    const r = restFor(it);
    if (last || r <= 0) return { ...w, rest_until: null, rest_total: null };
    void alertRestEnd(r);
    return { ...w, rest_until: tapTime() + r * 1000, rest_total: r };
  };
  const tickSet = (i: number, j: number) => {
    if (!live) return;
    const it = live.items[i]; const st = it.sets[j];
    const holding = !!hold && hold.i === i && hold.j === j;
    if (!st.done && !holding && it.kind === 'weight' && st.w == null) { setEdit({ i, j, field: 0, tick: true }); return; } // a set without a weight is no data
    if (!st.done && !holding && it.kind === 'time') { setHold({ i, j, until: tapTime() + (st.t ?? 60) * 1000 }); return; }
    if (holding) setHold(null);
    const on = !st.done;
    let next = withSet(live, i, j, { done: on, at: on ? new Date().toISOString() : null });
    if (on) {
      next = withRest(next, i, j);
      const b = best.get(it.ex);
      if (it.kind === 'weight' && b && e1rm(st.w, st.r) > b + 0.01) { haptic.success(); a.notice(`${it.name}: a new best, ${num(st.w ?? 0)} kg × ${st.r}`); }
    } else { next = { ...next, rest_until: null, rest_total: null }; void cancelRestAlert(); }
    void save(next);
  };
  const holdDone = () => {
    if (!hold || !live) return;
    const { i, j } = hold;
    setHold(null);
    haptic.success();
    void save(withRest(withSet(live, i, j, { done: true, at: new Date().toISOString() }), i, j));
  };
  const changeRest = (d: number) => {
    if (!live || !rest) return;
    const at = tapTime();
    const until = Math.max(at + 1000, rest.until + d * 1000);
    void alertRestEnd((until - at) / 1000);
    void save({ ...live, rest_until: until, rest_total: Math.max(rest.total, Math.round((until - at) / 1000)) });
  };
  const skipRest = () => { if (!live) return; void cancelRestAlert(); void save({ ...live, rest_until: null, rest_total: null }); };
  const finish = async () => {
    if (!live) return;
    setEnding(false);
    setSaving(true);
    const id = live.id;
    void cancelRestAlert();
    await save({ ...live, status: 'done', ended_at: new Date().toISOString(), rest_until: null, rest_total: null }, true);
    setHold(null);
    setFinished(id);
    setSaving(false);
    haptic.success();
  };
  const discard = async () => {
    if (!live) return;
    setEnding(false);
    void cancelRestAlert();
    try {
      if (live.id.startsWith('plan-')) await col.put({ ...live, status: 'planned', started_at: null, rest_until: null, items: live.items.map((it) => ({ ...it, sets: it.sets.map((x) => ({ ...x, done: false, at: null })) })) });
      else await col.remove(live.id);
      gymChanged(true);
      onClose();
    } catch (e) { a.notice((e as Error).message); }
  };
  const setItems = (items: WItem[]) => { if (live) void save({ ...live, items }); };

  const started = live?.started_at ? Date.parse(live.started_at) : null;
  return (
    <>
      <Screen open={open} onClose={onClose} title={finished ? 'Saved' : live?.name ?? (saving ? 'Saving' : 'Workout')} immersive
        right={live && !finished ? <Button label="Finish" kind="accent" small onPress={() => setEnding(true)} /> : undefined}
        contentStyle={rest ? s.roomForRest : undefined}
        footer={rest && !finished ? <RestBar key={rest.until} until={rest.until} total={rest.total} bottom={a.insets.bottom} onAdd={changeRest} onSkip={skipRest} onEnd={() => setRestGone(rest.until)} /> : null}>
        {finished ? <Summary id={finished} onDone={onClose} /> : null}
        {!finished && !live && (saving || (col.items == null && !col.error)) ? <Skeleton height={320} radius={22} /> : null}
        {!finished && !live && col.error && col.items == null ? <Failed message={col.error} onRetry={() => { void col.refresh(); }} /> : null}
        {!finished && !live && !saving && col.items != null ? <Empty title="No workout in progress" body="Start one from Train." action="Back" onAction={onClose} /> : null}
        {!finished && live ? (
          <>
            <Metrics style={s.stats}>
              <Elapsed since={started} />
              <Metric size="m" label="Sets" value={`${doneSets(live)}/${allSets(live)}`} />
              <Metric size="m" label="Volume" value={volumeText(volumeOf(live))} />
            </Metrics>
            {live.items.map((it, i) => (
              <ExerciseBlock key={`${it.ex}-${i}`} it={it} best={best.get(it.ex) ?? null}
                holding={hold && hold.i === i ? { j: hold.j, until: hold.until } : null} onHoldDone={holdDone}
                onTick={(j) => tickSet(i, j)} onEdit={(j, field) => setEdit({ i, j, field })} onMenu={() => setMenu(i)}
                onCopy={(j, x) => { void save(withSet(live, i, j, x)); haptic.tick(); }}
                onAddSet={() => setItems(live.items.map((x, k) => (k !== i ? x : { ...x, sets: [...x.sets, { ...startSet(x.kind, x.sets.length, x.sets.at(-1), undefined, x.target ?? null), done: false }] })))} />
            ))}
            <Button label="Add exercise" kind="quiet" icon={<Icon name="plus" size={16} />} onPress={() => setPicking(true)} />
          </>
        ) : null}
      </Screen>
      <Picker open={picking} onClose={() => setPicking(false)} onPick={async (ex) => {
        setPicking(false);
        if (!live) return;
        try { const p = await fetchOnce<Prev>(`${B}/prev?ex=${encodeURIComponent(ex)}&reps=10`); setItems([...live.items, itemFrom(p)]); }
        catch (e) { a.notice((e as Error).message); }
      }} />
      <SetKeypad live={live} edit={edit} onClose={() => setEdit(null)} onSave={(i, j, change, follow) => {
        if (!live) return;
        const tick = !!edit?.tick;
        let next = withSet(live, i, j, tick ? { ...change, done: true, at: new Date().toISOString() } : change, follow);
        if (tick) next = withRest(next, i, j);
        void save(next);
        setEdit(null);
      }} />
      <MenuSheet live={live} index={menu} onClose={() => setMenu(null)}
        onSwap={(p) => { if (!live || menu == null) return; const keep = live.items[menu].sets.length; setItems(live.items.map((x, k) => (k === menu ? itemFrom(p, keep) : x))); setMenu(null); }}
        onMove={(d) => {
          if (!live || menu == null) return;
          const to = menu + d; if (to < 0 || to >= live.items.length) return;
          const items = [...live.items]; [items[menu], items[to]] = [items[to], items[menu]];
          setItems(items); setMenu(to);
        }}
        onRemove={() => { if (!live || menu == null) return; setItems(live.items.filter((_, k) => k !== menu)); setMenu(null); }} />
      <Sheet open={ending} onClose={() => setEnding(false)} title="Finish workout">
        <Text style={t.subhead}>{live ? `${doneSets(live)} of ${allSets(live)} sets done. Sets not ticked are left out.` : ''}</Text>
        <Button label="Finish and save" kind="accent" onPress={() => { void finish(); }} />
        <Button label="Keep going" kind="quiet" onPress={() => setEnding(false)} />
        <Button label="Discard this workout" kind="danger" onPress={() => { void discard(); }} />
      </Sheet>
    </>
  );
}

/** The session clock: redraws itself each second, nothing else. Without a start time it counts from when it showed. */
function Elapsed({ since: from }: { since: number | null }) {
  const { open } = useAspect();
  const [now, setNow] = useState(() => Date.now());
  const [shown] = useState(() => Date.now());
  const since = from ?? shown;
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);
  return <Metric size="m" label="Time" value={timer((now - since) / 1000)} />;
}

/** The rest, pinned over the bottom of the screen: the time left, a bar, and the three things he does with it. */
function RestBar({ until, total, bottom, onAdd, onSkip, onEnd }: { until: number; total: number; bottom: number; onAdd: (d: number) => void; onSkip: () => void; onEnd: () => void }) {
  const a = useAspect();
  const [now, setNow] = useState(() => Date.now());
  // over before it showed (the workout was closed while it ran out): it ends without a buzz and never draws
  const [over] = useState(() => until <= Date.now());
  const rang = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (left > 0 || rang.current) return;
    rang.current = true;
    if (!over) haptic.success();
    onEnd();
  }, [left, onEnd, over]);
  if (over) return null;
  return (
    <View style={[s.restWrap, { paddingBottom: Math.max(bottom, 12) + 8 }]}>
      <View style={[s.rest, { borderColor: tint(a.color, 0.35) }]}>
        <View style={[s.restFill, { backgroundColor: tint(a.color, 0.14), width: `${Math.min(1, left / Math.max(1, total)) * 100}%` }]} />
        <View style={s.restText}>
          <Text style={[t.footnote, { color: a.color }]}>Rest</Text>
          <Text style={[t.title3, t.num]} accessibilityLiveRegion="polite">{timer(left)}</Text>
        </View>
        <Press label="15 seconds less rest" onPress={() => onAdd(-15)} style={[s.restBtn, s.restStep]}><Icon name="minus" size={14} /><Text style={[t.callout, t.num]}>15</Text></Press>
        <Press label="15 seconds more rest" onPress={() => onAdd(15)} style={[s.restBtn, s.restStep]}><Icon name="plus" size={14} /><Text style={[t.callout, t.num]}>15</Text></Press>
        <Press label="Skip rest" onPress={onSkip} style={[s.restBtn, s.restSkip]}><Text style={[t.callout, { color: C.scene }]}>Skip</Text></Press>
      </View>
    </View>
  );
}

const lastText = (kind: WItem['kind'], x: Partial<SetRow> | undefined) => {
  if (!x) return '';
  if (kind === 'weight') return x.w != null ? `${num(x.w)} × ${x.r ?? 0}` : '';
  if (kind === 'bw') return `${x.r ?? 0}`;
  if (kind === 'time') return `${x.t ?? 0} s`;
  return `${x.min ?? 0} min`;
};

function ExerciseBlock({ it, best, holding, onHoldDone, onTick, onEdit, onMenu, onCopy, onAddSet }: {
  it: WItem; best: number | null; holding: { j: number; until: number } | null; onHoldDone: () => void;
  onTick: (j: number) => void; onEdit: (j: number, field: number) => void; onMenu: () => void; onCopy: (j: number, x: Partial<SetRow>) => void; onAddSet: () => void;
}) {
  const a = useAspect();
  const prev = usePrev(it.ex, it.target?.r ?? 10).data;
  const all = it.sets.length > 0 && it.sets.every((x) => x.done);
  const cols = it.kind === 'weight' ? ['kg', 'Reps'] : it.kind === 'bw' ? ['Reps'] : it.kind === 'time' ? ['Seconds'] : ['Minutes', 'km'];
  return (
    <Group style={all ? { borderColor: tint(a.color, 0.4) } : undefined}>
      <View style={s.exHead}>
        <View style={u.flex}>
          <Text numberOfLines={2} style={[t.headline, all && { color: a.color }]}>{it.name}</Text>
          <Text numberOfLines={1} style={t.footnote}>{[muscleWords(prev?.p ?? []), it.equip].filter(Boolean).join(', ')}</Text>
        </View>
        <IconButton label={`More for ${it.name}`} size={36} onPress={onMenu}><Icon name="more" size={18} /></IconButton>
      </View>
      {it.note ? <Text style={[t.footnote, s.note]}>{it.note}</Text> : null}
      <View style={s.colHead}>
        <Text style={[t.micro, s.cSet]}>Set</Text>
        <Text style={[t.micro, s.cLast]}>{prev?.prev ? `Last, ${shortDay(prev.prev.date)}` : 'Last'}</Text>
        {cols.map((c) => <Text key={c} style={[t.micro, s.cVal]}>{c}</Text>)}
        <View style={s.cTick} />
      </View>
      {it.sets.map((st, j) => {
        const last = prev?.prev?.sets?.[j] ?? prev?.prev?.sets?.at(-1);
        const isBest = st.done && it.kind === 'weight' && best != null && e1rm(st.w, st.r) > best + 0.01;
        const vals: { text: string; empty: boolean }[] = it.kind === 'weight' ? [{ text: st.w != null ? num(st.w) : 'kg', empty: st.w == null }, { text: String(st.r ?? 0), empty: false }]
          : it.kind === 'bw' ? [{ text: String(st.r ?? 0), empty: false }] : it.kind === 'time' ? [{ text: String(st.t ?? 0), empty: false }]
            : [{ text: String(st.min ?? 0), empty: false }, { text: st.km != null ? num(st.km) : 'km', empty: st.km == null }];
        return (
          <View key={j} style={[s.setRow, st.done && { backgroundColor: tint(a.color, 0.09) }]}>
            <View style={s.cSet}>
              {isBest ? <Tag label="Best" tone="solid" /> : <Text style={[t.callout, t.num, { color: st.done ? a.color : C.muted }]}>{j + 1}</Text>}
            </View>
            <Press label={last ? `Use last time, ${lastText(it.kind, last)}` : 'No last time'} disabled={!last || st.done} feel="none" wrap={s.cLast}
              onPress={() => last && onCopy(j, it.kind === 'weight' ? { w: last.w ?? null, r: last.r ?? null } : it.kind === 'bw' ? { r: last.r ?? null } : it.kind === 'time' ? { t: last.t ?? null } : { min: last.min ?? null })}>
              <Text numberOfLines={1} style={[t.footnote, t.num]}>{last ? lastText(it.kind, last) : 'New'}</Text>
            </Press>
            {vals.map((v, k) => (
              <Press key={k} label={`Set ${j + 1}, ${cols[k]} ${v.empty ? 'not set' : v.text}. Change`} onPress={() => onEdit(j, k)} feel="tick" wrap={s.cVal}
                style={[s.cell, st.done && s.cellDone]}>
                <Text style={[s.cellText, t.num, v.empty && { color: C.faint }, st.done && { color: C.textSoft }]}>{v.text}</Text>
              </Press>
            ))}
            <View style={s.cTick}>
              {holding?.j === j ? <HoldRing until={holding.until} onTap={() => onTick(j)} onDone={onHoldDone} />
                : (
                  <Press label={`Set ${j + 1} done${!st.done && it.kind === 'time' ? `, starts a ${st.t ?? 60} second hold` : !st.done && it.kind === 'weight' && st.w == null ? ', pick a weight first' : ''}`}
                    role="checkbox" state={{ checked: st.done }} onPress={() => onTick(j)} feel={st.done ? 'light' : 'medium'} hitSlop={6} style={s.tickBtn}>
                    <CheckRing done={st.done} size={28} />
                  </Press>
                )}
            </View>
          </View>
        );
      })}
      <Press label={`Add a set to ${it.name}`} onPress={onAddSet} style={s.addSet}>
        <Icon name="plus" size={14} color={a.color} />
        <Text style={[t.subhead, { color: a.color }]}>Add set</Text>
      </Press>
    </Group>
  );
}

/** A hold (a dead hang, a plank) counting down its seconds; it ticks itself at zero. A tap ends it early. */
function HoldRing({ until, onTap, onDone }: { until: number; onTap: () => void; onDone: () => void }) {
  const a = useAspect();
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => { if (left <= 0 && !fired.current) { fired.current = true; onDone(); } }, [left, onDone]);
  return (
    <Press label={`${left} seconds left. Done now`} onPress={onTap} feel="medium" hitSlop={6} style={s.tickBtn}>
      <View style={[s.hold, { borderColor: a.color }]}><Text style={[t.micro, t.num, { color: C.text }]} accessibilityLiveRegion="polite">{left}</Text></View>
    </Press>
  );
}

/** Changing a set on big keys: weight then reps, last time and the plan one tap away, the plates for a barbell. */
function SetKeypad({ live, edit, onClose, onSave }: { live: Live | null; edit: Edit; onClose: () => void; onSave: (i: number, j: number, change: Partial<SetRow>, follow: boolean) => void }) {
  const it = edit && live ? live.items[edit.i] : null;
  const st = it && edit ? it.sets[edit.j] : null;
  const prev = usePrev(it?.ex ?? null, it?.target?.r ?? 10).data;
  const [follow, setFollow] = useState(true);
  const [w, setW] = useState<number | null>(null);
  const open = !!edit && !!st && !!it;
  const kind = it?.kind ?? 'weight';
  const fields: KeyField[] = !it || !st ? [] : kind === 'weight'
    ? [{ key: 'w', label: 'Weight', unit: 'kg', value: st.w ?? prev?.prev?.sets?.[0]?.w ?? null, step: it.step ?? 2.5, decimals: 2, max: 500 }, { key: 'r', label: 'Reps', value: st.r ?? 10, step: 1, max: 100 }]
    : kind === 'bw' ? [{ key: 'r', label: 'Reps', value: st.r ?? 10, step: 1, max: 200 }]
      : kind === 'time' ? [{ key: 't', label: 'Seconds', unit: 's', value: st.t ?? 45, step: 5, max: 900 }]
        : [{ key: 'min', label: 'Minutes', unit: 'min', value: st.min ?? 20, step: 1, max: 300 }, { key: 'km', label: 'Distance', unit: 'km', value: st.km ?? null, step: 0.5, decimals: 2, max: 100 }];
  // the focused field opens first: reordering puts the tapped one at the front only for a single tap on reps
  const ordered = edit && edit.field > 0 && fields.length > 1 ? [...fields.slice(edit.field), ...fields.slice(0, edit.field)] : fields;
  const last = prev?.prev?.sets?.[edit?.j ?? 0] ?? prev?.prev?.sets?.at(-1);
  const presets = !it ? [] : [
    ...(last && kind === 'weight' && last.w != null ? [{ label: `Last ${num(last.w)} × ${last.r ?? 0}`, values: { w: last.w, r: last.r ?? 10 } }] : []),
    ...(it.target?.w ? [{ label: `Plan ${num(it.target.w)} × ${it.target.r ?? 10}`, values: { w: it.target.w, r: it.target.r ?? 10 } }] : []),
  ];
  const bar = prev?.bar ?? null;
  const plates = platesFor(w ?? st?.w ?? null, bar);
  const later = !!it && !!edit && it.sets.slice(edit.j + 1).some((x) => !x.done);
  return (
    <Keypad open={open} onClose={onClose} title={it && edit ? `${it.name}, set ${edit.j + 1}` : ''}
      sub={edit?.tick ? 'Pick the weight you lifted. Saving ticks the set.' : plates ? `Each side of the bar: ${plates}` : bar ? `Bar ${bar} kg` : null}
      fields={ordered} presets={presets} done={edit?.tick ? 'Save and tick' : 'Save'}
      onDone={(v) => {
        if (!edit) return;
        setW(null);
        const change: Partial<SetRow> = {};
        for (const k of ['w', 'r', 't', 'min', 'km'] as const) if (k in v) (change as Record<string, number | null>)[k] = v[k];
        onSave(edit.i, edit.j, change, follow && later);
      }}
      extra={later ? (
        <Press label="Use for the sets after this one" role="checkbox" state={{ checked: follow }} onPress={() => setFollow(!follow)} feel="tick" style={s.follow}>
          <CheckRing done={follow} size={22} />
          <Text style={t.subhead}>Same for the sets after it</Text>
        </Press>
      ) : null} />
  );
}

function MenuSheet({ live, index, onClose, onSwap, onMove, onRemove }: {
  live: Live | null; index: number | null; onClose: () => void; onSwap: (p: Prev) => void; onMove: (d: 1 | -1) => void; onRemove: () => void;
}) {
  const it = live && index != null ? live.items[index] : null;
  const prev = usePrev(it?.ex ?? null);
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const swap = async (ex: string) => {
    setBusy(ex);
    try { onSwap(await fetchOnce<Prev>(`${B}/prev?ex=${encodeURIComponent(ex)}&reps=${it?.target?.r ?? 10}`)); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  return (
    <Sheet open={!!it} onClose={onClose} title={it?.name}>
      {prev.data?.cue ? <Text style={t.subhead}>{prev.data.cue}</Text> : null}
      {prev.data?.how?.length ? (
        <Group>{prev.data.how.map((h, i) => <Item key={i} title={h} lines={3} left={<Text style={[t.footnote, t.num, s.howN]}>{i + 1}</Text>} />)}</Group>
      ) : null}
      <Block title="Swap for the same muscles">
        {prev.data ? (prev.data.swaps.length ? (
          <Group>{prev.data.swaps.slice(0, 6).map((x) => <Item key={x.ex} title={x.name} sub={x.equip} onPress={() => { void swap(x.ex); }} value={busy === x.ex ? 'Swapping' : undefined} />)}</Group>
        ) : <Text style={t.footnote}>No close swaps for this one.</Text>) : prev.error ? <Text style={t.footnote}>{prev.error}</Text> : <Skeleton height={120} radius={22} />}
      </Block>
      <View style={u.row}>
        <Button label="Move up" kind="quiet" small onPress={() => onMove(-1)} disabled={index === 0} wrap={u.flex} />
        <Button label="Move down" kind="quiet" small onPress={() => onMove(1)} disabled={!live || index === live.items.length - 1} wrap={u.flex} />
      </View>
      <Button label="Remove from today" kind="danger" onPress={onRemove} />
    </Sheet>
  );
}

const GROUPS: { key: string; label: string; m: string[] }[] = [
  { key: 'all', label: 'All', m: [] }, { key: 'chest', label: 'Chest', m: ['chest'] }, { key: 'back', label: 'Back', m: ['upperback', 'lowerback', 'traps'] },
  { key: 'shoulders', label: 'Shoulders', m: ['shoulders'] }, { key: 'arms', label: 'Arms', m: ['biceps', 'triceps', 'forearms'] },
  { key: 'legs', label: 'Legs', m: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors'] }, { key: 'core', label: 'Core', m: ['abs', 'obliques'] },
];
/** Add any of the moves in the library, with its picture where the library has one. */
export function Picker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (ex: string) => void }) {
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
      <Field value={q} onChangeText={setQ} placeholder={`Search ${lib.data?.count ?? ''} moves`.replace('  ', ' ')} />
      <View style={u.wrap}>{GROUPS.map((x) => <Chip key={x.key} label={x.label} selected={g === x.key} onPress={() => setG(x.key)} />)}</View>
      {!lib.data && lib.error ? <Failed message={lib.error} onRetry={() => { void lib.refresh(); }} /> : null}
      {!lib.data && !lib.error ? <Skeleton height={300} radius={22} /> : null}
      {lib.data ? (list.length ? (
        <Group inset={76}>
          {list.map((x) => (
            <Item key={x.id} title={x.name} sub={`${x.equip}, ${muscleWords(x.p).toLowerCase()}`} onPress={() => onPick(x.id)}
              left={<Thumb uri={x.img && lib.data ? `${lib.data.img}/${x.img}` : null} />} />
          ))}
        </Group>
      ) : <Empty title="Nothing matches" body="Try one word, like row or press." />) : null}
    </Screen>
  );
}
export function Thumb({ uri, size = 48 }: { uri: string | null; size?: number }) {
  return (
    <View style={[s.thumb, { width: size, height: size }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} /> : <Icon name="plus" size={14} color={C.faint} />}
    </View>
  );
}

/** After Finish: time, sets, volume, records, and the muscles it worked. */
function Summary({ id, onDone }: { id: string; onDone: () => void }) {
  const a = useAspect();
  const read = useSession(id);
  const d = read.data;
  if (!d) return read.error ? <Failed message={read.error} onRetry={() => { void read.refresh(); }} /> : <Skeleton height={240} radius={22} />;
  return (
    <>
      <View style={s.sumHead}>
        <Text style={[t.footnote, { color: a.color }]}>Workout saved</Text>
        <Text style={t.large}>{d.name}</Text>
      </View>
      <Group pad>
        <Metrics>
          <Metric size="l" value={d.minutes != null ? String(d.minutes) : '0'} unit="min" label="Time" />
          <Metric size="l" value={String(d.sets)} label="Sets" />
          <Metric size="l" value={volumeText(d.volume)} label="Volume" />
        </Metrics>
      </Group>
      {d.records.length ? (
        <Block title={d.records.length === 1 ? 'A new best' : `${d.records.length} new bests`}>
          <Group>{d.records.map((r, i) => (
            <Item key={i} title={r.name} sub={r.was ? `Up from ${num(r.was.w ?? 0)} kg × ${r.was.r ?? 0}` : 'Your first logged set'}
              right={<Text style={[t.headline, t.num, { color: a.color }]}>{`${num(r.set.w ?? 0)} × ${r.set.r ?? 0}`}</Text>} />
          ))}</Group>
        </Block>
      ) : <Text style={t.footnote}>No new bests this time. Steady sessions are what make the next ones heavier.</Text>}
      <Block title="Done">
        <Group>{d.items.map((it) => (
          <Item key={it.ex} title={it.name} sub={it.sets.map((x) => (x.w != null ? `${num(x.w)}×${x.r ?? 0}` : x.t != null ? `${x.t}s` : `${x.r ?? 0}`)).join(', ')}
            right={it.sets.some((x) => x.pr) ? <Tag label="Best" tone="aspect" /> : undefined} />
        ))}</Group>
      </Block>
      <Button label="Done" kind="primary" onPress={onDone} />
    </>
  );
}

const s = StyleSheet.create({
  roomForRest: { paddingBottom: 140 },
  stats: { paddingVertical: 4 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  note: { paddingHorizontal: 16, paddingBottom: 6 },
  colHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 52, gap: 6 },
  cSet: { width: 44, alignItems: 'flex-start', paddingLeft: 4 },
  cLast: { flex: 1.1, minWidth: 0 },
  cVal: { flex: 1, minWidth: 0, textAlign: 'center' },
  cTick: { width: 44, alignItems: 'center' },
  cell: { height: 40, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  cellDone: { backgroundColor: 'transparent' },
  cellText: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  tickBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hold: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 48 },
  restWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8 },
  rest: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 68, borderRadius: 34, paddingLeft: 20, paddingRight: 10, overflow: 'hidden',
    backgroundColor: 'rgba(28,30,38,0.97)', borderWidth: StyleSheet.hairlineWidth, boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
  },
  restFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  restText: { flex: 1 },
  restStep: { flexDirection: 'row', gap: 4 },
  restBtn: { height: 48, minWidth: 52, paddingHorizontal: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  restSkip: { backgroundColor: C.text },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  howN: { width: 16 },
  thumb: { borderRadius: R.inner + 4, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  sumHead: { gap: 4 },
});
