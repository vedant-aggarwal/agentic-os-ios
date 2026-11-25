import { useState } from 'react';
import { Empty, Failed, Icon, IconButton, Skeleton, TabbedPage, TabPanel, today, undoable, useAspect, useEntry, useOnReturn, type TabDef } from '@/aspects/kit';
import { Linked } from '@/aspects/_linked/Linked';
import { openLink } from '@/lib/links';
import { newId, useCollection, useGet } from '@/lib/mod';
import { askNora, errText, HOME, momentDoc, momentDraft, moments, names, readTime, refresh, useAi, weeks } from './data';
import { DateScreen } from './DatePlan';
import { ComingUp, FamilyLead, ForThem, HomeSkeleton, MemoryStrip, pickLead, ThisWeek, Together } from './Home';
import { MemoriesTab } from './Memories';
import { PersonScreen } from './Person';
import { AddSheet, DateSheet, MemorySheet, MemoryView, MentionSheet, OwnSheet, PersonSheet, type MemoryPreset } from './sheets';
import { DatesTab, PeopleTab } from './Tabs';
import type { CalItem, Cand, Card, Chip, DateDoc, DateItem, Goal, Home, IdeaDoc, Jar, MomentBrief, MomentDoc, PersonDoc, Week, WeekDoc } from './types';

// The Family page: the people at home and their days. Home says who to give time to now (a day that is here, a
// date that needs a plan, this week's small thing for someone) and logs it in one tap with Undo; then this week for
// each of them, time together today, the dates coming, memories and what he is building for them. People, Memories
// and Dates each have a tab. A person and a date open as screens; quick jobs are sheets. Nothing here messages
// anyone, and nothing scores him.

type Tab = 'home' | 'people' | 'memories' | 'dates';
const TABS: readonly TabDef<Tab>[] = [
  { key: 'home', label: 'Home' }, { key: 'people', label: 'People' }, { key: 'memories', label: 'Memories' }, { key: 'dates', label: 'Dates' },
];
type Ov = { done: Record<string, Week['done']>; pick: Record<string, Cand>; chips: Record<string, string | null> };
const NONE: Ov = { done: {}, pick: {}, chips: {} };
type SheetKind = 'add' | 'memory' | 'mention' | 'date' | 'own' | 'person';
type SheetState = { kind: SheetKind; open: boolean; key: number; memory?: MemoryPreset; person?: string; date?: { kind?: DateDoc['kind']; people?: string[] } };
/** The moment that says he wished them on the day carries this key, so the lead knows it is done. */
const wishKey = (d: DateItem) => `wish:${d.id}`;

