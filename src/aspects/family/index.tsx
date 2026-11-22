import { useState } from 'react';
import { Empty, Failed, Icon, IconButton, Page, today, useAspect } from '@/aspects/kit';
import { newId, useCollection, useGet } from '@/lib/mod';
import { errText, HOME, momentDraft, moments, refresh, weeks } from './data';
import { DateScreen } from './DatePlan';
import { ComingUp, ForThem, HomeSkeleton, MemoryStrip, PersonCard, Together } from './Home';
import { MemoriesScreen } from './Memories';
import { PersonScreen } from './Person';
import { AddSheet, DateSheet, MemorySheet, MemoryView, MentionSheet, OwnSheet, PersonSheet, type MemoryPreset } from './sheets';
import type { CalItem, Cand, Card, Chip, DateDoc, Goal, Home, IdeaDoc, Jar, MomentBrief, PersonDoc, Week, WeekDoc } from './types';

// The Family page: am I showing up for them? People first: each with the last thing done together and this week's
// one small thing; time together today; the dates coming up, planned ahead; memories; and what he is building for
// them. A person, a date and the album open as screens; quick jobs are sheets. Nothing here messages anyone, and
// nothing scores him.

type Ov = { done: Record<string, Week['done']>; pick: Record<string, Cand>; chips: Record<string, string | null> };
const NONE: Ov = { done: {}, pick: {}, chips: {} };
type SheetKind = 'add' | 'memory' | 'mention' | 'date' | 'own' | 'person';
type SheetState = { kind: SheetKind; open: boolean; key: number; memory?: MemoryPreset; person?: string; date?: { kind?: DateDoc['kind']; people?: string[] } };
type Fund = { id: string; name: string; target?: number | null; aspect?: string | null; due?: string | null; goal?: string | null };

