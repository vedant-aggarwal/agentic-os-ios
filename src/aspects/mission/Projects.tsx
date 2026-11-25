import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, Chip, dayOf, Empty, Failed, Field, Group, haptic, Icon, Item, Lead, Metric, Metrics, myDay, Press, Sheet, shortDay, Skeleton, t,
  undoable, useAspect,
} from '@/aspects/kit';
import { call, invalidate, useGet } from '@/lib/mod';
import { C } from '@/theme';
import { act, cap, count, dueWords, M, message, refresh, when, WHY_SWITCH } from './data';
import { useNav } from './nav';
import { Disc, Dot, lower, s as ps, Serves, TickRow, useTickTask } from './parts';
import type { Project, Projects as ProjectsData } from './types';

export const PROJECTS = `${M}/projects`;
const serves = (p: Project) => (p.goal ? `Serves ${p.goal.title}` : 'Serves no goal yet');
const pace = (p: Project) => (p.done14 ? `${cap(count(p.done14, 'task'))} done in two weeks` : p.lastDone ? `Last task done ${shortDay(myDay(p.lastDone))}` : 'Nothing done yet');

/**
 * Projects: the one with the first block leads, with its next action to tick. Every running project shows its next
 * action, ticked in one tap with Undo. A project quiet for a month is shown apart with one tap to park it.
 */
export function ProjectsTab({ active }: { active: boolean }) {
  const a = useAspect();
  const r = useGet<ProjectsData>(a.open && active ? PROJECTS : null);
  const [pick, setPick] = useState<string | null>(null);
  const d = r.data;
  const live = d?.items.filter((p) => p.status !== 'done') ?? [];
  const chosen = live.find((p) => p.slug === pick) ?? null;
  const park = (p: Project, on: boolean) => {
    void act(`/project/${p.slug}`, { status: on ? 'paused' : 'active' }).then(() => {
      haptic.light();
      undoable(on ? `${p.name} parked` : `${p.name} is running again`, () => act(`/project/${p.slug}`, { status: on ? 'active' : 'paused' }).then(() => {}).catch((e) => a.notice(message(e))));
    }).catch((e) => a.notice(message(e)));
  };

  if (!d && r.error) return <Failed message={r.error} onRetry={r.refresh} />;
  if (!d) {
    return <View style={st.gap20} accessibilityLabel="Loading projects"><Skeleton height={260} radius={28} /><Skeleton height={18} width="35%" /><Skeleton height={180} radius={22} /></View>;
  }
  if (!live.length) return <Empty title="No projects yet" body="Projects are made on the PC or by Nora. Each one shows here with the goal it serves and its next action." />;

  const first = d.first ? live.find((p) => p.slug === d.first!.slug) ?? null : null;
  const running = live.filter((p) => p.status === 'active' && !p.quiet && !p.first);
  const quiet = live.filter((p) => p.status === 'active' && p.quiet);
  const parked = live.filter((p) => p.status === 'paused');
  return (
    <>
      <FirstLead d={d} p={first} onOpen={() => first && setPick(first.slug)} />
      {running.length ? (
        <Block title="Running" sub="Each project's next action. Tick it when it's done.">
          <Group inset={64}>{running.map((p) => <ProjectRow key={p.slug} p={p} onOpen={() => setPick(p.slug)} />)}</Group>
        </Block>
      ) : null}
      {quiet.length ? (
        <Block title="Quiet for a month" sub="Nothing done on these in thirty days. Parking one keeps it safe and out of the way.">
          <Group inset={36}>
            {quiet.map((p) => (
              <Item key={p.slug} title={p.name} sub={`${pace(p)}. ${serves(p)}`} left={<Dot aspect={p.aspect} />} onPress={() => setPick(p.slug)}
                action={<Button label="Park" kind="quiet" small onPress={() => park(p, true)} />} />
            ))}
          </Group>
        </Block>
      ) : null}
      {parked.length ? (
        <Block title="Parked" sub="Safe and out of the way until you run them again">
          <Group inset={36}>
            {parked.map((p) => (
              <Item key={p.slug} title={p.name} sub={serves(p)} left={<Dot aspect={p.aspect} />} onPress={() => setPick(p.slug)}
                action={<Button label="Run again" kind="quiet" small onPress={() => park(p, false)} />} />
            ))}
          </Group>
        </Block>
      ) : null}
      {d.switches.length ? (
        <Block title="Switches" sub="When the first block moved, and why">
          <Group>
            {d.switches.slice(0, 5).map((x) => (
              <Item key={x.at} title={`Moved from ${x.fromName ?? x.from}`} sub={`${cap(when(dayOf(x.at)))}, ${x.why ? lower(x.why) : 'no reason given'}`} />
            ))}
          </Group>
        </Block>
      ) : null}
      <ProjectSheet p={chosen} goals={d.goals} onClose={() => setPick(null)} onPark={park} />
    </>
  );
}

