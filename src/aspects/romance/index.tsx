import { useCallback, useState } from 'react';
import { haptic, TabbedPage, TabPanel, today, undoable, useAspect, useEntry, useOnReturn } from '@/aspects/kit';
import type { Draft } from '@/lib/mod';
import { DebriefScreen, DebriefsScreen } from './Debrief';
import { reloadAll, useRomance } from './data';
import { IdeaSheet, IdeasTab, WhoSheet } from './Ideas';
import { localState, queuePut, setLive, useOutbox } from './local';
import { withPlan, type Entry, type PlanItem } from './model';
import { NavContext, TABS, type DebriefTarget, type RomanceNav, type Tab } from './nav';
import { NowTab } from './Now';
import { EndedScreen, OutScreen, PrimerScreen } from './Out';
import { AddSheet, LookingSheet, NextSheet, PeopleTab, PersonScreen, TalkedSheet, TargetSheet } from './People';
import { DaySheet, debriefAbout, PlansTab } from './Plans';
import { PrivacyCover, whenIn } from './parts';
import type { Follow, IdeaRec, Outing, Place } from './types';

// Romance: am I meeting people, and is it going somewhere? Now holds the one thing that matters today (the outing,
// a debrief while it's fresh, a plan, a follow up, else the week and going out). People is who he is talking to, how
// far each has gone and when they were last in touch. Plans is meeting up and going out, with a debrief after each.
// Ideas is a bank to plan from, with ways in for each kind of place. The loop underneath is the same as before: a
// thirty second primer, a counter of conversations started (attempts, never results), a minute of debrief, and its
// one thing to try coming back as the next primer. Everything personal arrives from the PC at run time; the first
// screen shows names and days only.
type Rec = { id: string } & Record<string, unknown>;

