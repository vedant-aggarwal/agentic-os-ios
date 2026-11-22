import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, CheckRing, Chip, Failed, Field, haptic, Icon, IconButton, Row, Screen, Section, Sheet, Skeleton, shortDay, Stepper, t, today, useAspect, weekday,
} from '@/aspects/kit';
import { call, useCollection, useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { CloseChoice } from './CloseFlow';
import {
  act, ASPECT_KEYS, ASPECT_LABEL, count, daysLeftLabel, endedAgo, fmt, fundIn, HORIZON_GOAL, M, message, OUTCOME_WORD, progressOf, refresh,
  sourceLine, useReadingSync, useSources,
} from './data';
import { useNav } from './nav';
import { colorOf, Dot, GoalBar, Link, s as ps, Tag, Tile } from './parts';
import type { Commitment, GoalDetail, Measure, Milestone } from './types';

/** One goal: its progress and where the number comes from, its milestones, what it serves and what serves it. */
export function GoalScreen({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<GoalDetail>(`${M}/goal/${id}`);
  const d = r.data;
  const goals = useMemo(() => (d ? [d.goal] : []), [d]);
  const src = useSources(goals);
  useReadingSync(goals, src);
  const [sheet, setSheet] = useState<'edit' | 'parent' | 'close' | null>(null);

  const g = d?.goal;
  const tone = colorOf(g?.aspect, a.color);
  return (
    <Screen open={open} onClose={onClose} title={g ? HORIZON_GOAL[g.horizon] : 'Goal'}
      right={g ? <IconButton label="Edit goal" size={36} onPress={() => setSheet('edit')}><Icon name="pencil" size={16} /></IconButton> : undefined}>
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !d || !g ? (
        <View style={st.gap}><Skeleton height={64} /><Skeleton height={120} radius={24} /><Skeleton height={160} radius={24} /></View>
      ) : (
        <>
          <View style={st.head}>
            <Text style={[t.title2, g.status !== 'active' && { color: C.muted }]}>{g.title}</Text>
            <Tag aspect={g.aspect} text={`${g.aspect ? ASPECT_LABEL[g.aspect] : 'No aspect yet'}, ${g.horizon === 'week' ? `week of ${g.label}` : g.label}`} />
            <Text style={[t.caption, t.num]}>
              {g.status === 'done' ? 'Done' : g.status === 'dropped' ? (g.closing ? OUTCOME_WORD[g.closing.outcome] : 'Let go')
                : g.end ? (endedAgo(g.end) ?? daysLeftLabel(g.end)) : 'No end date'}
            </Text>
          </View>

          <Card style={st.progress}>
            {g.source.kind === 'none' ? (
              <>
                <Text style={t.strong}>No number yet</Text>
                <Text style={t.small}>Give it milestones, tie tasks to it, or read it from Money or Body.</Text>
                <Button label="Choose how to measure it" kind="soft" small onPress={() => nav.measure(g.id)} wrap={st.left} />
              </>
            ) : (
              <>
                <Text style={[t.big, t.num, { color: tone }]}>{Math.round(progressOf(g, src) * 100)}%</Text>
                <GoalBar progress={progressOf(g, src)} time={g.time} color={tone} />
                <Text style={t.small}>{sourceLine(g, src)}{g.time != null && g.time > 0.01 && g.status === 'active' ? `. ${Math.round(Math.min(1, g.time) * 100)}% of its time has gone.` : '.'}</Text>
                <Link label="Change how it's measured" onPress={() => nav.measure(g.id)} />
              </>
            )}
          </Card>

          {'state' in g ? <WeekState c={g as Commitment} /> : null}
          <Milestones goal={g.id} initial={d.milestones} />

          <Section title="What it serves" action={d.parents.length ? (g.parent ? 'Change' : 'Choose') : undefined} onAction={() => setSheet('parent')}>
            {g.parent ? (
              <Row title={g.parent.title} sub={HORIZON_GOAL[g.parent.horizon]} left={<Dot aspect={g.parent.aspect} />} chevron onPress={() => nav.goal(g.parent!.id)} />
            ) : <Text style={t.small}>{d.parents.length ? 'Serves no bigger goal yet.' : 'Nothing above it on the ladder to serve.'}</Text>}
          </Section>
          {d.children.length ? (
            <Section title="What serves it">
              {d.children.map((c) => <Row key={c.id} title={c.title} sub={`${HORIZON_GOAL[c.horizon]}, ${c.label}`} left={<Dot aspect={c.aspect} />} chevron onPress={() => nav.goal(c.id)} />)}
            </Section>
          ) : null}

          <Tasks goal={g.id} d={d} />

          {d.projects.length ? (
            <Section title="Projects serving it">
              {d.projects.map((p) => <Row key={p.slug} title={p.name} sub={p.status === 'paused' ? 'Parked' : 'Running'} />)}
            </Section>
          ) : null}

          {d.closings.length ? (
            <Section title="Its record">
              {d.closings.map((c) => (
                <Row key={c.id} title={`${OUTCOME_WORD[c.outcome]}, ${c.horizon === 'week' ? `week of ${c.label}` : c.label}`}
                  sub={[c.why, c.to ? `Into ${c.to.label}` : null, c.by === 'growth' ? 'From your weekly review' : null].filter(Boolean).join('. ') || null} />
              ))}
            </Section>
          ) : null}

          {g.status === 'active'
            ? <Button label="Close this goal" kind="quiet" onPress={() => setSheet('close')} />
            : <Button label="Open it again" kind="quiet" onPress={() => { void act('/reopen', { goal: g.id }).then(() => r.refresh()).catch((e) => a.notice(message(e))); }} />}

          <EditSheet open={sheet === 'edit'} d={d} onClose={() => setSheet(null)} onSaved={() => r.refresh()} />
          <Sheet open={sheet === 'parent'} onClose={() => setSheet(null)} title="What does it serve?">
            {d.parents.map((p) => (
              <Row key={p.id} title={p.title} sub={HORIZON_GOAL[p.horizon]} left={<Dot aspect={p.aspect} />} right={g.parent?.id === p.id ? <Icon name="check" size={16} color={a.color} /> : undefined}
                onPress={() => { setSheet(null); void act(`/goal/${g.id}`, { parent: p.id }).then(() => r.refresh()).catch((e) => a.notice(message(e))); }} />
            ))}
            {g.parent ? <Button label="Serves nothing bigger" kind="quiet" onPress={() => { setSheet(null); void act(`/goal/${g.id}`, { parent: null }).then(() => r.refresh()); }} /> : null}
          </Sheet>
          <Sheet open={sheet === 'close'} onClose={() => setSheet(null)} title="What happened?">
            <Text style={t.small}>{g.title}</Text>
            <CloseChoice goal={g} sunday={weekday(today()) === 0} onClosed={() => { setSheet(null); void r.refresh(); }} />
          </Sheet>
        </>
      )}
    </Screen>
  );
}

function WeekState({ c }: { c: Commitment }) {
  if (c.status !== 'active') return null;
  const head = c.state === 'moving' ? (c.tasks.doneWeek ? `Moving, ${count(c.tasks.doneWeek, 'task')} done this week` : 'Moving') : c.state === 'not_started' ? 'Not started yet' : 'Next step';
  return (
    <Section title={head}>
      <Text style={t.body}>{c.next ? (c.state === 'not_started' ? `Smallest next step: ${c.next.title}` : c.next.title) : 'No next step yet. Add a milestone or a task below.'}</Text>
    </Section>
  );
}

/** Milestones tick here and move the goal when nothing else measures it. */
function Milestones({ goal, initial }: { goal: string; initial: Milestone[] }) {
  const a = useAspect();
  const coll = useCollection<Milestone>('mission', 'milestones');
  const [text, setText] = useState('');
  const list = (coll.items ? coll.items.filter((m) => m.goal === goal && !m.deleted_at) : initial).slice().sort((x, y) => x.position - y.position);
  const done = list.filter((m) => m.done).length;
  const toggle = (m: Milestone) => {
    void coll.patch(m.id, { done: !m.done, done_at: m.done ? null : new Date().toISOString() }).then(refresh).catch((e) => a.notice(message(e)));
  };
  const add = () => {
    const title = text.trim();
    if (!title) return;
    setText('');
    void coll.put({ goal, title, done: false, due: null, position: list.length ? Math.max(...list.map((m) => m.position)) + 1 : 0 } as Omit<Milestone, 'id'>)
      .then(() => { haptic.light(); refresh(); }).catch((e) => a.notice(message(e)));
  };
  return (
    <Section title={list.length ? `Milestones, ${done} of ${list.length}` : 'Milestones'}>
      {list.map((m) => <Row key={m.id} title={m.title} done={m.done} onToggle={() => toggle(m)} sub={m.done && m.done_at ? `Done ${shortDay(m.done_at.slice(0, 10))}` : null} />)}
      <Field value={text} onChangeText={setText} placeholder={list.length ? 'Add a milestone' : 'Add the first milestone'} onSubmit={add} maxLength={200} />
      {text.trim() ? <Button label="Add milestone" kind="soft" small onPress={add} wrap={st.left} /> : null}
    </Section>
  );
}

/** Tasks tied to the goal. They are done on Today; here he can see them and add one. */
function Tasks({ goal, d }: { goal: string; d: GoalDetail }) {
  const a = useAspect();
  const [text, setText] = useState('');
  const add = () => {
    const title = text.trim();
    if (!title) return;
    setText('');
    void act(`/goal/${goal}/task`, { title }).then(() => haptic.light()).catch((e) => a.notice(message(e)));
  };
  const open = d.tasks.filter((x) => x.status !== 'done');
  const done = d.tasks.filter((x) => x.status === 'done');
  return (
    <Section title={d.tasks.length ? `Tasks, ${done.length} of ${d.tasks.length} done` : 'Tasks'}>
      {[...open, ...done.slice(0, 5)].map((x) => (
        <Row key={x.id} title={x.title} done={x.status === 'done'} left={<CheckRing done={x.status === 'done'} size={20} />}
          sub={x.status === 'done' ? (x.doneAt ? `Done ${shortDay(x.doneAt.slice(0, 10))}` : 'Done') : x.due ? `Due ${shortDay(x.due)}` : null} />
      ))}
      {!d.tasks.length ? <Text style={t.small}>No tasks carry it yet. Tasks you add here show on Today.</Text> : null}
      <Field value={text} onChangeText={setText} placeholder="Add a task for it" onSubmit={add} maxLength={300} />
      {text.trim() ? <Button label="Add task" kind="soft" small onPress={add} wrap={st.left} /> : null}
    </Section>
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
      <Text style={t.label}>Aspect</Text>
      <View style={st.chips}>
        {ASPECT_KEYS.map((k) => (
          <Chip key={k} label={ASPECT_LABEL[k]} selected={aspects.includes(k)} icon={<Dot aspect={k} />}
            onPress={() => setAspects((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k].slice(-3)))} />
        ))}
      </View>
      <Button label="Save" onPress={save} busy={busy} disabled={!title.trim()} />
    </Sheet>
  );
}