export default function Family() {
  const a = useAspect();
  const home = useGet<Home>(HOME);
  const ideas = useCollection<IdeaDoc>('people', 'ideas');
  const persons = useCollection<PersonDoc>('people', 'persons');
  const cal = useGet<{ items: CalItem[] }>('/mod/people/calendar?back=0&ahead=60');
  const goalsR = useGet<{ goals: Goal[] }>('/goals');
  const jarsR = useGet<{ jars: Jar[] }>('/mod/money/jars');
  const fundsR = useGet<{ items: Fund[] }>(jarsR.error ? '/mod/money/funds' : null);

  // what a tap changed shows at once; the next answer from the PC replaces it
  const [ov, setOv] = useState<{ for: Home | null; o: Ov }>({ for: null, o: NONE });
  if (home.data !== ov.for) setOv({ for: home.data, o: NONE });
  const o = home.data === ov.for ? ov.o : NONE;
  const patch = (fn: (x: Ov) => Ov) => setOv((cur) => ({ ...cur, o: fn(cur.o) }));

  const [personId, setPersonId] = useState<string | null>(null);
  const [personOpen, setPersonOpen] = useState(false);
  const [dateId, setDateId] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
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
  const jars: Jar[] = jarsR.data?.jars
    ? jarsR.data.jars.filter((j) => j.aspect === 'family')
    : (fundsR.data?.items ?? []).filter((f) => f.aspect === 'family')
        .map((f) => ({ id: f.id, name: f.name, target: f.target ?? null, saved: null, pct: null, due: f.due ?? null, aspect: 'family', goal: f.goal ?? null }));
  const person = cards.find((c) => c.id === personId) ?? null;

  // ── this week's small thing ──
  const weekDoc = (c: Card, change: Partial<WeekDoc>): WeekDoc => ({ id: c.week.id, week: data!.week, person: c.id, chosen: c.week.pick, skipped: c.week.skipped, done: c.week.done, ...change });
  const markIdea = (id: string | null | undefined, done: boolean) => {
    const i = id ? ideas.items?.find((x) => x.id === id) : null;
    if (i && i.done !== done) void ideas.patch(i.id, { done, done_on: done ? today() : null });
  };
  const toggleThing = async (c: Card) => {
    if (!data) return;
    if (c.week.done) {
      const was = c.week.done;
      patch((x) => ({ ...x, done: { ...x.done, [c.id]: null } }));
      try {
        await moments.remove(was.moment);
        await weeks.put(weekDoc(c, { done: null }));
        markIdea(c.week.pick?.idea, false);
        refresh();
      } catch (e) {
        patch((x) => ({ ...x, done: { ...x.done, [c.id]: was } }));
        a.notice(`Couldn't undo that: ${errText(e)}`);
      }
      return;
    }
    const pick = c.week.pick;
    if (!pick) return;
    const mid = newId('mo');
    const done = { moment: mid, at: new Date().toISOString(), title: pick.done_title };
    patch((x) => ({ ...x, done: { ...x.done, [c.id]: done } }));
    try {
      await moments.put(momentDraft({ id: mid, people: [c.id], title: pick.done_title, showup: true, week: data.week, from: pick.from }));
      await weeks.put(weekDoc(c, { chosen: pick, done }));
      markIdea(pick.idea, true);
      refresh();
    } catch (e) {
      patch((x) => { const d = { ...x.done }; delete d[c.id]; return { ...x, done: d }; });
      a.notice(`Couldn't save that: ${errText(e)}`);
    }
  };
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

  // ── time together ──
  const toggleChip = (chip: Chip) => {
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
  };

  const move = (c: Card, aspect: 'friends' | 'romance') => {
    persons.patch(c.id, { aspect, rel: aspect === 'friends' ? 'friend' : 'partner' })
      .then(() => { refresh(); a.notice(`${c.name} is in ${aspect === 'friends' ? 'Friends' : 'Romance'} now`); })
      .catch((e) => a.notice(`Couldn't move ${c.name}: ${errText(e)}`));
    setPersonOpen(false);
  };

  const openPerson = (id: string) => { setPersonId(id); setPersonOpen(true); };
  const openDate = (id: string) => { setDateId(id); setDateOpen(true); };
  const openMemory = (m: MomentBrief) => setView({ m, open: true });
  const addMemory = (preset: Partial<MemoryPreset> = {}) => openSheet({ kind: 'memory', memory: { kind: 'memory', ...preset } });
  const attach = (c: Card, focus: 'photo' | 'line') => {
    if (c.week.done) openSheet({ kind: 'memory', memory: { kind: 'attach', moment: c.week.done.moment, people: [c.id], focus } });
  };
  const refreshAll = () => { void home.refresh(); void cal.refresh(); void goalsR.refresh(); void jarsR.refresh(); void ideas.refresh(); };

  const add = <IconButton label="Add" size={36} onPress={() => openSheet({ kind: 'add' })}><Icon name="plus" size={16} /></IconButton>;
  const footer = (
    <>
      <PersonScreen open={personOpen} onClose={() => setPersonOpen(false)} card={person} noraMade={data?.nora?.made_at ?? null}
        onToggle={() => { if (person) void toggleThing(person); }}
        onChoose={(cand) => { if (person) choose(person, cand, false); }}
        onOwn={() => { if (person) openSheet({ kind: 'own', person: person.id }); }}
        onMention={() => { if (person) openSheet({ kind: 'mention', person: person.id }); }}
        onAddDate={(birthday) => { if (person) openSheet({ kind: 'date', date: { kind: birthday ? 'birthday' : undefined, people: [person.id] } }); }}
        onOpenDate={openDate}
        onMemories={() => { setMemPerson(person?.id ?? null); setMemOpen(true); }}
        onMemory={openMemory}
        onAddPhoto={() => { if (person) attach(person, 'photo'); }}
        onAddLine={() => { if (person) attach(person, 'line'); }}
        onMove={(asp) => { if (person) move(person, asp); }} />
      <DateScreen open={dateOpen} onClose={() => setDateOpen(false)} id={dateId} goals={goals} jars={jars} notice={a.notice}
        onMemory={(p) => addMemory({ people: p.people, date: p.date, title: p.title })} onOpenMemory={openMemory} openAspect={a.openAspect} />
      <MemoriesScreen open={memOpen} onClose={() => setMemOpen(false)} person={memPerson} onPerson={setMemPerson} onOpen={openMemory}
        onAdd={() => addMemory(memPerson ? { people: [memPerson] } : {})} />

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

  // nobody in the family yet: the welcome, even where the computed home can't load (the demo has no PC)
  const nobody = !data && persons.items != null && !persons.error && !persons.items.some((p) => p.aspect === 'family');
  if (nobody) {
    return (
      <Page right={add} footer={footer}>
        <Empty title="Your family lives here" body="Add the people in your family. Time with them, their dates and your memories together collect here."
          action="Add someone" onAction={() => openSheet({ kind: 'person' })} />
      </Page>
    );
  }

  if (!data) {
    return (
      <Page right={add} footer={footer}>
        {home.error ? <Failed message={home.error} onRetry={home.refresh} /> : <HomeSkeleton />}
      </Page>
    );
  }

  if (!cards.length) {
    return (
      <Page right={add} footer={footer} onRefresh={refreshAll} refreshing={home.busy}>
        <Empty title="Your family lives here" body="Add the people in your family. Time with them, their dates and your memories together collect here."
          action="Add someone" onAction={() => openSheet({ kind: 'person' })} />
      </Page>
    );
  }

  return (
    <Page right={add} footer={footer} onRefresh={refreshAll} refreshing={home.busy}>
      {cards.map((c) => (
        <PersonCard key={c.id} c={c} onOpen={() => openPerson(c.id)} onToggle={() => void toggleThing(c)}
          onSwap={() => { if (c.week.options[0]) choose(c, c.week.options[0], true); }}
          onAddPhoto={() => attach(c, 'photo')} onAddLine={() => attach(c, 'line')} />
      ))}
      <Together chips={chips} onToggle={toggleChip} onOther={() => openSheet({ kind: 'memory', memory: { kind: 'together' } })} />
      <ComingUp home={data} cal={calItems} nameOf={nameOf} onOpen={openDate} onAdd={() => openSheet({ kind: 'date' })}
        onBirthday={(pid) => openSheet({ kind: 'date', date: { kind: 'birthday', people: [pid] } })}
        onMemory={(p) => addMemory({ people: p.people, date: p.date, title: p.title })} />
      <MemoryStrip home={data} nameOf={nameOf} onOpen={openMemory} onAdd={() => addMemory()} onSeeAll={() => { setMemPerson(null); setMemOpen(true); }} />
      <ForThem goals={goals} jars={jars} onMission={() => a.openAspect('mission')} onMoney={() => a.openAspect('money')} />
    </Page>
  );
}