/** The project with the first block, its next action lit. */
function FirstLead({ d, p, onOpen }: { d: ProjectsData; p: Project | null; onOpen: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const tick = useTickTask();
  const [busy, setBusy] = useState(false);
  if (!d.first) {
    return (
      <Lead>
        <View style={st.gap4}>
          <Text style={[t.footnote, { color: a.color }]}>First block, every day</Text>
          <Text style={t.title3}>No project has it yet</Text>
          <Text style={t.subhead}>One project gets the first block of every day. The rest wait their turn.</Text>
        </View>
        <Button label="Pick the project" kind="accent" onPress={() => nav.first()} />
      </Lead>
    );
  }
  const f = d.first;
  const next = p?.next ?? null;
  const since = f.status === 'paused' ? 'Parked' : f.inherited ? 'From an earlier week' : f.since ? `Since ${shortDay(dayOf(f.since))}` : null;
  const done = async () => {
    if (!next || busy) return;
    setBusy(true);
    try { await tick(next); } finally { setBusy(false); }
  };
  return (
    <Lead>
      <Press label={`Open ${f.name}`} onPress={onOpen} scale={0.99} style={st.gap6}>
        <View style={st.between}>
          <Text style={[t.footnote, { color: a.color }]}>First block, every day</Text>
          {since ? <Text style={[t.footnote, t.num]}>{since}</Text> : null}
        </View>
        <Text style={t.title3}>{f.name}</Text>
        <Serves aspect={f.serves?.aspect ?? null} text={f.serves ? `Serves ${f.serves.title}` : 'Serves no goal yet'} strong />
      </Press>
      {p ? <Text style={[t.footnote, t.num]}>{`${pace(p)}${p.open ? `, ${count(p.open, 'task')} open` : ''}`}</Text> : null}
      <View style={st.step}>
        <Text style={t.footnote}>{next ? 'Next action' : 'No next action yet'}</Text>
        <Text style={next ? t.headline : t.subhead}>{next ? next.title : 'Nothing open on it. Add the next action so the block has something to start on.'}</Text>
        {next?.due ? <Text style={[t.footnote, t.num]}>{`Due ${dueWords(next.due)}`}</Text> : null}
      </View>
      <View style={st.buttons}>
        {next
          ? <Button label="Mark done" kind="accent" busy={busy} onPress={() => void done()} icon={<Icon name="check" size={18} color="#14161C" />} wrap={ps.flex} />
          : <Button label="Add the next action" kind="accent" onPress={onOpen} icon={<Icon name="plus" size={18} color="#14161C" />} wrap={ps.flex} />}
        <Button label="Switch" kind="quiet" onPress={() => nav.first()} />
      </View>
    </Lead>
  );
}

/** A running project: its next action ticks in one tap (Undo puts it back); the row opens the project. */
function ProjectRow({ p, onOpen }: { p: Project; onOpen: () => void }) {
  const a = useAspect();
  const tick = useTickTask();
  const next = p.next;
  if (!next) {
    return (
      <Item title={p.name} sub="No next action yet" left={<Disc><Icon name="plus" size={16} color={C.textSoft} /></Disc>} onPress={onOpen} chevron />
    );
  }
  return (
    <TickRow done={false} onTick={() => tick(next)} tickLabel={`Mark ${next.title} done`} title={next.title}
      sub={[p.name, next.due ? `due ${dueWords(next.due)}` : null].filter(Boolean).join(', ')} color={a.color} onPress={onOpen} />
  );
}

function ProjectSheet({ p, goals, onClose, onPark }: { p: Project | null; goals: ProjectsData['goals']; onClose: () => void; onPark: (p: Project, on: boolean) => void }) {
  const a = useAspect();
  const nav = useNav();
  const tick = useTickTask();
  const [shown, setShown] = useState(p);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (p && p !== shown) { setShown(p); if (p.slug !== shown?.slug) setText(''); }
  const x = shown;
  const tie = (goal: string | null) => {
    if (!x) return;
    void act(`/project/${x.slug}`, { goal }).then(() => haptic.tick()).catch((e) => a.notice(message(e)));
  };
  const add = async () => {
    const title = text.trim();
    if (!x || !title || busy) return;
    setBusy(true);
    try {
      await call('/tasks', { title: title.slice(0, 300), project: x.slug });
      refresh(); invalidate('/tasks');
      haptic.light();
      setText('');
      a.notice('Next action added');
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!p} onClose={onClose} title={x?.name}>
      {x ? (
        <>
          {x.description ? <Text style={t.subhead}>{x.description}</Text> : null}
          <Metrics>
            <Metric size="s" label="Two weeks" value={String(x.done14)} sub="done" />
            <Metric size="s" label="Open" value={String(x.open)} sub={x.open === 1 ? 'task' : 'tasks'} />
            <Metric size="s" label="Deadline" value={x.deadline ? shortDay(x.deadline) : 'None'} />
          </Metrics>
          <Block title="Next action">
            {x.next ? (
              <Group inset={64}>
                <TickRow done={false} onTick={() => tick(x.next!)} tickLabel={`Mark ${x.next.title} done`} title={x.next.title}
                  sub={x.next.due ? `Due ${dueWords(x.next.due)}` : null} color={a.color} />
              </Group>
            ) : null}
            <Field value={text} onChangeText={setText} placeholder={x.next ? 'Add another action' : 'Add the next action'} maxLength={300} onSubmit={() => void add()} />
            {text.trim() ? <Button label="Add it" kind="soft" small busy={busy} onPress={() => void add()} wrap={st.left} /> : null}
          </Block>
          <Block title="The goal it serves">
            <View style={st.chips}>
              {goals.filter((g) => !g.status || g.status === 'active').map((g) => (
                <Chip key={g.id} label={g.title.length > 34 ? `${g.title.slice(0, 32)}…` : g.title} icon={<Dot aspect={g.aspect} />} selected={x.goal?.id === g.id} onPress={() => tie(g.id)} />
              ))}
              <Chip label="No goal" selected={!x.goal} onPress={() => tie(null)} />
            </View>
          </Block>
          {!x.first && x.status === 'active' ? <Button label="Give it the first block" kind="soft" onPress={() => { onClose(); nav.first(x.slug); }} /> : null}
          <Button label={x.status === 'paused' ? 'Run it again' : 'Park it'} kind="quiet" onPress={() => { onPark(x, x.status !== 'paused'); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

/** Choosing the project that gets the first block. A switch asks why, in one tap, and the reason is kept. */
export function FirstSheet({ open, project, week, onClose }: { open: boolean; project?: string; week: string | null; onClose: () => void }) {
  const [n, setN] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) { setWas(open); if (open) setN(n + 1); }
  return (
    <Sheet open={open} onClose={onClose} title="First block">
      {week ? <FirstBody key={n} project={project} week={week} onClose={onClose} /> : <Skeleton height={120} />}
    </Sheet>
  );
}

function FirstBody({ project, week, onClose }: { project?: string; week: string; onClose: () => void }) {
  const a = useAspect();
  const r = useGet<ProjectsData>(PROJECTS);
  const [pick, setPick] = useState<string | null>(project ?? null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const d = r.data;
  if (!d) return r.error ? <Failed message={r.error} onRetry={r.refresh} /> : <Skeleton height={160} radius={16} />;
  const cur = d.first?.slug ?? null;
  const items = d.items.filter((p) => p.status === 'active' || p.status === 'paused');
  const switching = !!cur && !!pick && pick !== cur;
  const save = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await act(`/week/${week}/first`, { project: pick, why: switching ? why.trim() || null : null });
      haptic.success();
      onClose();
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  if (!items.length) return <Empty title="No projects to pick" body="Make a project first. It can then hold the first block." />;
  return (
    <>
      <Text style={t.subhead}>The first block of each day goes to one project. The rest wait their turn.</Text>
      <Group inset={36}>
        {items.map((p) => (
          <Item key={p.slug} title={p.name} label={`${p.name}${p.slug === cur ? ', has it now' : ''}${pick === p.slug ? ', chosen' : ''}`} left={<Dot aspect={p.aspect} />} onPress={() => setPick(p.slug)}
            sub={serves(p)} value={p.slug === cur ? 'Has it now' : p.status === 'paused' ? 'Parked' : null}
            right={pick === p.slug ? <Icon name="check" size={18} color={a.color} /> : undefined} />
        ))}
      </Group>
      {switching ? (
        <View style={st.gap8}>
          <Text style={t.footnote}>Why the switch? One tap, or say it.</Text>
          <View style={st.chips}>{WHY_SWITCH.map((w) => <Chip key={w} label={w} selected={why === w} onPress={() => setWhy(why === w ? '' : w)} />)}</View>
          <Field value={WHY_SWITCH.includes(why) ? '' : why} onChangeText={setWhy} placeholder="Or say it in your words" maxLength={200} />
        </View>
      ) : null}
      <Button label={switching ? 'Switch the first block' : 'Give it the first block'} kind="accent" onPress={() => void save()} busy={busy} disabled={!pick || pick === cur} />
    </>
  );
}

const st = StyleSheet.create({
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap20: { gap: 20 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  step: { gap: 4, padding: 14, borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.06)' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  left: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
