import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Empty, Failed, Icon, Page, Section, Skeleton, SP, useAspect, useEntry } from '@/aspects/kit';
import { invalidate } from '@/lib/mod';
import { makeActions } from './actions';
import { DeepenCard, FriendRow, LogDetail, UsualRow } from './Circle';
import { useFriends, type Kind, type Person } from './data';
import { askIdeas } from './ideas';
import { AskCard, NextCard, NoPlanCard } from './LeadPlan';
import { buildModel, deepenIdeas, type DeepenIdea } from './model';
import { AddSomeone, NewPeopleScreen, NudgeRow } from './NewPeople';
import { PathTrack } from './parts';
import { PersonScreen } from './Person';
import { PlanFlow, type Preset } from './PlanFlow';
import { PlansScreen } from './Plans';

// Friends: is my circle growing? One screen with the next plan as the lead, the people he is getting to know and
// the next hello in a place he already goes, and his circle with when he last saw each friend.
export default function Friends() {
  const asp = useAspect();
  const f = useFriends();
  const m = buildModel(f);
  const a = makeActions(f, asp.notice);

  const [person, setPerson] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [flow, setFlow] = useState<{ open: boolean; key: number; preset: Preset }>({ open: false, key: 0, preset: {} });
  const [plansOpen, setPlansOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [logged, setLogged] = useState<{ person: string; moment: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const openPerson = (p: Person) => { setPerson(p.id); setPersonOpen(true); };
  const makePlan = (preset: Preset = {}) => {
    if (preset.person) askIdeas(preset.person);
    setFlow((x) => ({ open: true, key: x.key + 1, preset }));
  };
  const planWith = (id: string, idea?: DeepenIdea | null) => makePlan({ person: id, idea: idea ?? null });
  const log = (p: Person, kind: Kind, act?: string) => setLogged({ person: p.id, moment: a.log(p, kind, act ? { act } : {}) });
  // friends/<part>: person/<id>, plans, new (people he is getting to know), plan[?person=<id>] (make a plan), add.
  useEntry((e) => {
    const [p, id] = e.parts;
    setPersonOpen(p === 'person' && !!id);
    if (p === 'person' && id) setPerson(id);
    setPlansOpen(p === 'plans');
    setNewOpen(p === 'new');
    setAddOpen(p === 'add');
    if (p === 'plan') makePlan(e.query.person ? { person: e.query.person } : {});
    else setFlow((x) => ({ ...x, open: false }));
  });
  const refresh = async () => {
    setRefreshing(true);
    invalidate('/mod/friends/');
    await Promise.all([f.persons.refresh(), f.moments.refresh(), f.plans.refresh(), f.ideas.refresh(), f.rhythms.refresh(), f.places.refresh(), f.week.refresh()]);
    setRefreshing(false);
  };

  const failed = (f.persons.items == null && f.persons.error) || (f.moments.items == null && f.moments.error) || (f.plans.items == null && f.plans.error);
  const loading = !failed && (f.persons.items == null || f.moments.items == null || f.plans.items == null);
  const free = f.week.data?.free ?? [];
  const loggedMoment = logged ? f.moments.items?.find((x) => x.id === logged.moment) ?? null : null;
  const steady = m.steady;

  return (
    <Page subtitle={loading || failed ? null : m.headline} onRefresh={refresh} refreshing={refreshing}
      footer={(
        <>
          <NewPeopleScreen open={newOpen} onClose={() => setNewOpen(false)} m={m} week={f.week.data} a={a}
            onPerson={openPerson} onAdd={() => setAddOpen(true)} onPlan={(p) => planWith(p.id)} />
          <PlansScreen open={plansOpen} onClose={() => setPlansOpen(false)} m={m} a={a} week={f.week.data} onMake={() => makePlan()} notice={asp.notice} />
          <PersonScreen open={personOpen} onClose={() => setPersonOpen(false)} id={person} m={m} f={f} a={a} bank={f.bank.data} onPlan={planWith} notice={asp.notice} />
          <PlanFlow key={flow.key} open={flow.open} onClose={() => setFlow((x) => ({ ...x, open: false }))} preset={flow.preset}
            m={m} f={f} a={a} week={f.week.data} bank={f.bank.data} notice={asp.notice} />
          <AddSomeone open={addOpen} onClose={() => setAddOpen(false)} m={m} week={f.week.data} a={a} notice={asp.notice} />
        </>
      )}>
      {loading ? (
        <View style={s.skeleton}>
          <Skeleton height={20} width="30%" />
          <Skeleton height={172} radius={24} />
          <Skeleton height={20} width="30%" />
          <Skeleton height={96} radius={16} />
          <Skeleton height={56} radius={16} />
          <Skeleton height={56} radius={16} />
        </View>
      ) : failed ? (
        <Failed message={f.persons.error ?? f.moments.error ?? f.plans.error ?? 'Your PC did not answer.'} onRetry={() => void refresh()} />
      ) : (
        <>
          <Section title="Plans" action={m.upcoming.length + m.ask.length + m.done.length ? 'All' : undefined} onAction={() => setPlansOpen(true)}>
            {m.ask[0] ? <AskCard plan={m.ask[0]} m={m} a={a} free={free} />
              : m.upcoming[0] ? <NextCard plan={m.upcoming[0]} m={m} a={a} more={m.upcoming.length - 1} onOpen={() => setPlansOpen(true)} notice={asp.notice} />
                : <NoPlanCard free={free} onMake={() => makePlan()} calendarKnown={!!f.week.data} />}
          </Section>

          <Section title="New people" action="All" onAction={() => setNewOpen(true)}>
            <PathTrack groups={m.groups} onPerson={openPerson} onAdd={() => setAddOpen(true)} onStop={() => setNewOpen(true)} />
            {m.nudges.length ? <View>{m.nudges.slice(0, 3).map((n) => <NudgeRow key={n.key} n={n} a={a} onOpen={openPerson} onPlan={(p) => planWith(p.id)} />)}</View> : null}
            <Button label="I just met someone" kind="soft" onPress={() => setAddOpen(true)} icon={<Icon name="plus" size={18} color={asp.color} />} />
          </Section>

          <Section title="Circle" gap={0}>
            {m.friends.length ? m.friends.map((v) => (
              <View key={v.p.id}>
                <FriendRow v={v} logged={logged?.person === v.p.id && !!loggedMoment} onLog={(kind) => log(v.p, kind)} onOpen={() => openPerson(v.p)} />
                {logged?.person === v.p.id && loggedMoment ? <LogDetail moment={loggedMoment} a={a} onClose={() => setLogged(null)} /> : null}
                {v.usual ? <UsualRow v={v} onLog={() => log(v.p, 'meet', v.usual!.act)} /> : null}
              </View>
            )) : (
              <Empty title="Your friends will be here" body="Someone you meet joins your circle once you have spent time together. A friend you already have can be added too."
                action="Add someone" onAction={() => setAddOpen(true)} />
            )}
          </Section>

          {steady ? <DeepenCard v={steady} ideas={deepenIdeas(steady, f.ideas.items ?? [], f.bank.data?.ideas ?? [])} onPlan={(d) => planWith(steady.p.id, d)} /> : null}
        </>
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  skeleton: { gap: SP[16] },
});
