import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { tap } from '@/components/Glass';
import { SignIn } from '@/components/SignIn';
import { openSheet } from '@/work/bus';
import { fanOrder, useOrca, useWorkHome, work } from '@/work/store';
import type { OrcaAgent, ProjectCard } from '@/work/types';
import { HubList, type Item, type ListHandlers, type Sec } from '@/work/ui/HubList';
import { IdeaIcon, JobIcon, TaskIcon } from '@/work/ui/icons';
import { useAnswered } from '@/work/ui/NeedCard';
import { orcaLive, orcaWaiting, orcaWorking } from '@/work/ui/orca';
import { type MenuAt, ProjectMenu } from '@/work/ui/ProjectMenu';
import { isIdeaProject, type ProjectTab, ProjectTabs } from '@/work/ui/projects';
import { Shell, useShellInsets } from '@/work/ui/Shell';
import { design } from '@/work/variants/liquid';

// The Work orb's tap. Top: the Liquid head (his Claude and Codex limits as glass capsules, whether Orca is there;
// src/work/variants/liquid), then
// everything waiting on him, what's running (app jobs and Orca agents), his projects (Active as tiles, idea
// projects behind a switch), what finished in Orca lately, and the inbox. Draws from the phone's copy at once.

const INBOX_CUT = 6;
const RECENT_CUT = 4;
const DAY = 86_400_000;

const newProject = () => openSheet({ kind: 'project' });
const QUICK = [
  { key: 'idea', label: 'Idea', a11y: 'New idea', icon: <IdeaIcon />, onPress: () => openSheet({ kind: 'idea', project: null }) },
  { key: 'task', label: 'Task', a11y: 'New task', icon: <TaskIcon />, onPress: () => openSheet({ kind: 'task', project: null }) },
  { key: 'job', label: 'Job', a11y: 'New job', icon: <JobIcon />, onPress: () => openSheet({ kind: 'job', project: null }) },
];

