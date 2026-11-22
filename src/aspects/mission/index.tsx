import { useCallback, useMemo, useState } from 'react';
import { Icon, IconButton, Page, useEntry } from '@/aspects/kit';
import { ASPECT_KEYS } from '@/lib/aspectLinks';
import { useGet } from '@/lib/mod';
import { AddGoal } from './AddGoal';
import { CloseFlow } from './CloseFlow';
import { HOME } from './data';
import { GoalScreen, MeasureSheet } from './GoalScreen';
import { Home } from './Home';
import { Ladder } from './Ladder';
import { NavContext, type AddInit, type Nav } from './nav';
import { FirstSheet, Projects } from './Projects';
import { Purpose } from './Purpose';
import { RecordScreen } from './Record';
import type { Home as HomeData } from './types';
import { Linked } from '@/aspects/_linked/Linked';

type Open = 'close' | 'ladder' | 'projects' | 'purpose' | 'record';
const SHUT: Record<Open, boolean> = { close: false, ladder: false, projects: false, purpose: false, record: false };

// Mission: where he is going and this week's move. Home narrows from the line he lives by to today's first block;
// every other view slides in over it. Copy is written here; the PC sends numbers, states and ids.
export default function Mission() {
  const home = useGet<HomeData>(HOME);
  const [open, setOpen] = useState(SHUT);
  const [goals, setGoals] = useState<{ id: string; open: boolean; n: number }[]>([]);
  const [add, setAdd] = useState<AddInit | null>(null);
  const [first, setFirst] = useState<{ project?: string } | null>(null);
  const [measure, setMeasure] = useState<string | null>(null);

  const show = useCallback((k: Open, on: boolean) => setOpen((o) => ({ ...o, [k]: on })), []);
  const popGoal = useCallback((n: number) => {
    setGoals((gs) => gs.map((g) => (g.n === n ? { ...g, open: false } : g)));
    setTimeout(() => setGoals((gs) => gs.filter((g) => g.n !== n)), 460);
  }, []);
  const nav: Nav = useMemo(() => ({
    goal: (id) => setGoals((gs) => [...gs, { id, open: true, n: Date.now() }]),
    add: (init = {}) => setAdd(init),
    close: () => show('close', true),
    ladder: () => show('ladder', true),
    projects: () => show('projects', true),
    purpose: () => show('purpose', true),
    record: () => show('record', true),
    first: (project) => setFirst({ project }),
    measure: (g) => setMeasure(g),
  }), [show]);

  // mission/<part>: goal/<id>, ladder, projects, purpose, record, close (closing the week), add[?aspect=<key>] (with
  // that section picked). Plain mission (the "This week isn't set yet" push) is home, where the week is.
  useEntry((e) => {
    const [p, id] = e.parts;
    setOpen({ ...SHUT, ...(p === 'ladder' || p === 'projects' || p === 'purpose' || p === 'record' || p === 'close' ? { [p]: true } : {}) });
    for (const g of goals) popGoal(g.n);
    if (p === 'goal' && id) nav.goal(id);
    if (p === 'add') {
      const k = ASPECT_KEYS.find((x) => x === e.query.aspect);
      nav.add(k ? { aspects: [k] } : {});
    }
  });

  const plan = home.data?.plan ?? home.data?.week ?? null;
  return (
    <NavContext value={nav}>
      <Page onRefresh={home.refresh} refreshing={home.busy && !!home.data}
        right={home.data ? <IconButton label="Add a goal" size={36} onPress={() => nav.add({})}><Icon name="plus" size={16} /></IconButton> : undefined}
        footer={
          <>
            <Ladder open={open.ladder} onClose={() => show('ladder', false)} />
            <Projects open={open.projects} onClose={() => show('projects', false)} />
            <RecordScreen open={open.record} onClose={() => show('record', false)} />
            <Purpose open={open.purpose} onClose={() => show('purpose', false)} />
            <CloseFlow open={open.close} onClose={() => show('close', false)} home={home.data} />
            {goals.map((g) => <GoalScreen key={g.n} id={g.id} open={g.open} onClose={() => popGoal(g.n)} />)}
            <AddGoal init={add} onClose={() => setAdd(null)} today={home.data?.today ?? null} />
            <FirstSheet open={!!first} project={first?.project} week={plan?.key ?? null} onClose={() => setFirst(null)} />
            <MeasureSheet goal={measure} onClose={() => setMeasure(null)} />
          </>
        }>
        <Home read={home} />
        {home.data ? <Linked goals={false} /> : null}
      </Page>
    </NavContext>
  );
}
