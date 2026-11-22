import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { type GestureResponderEvent, Text, View } from 'react-native';
import { tap } from '@/components/Glass';
import { SignIn } from '@/components/SignIn';
import { openSheet } from '@/work/bus';
import { fanOrder, useWorkHome, work } from '@/work/store';
import type { ProjectCard } from '@/work/types';
import { HubList, type Item, type ListHandlers, type Sec } from '@/work/ui/HubList';
import { IdeaIcon, JobIcon, TaskIcon } from '@/work/ui/icons';
import { useAnswered } from '@/work/ui/NeedCard';
import { type MenuAt, ProjectMenu } from '@/work/ui/ProjectMenu';
import { Shell, useShellInsets } from '@/work/ui/Shell';
import { T } from '@/work/ui/tokens';

// The Work orb's tap: everything waiting on him first, then what's running, his projects, and the inbox.
// Draws from the phone's copy at once (store: cache, then the PC, then the live feed).

const INBOX_CUT = 6;

const newProject = () => openSheet({ kind: 'project' });
const QUICK = [
  { key: 'idea', label: 'Idea', a11y: 'New idea', icon: <IdeaIcon />, onPress: () => openSheet({ kind: 'idea', project: null }) },
  { key: 'task', label: 'Task', a11y: 'New task', icon: <TaskIcon />, onPress: () => openSheet({ kind: 'task', project: null }) },
  { key: 'job', label: 'Job', a11y: 'New job', icon: <JobIcon />, onPress: () => openSheet({ kind: 'job', project: null }) },
];

export default function WorkHome() {
  const home = useWorkHome();
  const pad = useShellInsets();
  const { hidden, hide, unhide } = useAnswered();
  const [refreshing, setRefreshing] = useState(false);
  const [allInbox, setAllInbox] = useState(false);
  const [menu, setMenu] = useState<MenuAt | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await work.loadHome(); } finally { setRefreshing(false); }
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

  const sections = useMemo<Sec[]>(() => {
    const d = home.data;
    if (!d) {
      if (home.load === 'error') {
        return [{ key: 'error', data: [{ kind: 'error', key: 'error', title: 'Work didn’t load', message: home.error, onRetry: () => { work.loadHome(); } }] }];
      }
      return [{ key: 'loading', data: [{ kind: 'loading', key: 'loading' }] }];
    }
    const names = new Map(d.projects.map((p) => [p.slug, p.name]));
    const out: Sec[] = [];

    const needs = d.needs.filter((n) => !hidden.has(n.id));
    if (needs.length) {
      out.push({
        key: 'needs', title: 'Needs you', count: needs.length,
        data: needs.map((n): Item => ({ kind: 'need', key: `n:${n.id}`, need: n, heading: n.project ? names.get(n.project) ?? n.project : 'Inbox' })),
      });
    }
    if (d.live.length) {
      out.push({
        key: 'live', title: 'Live', count: d.live.length,
        data: d.live.map((j): Item => ({ kind: 'job', key: `j:${j.id}`, job: j, where: j.project ? names.get(j.project) ?? j.project : null })),
      });
    }

    const projects = fanOrder(d.projects);
    out.push({
      key: 'projects', title: 'Projects', add: { label: 'New project', onPress: newProject },
      data: projects.length
        ? projects.map((p): Item => ({ kind: 'project', key: `p:${p.slug}`, project: p }))
        : [{ kind: 'empty', key: 'p:empty', text: 'No projects yet', add: { label: 'New project', onPress: newProject } }],
    });

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
  }, [home, hidden, allInbox]);

  if (home.load === 'signedOut') return <SignIn onDone={() => { work.loadHome(); }} />;

  const header = (
    <View style={{ paddingBottom: 24 }}>
      <Text accessibilityRole="header" style={T.title}>Work</Text>
    </View>
  );

  return (
    <Shell
      actions={QUICK}
      overlay={menu ? (
        <ProjectMenu at={menu} top={pad.safeTop + 16} bottom={pad.bottom} onClose={() => setMenu(null)}
          onPin={() => { work.patchProject(menu.project.slug, { pinned: !menu.project.pinned }); setMenu(null); }}
          onSettings={() => { openSheet({ kind: 'projectSettings', project: menu.project.slug }); setMenu(null); }} />
      ) : null}>
      <HubList sections={sections} header={header} refreshing={refreshing} onRefresh={refresh} handlers={handlers} />
    </Shell>
  );
}
