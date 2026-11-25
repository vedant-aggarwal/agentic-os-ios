import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Chip, Failed, Field, Group, haptic, Icon, IconButton, Item, Metric, myDay, Screen, Sheet, shortDay, Skeleton, Stepper, t, today, useAspect, weekday,
} from '@/aspects/kit';
import { call, useCollection, useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { CloseChoice } from './CloseFlow';
import {
  act, ASPECT_KEYS, ASPECT_LABEL, count, daysLeftLabel, dueWords, endedAgo, fmt, HORIZON_GOAL, M, liveReading, message, OUTCOME_WORD, pctKnown, progressOf,
  refresh, sourceLine, useReadingSync, useSources, type Jar, type Sources,
} from './data';
import { useNav } from './nav';
import { aspectName, colorOf, Dot, GoalBar, GoalRow, s as ps, Serves, TickRow, Tile, useTickMilestone, useTickTask } from './parts';
import type { Commitment, Goal, GoalDetail, Measure, Milestone } from './types';

/** One goal: its progress and where the number comes from, its next step, milestones, tasks, what it serves and what serves it. */
export function GoalScreen({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<GoalDetail>(`${M}/goal/${id}`);
  const d = r.data;
  const goals = useMemo(() => (d ? [d.goal, ...d.children] : []), [d]);
  const src = useSources(goals);
  useReadingSync(goals, src);
  const [sheet, setSheet] = useState<'edit' | 'parent' | 'close' | null>(null);

  const g = d?.goal;
  return (
    <Screen open={open} onClose={onClose} title={g ? HORIZON_GOAL[g.horizon] : 'Goal'}
      right={g ? <IconButton label="Edit goal" size={36} onPress={() => setSheet('edit')}><Icon name="pencil" size={16} /></IconButton> : undefined}>
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !d || !g ? (
        <View style={st.gap16}><Skeleton height={72} /><Skeleton height={150} radius={22} /><Skeleton height={160} radius={22} /></View>
      ) : (
        <>
          <View style={st.head}>
            <Text style={[t.title3, g.status !== 'active' && { color: C.muted }]}>{g.title}</Text>
            <Serves aspect={g.aspect} text={`${aspectName(g.aspect)}, ${g.horizon === 'week' ? `week of ${g.label}` : g.label}`} strong />
            <Text style={[t.footnote, t.num]}>
              {g.status === 'done' ? 'Done' : g.status === 'dropped' ? (g.closing ? OUTCOME_WORD[g.closing.outcome] : 'Let go')
                : g.end ? (endedAgo(g.end) ?? daysLeftLabel(g.end)) : 'No end date'}
            </Text>
          </View>

          <Progress g={g} src={src} />
          {'state' in g ? <NextStep c={g as Commitment} /> : null}
          <Milestones goal={g.id} initial={d.milestones} />
          <Tasks goal={g.id} d={d} />

          <Block title="What it serves" action={d.parents.length ? (g.parent ? 'Change' : 'Choose') : undefined} onAction={() => setSheet('parent')}>
            {g.parent ? (
              <Group inset={36}>
                <Item title={g.parent.title} sub={HORIZON_GOAL[g.parent.horizon]} left={<Dot aspect={g.parent.aspect} />} chevron onPress={() => nav.goal(g.parent!.id)} />
              </Group>
            ) : <Text style={[t.footnote, st.pad]}>{d.parents.length ? 'Serves no bigger goal yet.' : 'Nothing above it on the ladder to serve.'}</Text>}
          </Block>
          {d.children.length ? (
            <Block title="What serves it">
              <Group>{d.children.map((c) => <GoalRow key={c.id} g={c} src={src} />)}</Group>
            </Block>
          ) : null}

          {d.projects.length ? (
            <Block title="Projects serving it">
              <Group>{d.projects.map((p) => <Item key={p.slug} title={p.name} value={p.status === 'paused' ? 'Parked' : 'Running'} />)}</Group>
            </Block>
          ) : null}

          {d.closings.length ? (
            <Block title="Its record">
              <Group>
                {d.closings.map((c) => (
                  <Item key={c.id} title={`${OUTCOME_WORD[c.outcome]}, ${c.horizon === 'week' ? `week of ${c.label}` : c.label}`}
                    sub={[c.why, c.to ? `Into ${c.to.label}` : null, c.by === 'growth' ? 'From your weekly review' : null].filter(Boolean).join('. ') || null} />
                ))}
              </Group>
            </Block>
          ) : null}

          {g.status === 'active'
            ? <Button label="Close this goal" kind="quiet" onPress={() => setSheet('close')} />
            : <Button label="Open it again" kind="quiet" onPress={() => { void act('/reopen', { goal: g.id }).then(() => r.refresh()).catch((e) => a.notice(message(e))); }} />}

          <EditSheet open={sheet === 'edit'} d={d} onClose={() => setSheet(null)} onSaved={() => r.refresh()} />
          <Sheet open={sheet === 'parent'} onClose={() => setSheet(null)} title="What does it serve?">
            <Group inset={36}>
              {d.parents.map((p) => (
                <Item key={p.id} title={p.title} sub={HORIZON_GOAL[p.horizon]} left={<Dot aspect={p.aspect} />} label={`${p.title}${g.parent?.id === p.id ? ', chosen' : ''}`}
                  right={g.parent?.id === p.id ? <Icon name="check" size={18} color={a.color} /> : undefined}
                  onPress={() => { setSheet(null); void act(`/goal/${g.id}`, { parent: p.id }).then(() => r.refresh()).catch((e) => a.notice(message(e))); }} />
              ))}
            </Group>
            {g.parent ? <Button label="Serves nothing bigger" kind="quiet" onPress={() => { setSheet(null); void act(`/goal/${g.id}`, { parent: null }).then(() => r.refresh()).catch((e) => a.notice(message(e))); }} /> : null}
          </Sheet>
          <Sheet open={sheet === 'close'} onClose={() => setSheet(null)} title="What happened?">
            <Text style={t.subhead}>{g.title}</Text>
            <CloseChoice goal={g} sunday={weekday(today()) === 0} onClosed={() => { setSheet(null); void r.refresh(); }} />
          </Sheet>
        </>
      )}
    </Screen>
  );
}

/** How far it has come, where the number comes from, and how much of its time has gone. */
function Progress({ g, src }: { g: Goal; src: Sources }) {
  const a = useAspect();
  const nav = useNav();
  const tone = colorOf(g.aspect, a.color);
  if (g.source.kind === 'none') {
    return (
      <Group pad>
        <View style={st.gap4}>
          <Text style={t.headline}>No number yet</Text>
          <Text style={t.footnote}>Give it milestones, tie tasks to it, set it by hand, or read it from Money or Body.</Text>
        </View>
        <Button label="Choose how to measure it" kind="soft" small onPress={() => nav.measure(g.id)} wrap={st.left} />
      </Group>
    );
  }
  const p = progressOf(g, src);
  const known = pctKnown(g, src);
  const gone = g.time != null && g.time > 0.01 && g.status === 'active' ? ` ${Math.round(Math.min(1, g.time) * 100)}% of its time has gone.` : '';
  return (
    <Group pad>
      <Metric size="l" value={known ? `${Math.round(p * 100)}%` : bigReading(g, src)} color={g.status === 'active' ? tone : undefined} />
      <GoalBar progress={p} time={g.status === 'active' ? g.time : null} color={tone} />
      <Text style={[t.footnote, t.num]}>{`${sourceLine(g, src)}.${gone}`}</Text>
      <View style={st.buttons}>
        {g.source.kind === 'manual' && g.status === 'active' ? <Button label="Log progress" kind="soft" small onPress={() => nav.progress(g)} /> : null}
        <Button label="Change measure" kind="quiet" small onPress={() => nav.measure(g.id)} />
      </View>
    </Group>
  );
}

/** A week goal's next step, ticked here in one tap (Undo puts it back). */
function NextStep({ c }: { c: Commitment }) {
  const nav = useNav();
  const tickTask = useTickTask();
  const tickMilestone = useTickMilestone();
  if (c.status !== 'active') return null;
  const state = c.state === 'moving' ? (c.tasks.doneWeek ? `Moving, ${count(c.tasks.doneWeek, 'task')} done this week` : 'Moving') : c.state === 'not_started' ? 'Not started yet' : null;
  const next = c.next;
  return (
    <Block title={c.state === 'not_started' ? 'Smallest next step' : 'Next step'} sub={state}>
      <Group inset={64}>
        {next ? (
          <TickRow done={false} onTick={() => (next.kind === 'task' ? tickTask(next) : tickMilestone(next.id))} tickLabel={`Mark ${next.title} done`} title={next.title}
            sub={next.kind === 'milestone' ? 'A milestone' : next.due ? `Due ${dueWords(next.due)}` : 'A task, on Today'} />
        ) : (
          <Item title="No next step yet" sub="Tie one of your tasks, or add a milestone below" action={<Button label="Tie a task" kind="soft" small onPress={() => nav.tie(c.id)} />} />
        )}
      </Group>
    </Block>
  );
}

/** Milestones tick here and move the goal when nothing else measures it. */
function Milestones({ goal, initial }: { goal: string; initial: Milestone[] }) {
  const a = useAspect();
  const coll = useCollection<Milestone>('mission', 'milestones');
  const tick = useTickMilestone();
  const [text, setText] = useState('');
  const list = (coll.items ? coll.items.filter((m) => m.goal === goal && !m.deleted_at) : initial).slice().sort((x, y) => x.position - y.position);
  const done = list.filter((m) => m.done).length;
  const add = () => {
    const title = text.trim();
    if (!title) return;
    setText('');
    void coll.put({ goal, title, done: false, due: null, position: list.length ? Math.max(...list.map((m) => m.position)) + 1 : 0 } as Omit<Milestone, 'id'>)
      .then(() => { haptic.light(); refresh(); }).catch((e) => a.notice(message(e)));
  };
  return (
    <Block title="Milestones" sub={list.length ? `${done} of ${list.length} done` : 'The few points on the way'}>
      {list.length ? (
        <Group inset={64}>
          {list.map((m) => (
            <TickRow key={m.id} done={m.done} onTick={() => tick(m.id, !m.done)} tickLabel={m.done ? `Mark ${m.title} not done` : `Mark ${m.title} done`} title={m.title}
              sub={m.done && m.done_at ? `Done ${shortDay(myDay(m.done_at))}` : m.due ? `Due ${dueWords(m.due)}` : null} />
          ))}
        </Group>
      ) : null}
      <Field value={text} onChangeText={setText} placeholder={list.length ? 'Add a milestone' : 'Add the first milestone'} onSubmit={add} maxLength={200} />
      {text.trim() ? <Button label="Add milestone" kind="soft" small onPress={add} wrap={st.left} /> : null}
    </Block>
  );
}

/** Tasks tied to the goal, ticked here as on Today; tie one he already has, or add one. */
function Tasks({ goal, d }: { goal: string; d: GoalDetail }) {
  const a = useAspect();
  const nav = useNav();
  const tick = useTickTask();
  const [text, setText] = useState('');
  const add = () => {
    const title = text.trim();
    if (!title) return;
    setText('');
    void act(`/goal/${goal}/task`, { title }).then(() => { haptic.light(); a.notice('Added to Today, tied to this goal'); }).catch((e) => a.notice(message(e)));
  };
  const open = d.tasks.filter((x) => x.status !== 'done');
  const done = d.tasks.filter((x) => x.status === 'done');
  return (
    <Block title="Tasks" sub={d.tasks.length ? `${done.length} of ${d.tasks.length} done` : null} action="Tie a task" onAction={() => nav.tie(goal)}>
      {d.tasks.length ? (
        <Group inset={64}>
          {[...open, ...done.slice(0, 5)].map((x) => (
            <TickRow key={x.id} done={x.status === 'done'} onTick={() => tick(x, x.status !== 'done')} title={x.title}
              tickLabel={x.status === 'done' ? `Mark ${x.title} not done` : `Mark ${x.title} done`}
              sub={x.status === 'done' ? (x.doneAt ? `Done ${shortDay(myDay(x.doneAt))}` : 'Done') : x.due ? `Due ${dueWords(x.due)}` : null} />
          ))}
        </Group>
      ) : <Text style={[t.footnote, st.pad]}>No tasks carry it yet. Tie one you already have, or add one here. It shows on Today.</Text>}
      <Field value={text} onChangeText={setText} placeholder="Add a task for it" onSubmit={add} maxLength={300} />
      {text.trim() ? <Button label="Add task" kind="soft" small onPress={add} wrap={st.left} /> : null}
    </Block>
  );
}

function EditSheet({ open, d, onClose, onSaved }: { open: boolean; d: GoalDetail; onClose: () => void; onSaved: () => void }) {
  const a = useAspect();
  const [title, setTitle] = useState(d.goal.title);
  const [aspects, setAspects] = useState<AspectKey[]>(d.goal.aspects ?? (d.goal.aspect ? [d.goal.aspect] : []));
  const [busy, setBusy] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) { setWas(open); if (open) { setTitle(d.goal.title); setAspects(d.goal.aspects ?? (d.goal.aspect ? [d.goal.aspect] : [])); } }
  const save = async () => {
    setBusy(true);
    try { await act(`/goal/${d.goal.id}`, { title: title.trim(), aspects }); haptic.light(); onSaved(); onClose(); } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit goal">
      <Field label="Goal" value={title} onChangeText={setTitle} maxLength={300} />
      <View style={st.gap8}>
        <Text style={t.footnote}>Sections it serves, up to three</Text>
        <View style={st.chips}>
          {ASPECT_KEYS.map((k) => (
            <Chip key={k} label={ASPECT_LABEL[k]} selected={aspects.includes(k)} icon={<Dot aspect={k} />}
              onPress={() => setAspects((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k].slice(-3)))} />
          ))}
        </View>
      </View>
      <Button label="Save" kind="accent" onPress={save} busy={busy} disabled={!title.trim()} />
    </Sheet>
  );
}