export default function Family() {
  const a = useAspect();
  const home = useGet<Home>(HOME);
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const persons = useCollection<PersonDoc>('people', 'persons');
  const held = useCollection<MomentDoc>('people', 'moments');
  const cal = useGet<{ items: CalItem[] }>('/mod/people/calendar?back=0&ahead=60');
  const goalsR = useGet<{ goals: Goal[] }>('/goals');
  const jarsR = useGet<{ jars: Jar[] }>('/mod/money/jars');
  const nora = useAi('week');
  const goalsAt = readTime(goalsR.data);
  const jarsAt = readTime(jarsR.data);
  const [tab, setTab] = useState<Tab>('home');

  // what a tap changed shows at once; the next answer from the PC replaces it
  const [ov, setOv] = useState<{ for: Home | null; o: Ov }>({ for: null, o: NONE });
  if (home.data !== ov.for) setOv({ for: home.data, o: NONE });
  const o = home.data === ov.for ? ov.o : NONE;
  const patch = (fn: (x: Ov) => Ov) => setOv((cur) => ({ ...cur, o: fn(cur.o) }));

  const [personId, setPersonId] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [dateId, setDateId] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [memPerson, setMemPerson] = useState<string | null>(null);
  const [view, setView] = useState<{ m: MomentBrief | null; open: boolean }>({ m: null, open: false });
  const [sheet, setSheet] = useState<SheetState>({ kind: 'add', open: false, key: 0 });
  const openSheet = (s: Omit<SheetState, 'open' | 'key'>) => setSheet((cur) => ({ ...s, open: true, key: cur.key + 1 }));
  const closeSheet = () => setSheet((cur) => ({ ...cur, open: false }));
  // from one sheet to the next: let the first slide away
  const thenSheet = (s: Omit<SheetState, 'open' | 'key'>) => { closeSheet(); setTimeout(() => openSheet(s), 260); };

  const data = home.data;
  const cards: Card[] = (data?.people ?? []).map((c) => {
    const pick = o.pick[c.id] ?? c.week.pick;
    const done = c.id in o.done ? o.done[c.id] : c.week.done;
    const options = o.pick[c.id] ? [...(c.week.pick ? [c.week.pick] : []), ...c.week.options].filter((x) => x.key !== pick?.key).slice(0, 5) : c.week.options;
    return { ...c, week: { ...c.week, pick, done, options } };
  });
  const chips: Chip[] = (data?.together ?? []).map((c) => (c.key in o.chips ? { ...c, moment: o.chips[c.key] } : c));
  const people = cards.map((c) => ({ id: c.id, name: c.name }));
  const nameOf = (id: string) => cards.find((c) => c.id === id)?.name ?? '';
  const ids = new Set(people.map((p) => p.id));
  const calItems = (cal.data?.items ?? []).filter((e) => e.kind === 'event' && e.date >= today() && e.people.some((p) => ids.has(p)));
  const goals = (goalsR.data?.goals ?? []).filter((g) => g.status === 'active' && (g.aspects ?? []).includes('family'));
  // jars carry no aspect: the ones to show serve a family goal (HANDOFFS.md)
  const goalIds = new Set(goals.map((g) => g.id));
  const jars: Jar[] = (jarsR.data?.jars ?? []).filter((j) => j.goal != null && goalIds.has(j.goal));
  const person = cards.find((c) => c.id === personId) ?? null;
  const wishedOn = (d: DateItem) => (held.items ?? []).find((m) => m.chip === wishKey(d) && m.date === (data?.today ?? today())) ?? null;

  // ── this week's small thing ──
  const weekDoc = (c: Card, change: Partial<WeekDoc>): WeekDoc => ({ id: c.week.id, week: data!.week, person: c.id, chosen: c.week.pick, skipped: c.week.skipped, done: c.week.done, ...change });
  const markIdea = (id: string | null | undefined, done: boolean) => {
    const i = id ? ideas.items?.find((x) => x.id === id) : null;
    if (i && i.done !== done) void ideas.patch(i.id, { done, done_on: done ? today() : null });
  };
  // the chip for the same routine as this week's thing: ticking either files one moment and lights both
  const chipFor = (c: Card) => chips.find((x) => x.thing === c.id) ?? null;
  // one tap: it shows done at once, saves, and the toast can take it all back
  const markDone = (c: Card) => {
    const pick = c.week.pick;
    if (!pick || !data || c.week.done) return;
    const chip = chipFor(c);
    // the chip already logged today's visit: that moment is this week's thing too
    const have = chip?.moment ?? null;
    const mid = have ?? newId('mo');
    const done = { moment: mid, at: new Date().toISOString(), title: pick.done_title };
    patch((x) => ({ ...x, done: { ...x.done, [c.id]: done }, chips: chip ? { ...x.chips, [chip.key]: mid } : x.chips }));
    const saving = (async () => {
      if (!have) await moments.put(momentDraft({
        id: mid, people: [c.id], title: pick.done_title, showup: true, week: data.week, from: pick.from,
        ...(chip ? { chip: chip.key, act: chip.act } : {}),
      }));
      await weeks.put(weekDoc(c, { chosen: pick, done }));
      markIdea(pick.idea, true);
    })();
    const saved = saving.then(() => { refresh(); return true; }, (e) => {
      patch((x) => {
        const d = { ...x.done }; delete d[c.id];
        const ch = { ...x.chips }; if (chip && !have) delete ch[chip.key];
        return { ...x, done: d, chips: ch };
      });
      a.notice(`Couldn't save that: ${errText(e)}`);
      return false;
    });
    undoable(`Saved: ${pick.done_title}`, async () => {
      if (!(await saved)) return;
      patch((x) => ({ ...x, done: { ...x.done, [c.id]: null }, chips: chip && !have ? { ...x.chips, [chip.key]: null } : x.chips }));
      try {
        if (!have) await moments.remove(mid);
        await weeks.put(weekDoc(c, { chosen: pick, done: null }));
        markIdea(pick.idea, false);
      } catch (e) { a.notice(`Couldn't undo that: ${errText(e)}`); }
      refresh();
    });
  };
  // untick: a moment he added a photo or a line to stays (only the week's tick goes); a bare one goes, with Undo
  const unmark = async (c: Card) => {
    const was = c.week.done;
    if (!was || !data) return;
    const chip = chipFor(c);
    patch((x) => ({ ...x, done: { ...x.done, [c.id]: null } }));
    try {
      const doc = await momentDoc(was.moment);
      const keep = !!(doc?.photo || doc?.note?.trim());
      if (!keep) {
        if (chip?.moment === was.moment) patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: null } }));
        await moments.remove(was.moment);
      }
      await weeks.put(weekDoc(c, { done: null }));
      markIdea(c.week.pick?.idea, false);
      refresh();
      undoable(keep ? 'Unticked. The memory stays' : 'Unticked', async () => {
        patch((x) => ({ ...x, done: { ...x.done, [c.id]: was } }));
        try {
          if (!keep) {
            const { created_at: _c, updated_at: _u, deleted_at: _d, ...cur } = doc ?? momentDraft({ people: [c.id], title: was.title, showup: true, week: data.week });
            await moments.put({ ...cur, id: was.moment });
          }
          await weeks.put(weekDoc(c, { done: was }));
          markIdea(c.week.pick?.idea, true);
        } catch (e) { a.notice(`Couldn't put it back: ${errText(e)}`); }
        refresh();
      });
    } catch (e) {
      patch((x) => ({ ...x, done: { ...x.done, [c.id]: was }, chips: chip?.moment === was.moment ? { ...x.chips, [chip.key]: was.moment } : x.chips }));
      a.notice(`Couldn't undo that: ${errText(e)}`);
    }
  };
  const toggleThing = (c: Card) => { if (c.week.done) void unmark(c); else markDone(c); };
  const choose = (c: Card, next: Cand, skip: boolean) => {
    if (!data) return;
    patch((x) => ({ ...x, pick: { ...x.pick, [c.id]: next } }));
    const skipped = skip && c.week.pick ? [...new Set([...c.week.skipped, c.week.pick.key])] : c.week.skipped;
    weeks.put(weekDoc(c, { chosen: next, skipped })).then(() => refresh()).catch((e) => {
      patch((x) => { const p = { ...x.pick }; delete p[c.id]; return { ...x, pick: p }; });
      a.notice(`Couldn't change it: ${errText(e)}`);
    });
  };
  const own = (c: Card, title: string) => {
    const idea = newId('id');
    ideas.put({ id: idea, person: c.id, aspect: 'family', kind: 'showup', title, from: 'own', done: false, by: 'you' })
      .catch((e) => a.notice(`Couldn't keep that idea: ${errText(e)}`));
    choose(c, { key: `own:${idea}`, title, done_title: title, from: 'own', why: null, idea }, false);
  };

  // ── the day itself: wishing them is one tap, kept as a moment with them ──
  const wished = (d: DateItem) => {
    if (wishedOn(d)) return;
    const who = names(d.people.map(nameOf).filter(Boolean));
    const title = d.kind === 'birthday' ? `Wished ${who} a happy birthday` : d.kind === 'anniversary' ? `Wished ${who} a happy anniversary` : `Wished ${who} for ${d.title}`;
    const mid = newId('mo');
    moments.put(momentDraft({ id: mid, people: d.people, title, kind: 'chat', showup: true, chip: wishKey(d) }))
      .then(() => refresh()).catch((e) => a.notice(`Couldn't save that: ${errText(e)}`));
    undoable(`Saved: ${title}`, () => { void moments.remove(mid).then(() => refresh()).catch((e) => a.notice(`Couldn't take it back: ${errText(e)}`)); });
  };

  // ── time together ──
  const toggleChip = (chip: Chip) => {
    // a routine chip that is someone's thing this week: tapping it ticks (or unticks) that thing, one moment for both
    const linked = chip.thing ? cards.find((c) => c.id === chip.thing) : null;
    if (linked && (chip.moment ? linked.week.done?.moment === chip.moment : !linked.week.done && linked.week.pick)) {
      toggleThing(linked);
      return;
    }
    if (chip.moment) {
      const mid = chip.moment;
      patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: null } }));
      moments.remove(mid).then(() => refresh())
        .catch((e) => { patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: mid } })); a.notice(`Couldn't take it back: ${errText(e)}`); });
      return;
    }
    const mid = newId('mo');
    patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: mid } }));
    moments.put(momentDraft({ id: mid, people: chip.people, title: chip.label, act: chip.act, dinner: chip.dinner || undefined, chip: chip.key }))
      .then(() => refresh())
      .catch((e) => { patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: null } })); a.notice(`Couldn't save that: ${errText(e)}`); });
    undoable(`Saved: ${chip.label}`, () => {
      patch((x) => ({ ...x, chips: { ...x.chips, [chip.key]: null } }));
      void moments.remove(mid).then(() => refresh()).catch((e) => a.notice(`Couldn't take it back: ${errText(e)}`));
    });
  };

  const move = (c: Card, aspect: 'friends' | 'romance') => {
    const prev = persons.items?.find((p) => p.id === c.id);
    const back = { aspect: prev?.aspect ?? 'family', rel: prev?.rel ?? 'family' };
    persons.patch(c.id, { aspect, rel: aspect === 'friends' ? 'friend' : 'partner' })
      .then(() => {
        refresh();
        undoable(`${c.name} is in ${aspect === 'friends' ? 'Friends' : 'Romance'} now`, () =>
          persons.patch(c.id, back).then(() => refresh()).catch((e) => a.notice(`Couldn't move ${c.name} back: ${errText(e)}`)), 8000);
      })
      .catch((e) => a.notice(`Couldn't move ${c.name}: ${errText(e)}`));
    setPersonOpen(false);
  };

  const openPerson = (id: string) => { setPersonId(id); setPersonOpen(true); };
  const openDate = (id: string) => { setDateId(id); setDateOpen(true); };
  const openMemory = (m: MomentBrief) => setView({ m, open: true });
  const openMemories = (who: string | null) => { setMemPerson(who); setTab('memories'); };
  const addMemory = (preset: Partial<MemoryPreset> = {}) => openSheet({ kind: 'memory', memory: { kind: 'memory', ...preset } });
  const attach = (c: Card, focus: 'photo' | 'line') => {
    if (c.week.done) openSheet({ kind: 'memory', memory: { kind: 'attach', moment: c.week.done.moment, people: [c.id], focus } });
  };
  // family/<part>: person/<id>, date/<id>, memories[/<person id>], people, dates, add. Plain family is home.
  useEntry((e) => {
    const [p, id] = e.parts;
    setPersonOpen(false); setDateOpen(false); closeSheet();
    setView((v) => ({ ...v, open: false }));
    if (p === 'person' && id) openPerson(id);
    else if (p === 'date' && id) { setTab('dates'); openDate(id); }
    else if (p === 'memories') openMemories(id ?? null);
    else if (p === 'people' || p === 'dates') setTab(p);
    else if (p === 'add') openSheet({ kind: 'add' });
    else setTab('home');
  });
  const refreshAll = () => { refresh(); void cal.refresh(); void goalsR.refresh(); void jarsR.refresh(); void ideas.refresh(); };
  // back from another app or the lock screen: the day may have moved on, and other pages change goals and jars
  useOnReturn(refreshAll);

  const add = <IconButton label="Add" size={40} onPress={() => openSheet({ kind: 'add' })}><Icon name="plus" size={18} /></IconButton>;
  const footer = (
    <>
      <PersonScreen open={personOpen} onClose={() => setPersonOpen(false)} card={person} noraMade={data?.nora?.made_at ?? null}
        onToggle={() => { if (person) toggleThing(person); }}
        onChoose={(cand) => { if (person) choose(person, cand, false); }}
        onOwn={() => { if (person) openSheet({ kind: 'own', person: person.id }); }}
        onMention={() => { if (person) openSheet({ kind: 'mention', person: person.id }); }}
        onAddDate={(birthday) => { if (person) openSheet({ kind: 'date', date: { kind: birthday ? 'birthday' : undefined, people: [person.id] } }); }}
        onOpenDate={openDate}
        onMemories={() => { setPersonOpen(false); openMemories(person?.id ?? null); }}
        onMemory={openMemory}
        onAddPhoto={() => { if (person) attach(person, 'photo'); }}
        onAddLine={() => { if (person) attach(person, 'line'); }}
        onMove={(asp) => { if (person) move(person, asp); }} />
      <DateScreen open={dateOpen} onClose={() => setDateOpen(false)} id={dateId} goals={goals} jars={jars} goalsAt={goalsAt} jarsAt={jarsAt} notice={a.notice}
        onMemory={(p) => addMemory({ people: p.people, date: p.date, title: p.title })} onOpenMemory={openMemory} />

      <AddSheet open={sheet.open && sheet.kind === 'add'} onClose={closeSheet}
        onPick={(k) => thenSheet(k === 'memory' ? { kind: 'memory', memory: { kind: 'memory' } } : { kind: k })} />
      {sheet.kind === 'memory' && sheet.memory ? <MemorySheet key={sheet.key} open={sheet.open} onClose={closeSheet} people={people} preset={sheet.memory} notice={a.notice} /> : null}
      {sheet.kind === 'mention' ? <MentionSheet key={sheet.key} open={sheet.open} onClose={closeSheet} people={people} person={sheet.person} notice={a.notice} /> : null}
      {sheet.kind === 'date' ? <DateSheet key={sheet.key} open={sheet.open} onClose={closeSheet} people={people} preset={sheet.date} notice={a.notice} /> : null}
      {sheet.kind === 'own' && sheet.person ? (
        <OwnSheet key={sheet.key} open={sheet.open} onClose={closeSheet} name={nameOf(sheet.person)}
          onSave={(title) => { const c = cards.find((x) => x.id === sheet.person); if (c) own(c, title); }} />
      ) : null}
      {sheet.kind === 'person' ? <PersonSheet key={sheet.key} open={sheet.open} onClose={closeSheet} notice={a.notice} /> : null}
      <MemoryView open={view.open} m={view.m} onClose={() => setView((v) => ({ ...v, open: false }))} nameOf={nameOf} notice={a.notice}
        onAttach={(m) => {
          setView((v) => ({ ...v, open: false }));
          setTimeout(() => openSheet({ kind: 'memory', memory: { kind: 'attach', moment: m.id, people: m.people, focus: m.photo ? 'line' : 'photo' } }), 260);
        }} />
    </>
  );

  // nobody in the family yet: the welcome on every tab, even where the computed home can't load
  const nobody = (!data && persons.items != null && !persons.error && !persons.items.some((p) => p.aspect === 'family')) || (!!data && !cards.length);
  const welcome = (
    <Empty title="Your family lives here" body="Add the people in your family. Time with them, their dates and your memories together collect here."
      action="Add someone" onAction={() => openSheet({ kind: 'person' })} />
  );
  const waiting = home.error ? <Failed message={home.error} onRetry={home.refresh} /> : null;
  const lead = data ? pickLead(data, cards) : null;
  const leadPerson = lead?.kind === 'thing' ? lead.c.id : null;

  return (
    <TabbedPage tabs={TABS} tab={tab} onTab={setTab} right={add} footer={footer} onRefresh={refreshAll} refreshing={home.busy && !!data}>
      <TabPanel active={tab === 'home'}>
        {nobody ? welcome : !data || !lead ? (waiting ?? <HomeSkeleton />) : (
          <>
            <FamilyLead pick={lead} cards={cards} nameOf={nameOf} wished={lead.kind === 'today' && !!wishedOn(lead.d)}
              onDone={markDone} onSwap={(c) => { if (c.week.options[0]) choose(c, c.week.options[0], true); }} onWished={wished}
              onOpenDate={openDate} onOpenPerson={openPerson} onAddMemory={(p) => addMemory(p ?? {})}
              onAskNora={() => void askNora('week', '/mod/family/suggest')} asking={nora.busy} />
            <ThisWeek cards={cards} except={leadPerson} onToggle={toggleThing} onOpen={openPerson} />
            <Together chips={chips} onToggle={toggleChip} onOther={() => openSheet({ kind: 'memory', memory: { kind: 'together' } })} />
            <ComingUp home={data} nameOf={nameOf} onOpen={openDate} onAll={() => setTab('dates')}
              onMemory={(p) => addMemory({ people: p.people, date: p.date, title: p.title })} />
            <MemoryStrip home={data} nameOf={nameOf} onOpen={openMemory} onAdd={() => addMemory()} onSeeAll={() => openMemories(null)} />
            <ForThem goals={goals} jars={jars} goalsAt={goalsAt} jarsAt={jarsAt} onMission={(id) => openLink(`mission/goal/${encodeURIComponent(id)}`)} onMoney={() => openLink('money/save')} />
            <Linked goals={false} />
          </>
        )}
      </TabPanel>
      <TabPanel active={tab === 'people'}>
        {nobody ? welcome : !data ? (waiting ?? <Skeleton height={320} radius={22} />) : (
          <PeopleTab cards={cards} soon={data.dates.soon} onOpen={openPerson} onAdd={() => openSheet({ kind: 'person' })} onMention={() => openSheet({ kind: 'mention' })}
            onBirthday={(pid) => openSheet({ kind: 'date', date: { kind: 'birthday', people: [pid] } })} />
        )}
      </TabPanel>
      <TabPanel active={tab === 'memories'}>
        {nobody ? welcome : (
          <MemoriesTab active={tab === 'memories'} person={memPerson} onPerson={setMemPerson} onOpen={openMemory}
            onAdd={() => addMemory(memPerson ? { people: [memPerson] } : {})} />
        )}
      </TabPanel>
      <TabPanel active={tab === 'dates'}>
        {nobody ? welcome : !data ? (waiting ?? <Skeleton height={320} radius={22} />) : (
          <DatesTab home={data} cal={calItems} nameOf={nameOf} onOpen={openDate} onAdd={() => openSheet({ kind: 'date' })}
            onBirthday={(pid) => openSheet({ kind: 'date', date: { kind: 'birthday', people: [pid] } })}
            onMemory={(p) => addMemory({ people: p.people, date: p.date, title: p.title })} />
        )}
      </TabPanel>
    </TabbedPage>
  );
}
