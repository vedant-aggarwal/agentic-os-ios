import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SignIn } from '@/components/SignIn';
import { openSheet } from '@/work/bus';
import { useOrca, useProjectHome, work } from '@/work/store';
import { HubList, type Item, type ListHandlers, type Sec } from '@/work/ui/HubList';
import { IdeaIcon, JobIcon, MicIcon, SettingsIcon, TaskIcon } from '@/work/ui/icons';
import { useAnswered } from '@/work/ui/NeedCard';
import { orcaLive, orcaWaiting } from '@/work/ui/orca';
import { ProjectHeader } from '@/work/ui/ProjectHeader';
import type { QuickAction } from '@/work/ui/QuickBar';
import { Shell } from '@/work/ui/Shell';

// One project: what waits on him, what runs (app jobs and its Orca agents), its ideas and tasks, past jobs, its
// recent Orca agents, outside sessions and uncommitted changes. The header draws at once from the hub's project card while the full ProjectHome loads.

const JOBS_CUT = 8;
const ORCA_CUT = 4;

export default function ProjectHome() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = (Array.isArray(params.slug) ? params.slug[0] : params.slug) ?? '';
  const { slot, card } = useProjectHome(slug);
  const data = slot.data;
  const project = data?.project ?? card;
  const { hidden, hide, unhide } = useAnswered();
  const [refreshing, setRefreshing] = useState(false);
  const [allJobs, setAllJobs] = useState(false);
  const [allOrca, setAllOrca] = useState(false);
  const orca = useOrca();
  const agents = useMemo(() => (orca.data?.up ? orca.data.agents.filter((a) => a.project === slug) : []), [orca.data, slug]);

  const reload = useCallback(() => Promise.all([work.loadProject(slug), work.loadHome(), work.loadOrca()]), [slug]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  }, [reload]);
  const settings = useCallback(() => openSheet({ kind: 'projectSettings', project: slug }), [slug]);

  const handlers = useMemo<ListHandlers>(() => ({ onHide: hide, onUndo: unhide, onSent: () => { reload(); } }), [hide, unhide, reload]);

  const quick = useMemo<QuickAction[]>(() => [
    // Push to talk recording is the capture sheets' job; until it lands, the mic opens the idea sheet.
    { key: 'record', label: 'Record', a11y: 'Record an idea', iconOnly: true, icon: <MicIcon />, onPress: () => openSheet({ kind: 'idea', project: slug }) },
    { key: 'idea', label: 'Idea', a11y: 'New idea', icon: <IdeaIcon />, onPress: () => openSheet({ kind: 'idea', project: slug }) },
    { key: 'task', label: 'Task', a11y: 'New task', icon: <TaskIcon />, onPress: () => openSheet({ kind: 'task', project: slug }) },
    { key: 'job', label: 'Job', a11y: 'New job', icon: <JobIcon />, onPress: () => openSheet({ kind: 'job', project: slug }) },
  ], [slug]);

  const sections = useMemo<Sec[]>(() => {
    if (!data) {
      if (slot.load === 'error') {
        return [{ key: 'error', data: [{ kind: 'error', key: 'error', title: `${project?.name ?? 'This project'} didn’t load`, message: slot.error, onRetry: () => { reload(); } }] }];
      }
      return [{ key: 'loading', data: [{ kind: 'loading', key: 'loading' }] }];
    }
    const out: Sec[] = [];
    const needs = data.needs.filter((n) => !hidden.has(n.id));
    if (needs.length) {
      out.push({ key: 'needs', title: 'Needs you', count: needs.length, data: needs.map((n): Item => ({ kind: 'need', key: `n:${n.id}`, need: n })) });
    }
    const liveIds = new Set(data.live.map((j) => j.id));
    // Live: this project's app jobs and Orca agents, the ones waiting on him first.
    const liveAgents = agents.filter(orcaLive);
    const live: Item[] = [
      ...liveAgents.filter(orcaWaiting).map((a): Item => ({ kind: 'orca', key: `o:${a.id}`, agent: a })),
      ...data.live.map((j): Item => ({ kind: 'job', key: `l:${j.id}`, job: j })),
      ...liveAgents.filter((a) => !orcaWaiting(a)).map((a): Item => ({ kind: 'orca', key: `o:${a.id}`, agent: a })),
    ];
    if (live.length) out.push({ key: 'live', title: 'Live', count: live.length, data: live });

    const ideas = data.ideas.filter((i) => i.status !== 'archived');
    out.push({
      key: 'ideas', title: 'Ideas', count: ideas.length,
      data: ideas.length
        ? ideas.map((i): Item => ({ kind: 'idea', key: `i:${i.id}`, idea: i }))
        : [{ kind: 'empty', key: 'i:empty', text: 'No ideas yet', add: { label: 'Add idea', onPress: () => openSheet({ kind: 'idea', project: slug }) } }],
    });
    const tasks = data.tasks.filter((t) => t.status !== 'done' && t.status !== 'dropped');
    out.push({
      key: 'tasks', title: 'Tasks', count: tasks.length,
      data: tasks.length
        ? tasks.map((t): Item => ({ kind: 'task', key: `t:${t.id}`, task: t }))
        : [{ kind: 'empty', key: 't:empty', text: 'No tasks yet', add: { label: 'Add task', onPress: () => openSheet({ kind: 'task', project: slug }) } }],
    });

    const jobs = data.jobs.filter((j) => !liveIds.has(j.id));
    if (jobs.length) {
      const cut = !allJobs && jobs.length > JOBS_CUT + 2;
      out.push({
        key: 'jobs', title: 'Jobs', count: jobs.length,
        data: [
          ...(cut ? jobs.slice(0, JOBS_CUT) : jobs).map((j): Item => ({ kind: 'job', key: `j:${j.id}`, job: j })),
          ...(cut ? [{ kind: 'more', key: 'jobs:more', label: `Show all ${jobs.length}`, onPress: () => setAllJobs(true) } as Item] : []),
        ],
      });
    }
    const done = agents.filter((a) => !orcaLive(a));
    if (done.length) {
      const cut = !allOrca && done.length > ORCA_CUT + 1;
      out.push({
        key: 'orca', title: 'In Orca', count: done.length,
        data: [
          ...(cut ? done.slice(0, ORCA_CUT) : done).map((a): Item => ({ kind: 'orca', key: `r:${a.id}`, agent: a })),
          ...(cut ? [{ kind: 'more', key: 'orca:more', label: `Show all ${done.length}`, onPress: () => setAllOrca(true) } as Item] : []),
        ],
      });
    }
    if (data.sessions.length) {
      out.push({ key: 'sessions', title: 'Sessions', count: data.sessions.length, data: data.sessions.map((x): Item => ({ kind: 'session', key: `s:${x.id}`, session: x })) });
    }
    const changes = data.repo.filter((r) => r.changed || r.ahead);
    if (changes.length) {
      out.push({
        key: 'changes', title: 'Changes',
        data: changes.map((r): Item => ({ kind: 'repo', key: `r:${r.folder}`, repo: r, folders: data.project.folders })),
      });
    }
    return out;
  }, [data, slot.load, slot.error, project?.name, hidden, allJobs, allOrca, agents, slug, reload]);

  if (slot.load === 'signedOut') return <SignIn onDone={() => { reload(); }} />;

  const header = project
    ? <ProjectHeader project={project} repo={data?.repo ?? []} onLink={settings} />
    : <View style={s.titleBar} accessibilityLabel="Loading" />;

  return (
    <Shell actions={quick} right={{ label: 'Project settings', icon: <SettingsIcon />, onPress: settings }}>
      <HubList sections={sections} header={header} refreshing={refreshing} onRefresh={refresh} handlers={handlers} />
    </Shell>
  );
}

const s = StyleSheet.create({
  // the name's place while nothing about the project is cached yet
  titleBar: { height: 36, width: '56%', borderRadius: 8, marginBottom: 24, backgroundColor: 'rgba(255,255,255,0.07)' },
});
