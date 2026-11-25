import { addDays, daysBetween, myDay, today } from '@/aspects/kit';
import {
  actWord, count, firstName, standingOf, standingPlan, warmthOf, whenAgo, whenAhead,
  type BankIdea, type Friends, type Idea, type Moment, type Person, type Place, type Plan, type Rhythm, type Stage, type Standing, type Visit,
} from './data';

// What every screen shows, worked out from the records in one place.

export type FriendView = {
  p: Person; st: Standing; rhythm: Rhythm | null; warmth: 'warm' | 'due' | 'drift' | 'none'; usual: { act: string; thisWeek: boolean } | null;
  /** What is already logged for his day (rolls at 04:00): the one-tap buttons read these, so a second tap can't log twice. */
  todayMeet: Moment | null; todayTalk: Moment | null;
};
export type NewView = { p: Person; st: Standing; place: Place | null; visit: Visit | null };
export type Nudge = { key: string; kind: 'hello' | 'invite' | 'friend'; v: NewView; title: string; sub: string };
export type DeepenIdea = { id: string; title: string; act: string | null; invite: string | null; saved: boolean };
export type PlaceView = { place: Place; visits: Visit[]; people: { p: Person; stage: Stage }[] };

const OPEN = new Set(['tentative', 'confirmed', 'asked', 'sent', 'draft', 'idea']);
/** How long an unanswered plan waits on home for "did it happen?" before it lives on the Plans screen only. */
const ASK_DAYS = 7;

/** The latest moment with this person logged for his day `day`, of one kind: an in-person meeting or a call/chat. */
export function loggedOn(moments: Moment[], person: string, day: string, talk: boolean) {
  return moments.filter((m) => m.date === day && m.people?.includes(person) && (((m.kind ?? 'meet') === 'meet') !== talk))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] ?? null;
}

export function visitPhrase(place: Place | null, visit: Visit | null) {
  if (!place) return null;
  if (!visit) return `${place.name}, next time you are there`;
  return `${place.name}, ${whenAhead(visit.date).replace(/^on /, '')}${visit.at ? ` at ${visit.at}` : ''}`;
}

