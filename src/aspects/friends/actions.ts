import { clock, myDay, today, undoable } from '@/aspects/kit';
import { invalidate, newId, upload } from '@/lib/mod';
import { actWord, dayAhead, firstName, inLine, type Friends, type Kind, type Moment, type Person, type Place, type Plan, type Rhythm, type SeenPlace } from './data';
import { loggedOn } from './model';

// Every write the page makes. Writes show at once (the data layer keeps them) and reach the PC in order; when the
// PC refuses, the record goes back and the promise rejects, so each action reports through `notice`.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const momentTitle = (kind: Kind, act?: string | null) => (act ? cap(actWord(act) ?? act) : kind === 'meet' ? 'Met' : kind === 'call' ? 'A call' : 'A message');
const why = (e: unknown) => (e instanceof Error ? e.message : "Couldn't save that.");

export function makeActions(f: Friends, notice: (text: string) => void) {
  const fail = (e: unknown) => { notice(why(e)); };

  /** A new moment for his day (a log at 01:00 still counts for the evening before). Returns its id. */
  function put(person: Person, kind: Kind, extra: Partial<Moment> = {}) {
    const id = newId('mo');
    f.moments.put({ id, date: myDay(), at: clock(Date.now()), people: [person.id], aspect: 'friends', kind, act: null,
      title: momentTitle(kind), by: 'you', source: 'you', ...extra }).catch(fail);
    return id;
  }
  /**
   * One tap: met today or talked today. Once one is logged for his day, another tap saves nothing new: it returns that
   * moment (adding the act when it has none), so the page opens its details. Only a different act makes a second one.
   */
  function log(person: Person, kind: Kind, extra: Partial<Moment> = {}) {
    const had = loggedOn(f.moments.items ?? [], person.id, myDay(), kind !== 'meet');
    if (had && !(extra.act && had.act && had.act !== extra.act)) {
      if (extra.act && !had.act) detail(had.id, { act: extra.act });
      return had.id;
    }
    const id = put(person, kind, extra);
    const what = extra.act ? (actWord(extra.act) ?? extra.act) : null;
    undoable(`${kind === 'meet' ? 'Met' : kind === 'chat' ? 'Messaged' : 'Talked to'} ${firstName(person)}${what ? `, ${what}` : ''}`, () => undoLog(id));
    return id;
  }
  function detail(id: string, change: Partial<Moment>) {
    const cur = f.moments.items?.find((m) => m.id === id);
    if (!cur) return;
    const kind = (change.kind ?? cur.kind ?? 'meet') as Kind;
    const act = change.act !== undefined ? change.act : cur.act;
    const titled = !cur.plan && (cur.title == null || /^(Met|A call|A chat|A message|Talked)$/.test(cur.title) || cur.title === momentTitle(kind, cur.act));
    f.moments.patch(id, { ...change, ...(titled ? { title: momentTitle(kind, act) } : null) }).catch(fail);
  }
  function undoLog(id: string) { f.moments.remove(id).catch(fail); }
  async function photo(id: string, file: { uri: string; type: string }) {
    try {
      const r = await upload<{ id: string; path: string }>(`/mod/friends/photo?moment=${encodeURIComponent(id)}`, file.uri, file.type);
      await f.moments.patch(id, { photo: r.path });
      notice('Photo added');
    } catch (e) { fail(e); }
  }

  /** Someone he just met: the person (rel new) and the first meeting, in one go. */
  async function addSomeone(o: { name: string; place: Place | SeenPlace | null; note: string }) {
    let placeId: string | null = null, placeName: string | null = null;
    if (o.place && 'key' in o.place && !('id' in o.place)) {
      const kept = await keepPlace(o.place as SeenPlace);
      placeId = kept?.id ?? null; placeName = o.place.name;
    } else if (o.place) { placeId = (o.place as Place).id; placeName = o.place.name; }
    const id = newId('fp');
    const sort = 100 + (f.persons.items?.length ?? 0);
    try {
      await f.persons.put({ id, name: o.name.trim(), rel: 'new', aspect: 'friends', where: placeName, place: placeId, note: o.note.trim() || null, met: today(), sort, by: 'you' });
      await f.moments.put({ id: newId('mo'), date: today(), at: clock(Date.now()), people: [id], aspect: 'friends', kind: 'meet', act: null,
        title: 'First met', place: placeId, by: 'you', source: 'you' });
      invalidate('/mod/friends/');
      return id;
    } catch (e) { fail(e); return null; }
  }
  function sawAgain(p: Person) {
    const id = put(p, 'meet', { title: 'Saw again', place: p.place ?? null });
    undoable(`Saw ${firstName(p)} again`, () => undoLog(id));
    return id;
  }
  function makeFriend(p: Person) {
    const back = { rel: p.rel ?? 'new', friend_since: p.friend_since ?? null };
    f.persons.patch(p.id, { rel: 'friend', friend_since: today() })
      .then(() => undoable(`${firstName(p)} is in your circle`, () => { f.persons.patch(p.id, back).catch(fail); }))
      .catch(fail);
  }
  function stillGettingToKnow(p: Person) { f.persons.patch(p.id, { rel: 'new', friend_since: null }).catch(fail); }
  function patchPerson(p: Person, change: Partial<Person>) { f.persons.patch(p.id, change).catch(fail); }
  /** Move someone to Family or Romance: only the section changes; their history stays with them. Undo puts them back. */
  function moveTo(p: Person, aspect: 'family' | 'romance') {
    const back = { aspect: p.aspect ?? 'friends', rel: p.rel ?? null };
    f.persons.patch(p.id, { aspect, ...(aspect === 'family' ? { rel: 'family' } : null) })
      .then(() => undoable(`${firstName(p)} moved to ${aspect === 'family' ? 'Family' : 'Romance'}`, () => { f.persons.patch(p.id, back).catch(fail); }))
      .catch(fail);
  }
  /** What he and a friend usually do, saved on the rhythm he set with them, so the weekly row and "a first" work from day one. */
  function setUsual(r: Rhythm, act: string | null) { f.rhythms.patch(r.id, { act }).catch(fail); }
  /** Forget someone he is getting to know: the person and the meetings that were only with them. */
  async function forget(p: Person) {
    try {
      for (const m of f.moments.items ?? []) if (m.people?.length === 1 && m.people[0] === p.id) await f.moments.remove(m.id);
      await f.persons.remove(p.id);
      notice('Removed');
    } catch (e) { fail(e); }
  }

  // ── plans ──────────────────────────────────────────────────────────────────────────────────────────────────
  async function makePlan(o: { people: string[]; title: string; act: string | null; date: string; slot: string | null; invite: string | null; idea: string | null }) {
    const id = newId('pl');
    try {
      await f.plans.put({ id, title: o.title, people: o.people, aspect: 'friends', act: o.act, date: o.date, slot: o.slot, state: 'tentative', invite: o.invite, idea: o.idea, by: 'you' });
      return id;
    } catch (e) { fail(e); return null; }
  }
  function patchPlan(id: string, change: Partial<Plan>) { f.plans.patch(id, change).catch(fail); }
  /** Did it happen? Yes: the plan is done and becomes a moment with everyone in it. */
  function happened(plan: Plan) {
    const mo = newId('mo');
    f.plans.patch(plan.id, { state: 'done' }).catch(fail);
    f.moments.put({ id: mo, date: plan.date ?? today(), at: plan.slot ?? null, people: plan.people, aspect: 'friends', kind: 'meet', act: plan.act ?? null,
      title: plan.title, plan: plan.id, by: 'you', source: 'you' }).catch(fail);
    undoable('Kept as a moment', () => { f.plans.patch(plan.id, { state: plan.state }).catch(fail); undoLog(mo); });
  }
  /** Another day for a plan. The toast says where it went and can put it back. */
  function movePlan(plan: Plan, date: string, slot: string | null) {
    const back = { date: plan.date ?? null, slot: plan.slot ?? null, state: plan.state };
    f.plans.patch(plan.id, { date, slot, state: 'tentative' }).catch(fail);
    undoable(`Moved to ${inLine(dayAhead(date))}`, () => { f.plans.patch(plan.id, back).catch(fail); });
  }
  function letGo(plan: Plan) {
    f.plans.patch(plan.id, { state: 'dropped' }).catch(fail);
    undoable(`Let go: ${plan.title}`, () => { f.plans.patch(plan.id, { state: plan.state }).catch(fail); });
  }
  function removePlan(plan: Plan) {
    f.plans.remove(plan.id).catch(fail);
    undoable(`Removed: ${plan.title}`, () => { f.plans.put(plan).catch(fail); });
  }

  // ── ideas he saves for a friend ───────────────────────────────────────────────────────────────────────────
  function saveIdea(p: Person, title: string) {
    f.ideas.put({ id: newId('id'), person: p.id, aspect: 'friends', kind: 'plan', title: title.trim(), done: false, by: 'you' }).catch(fail);
  }
  function toggleIdea(id: string, done: boolean) { f.ideas.patch(id, { done }).catch(fail); }

  // ── places ─────────────────────────────────────────────────────────────────────────────────────────────────
  async function keepPlace(sp: SeenPlace) {
    try {
      const doc = await f.places.put({ id: newId('pc'), name: sp.name, key: sp.key, days: sp.days?.length ? sp.days : null, from: 'calendar', sort: (f.places.items?.length ?? 0) + 1 });
      invalidate('/mod/friends/week');
      return doc;
    } catch (e) { fail(e); return null; }
  }
  async function addPlace(name: string, days: number[]) {
    try {
      const doc = await f.places.put({ id: newId('pc'), name: name.trim(), key: null, days: days.length ? days : null, from: 'you', sort: (f.places.items?.length ?? 0) + 1 });
      invalidate('/mod/friends/week');
      return doc;
    } catch (e) { fail(e); return null; }
  }
  function editPlace(id: string, change: Partial<Place>) {
    f.places.patch(id, change).then(() => invalidate('/mod/friends/week')).catch(fail);
  }
  function removePlace(id: string) { f.places.remove(id).then(() => invalidate('/mod/friends/week')).catch(fail); }

  return {
    log, detail, undoLog, photo, addSomeone, sawAgain, makeFriend, stillGettingToKnow, patchPerson, moveTo, setUsual, forget,
    makePlan, patchPlan, happened, movePlan, letGo, removePlan, saveIdea, toggleIdea, keepPlace, addPlace, editPlace, removePlace,
  };
}
export type Actions = ReturnType<typeof makeActions>;
