import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, Empty, Failed, Field, haptic, Row, Screen, Section, Sheet, shortDay, Skeleton, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { act, cap, count, M, message, WHY_SWITCH } from './data';
import { useNav } from './nav';
import { Dot, s as ps, Tag, Tile } from './parts';
import type { Project, Projects as ProjectsData } from './types';

const PROJECTS = `${M}/projects`;
const serves = (p: Project) => (p.goal ? `Serves ${p.goal.title}` : 'Serves no goal yet');
const pace = (p: Project) => (p.done14 ? `${cap(count(p.done14, 'task'))} done in two weeks` : p.lastDone ? `Last task done ${shortDay(p.lastDone.slice(0, 10))}` : 'Nothing done yet');

/**
 * Projects, each with the goal it serves. One holds the first block; the rest run or are parked. A project that has
 * gone quiet for a month is shown apart, with one tap to park it.
 */
export function Projects({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<ProjectsData>(open ? PROJECTS : null);
  const [pick, setPick] = useState<string | null>(null);
  const d = r.data;
  const live = d?.items.filter((p) => p.status !== 'done') ?? [];
  const running = live.filter((p) => p.status === 'active' && !p.quiet);
  const quiet = live.filter((p) => p.status === 'active' && p.quiet);
  const parked = live.filter((p) => p.status === 'paused');
  const park = (p: Project, on: boolean) => {
    void act(`/project/${p.slug}`, { status: on ? 'paused' : 'active' }).then(() => { haptic.light(); a.notice(on ? `${p.name} parked` : `${p.name} is running again`); })
      .catch((e) => a.notice(message(e)));
  };
  const row = (p: Project) => (
    <Row key={p.slug} title={p.name} sub={`${serves(p)}. ${pace(p)}.`} left={<Dot aspect={p.aspect} />} chevron onPress={() => setPick(p.slug)} />
  );
  const chosen = live.find((p) => p.slug === pick) ?? null;
  return (
    <Screen open={open} onClose={onClose} title="Projects">
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !d ? (
        <View style={st.gap}><Skeleton height={96} radius={24} /><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></View>
      ) : !live.length ? (
        <Empty title="No projects yet" body="Projects are made on the PC or by Nora. Each one shows here with the goal it serves." />
      ) : (
        <>
          <Card style={st.first}>
            <Text style={t.label}>First block, every day</Text>
            <Text style={t.lead}>{d.first ? d.first.name : 'No project has it yet'}</Text>
            {d.first ? <Tag aspect={d.first.serves?.aspect ?? null} text={d.first.serves ? `Serves ${d.first.serves.title}` : 'Serves no goal yet'} /> : null}
            <Button label={d.first ? 'Switch' : 'Pick the project'} kind="soft" small onPress={() => nav.first()} wrap={st.left} />
          </Card>
          {d.switches.length ? (
            <Section title="Switches">
              {d.switches.slice(-3).reverse().map((s) => (
                <Text key={s.at} style={t.small}>{`${shortDay(s.at.slice(0, 10))}: from ${s.fromName ?? s.from}${s.why ? `, because ${s.why.toLowerCase()}` : ''}.`}</Text>
              ))}
            </Section>
          ) : null}
          {running.length ? <Section title={`Running, ${running.length}`}>{running.map(row)}</Section> : null}
          {quiet.length ? (
            <Section title={`Quiet for a month, ${quiet.length}`}>
              <Text style={t.small}>Nothing done on these in thirty days. Parking one keeps it safe and out of the way.</Text>
              {quiet.map((p) => (
                <View key={p.slug} style={st.quiet}>
                  <View style={ps.flex}>
                    <Row title={p.name} sub={`${serves(p)}. ${pace(p)}.`} left={<Dot aspect={p.aspect} />} onPress={() => setPick(p.slug)} />
                  </View>
                  <Button label="Park" kind="quiet" small onPress={() => park(p, true)} />
                </View>
              ))}
            </Section>
          ) : null}
          {parked.length ? <Section title={`Parked, ${parked.length}`}>{parked.map(row)}</Section> : null}
        </>
      )}
      <ProjectSheet p={chosen} goals={d?.goals ?? []} onClose={() => setPick(null)} onPark={park} />
    </Screen>
  );
}

function ProjectSheet({ p, goals, onClose, onPark }: { p: Project | null; goals: ProjectsData['goals']; onClose: () => void; onPark: (p: Project, on: boolean) => void }) {
  const a = useAspect();
  const nav = useNav();
  const [shown, setShown] = useState(p);
  if (p && p !== shown) setShown(p);
  const x = shown;
  const tie = (goal: string | null) => {
    if (!x) return;
    void act(`/project/${x.slug}`, { goal }).then(() => { haptic.tick(); onClose(); }).catch((e) => a.notice(message(e)));
  };
  return (
    <Sheet open={!!p} onClose={onClose} title={x?.name}>
      {x ? (
        <>
          {x.description ? <Text style={t.small}>{x.description}</Text> : null}
          <Text style={t.small}>{`${pace(x)}.${x.open ? ` ${cap(count(x.open, 'task'))} open.` : ''}${x.next ? ` Next: ${x.next.title}.` : ''}${x.deadline ? ` Deadline ${shortDay(x.deadline)}.` : ''}`}</Text>
          <Text style={t.label}>The goal it serves</Text>
          <View style={st.chips}>
            {goals.filter((g) => !g.status || g.status === 'active').map((g) => (
              <Chip key={g.id} label={g.title.length > 34 ? `${g.title.slice(0, 32)}…` : g.title} icon={<Dot aspect={g.aspect} />} selected={x.goal?.id === g.id} onPress={() => tie(g.id)} />
            ))}
            <Chip label="No goal" selected={!x.goal} onPress={() => tie(null)} />
          </View>
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
      <Text style={t.small}>The first block of each day goes to one project. The rest wait their turn.</Text>
      <View style={st.list}>
        {items.map((p) => (
          <Tile key={p.slug} title={p.name} sub={`${p.slug === cur ? 'Has it now. ' : p.status === 'paused' ? 'Parked. ' : ''}${serves(p)}`} selected={pick === p.slug}
            onPress={() => setPick(p.slug)} wrap={st.full} />
        ))}
      </View>
      {switching ? (
        <View style={st.why}>
          <Text style={t.label}>Why the switch?</Text>
          <View style={st.chips}>{WHY_SWITCH.map((w) => <Chip key={w} label={w} selected={why === w} onPress={() => setWhy(why === w ? '' : w)} />)}</View>
          <Field value={WHY_SWITCH.includes(why) ? '' : why} onChangeText={setWhy} placeholder="Or say it in your words" maxLength={200} />
        </View>
      ) : null}
      <Button label={switching ? 'Switch the first block' : 'Give it the first block'} onPress={() => void save()} busy={busy} disabled={!pick || pick === cur} />
    </>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  first: { gap: 8 },
  left: { alignSelf: 'flex-start', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { gap: 8 },
  full: { flexBasis: 'auto', flexGrow: 0 },
  why: { gap: 8 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