export function buildModel(f: Friends) {
  const ref = today();
  const day = myDay();
  const persons = (f.persons.items ?? []).filter((p) => p.aspect === 'friends');
  const ids = new Set(persons.map((p) => p.id));
  const moments = (f.moments.items ?? []).filter((m) => m.people?.some((id) => ids.has(id)));
  const plans = (f.plans.items ?? []).filter((p) => p.aspect === 'friends');
  const rhythms = f.rhythms.items ?? [];
  const places = (f.places.items ?? []).filter((p) => !p.hidden).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const visits = f.week.data?.visits ?? {};
  const placeOf = (id?: string | null) => (id ? places.find((x) => x.id === id) ?? null : null);

  const byName = (a: Person, b: Person) => (a.sort ?? 99) - (b.sort ?? 99) || a.name.localeCompare(b.name);
  const friends: FriendView[] = persons.filter((p) => p.rel !== 'new').sort(byName).map((p) => {
    const st = standingOf(p, moments, plans, ref);
    const rhythm = rhythms.filter((r) => r.person === p.id && !r.dinner).sort((a, b) => ((a as { sort?: number }).sort ?? 9) - ((b as { sort?: number }).sort ?? 9))[0] ?? null;
    return { p, st, rhythm, warmth: warmthOf(rhythm, st), usual: standingPlan(p, moments, rhythm, ref),
      todayMeet: loggedOn(moments, p.id, day, false), todayTalk: loggedOn(moments, p.id, day, true) };
  });
  const all: NewView[] = persons.filter((p) => p.rel === 'new').map((p) => {
    const place = placeOf(p.place);
    return { p, st: standingOf(p, moments, plans, ref), place, visit: place ? visits[place.id]?.[0] ?? null : null };
  });
  const newcomers = all.filter((v) => !v.st.faded).sort((a, b) => (b.st.last?.date ?? b.p.met ?? '').localeCompare(a.st.last?.date ?? a.p.met ?? ''));
  const faded = all.filter((v) => v.st.faded);

  const groups: Record<Stage, Person[]> = {
    met: newcomers.filter((v) => v.st.stage === 'met').map((v) => v.p),
    again: newcomers.filter((v) => v.st.stage === 'again').map((v) => v.p),
    friend: friends.map((v) => v.p),
  };

  // ── plans ──
  const open = plans.filter((p) => OPEN.has(p.state));
  const ask = open.filter((p) => p.date && p.date < ref).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // home asks only about the last week's plans, newest first; older ones wait on the Plans screen
  const askRecent = ask.filter((p) => String(p.date) >= addDays(ref, -ASK_DAYS)).reverse();
  const upcoming = open.filter((p) => !p.date || p.date >= ref).sort((a, b) => String(a.date ?? '9999').localeCompare(String(b.date ?? '9999')) || String(a.slot ?? '').localeCompare(String(b.slot ?? '')));
  const done = plans.filter((p) => p.state === 'done').sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const withPlan = new Set([...upcoming, ...ask].flatMap((p) => p.people ?? []));

  // ── second meetings: the next hello in the same place, then a small invitation, then "friends now?" ──
  const nudges: Nudge[] = [];
  for (const v of newcomers) {
    const first = firstName(v.p);
    const where = visitPhrase(v.place, v.visit);
    if (v.st.stage === 'again' && v.st.planDone) {
      nudges.push({ key: `f-${v.p.id}`, kind: 'friend', v, title: `Friends with ${first} now?`, sub: 'You spent time together beyond where you met.' });
    } else if (v.st.stage === 'met' && (v.st.since ?? 0) <= 21) {
      const note = v.p.note ? ` ${v.p.note.replace(/[.\s]+$/, '')}.` : '';
      nudges.push({ key: `h-${v.p.id}`, kind: 'hello', v, title: `Say hello to ${first}`, sub: `${where ? `${where}.` : `Met ${whenAgo(v.st.last?.date ?? v.p.met ?? ref)}.`}${note}` });
    } else if (v.st.stage === 'again' && !withPlan.has(v.p.id)) {
      nudges.push({ key: `i-${v.p.id}`, kind: 'invite', v, title: `Plan something with ${first}`, sub: `${where ? `${where}. ` : ''}A chai or a walk right after is enough.` });
    }
  }
  const rank = (n: Nudge) => (n.kind === 'friend' ? 0 : n.kind === 'hello' ? 1 : 2);
  nudges.sort((a, b) => rank(a) - rank(b) || String(a.v.visit?.date ?? '9999').localeCompare(String(b.v.visit?.date ?? '9999')));

  // ── the steadiest friend gets one idea beyond the usual: the one he meets most, or, before anything is logged,
  // the one he set the closest in-person rhythm with (his own words for who he sees every week) ──
  const recent = (v: FriendView) => (v.st.last ? v.st.meetings : 0);
  const steady = friends.filter((v) => v.st.meetings >= 2 && v.st.lastMeet && v.st.lastMeet.date >= addDays(ref, -60)).sort((a, b) => recent(b) - recent(a))[0]
    ?? friends.filter((v) => v.rhythm?.mode === 'meet' && v.rhythm.every <= 14).sort((a, b) => a.rhythm!.every - b.rhythm!.every)[0] ?? null;

  // ── the header line: the answer to "is my circle growing?" in words ──
  const monthStart = `${ref.slice(0, 8)}01`;
  const newFriends = friends.filter((v) => v.p.friend_since && v.p.friend_since >= monthStart).length;
  const knowing = newcomers.length;
  let headline: string;
  if (!persons.length) headline = 'The people you meet and the friends you keep.';
  else if (newFriends) headline = `${count(newFriends)} new ${newFriends === 1 ? 'friend' : 'friends'} this month${knowing ? `, and ${count(knowing, true)} ${knowing === 1 ? 'person' : 'people'} you are getting to know` : ''}.`;
  else if (knowing) headline = `${count(friends.length)} ${friends.length === 1 ? 'friend' : 'friends'}, and ${count(knowing, true)} ${knowing === 1 ? 'person' : 'people'} you are getting to know.`;
  else headline = `${count(friends.length)} ${friends.length === 1 ? 'friend' : 'friends'}. The people you meet start here.`;

  const placeViews: PlaceView[] = places.map((place) => ({
    place, visits: visits[place.id] ?? [],
    people: [...newcomers.filter((v) => v.p.place === place.id).map((v) => ({ p: v.p, stage: v.st.stage })),
      ...friends.filter((v) => v.p.place === place.id).map((v) => ({ p: v.p, stage: 'friend' as Stage }))],
  }));

  return { ref, persons, moments, plans, friends, newcomers, faded, groups, ask, askRecent, upcoming, done, nudges, steady, headline, places: placeViews, placeOf };
}
export type Model = ReturnType<typeof buildModel>;