// ── measure ──────────────────────────────────────────────────────────────────────────────────────────────────
type Kind = 'auto' | 'manual' | 'income' | 'jar' | 'weight';
type Fund = { id: string; name: string; target?: number | null; saved?: number; balance?: number; in?: number; deleted_at?: string | null };

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
  const funds = useGet<{ items: Fund[] }>(k === 'jar' ? '/mod/money/funds' : null);
  const body = useGet<{ weight: { now: number | null; goal: { goal: number } | null } | null }>(k === 'weight' ? '/mod/body/today' : null);
  if (!d) return r.error ? <Failed message={r.error} onRetry={r.refresh} /> : <Skeleton height={200} radius={24} />;

  const value = pct ?? Math.round(d.goal.progress);
  const n = (s: string) => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
  const save = async () => {
    setBusy(true);
    try {
      const base = { id: goal, goal };
      if (k === 'auto') { await measures.put({ ...base, source: 'auto' }); await call(`${M}/goal/${goal}`, { progressMode: 'auto' }); }
      if (k === 'manual') { await measures.put({ ...base, source: 'manual' }); await call(`${M}/goal/${goal}`, { progress: value }); }
      if (k === 'income') await measures.put({ ...base, source: 'income', unit: 'rupees', target: n(target) ?? same?.target ?? null });
      if (k === 'jar') await measures.put({ ...base, source: 'jar', unit: 'rupees', jar: jar ?? same?.jar ?? null, target: null });
      if (k === 'weight') await measures.put({ ...base, source: 'weight', unit: 'kg', target: n(target) ?? same?.target ?? null, from: n(from) ?? same?.from ?? body.data?.weight?.now ?? null });
      refresh();
      haptic.light();
      onClose();
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  const items = funds.data?.items.filter((f) => !f.deleted_at) ?? null;
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
        items == null ? (funds.error ? <Text style={t.small}>{funds.error}</Text> : <Skeleton height={36} />)
          : items.length ? (
            <View style={st.chips}>
              {items.map((f) => {
                const v = fundIn(f);
                return <Chip key={f.id} label={v != null ? `${f.name}, ${fmt(v, 'rupees')}` : f.name} selected={(jar ?? same?.jar) === f.id} onPress={() => setJar(f.id)} />;
              })}
            </View>
          ) : <Text style={t.small}>No savings jars in Money yet. Make one there and it shows here.</Text>
      ) : null}
      {k === 'weight' ? (
        <View style={st.row2}>
          <View style={ps.flex}><Field label="Starting from" value={from} onChangeText={setFrom} keyboardType="decimal-pad" suffix="kg" inputStyle={st.shrink} placeholder={same?.from != null ? String(same.from) : body.data?.weight?.now != null ? String(body.data.weight.now) : ''} /></View>
          <View style={ps.flex}><Field label="Aiming for" value={target} onChangeText={setTarget} keyboardType="decimal-pad" suffix="kg" inputStyle={st.shrink} placeholder={same?.target != null ? String(same.target) : body.data?.weight?.goal ? String(body.data.weight.goal.goal) : ''} /></View>
        </View>
      ) : null}
      <Text style={t.caption}>{k === 'auto' ? 'Done tasks and finished goals under it move it. With neither, milestones do.' : k === 'manual' ? 'Only you move this one.' : 'Read each time you open Mission, with the date it was true.'}</Text>
      <Button label="Save" onPress={save} busy={busy} disabled={k === 'jar' && !(jar ?? same?.jar)} />
    </>
  );
}

const st = StyleSheet.create({
  shrink: { minWidth: 0 }, // a web input keeps a wide default width; without this the suffix is pushed out of a half-width field
  gap: { gap: 16 },
  head: { gap: 8 },
  progress: { gap: 8 },
  left: { alignSelf: 'flex-start', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row2: { flexDirection: 'row', gap: 12 },
});