export default function Romance() {
  const a = useAspect();
  const r = useRomance();
  const { live } = r;
  useOutbox(a.open); // sends what waited on the phone; never runs while the page is closed

  const [tab, setTab] = useState<Tab>('now');
  const [primerOpen, setPrimerOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [ended, setEnded] = useState<Outing | null>(null);
  const [debrief, setDebrief] = useState<DebriefTarget | null>(null);
  const [debriefsOpen, setDebriefsOpen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const [add, setAdd] = useState<{ place: Place | null; session: string | null } | null>(null);
  const [nextFor, setNextFor] = useState<string | null>(null);
  const [talkedFor, setTalkedFor] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [target, setTarget] = useState(false);
  const [day, setDay] = useState<PlanItem | null>(null);
  const [idea, setIdea] = useState<{ open: boolean; person: string | null; edit: IdeaRec | null }>({ open: false, person: null, edit: null });
  const [who, setWho] = useState<IdeaRec | null>(null);

  // romance/<part>: people, person/<id>, plans, debriefs, ideas, primer (getting ready to go out), out (the outing
  // on now; with none on, the primer that starts one).
  useEntry((e) => {
    const [p, id] = e.parts;
    setTab(p === 'people' || p === 'person' ? 'people' : p === 'plans' || p === 'debriefs' ? 'plans' : p === 'ideas' ? 'ideas' : 'now');
    setPerson(p === 'person' && id ? id : null);
    setDebriefsOpen(p === 'debriefs');
    setPrimerOpen(p === 'primer' || (p === 'out' && !live));
    setOutOpen(p === 'out' && !!live);
  });
  // back from another app or the lock screen: the day may have rolled, a reading may have landed on the PC
  useOnReturn(reloadAll);

  const closePrimer = useCallback(() => setPrimerOpen(false), []);
  const closeOut = useCallback(() => setOutOpen(false), []);
  const closeEnded = useCallback(() => setEnded(null), []);
  const closeDebrief = useCallback(() => setDebrief(null), []);
  const closeDebriefs = useCallback(() => setDebriefsOpen(false), []);
  const closePerson = useCallback(() => setPerson(null), []);

  const follow = r.people.follow;
  const entryOf = (id: string) => r.list?.find((x) => x.person.id === id) ?? null;

  // "Add one": a conversation outside an outing, in today's record, with Undo
  const addOne = () => {
    const id = `day:${today()}`;
    const cur = r.outings.items?.find((o) => o.id === id);
    const o: Outing = { id, day: today(), start: null, end: null, place: 'logged', primer: null, reps: [...(cur?.reps ?? []), { at: new Date().toISOString(), depth: null }] };
    queuePut('sessions', o as unknown as Rec);
    haptic.medium();
    undoable('Conversation added', () => queuePut('sessions', { ...o, reps: o.reps.slice(0, -1) } as unknown as Rec));
  };
  // a next step done in one tap, with Undo that puts it back
  const markDone = (e: Entry) => {
    const f = e.follow;
    if (!f?.next) return;
    const before = f;
    haptic.medium();
    follow.put({ ...f, next: null, done: [...(f.done ?? []), { what: f.next.what, at: new Date().toISOString() }] }).catch((err: Error) => a.notice(err.message));
    undoable(`${f.next.what}, done`, () => { follow.put(before).catch((err: Error) => a.notice(err.message)); });
  };
  // End is one tap with an Undo that brings the outing back, still running, with its count
  const resume = (o: Outing) => {
    if (localState().live) return; // another outing has started since
    const back: Outing = { ...o, end: null };
    setLive(back, null);
    queuePut('sessions', back as unknown as Rec);
    setEnded(null);
    setDebrief(null);
    setOutOpen(true);
  };
  const afterEnd = (o: Outing) => { setEnded(o); undoable('Outing ended', () => resume(o)); };
  const endLive = () => {
    if (!live) return;
    const done = { ...live, end: new Date().toISOString() };
    queuePut('sessions', done as unknown as Rec);
    setLive(null, done.id);
    afterEnd(done);
  };
  // an idea becomes a plan with someone: their page opens to pick the day
  const makePlan = (personId: string, i: IdeaRec) => {
    const e = entryOf(personId);
    setWho(null);
    if (!e) return;
    const f = e.follow;
    if (f?.plan && !f.plan.debrief) { a.notice(`${e.person.name} has a plan already. Change it on their page.`); setPerson(personId); return; }
    const base: Draft<Follow> = f ? { ...f } : { id: personId, person: personId, done: [], archived: false };
    follow.put({ ...base, id: personId, person: personId, ...withPlan(f, { title: i.title, steps: [], date: null }) }).catch((err: Error) => a.notice(err.message));
    haptic.medium();
    setPerson(personId);
  };
  // a debrief made after a plan is tied to it, so the plan reads as done and the debrief says what it was about
  const madeDebrief = (id: string) => {
    const p = debrief?.plan;
    if (!p) return;
    if (p.kind === 'follow') {
      const f = entryOf(p.id)?.follow;
      if (f?.plan) follow.put({ ...f, plan: { ...f.plan, debrief: id } }).catch((err: Error) => a.notice(err.message));
    } else {
      r.shared.patch(p.id, { debrief: id, state: 'done' }).catch((err: Error) => a.notice(err.message));
    }
  };

  const nav: RomanceNav = {
    tab,
    openTab: setTab,
    person: setPerson,
    add: (met) => setAdd(met ?? { place: null, session: null }),
    next: setNextFor,
    markDone,
    looking: () => setLooking(true),
    target: () => setTarget(true),
    goOut: () => (live ? setOutOpen(true) : setPrimerOpen(true)),
    backToOut: () => setOutOpen(true),
    endLive,
    addOne,
    debrief: setDebrief,
    debriefs: () => setDebriefsOpen(true),
    planDay: setDay,
    idea: (o) => setIdea({ open: true, person: o?.person ?? null, edit: o?.edit ?? null }),
    planIdea: (i) => (i.person ? makePlan(i.person, i) : setWho(i)),
  };
  const plan = debrief?.plan ?? null;

  return (
    <NavContext value={nav}>
      <TabbedPage tabs={TABS} tab={tab} onTab={setTab} onRefresh={reloadAll} refreshing={false}
        footer={(
          <>
            <DebriefsScreen open={debriefsOpen} onClose={closeDebriefs} about={(d) => debriefAbout(d, r)} />
            <PersonScreen id={person} onClose={closePerson} onNext={setNextFor} onTalked={setTalkedFor} />
            <PrimerScreen open={primerOpen} onClose={closePrimer} onStart={() => { setPrimerOpen(false); setOutOpen(true); }} />
            <OutScreen open={outOpen} onClose={closeOut} onEnded={(o) => { setOutOpen(false); afterEnd(o); }} />
            <EndedScreen outing={ended} onClose={closeEnded}
              onDebrief={() => { const o = ended; setEnded(null); setDebrief({ outing: o, view: null }); }}
              onAdd={() => setAdd({ place: ended && ended.place !== 'logged' ? ended.place : null, session: ended?.id ?? null })} />
            <DebriefScreen target={debrief} lastTry={r.primer.data?.try.text ?? null} onClose={closeDebrief} onMade={madeDebrief}
              about={plan ? `After your plan with ${plan.names}${plan.date ? `, ${whenIn(plan.date)}` : ''}` : null} />
            <AddSheet open={!!add} met={add} onClose={() => setAdd(null)} onAdded={(id) => { setEnded(null); setPerson(id); }} />
            <NextSheet id={nextFor} onClose={() => setNextFor(null)} />
            <TalkedSheet id={talkedFor} onClose={() => setTalkedFor(null)} />
            <LookingSheet open={looking} onClose={() => setLooking(false)} />
            <TargetSheet open={target} onClose={() => setTarget(false)} />
            <DaySheet plan={day} onClose={() => setDay(null)} />
            <IdeaSheet open={idea.open} edit={idea.edit} person={idea.person} onClose={() => setIdea((x) => ({ ...x, open: false }))} />
            <WhoSheet idea={who} onClose={() => setWho(null)} onPick={makePlan} />
            <PrivacyCover />
          </>
        )}>
        <TabPanel active={tab === 'now'}><NowTab /></TabPanel>
        <TabPanel active={tab === 'people'}><PeopleTab /></TabPanel>
        <TabPanel active={tab === 'plans'}><PlansTab /></TabPanel>
        <TabPanel active={tab === 'ideas'}><IdeasTab /></TabPanel>
      </TabbedPage>
    </NavContext>
  );
}