/** Ideas beyond the usual for one friend: his own saved ideas first, then the bank's firsts for these two. */
export function deepenIdeas(v: FriendView, ideas: Idea[], bank: BankIdea[]): DeepenIdea[] {
  const saved = ideas.filter((i) => i.person === v.p.id && i.kind === 'plan' && !i.done).map((i) => ({ id: i.id, title: i.title, act: null, invite: null, saved: true }));
  const usual = v.rhythm?.act ?? null;
  const firsts = bank.filter((b) => b.act !== 'talk' && b.act !== usual && !v.st.acts[b.act] && !(b.act === 'food' && (v.st.acts.meal || usual === 'meal')))
    .sort((a, b) => Number(!!a.near) - Number(!!b.near))
    .map((b) => ({ id: b.id, title: b.title, act: b.act, invite: b.invite, saved: false }));
  return [...saved, ...firsts];
}

/** What a friend and he usually do, for "this would be a first": what they log most, else what he said they do. */
export function usualAct(st: Standing, rhythm?: Rhythm | null) {
  const top = Object.entries(st.acts).sort((a, b) => b[1] - a[1])[0];
  return top ? actWord(top[0]) : actWord(rhythm?.act);
}

/** Plans that involve a person, soonest first. */
export const plansWith = (m: Model, id: string): Plan[] => m.upcoming.filter((p) => p.people?.includes(id));
/** Everyone with a plan ahead, or a plan from the last week still waiting for "did it happen?". */
export const plannedIds = (m: Model) => new Set([...m.upcoming, ...m.askRecent].flatMap((p) => p.people ?? []));

// ── who to reach out to ───────────────────────────────────────────────────────────────────────────────────────
/** How often he wants to see someone when he set no rhythm with them: about once a month. */
const EVERY_UNSET = 30;
/** How far past his rhythm with them a friend is: 1 is exactly due, 2 twice as long. Never shown as a number. */
export function overdue(v: FriendView, ref = today()) {
  const every = v.rhythm?.every || EVERY_UNSET;
  const last = v.rhythm?.mode === 'meet' ? v.st.lastMeet : v.st.last;
  if (!last) return 1.2; // nothing logged yet: a gentle first hello, after anyone well past their rhythm
  return daysBetween(last.date, ref) / every;
}
/**
 * Friends to reach out to now, the most overdue against how close they are first (a weekly friend unseen for three
 * weeks comes before a monthly one unseen for five). Anyone already met or talked to today, or with a plan ahead
 * (`planned`), is left out.
 */
export function reachOut(friends: FriendView[], planned: ReadonlySet<string> = new Set(), ref = today()) {
  return friends.filter((v) => !v.todayMeet && !v.todayTalk && !planned.has(v.p.id))
    .map((v) => ({ v, r: overdue(v, ref) }))
    .filter((x) => x.r >= 1)
    .sort((a, b) => b.r - a.r || (a.v.rhythm?.every ?? 99) - (b.v.rhythm?.every ?? 99))
    .map((x) => x.v);
}
/** The easiest next step with a friend, in words. Plain, never a countdown. */
export function nextStep(v: FriendView) {
  const r = overdue(v);
  if (!v.st.last) return 'A short hello is a good start.';
  if (r >= 2) return 'A short message is enough.';
  return v.rhythm?.mode === 'talk' ? 'A good week for a call.' : 'A good week to meet.';
}

/** The circle by closeness: how often he wants to see each friend, from the rhythm he set. */
export type Ring = { key: 'week' | 'weeks' | 'month'; title: string; friends: FriendView[] };
export function rings(friends: FriendView[]): Ring[] {
  const every = (v: FriendView) => v.rhythm?.every ?? null;
  const out: Ring[] = [
    { key: 'week', title: 'Every week', friends: friends.filter((v) => every(v) != null && every(v)! <= 7) },
    { key: 'weeks', title: 'Every few weeks', friends: friends.filter((v) => every(v) != null && every(v)! > 7 && every(v)! <= 21) },
    { key: 'month', title: 'Now and then', friends: friends.filter((v) => every(v) == null || every(v)! > 21) },
  ];
  return out.filter((r) => r.friends.length);
}