/** With no target there is no percentage: the big figure is the reading itself. */
function bigReading(g: Goal, s: Sources) {
  const r = liveReading(g, s) ?? g.source.reading ?? null;
  return r ? fmt(r.value, r.unit) : 'No number yet';
}

// ── measure ──────────────────────────────────────────────────────────────────────────────────────────────────
type Kind = 'auto' | 'manual' | 'income' | 'jar' | 'weight';

/** Where a goal's number comes from: counted for him, set by hand, or read from Money or Body with its date. */
export function MeasureSheet({ goal, onClose }: { goal: string | null; onClose: () => void }) {
  const [shown, setShown] = useState(goal);
  if (goal && goal !== shown) setShown(goal);
  return (
    <Sheet open={!!goal} onClose={onClose} title="How is it measured?">
      {shown ? <MeasureBody key={shown} goal={shown} onClose={onClose} /> : null}
    </Sheet>
  );
}

function MeasureBody({ goal, onClose }: { goal: string; onClose: () => void }) {
  const a = useAspect();
  const r = useGet<GoalDetail>(`${M}/goal/${goal}`);
  const measures = useCollection<Measure>('mission', 'measures');
  const d = r.data;
  const cur = d?.measure && !d.measure.deleted_at ? d.measure : null;
  const [kind, setKind] = useState<Kind | null>(null);
  const k: Kind = kind ?? (cur?.source as Kind) ?? (d?.goal.progressMode === 'manual' ? 'manual' : 'auto');
  const same = cur?.source === k ? cur : null; // a number kept for one kind of measure never prefills another
  const [pct, setPct] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [jar, setJar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const jars = useGet<{ jars: Jar[] }>(k === 'jar' ? '/mod/money/jars' : null);
  const body = useGet<{ weight: { now: number | null; goal: { goal: number } | null } | null }>(k === 'weight' ? '/mod/body/today' : null);
  if (!d) return r.error ? <Failed message={r.error} onRetry={r.refresh} /> : <Skeleton height={200} radius={22} />;

  const value = pct ?? Math.round(d.goal.progress);
  const n = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
  const save = async () => {
    setBusy(true);
    try {
      const base = { id: goal, goal };
      if (k === 'auto') { await measures.put({ ...base, source: 'auto' }); await call(`${M}/goal/${goal}`, { progressMode: 'auto' }); }
      if (k === 'manual') { await measures.put({ ...base, source: 'manual' }); await call(`${M}/goal/${goal}`, { progress: value }); }
      if (k === 'income') await measures.put({ ...base, source: 'income', unit: 'rupees', target: n(target) ?? same?.target ?? null });
      if (k === 'jar') await measures.put({ ...base, source: 'jar', unit: 'rupees', jar: pickJar, target: null });
      if (k === 'weight') await measures.put({ ...base, source: 'weight', unit: 'kg', target: n(target) ?? same?.target ?? null, from: n(from) ?? same?.from ?? body.data?.weight?.now ?? null });
      refresh();
      haptic.light();
      onClose();
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  // a jar Money already ties to this goal comes first and is the default pick
  const items = jars.data ? [...jars.data.jars].sort((x, y) => Number(y.goal === goal) - Number(x.goal === goal)) : null;
  const pickJar = jar ?? same?.jar ?? items?.find((f) => f.goal === goal)?.id ?? null;
  return (
    <>
      <View style={st.tiles}>
        <Tile title="Count it for me" sub="Tasks or goals under it, else milestones" selected={k === 'auto'} onPress={() => setKind('auto')} />
        <Tile title="A number I set" sub="Move it by hand" selected={k === 'manual'} onPress={() => setKind('manual')} />
        <Tile title="Income this month" sub="From Money" selected={k === 'income'} onPress={() => setKind('income')} />
        <Tile title="A savings jar" sub="From Money" selected={k === 'jar'} onPress={() => setKind('jar')} />
        <Tile title="Weight" sub="From Body" selected={k === 'weight'} onPress={() => setKind('weight')} />
      </View>
      {k === 'manual' ? <Stepper label="progress" value={value} onChange={setPct} step={5} min={0} max={100} format={(v) => `${v}%`} /> : null}
      {k === 'income' ? <Field label="Target for the month" value={target} onChangeText={setTarget} keyboardType="number-pad" suffix="₹" placeholder={same?.target ? String(same.target) : 'Money’s own target'} /> : null}
      {k === 'jar' ? (
        items == null ? (jars.error ? <Text style={t.footnote}>{jars.error}</Text> : <Skeleton height={36} />)
          : items.length ? (
            <View style={st.chips}>
              {items.map((f) => (
                <Chip key={f.id} label={`${f.name}, ${fmt(f.saved, 'rupees')}${f.goal === goal ? ', serves this goal' : ''}`} selected={pickJar === f.id} onPress={() => setJar(f.id)} />
              ))}
            </View>
          ) : <Text style={t.footnote}>No savings jars in Money yet. Make one there and it shows here.</Text>
      ) : null}
      {k === 'weight' ? (
        <View style={st.row2}>
          <View style={ps.flex}><Field label="Starting from" value={from} onChangeText={setFrom} keyboardType="decimal-pad" suffix="kg" inputStyle={st.shrink} placeholder={same?.from != null ? String(same.from) : body.data?.weight?.now != null ? String(body.data.weight.now) : ''} /></View>
          <View style={ps.flex}><Field label="Aiming for" value={target} onChangeText={setTarget} keyboardType="decimal-pad" suffix="kg" inputStyle={st.shrink} placeholder={same?.target != null ? String(same.target) : body.data?.weight?.goal ? String(body.data.weight.goal.goal) : ''} /></View>
        </View>
      ) : null}
      <Text style={t.footnote}>{k === 'auto' ? 'Done tasks and finished goals under it move it. With neither, milestones do.' : k === 'manual' ? 'Only you move this one. Log progress from the goal or from Now.' : 'Read each time you open Mission, with the date it was true.'}</Text>
      <Button label="Save" kind="accent" onPress={save} busy={busy} disabled={k === 'jar' && !pickJar} />
    </>
  );
}

const st = StyleSheet.create({
  shrink: { minWidth: 0 }, // a web input keeps a wide default width; without this the suffix is pushed out of a half-width field
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  head: { gap: 8 },
  pad: { paddingHorizontal: 4 },
  left: { alignSelf: 'flex-start' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row2: { flexDirection: 'row', gap: 12 },
});
