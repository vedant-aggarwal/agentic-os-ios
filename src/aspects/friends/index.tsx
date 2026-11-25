import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Failed, Icon, IconButton, Skeleton, TabbedPage, TabPanel, useAspect, useEntry, useOnReturn, type TabDef } from '@/aspects/kit';
import { invalidate } from '@/lib/mod';
import { makeActions } from './actions';
import { CircleTab } from './Circle';
import { useFriends, type Person } from './data';
import { askIdeas } from './ideas';
import { buildModel, type DeepenIdea } from './model';
import { AddSomeone, NewTab } from './NewPeople';
import { NowTab } from './Now';
import { PersonScreen } from './Person';
import { PlanFlow, type Preset } from './PlanFlow';
import { PlansTab } from './Plans';

// Friends: keeping friendships alive. Now says who to reach out to (the friend most overdue against how close they
// are) and logs Messaged or Met in one tap with Undo, or starts a plan. Circle has every friend by closeness with when
// they last met; Plans has what is ahead and what happened; New has the people he is getting to know. A person and
// the plan flow open as screens. Nothing here messages anyone: invites are copied and sent from his own phone.

type Tab = 'now' | 'circle' | 'plans' | 'new';
const TABS: readonly TabDef<Tab>[] = [
  { key: 'now', label: 'Now' }, { key: 'circle', label: 'Circle' }, { key: 'plans', label: 'Plans' }, { key: 'new', label: 'New' },
];

function TabSkeleton() {
  return (
    <View style={s.skeleton}>
      <Skeleton height={208} radius={24} />
      <Skeleton height={20} width="30%" />
      <Skeleton height={72} radius={22} />
      <Skeleton height={144} radius={22} />
    </View>
  );
}

export default function Friends() {
  const asp = useAspect();
  const f = useFriends();
  const m = buildModel(f);
  const a = makeActions(f, asp.notice);

  const [tab, setTab] = useState<Tab>('now');
  const [person, setPerson] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [flow, setFlow] = useState<{ open: boolean; key: number; preset: Preset }>({ open: false, key: 0, preset: {} });
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openPerson = (p: Person) => { setPerson(p.id); setPersonOpen(true); };
  const makePlan = (preset: Preset = {}) => {
    if (preset.person) askIdeas(preset.person);
    setFlow((x) => ({ open: true, key: x.key + 1, preset }));
  };
  const planWith = (id: string, idea?: DeepenIdea | null) => makePlan({ person: id, idea: idea ?? null });

  // friends/<part>: person/<id>, now, circle, plans, new, plan[?person=<id>] (make a plan), add. Plain friends is Now.
  useEntry((e) => {
    const [p, id] = e.parts;
    setPersonOpen(p === 'person' && !!id);
    if (p === 'person' && id) setPerson(id);
    setAddOpen(p === 'add');
    if (p === 'plan') makePlan(e.query.person ? { person: e.query.person } : {});
    else setFlow((x) => ({ ...x, open: false }));
    if (p === 'circle' || p === 'plans' || p === 'new' || p === 'now') setTab(p);
    else if (!p) setTab('now');
  });

  const reload = () => {
    invalidate('/mod/friends/');
    return Promise.all([f.persons.refresh(), f.moments.refresh(), f.plans.refresh(), f.ideas.refresh(), f.rhythms.refresh(), f.places.refresh(), f.week.refresh()]);
  };
  const refresh = async () => { setRefreshing(true); try { await reload(); } finally { setRefreshing(false); } };
  // back from another app or the lock screen: the day may have moved on, and Family and Romance share the people list
  useOnReturn(() => { void reload(); });

  const failed = (f.persons.items == null && f.persons.error) || (f.moments.items == null && f.moments.error) || (f.plans.items == null && f.plans.error);
  const loading = !failed && (f.persons.items == null || f.moments.items == null || f.plans.items == null);
  const waiting = failed
    ? <Failed message={f.persons.error ?? f.moments.error ?? f.plans.error ?? 'Your PC did not answer.'} onRetry={() => void refresh()} />
    : <TabSkeleton />;
  const ready = !loading && !failed;

  const plan = <IconButton label="Make a plan" size={40} onPress={() => makePlan()}><Icon name="plus" size={18} /></IconButton>;
  const add = <IconButton label="Add someone you met" size={40} onPress={() => setAddOpen(true)}><Icon name="plus" size={18} /></IconButton>;
  const right = !ready ? undefined : tab === 'circle' || tab === 'new' ? add : plan;

  const footer = (
    <>
      <PersonScreen open={personOpen} onClose={() => setPersonOpen(false)} id={person} m={m} f={f} a={a} bank={f.bank.data} onPlan={planWith} notice={asp.notice} />
      <PlanFlow key={flow.key} open={flow.open} onClose={() => setFlow((x) => ({ ...x, open: false }))} preset={flow.preset}
        m={m} f={f} a={a} week={f.week.data} bank={f.bank.data} notice={asp.notice} />
      <AddSomeone open={addOpen} onClose={() => setAddOpen(false)} m={m} week={f.week.data} a={a} notice={asp.notice} />
    </>
  );

  return (
    <TabbedPage tabs={TABS} tab={tab} onTab={setTab} right={right} footer={footer} onRefresh={() => void refresh()} refreshing={refreshing}>
      <TabPanel active={tab === 'now'}>
        {!ready ? waiting : (
          <NowTab m={m} a={a} week={f.week.data} onPerson={openPerson} onPlan={() => makePlan()} onPlanWith={(id) => planWith(id)}
            onPlans={() => setTab('plans')} onAdd={() => setAddOpen(true)} notice={asp.notice} />
        )}
      </TabPanel>
      <TabPanel active={tab === 'circle'}>
        {!ready ? waiting : <CircleTab m={m} f={f} a={a} onOpen={(v) => openPerson(v.p)} onAdd={() => setAddOpen(true)} />}
      </TabPanel>
      <TabPanel active={tab === 'plans'}>
        {!ready ? waiting : (
          <PlansTab m={m} f={f} a={a} week={f.week.data} onMake={() => makePlan()} onPlanWith={planWith} notice={asp.notice} />
        )}
      </TabPanel>
      <TabPanel active={tab === 'new'}>
        {!ready ? waiting : (
          <NewTab m={m} week={f.week.data} a={a} onPerson={openPerson} onAdd={() => setAddOpen(true)} onPlan={(p) => planWith(p.id)} />
        )}
      </TabPanel>
    </TabbedPage>
  );
}

const s = StyleSheet.create({
  skeleton: { gap: 16 },
});