export default function WorkHome() {
  const home = useWorkHome();
  const orca = useOrca();
  const pad = useShellInsets(false);
  const { hidden, hide, unhide } = useAnswered();
  const [refreshing, setRefreshing] = useState(false);
  const [allInbox, setAllInbox] = useState(false);
  const [allRecent, setAllRecent] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('active');
  const [menu, setMenu] = useState<MenuAt | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([work.loadHome(), work.loadOrca()]); } finally { setRefreshing(false); }
  }, []);

  const handlers = useMemo<ListHandlers>(() => ({
    onHide: hide,
    onUndo: unhide,
    onSent: () => { work.loadHome(); },
    onHold: (project: ProjectCard, e: GestureResponderEvent) => {
      tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      setMenu({ project, y: e.nativeEvent.pageY });
    },
    onProjectAction: (project, action) => {
      if (action === 'pin') work.patchProject(project.slug, { pinned: !project.pinned });
      else openSheet({ kind: 'projectSettings', project: project.slug });
    },
  }), [hide, unhide]);

  const agents = useMemo(() => (orca.data?.up ? orca.data.agents : []), [orca.data]);
  // "Recent" counts back from Orca's last snapshot, so the list doesn't need a clock.
  const orcaAt = orca.data ? Date.parse(orca.data.at) : 0;

  const sections = useMemo<Sec[]>(() => {
    const d = home.data;
    if (!d) {
      if (home.load === 'error') {
        return [{ key: 'error', data: [{ kind: 'error', key: 'error', title: 'Work didn’t load', message: home.error, onRetry: () => { work.loadHome(); } }] }];
      }
      return [{ key: 'loading', data: [{ kind: 'loading', key: 'loading' }] }];
    }
    const names = new Map(d.projects.map((p) => [p.slug, p.name]));
    const placeOf = (a: OrcaAgent) => (a.project ? names.get(a.project) ?? a.project : a.workspace && a.workspace !== '~' ? a.workspace : 'Orca');
    const out: Sec[] = [];

    const needs = d.needs.filter((n) => !hidden.has(n.id));
    if (needs.length) {
      out.push({
        key: 'needs', title: 'Needs you', count: needs.length,
        data: needs.map((n): Item => ({ kind: 'need', key: `n:${n.id}`, need: n, heading: n.project ? names.get(n.project) ?? n.project : 'Inbox' })),
      });
    }

    // Live: app jobs and Orca agents together, the ones waiting on him first.
    const liveAgents = agents.filter(orcaLive).sort((a, b) => Number(orcaWaiting(b)) - Number(orcaWaiting(a)));
    const live: Item[] = [
      ...liveAgents.filter(orcaWaiting).map((a): Item => ({ kind: 'orca', key: `o:${a.id}`, agent: a, where: placeOf(a) })),
      ...d.live.map((j): Item => ({ kind: 'job', key: `j:${j.id}`, job: j, where: j.project ? names.get(j.project) ?? j.project : null })),
      ...liveAgents.filter((a) => !orcaWaiting(a)).map((a): Item => ({ kind: 'orca', key: `o:${a.id}`, agent: a, where: placeOf(a) })),
    ];
    if (live.length) out.push({ key: 'live', title: 'Live', count: live.length, data: live });

    // Projects: Active as tiles (pairs), idea projects as quiet rows.
    const ordered = fanOrder(d.projects);
    const active = ordered.filter((p) => !isIdeaProject(p));
    const ideas = ordered.filter(isIdeaProject);
    const perProject = new Map<string, { working: number; waiting: number }>();
    for (const a of agents) {
      if (!a.project) continue;
      const c = perProject.get(a.project) ?? { working: 0, waiting: 0 };
      if (orcaWorking(a)) c.working++;
      if (orcaWaiting(a)) c.waiting++;
      perProject.set(a.project, c);
    }
    const shown = tab === 'active' ? active : ideas;
    let rows: Item[];
    if (!d.projects.length) rows = [{ kind: 'empty', key: 'p:empty', text: 'No projects yet', add: { label: 'New project', onPress: newProject } }];
    else if (!shown.length) rows = [{ kind: 'empty', key: 'p:none', text: tab === 'active' ? 'Nothing active. Hold an idea project to move it here.' : 'No idea projects. Hold a project to park it here.' }];
    else if (tab === 'ideas') rows = ideas.map((p): Item => ({ kind: 'ideaProject', key: `ip:${p.slug}`, project: p }));
    else {
      rows = [];
      for (let i = 0; i < active.length; i += 2) {
        const pair = active.slice(i, i + 2).map((p) => ({ project: p, orcaWorking: perProject.get(p.slug)?.working ?? 0, orcaWaiting: perProject.get(p.slug)?.waiting ?? 0 }));
        rows.push({ kind: 'tiles', key: `pt:${pair.map((x) => x.project.slug).join('+')}`, projects: pair });
      }
    }
    out.push({
      key: 'projects', title: 'Projects', add: { label: 'New project', onPress: newProject },
      extra: d.projects.length ? <ProjectTabs tab={tab} counts={{ active: active.length, ideas: ideas.length }} onChange={setTab} /> : undefined,
      data: rows,
    });

    // What Orca finished in the last day: open one to read it, or reply while its cache is warm.
    const recent = agents.filter((a) => !orcaLive(a) && a.updatedAt && orcaAt - Date.parse(a.updatedAt) < DAY);
    if (recent.length) {
      const cut = !allRecent && recent.length > RECENT_CUT + 1;
      out.push({
        key: 'orca', title: 'Recent in Orca', count: recent.length,
        data: [
          ...(cut ? recent.slice(0, RECENT_CUT) : recent).map((a): Item => ({ kind: 'orca', key: `r:${a.id}`, agent: a, where: placeOf(a) })),
          ...(cut ? [{ kind: 'more', key: 'orca:more', label: `Show all ${recent.length}`, onPress: () => setAllRecent(true) } as Item] : []),
        ],
      });
    }

    const inbox: Item[] = [
      ...d.inbox.ideas.map((i): Item => ({ kind: 'idea', key: `i:${i.id}`, idea: i })),
      ...d.inbox.tasks.map((t): Item => ({ kind: 'task', key: `t:${t.id}`, task: t })),
    ];
    if (inbox.length) {
      const cut = !allInbox && inbox.length > INBOX_CUT + 2;
      out.push({
        key: 'inbox', title: 'Inbox', count: inbox.length,
        data: cut
          ? [...inbox.slice(0, INBOX_CUT), { kind: 'more', key: 'inbox:more', label: `Show all ${inbox.length}`, onPress: () => setAllInbox(true) }]
          : inbox,
      });
    }
    return out;
  }, [home, hidden, allInbox, allRecent, tab, agents, orcaAt]);

  if (home.load === 'signedOut') return <SignIn onDone={() => { work.loadHome(); work.loadOrca(); }} />;

  const orcaInfo = () => {
    const o = orca.data;
    if (!o) work.notify(orca.error ?? 'Asking your PC about Orca…');
    else if (!o.up) work.notify(`Orca isn’t answering on your PC${o.error ? `: ${o.error}` : ''}. Open Orca there; jobs started here still run.`);
    else {
      const w = o.agents.filter(orcaWorking).length, q = o.agents.filter(orcaWaiting).length;
      work.notify(`Orca is running: ${w} working${q ? `, ${q} waiting for you` : ''}. New jobs from here start in Orca, so you can follow them on the PC too.`);
    }
  };

  const d = home.data;
  const counts = {
    needs: (d ? d.needs.filter((n) => !hidden.has(n.id)).length : 0) + agents.filter(orcaWaiting).length,
    live: (d ? d.live.length : 0) + agents.filter(orcaLive).length,
    active: d ? d.projects.filter((p) => !isIdeaProject(p)).length : 0,
  };
  const Head = design.Header;
  const Ambient = design.Ambient;
  const header = <Head orca={orca.data} orcaError={orca.error} onOrcaPress={orcaInfo} counts={counts} />;

  return (
    <Shell
      actions={QUICK}
      ambient={Ambient ? <Ambient /> : null}
      overlay={menu ? (
        <ProjectMenu at={menu} top={pad.safeTop + 16} bottom={pad.bottom} onClose={() => setMenu(null)}
          onStart={() => { openSheet({ kind: 'job', project: menu.project.slug }); setMenu(null); }}
          onPin={() => { work.patchProject(menu.project.slug, { pinned: !menu.project.pinned }); setMenu(null); }}
          onMove={() => {
            const toIdeas = menu.project.status !== 'paused';
            work.setProjectStatus(menu.project.slug, toIdeas ? 'paused' : 'active');
            work.notify(`${menu.project.name} moved to ${toIdeas ? 'Ideas' : 'Active'}.`);
            setMenu(null);
          }}
          onSettings={() => { openSheet({ kind: 'projectSettings', project: menu.project.slug }); setMenu(null); }} />
      ) : null}>
      <HubList sections={sections} header={header} refreshing={refreshing} onRefresh={refresh} handlers={handlers} skin={design} topBar={false} />
    </Shell>
  );
}

