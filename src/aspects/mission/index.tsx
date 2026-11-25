import { useCallback, useMemo, useState } from 'react';
import { haptic, Icon, IconButton, Keypad, TabbedPage, TabPanel, undoable, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import { ASPECT_KEYS } from '@/lib/aspectLinks';
import { invalidate, useGet } from '@/lib/mod';
import { AddGoal } from './AddGoal';
import { CloseFlow } from './CloseFlow';
import { act, HANDOFF, HOME, message, refresh } from './data';
import { GoalScreen, MeasureSheet } from './GoalScreen';
import { GoalsTab } from './Goals';
import { NavContext, TABS, type AddInit, type Nav, type Tab } from './nav';
import { NowTab } from './Now';
import { FirstSheet, ProjectsTab } from './Projects';
import { PurposeTab } from './Purpose';
import { RecordScreen } from './Record';
import { TieSheet } from './Tie';
import type { Goal, Home as HomeData } from './types';

// Mission: where he is going and this week's move. Now is the one goal to move this week and its next step; Goals is
// the ladder from life down to the week; Projects is the first block and every project's next action; Purpose is the
// line he lives by and the lifetime directions. One goal, adding a goal, closing goals, the record and tying a task
// open on top. Copy is written here; the PC sends numbers, states and ids.
export default function Mission() {
  const a = useAspect();
  const home = useGet<HomeData>(a.open ? HOME : null);
  const [tab, setTab] = useState<Tab>('now');
  const [closing, setClosing] = useState(false);
  const [record, setRecord] = useState(false);
  const [goals, setGoals] = useState<{ id: string; open: boolean; n: number }[]>([]);
  const [add, setAdd] = useState<AddInit | null>(null);
  const [first, setFirst] = useState<{ project?: string } | null>(null);
  const [measure, setMeasure] = useState<string | null>(null);
  const [tie, setTie] = useState<string | null>(null);
  const [moving, setMoving] = useState<Goal | null>(null);

  // the page stays mounted while closed: coming back to it (or to the app) reads everything again, so the week, the
  // days left and the clean-up list are never as he left them yesterday
  useOnReturn(() => {
    refresh();
    invalidate(HANDOFF);
    invalidate('/mod/money/summary');
    invalidate('/mod/money/jars');
    invalidate('/mod/body/today');
    invalidate('/tasks');
  });

  const popGoal = useCallback((n: number) => {
    setGoals((gs) => gs.map((g) => (g.n === n ? { ...g, open: false } : g)));
    setTimeout(() => setGoals((gs) => gs.filter((g) => g.n !== n)), 460);
  }, []);
  const nav: Nav = useMemo(() => ({
    tab,
    openTab: setTab,
    goal: (id) => setGoals((gs) => [...gs, { id, open: true, n: Date.now() }]),
    add: (init = {}) => setAdd(init),
    close: () => setClosing(true),
    record: () => setRecord(true),
    first: (project) => setFirst({ project }),
    measure: (g) => setMeasure(g),
    tie: (g) => setTie(g),
    progress: (g) => setMoving(g),
  }), [tab]);

  // mission/<part>: goal/<id>, ladder (the Goals tab), projects, purpose, record, close (closing the week),
  // add[?aspect=<key>] (with that section picked). Plain mission (the "This week isn't set yet" push) is Now.
  useEntry((e) => {
    const [p, id] = e.parts;
    setTab(p === 'ladder' || p === 'goals' ? 'goals' : p === 'projects' ? 'projects' : p === 'purpose' ? 'purpose' : 'now');
    setClosing(p === 'close');
    setRecord(p === 'record');
    for (const g of goals) popGoal(g.n);
    if (p === 'goal' && id) nav.goal(id);
    if (p === 'add') {
      const k = ASPECT_KEYS.find((x) => x === e.query.aspect);
      nav.add(k ? { aspects: [k] } : {});
    }
  });

  // a goal measured by hand: the keypad sets it, Undo puts the old number back
  const logProgress = async (g: Goal, p: number) => {
    const was = Math.round(g.progress);
    if (p === was) return;
    try {
      await act(`/goal/${g.id}`, { progress: p });
      haptic.medium();
      undoable(`Progress set to ${p}%`, () => act(`/goal/${g.id}`, { progress: was }).then(() => {}).catch((e) => a.notice(message(e))));
    } catch (e) { a.notice(message(e)); }
  };

  const plan = home.data?.plan ?? home.data?.week ?? null;
  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} onRefresh={() => { refresh(); invalidate(HANDOFF); invalidate('/tasks'); }} refreshing={home.busy && !!home.data}
        right={<IconButton label="Add a goal" size={36} onPress={() => nav.add({})}><Icon name="plus" size={16} /></IconButton>}
        footer={(
          <>
            <RecordScreen open={record} onClose={() => setRecord(false)} />
            <CloseFlow open={closing} onClose={() => setClosing(false)} home={home.data} />
            {goals.map((g) => <GoalScreen key={g.n} id={g.id} open={g.open} onClose={() => popGoal(g.n)} />)}
            <AddGoal init={add} onClose={() => setAdd(null)} today={home.data?.today ?? null} />
            <FirstSheet open={!!first} project={first?.project} week={plan?.key ?? null} onClose={() => setFirst(null)} />
            <MeasureSheet goal={measure} onClose={() => setMeasure(null)} />
            <TieSheet goal={tie} onClose={() => setTie(null)} />
            <Keypad open={!!moving} onClose={() => setMoving(null)} title="Log progress" sub={moving?.title ?? null}
              fields={[{ key: 'p', label: 'Progress', value: moving ? Math.round(moving.progress) : 0, step: 5, min: 0, max: 100, unit: '%' }]}
              presets={[25, 50, 75, 100].map((v) => ({ label: `${v}%`, values: { p: v } }))}
              onDone={(v) => { const g = moving; setMoving(null); if (g && v.p != null) void logProgress(g, Math.max(0, Math.min(100, Math.round(v.p)))); }} />
          </>
        )}>
        <TabPanel active={tab === 'now'}><NowTab read={home} /></TabPanel>
        <TabPanel active={tab === 'goals'}><GoalsTab active={tab === 'goals'} /></TabPanel>
        <TabPanel active={tab === 'projects'}><ProjectsTab active={tab === 'projects'} /></TabPanel>
        <TabPanel active={tab === 'purpose'}><PurposeTab /></TabPanel>
      </TabbedPage>
    </NavContext>
  );
}
