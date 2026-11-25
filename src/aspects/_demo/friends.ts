// Sample records for the `?demo` preview of the Friends page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data: every name, place and line here is made up and belongs to nobody. Each record carries
// `sample: true`. The week and the plan ideas are worked out from the in-memory collections on every read, so a tap
// in the preview changes what the page shows. The phone never loads this file.
import { collection, demoSource, type Doc } from '@/lib/mod';
import { addDays, clock, today, weekday } from '@/aspects/kit/time';
import type { AiAnswer, AiIdea, Bank, Idea, Kind, Moment, Person, Place, Plan, Rhythm, SeenPlace, Visit, Week, Window } from '@/aspects/friends/data';

const day = today();
const ago = (n: number) => addDays(day, -n);
const ahead = (n: number) => addDays(day, n);
type Sample<T> = T & { sample: true };

// ── people: five friends and four people he is getting to know ─────────────────────────────────────────────────
const friend = (id: string, name: string, role: string, sort: number, o: Partial<Person> = {}): Sample<Person> =>
  ({ id, name, rel: 'friend', aspect: 'friends', role, sort, by: 'you', ...o, sample: true });
const newcomer = (id: string, name: string, place: string, where: string, met: string, o: Partial<Person> = {}): Sample<Person> =>
  ({ id, name, rel: 'new', aspect: 'friends', role: null, place, where, met, sort: 100, by: 'you', ...o, sample: true });
const PEOPLE: Sample<Person>[] = [
  friend('fr-s-kabir', 'Kabir', 'College friend', 1),
  friend('fr-s-neha', 'Neha', 'School friend', 2),
  friend('fr-s-tara', 'Tara', 'From the debate club', 3, { friend_since: `${day.slice(0, 8)}01` }),
  friend('fr-s-aman', 'Aman', 'Old flatmate', 4),
  friend('fr-s-ishaan', 'Ishaan', 'Childhood friend', 5),
  newcomer('nw-s-zoya', 'Zoya', 'pc-s-gym', 'Gym', ago(5), { note: 'Training for her first race' }),
  newcomer('nw-s-dev', 'Dev', 'pc-s-college', 'College', ago(20)),
  newcomer('nw-s-meera', 'Meera', 'pc-s-cafe', 'Corner cafe', ago(12), { note: 'Reads the same authors' }),
  newcomer('nw-s-rohan', 'Rohan', 'pc-s-cafe', 'Corner cafe', ago(40)),
];

// ── what he set with each friend: how often, and how ────────────────────────────────────────────────────────────
const RHYTHMS: Sample<Rhythm>[] = [
  { id: 'rh-s-kabir', person: 'fr-s-kabir', every: 7, mode: 'meet', label: 'Every week, in person', act: 'gym', sample: true },
  { id: 'rh-s-neha', person: 'fr-s-neha', every: 14, mode: 'talk', label: 'Every two weeks, a call', act: null, sample: true },
  { id: 'rh-s-tara', person: 'fr-s-tara', every: 21, mode: 'talk', label: 'Every three weeks', act: null, sample: true },
  { id: 'rh-s-aman', person: 'fr-s-aman', every: 30, mode: 'any', label: 'About once a month', act: null, sample: true },
];

// ── the times together ───────────────────────────────────────────────────────────────────────────────────────────
let seq = 0;
const mo = (people: string[], date: string, kind: Kind, title: string, o: Partial<Moment> = {}): Sample<Moment> =>
  ({ id: `mo-s-f${++seq}`, date, at: '18:30', people, aspect: 'friends', kind, act: null, title, line: null, photo: null, by: 'you', source: 'you', ...o, sample: true });
const MOMENTS: Sample<Moment>[] = [
  // Kabir: the gym most weeks, so the page shows their weekly gym
  mo(['fr-s-kabir'], ago(9), 'meet', 'The gym', { act: 'gym', at: '07:00' }),
  mo(['fr-s-kabir'], ago(16), 'meet', 'The gym', { act: 'gym', at: '07:00' }),
  mo(['fr-s-kabir'], ago(23), 'meet', 'The gym', { act: 'gym', at: '07:00' }),
  mo(['fr-s-kabir'], ago(30), 'meet', 'The gym', { act: 'gym', at: '07:00' }),
  mo(['fr-s-kabir'], ago(44), 'meet', 'Dinner out', { act: 'food', at: '20:30', line: 'Found a place that stays open late.' }),
  // Neha: calls, and one lunch a while back
  mo(['fr-s-neha'], ago(26), 'call', 'A call', { at: '21:00', line: 'She got the internship she wanted.' }),
  mo(['fr-s-neha'], ago(41), 'call', 'A call', { at: '21:15' }),
  mo(['fr-s-neha'], ago(58), 'meet', 'Lunch near her college', { act: 'food', at: '13:30' }),
  // Tara: talked this week
  mo(['fr-s-tara'], ago(3), 'call', 'A call', { at: '22:00' }),
  mo(['fr-s-tara'], ago(12), 'chat', 'A message', { at: '11:00' }),
  mo(['fr-s-tara'], ago(25), 'meet', 'Chai', { act: 'chai', at: '17:00' }),
  // Aman: a month ago
  mo(['fr-s-aman'], ago(34), 'meet', 'Cricket', { act: 'sport', at: '07:30' }),
  mo(['fr-s-aman'], ago(66), 'meet', 'Dinner out', { act: 'food', at: '21:00' }),
  // Ishaan: film night yesterday
  mo(['fr-s-ishaan'], ago(1), 'meet', 'Film night', { act: 'film', at: '20:00', plan: 'pl-s-film' }),
  mo(['fr-s-ishaan'], ago(15), 'meet', 'Board games', { act: 'game', at: '19:00' }),
  mo(['fr-s-ishaan'], ago(33), 'meet', 'A walk', { act: 'walk', at: '18:00' }),
  // the people he is getting to know
  mo(['nw-s-zoya'], ago(5), 'meet', 'First met', { place: 'pc-s-gym', at: '07:10' }),
  mo(['nw-s-dev'], ago(20), 'meet', 'First met', { place: 'pc-s-college', at: '10:00' }),
  mo(['nw-s-dev'], ago(6), 'meet', 'Saw again', { place: 'pc-s-college', act: 'chai', at: '12:30' }),
  mo(['nw-s-meera'], ago(12), 'meet', 'First met', { place: 'pc-s-cafe', at: '17:00' }),
  mo(['nw-s-meera'], ago(4), 'meet', 'Chai at the corner cafe', { act: 'chai', at: '17:30', plan: 'pl-s-cafe' }),
  mo(['nw-s-rohan'], ago(40), 'meet', 'First met', { place: 'pc-s-cafe', at: '18:00' }),
];

// ── plans: two ahead, one waiting for "did it happen?", two that happened ────────────────────────────────────────
const plan = (id: string, title: string, people: string[], date: string, slot: string, state: Plan['state'], act: string | null): Sample<Plan> =>
  ({ id, title, people, aspect: 'friends', act, date, slot, state, invite: null, idea: null, by: 'you', sample: true });
const PLANS: Sample<Plan>[] = [
  plan('pl-s-games', 'Board games at home', ['fr-s-ishaan', 'fr-s-tara'], ahead(2), '19:00', 'tentative', 'game'),
  plan('pl-s-chai', 'Chai after class', ['nw-s-dev'], ahead(5), '16:30', 'confirmed', 'chai'),
  plan('pl-s-cricket', 'Cricket at the ground', ['fr-s-aman'], ago(2), '07:00', 'tentative', 'sport'),
  plan('pl-s-film', 'Film night', ['fr-s-ishaan'], ago(1), '20:00', 'done', 'film'),
  plan('pl-s-cafe', 'Chai at the corner cafe', ['nw-s-meera'], ago(4), '17:30', 'done', 'chai'),
];

// ── ideas he saved for a friend ──────────────────────────────────────────────────────────────────────────────────
const IDEAS: Sample<Idea>[] = [
  { id: 'id-s-climb', person: 'fr-s-kabir', aspect: 'friends', kind: 'plan', title: 'Try the climbing wall', done: false, by: 'you', created_at: `${ago(6)}T10:00:00.000Z`, sample: true },
  { id: 'id-s-fair', person: 'fr-s-neha', aspect: 'friends', kind: 'plan', title: 'Go to the book fair', done: false, by: 'you', created_at: `${ago(9)}T10:00:00.000Z`, sample: true },
  { id: 'id-s-cook', person: 'fr-s-ishaan', aspect: 'friends', kind: 'plan', title: 'Cook a big dinner together', done: true, by: 'you', created_at: `${ago(30)}T10:00:00.000Z`, sample: true },
];

// ── places he goes, where new people come from ───────────────────────────────────────────────────────────────────
const PLACES: Sample<Place>[] = [
  { id: 'pc-s-gym', name: 'Gym', key: 'gym', days: [1, 3, 5], from: 'calendar', sort: 1, sample: true },
  { id: 'pc-s-college', name: 'College', key: 'college', days: [1, 2, 3, 4, 5], from: 'calendar', sort: 2, sample: true },
  { id: 'pc-s-cafe', name: 'Corner cafe', key: null, days: [6], from: 'you', sort: 3, sample: true },
];
const SEEN: SeenPlace[] = [{ key: 'library', name: 'Library', days: [2, 4], count: 4 }];

// ── reads worked out from the collections ────────────────────────────────────────────────────────────────────────
function held<T extends Doc>(key: string): T[] {
  const [mod, coll] = key.split('/');
  const c = collection<T>(mod, coll);
  if (!c.get()) void c.refresh(); // in the preview this loads at once
  return c.get() ?? [];
}

/** The next two weeks: free evenings, and the next days at each place he goes. */
function weekOf(): Week {
  const free: Window[] = [
    { date: ahead(1), from: '18:40', to: '22:00', minutes: 200, part: 'evening' },
    { date: ahead(3), from: '19:00', to: '22:30', minutes: 210, part: 'evening' },
    { date: ahead(4), from: '11:00', to: '16:00', minutes: 300, part: 'day' },
    { date: ahead(6), from: '18:00', to: '22:00', minutes: 240, part: 'evening' },
  ];
  const places = held<Place>('friends/places').filter((p) => !p.hidden);
  const visits: Record<string, Visit[]> = {};
  for (const p of places) {
    const days = new Set(p.days ?? []);
    visits[p.id] = Array.from({ length: 13 }, (_, i) => ahead(i + 1)).filter((d) => days.has(weekday(d)))
      .map((d) => ({ place: p.id, date: d, at: p.key === 'gym' ? '07:00' : null, title: null, from: 'weekday' as const }));
  }
  const kept = new Set(places.map((p) => p.key).filter(Boolean));
  return { today: day, now: clock(Date.now()), free, visits, suggested: SEEN.filter((x) => !kept.has(x.key)), here: null };
}

const BANK: Bank = {
  acts: ['food', 'chai', 'gym', 'film', 'drive', 'walk', 'sport', 'game', 'study', 'talk'],
  ideas: [
    { id: 'bk-s-chai', act: 'chai', title: 'Chai after class', invite: 'Chai after class, {name}?', near: true },
    { id: 'bk-s-walk', act: 'walk', title: 'An evening walk', invite: '{name}, an evening walk later?', near: true },
    { id: 'bk-s-study', act: 'study', title: 'Study together at the library', invite: 'Library together this week, {name}?', near: true },
    { id: 'bk-s-film', act: 'film', title: 'Catch a film', invite: 'Want to catch a film this week, {name}?' },
    { id: 'bk-s-food', act: 'food', title: 'Try a new place to eat', invite: '{name}, want to try a new place to eat?' },
    { id: 'bk-s-game', act: 'game', title: 'A board games evening', invite: 'Board games at mine, {name}?' },
    { id: 'bk-s-sport', act: 'sport', title: 'A game of badminton', invite: 'Badminton this week, {name}?' },
    { id: 'bk-s-drive', act: 'drive', title: 'A long drive', invite: '{name}, a long drive this weekend?' },
    { id: 'bk-s-market', act: 'market', title: 'Walk around a market', invite: 'A market walk on the weekend, {name}?' },
  ],
};

// plan ideas "from Nora": a small fixed pool, a different three each time he asks for fresh ones
const POOL: AiIdea[] = [
  { id: 'ai-s-1', title: 'A long walk and chai', act: 'walk', why: 'Easy to say yes to on a weeknight, and there is time to talk.', invite: '{name}, a long walk and chai this week?' },
  { id: 'ai-s-2', title: 'Cook dinner together', act: 'cook', why: 'Something the two of you have not done yet.', invite: 'Cook dinner together this week, {name}?' },
  { id: 'ai-s-3', title: 'A day trip on the weekend', act: 'outing', why: 'A bigger plan for a free Saturday.', invite: '{name}, a day trip this weekend?' },
  { id: 'ai-s-4', title: 'Badminton at the club', act: 'sport', why: 'A game is an easy way to spend an evening together.', invite: 'Badminton this week, {name}?' },
  { id: 'ai-s-5', title: 'Visit a market together', act: 'market', why: 'Walk around and eat something new on the way.', invite: '{name}, a market walk on the weekend?' },
  { id: 'ai-s-6', title: 'Study session at the library', act: 'study', why: 'Good for a busy week: you both get work done.', invite: 'Library together this week, {name}?' },
];
const AI: Record<string, Sample<AiAnswer>> = {};
let turn = 0;
function answerFor(person: string, fresh: boolean): Sample<AiAnswer> {
  const have = AI[person];
  if (have && have.date === day && !fresh) return have;
  const from = (turn++ * 3) % POOL.length;
  const ideas = [0, 1, 2].map((i) => POOL[(from + i) % POOL.length]);
  const item: Sample<AiAnswer> = { id: `ai-s-${person}`, person, date: day, at: new Date().toISOString(), v: 1, model: 'sample', ms: null, ideas, sample: true };
  AI[person] = item;
  return item;
}

demoSource({
  collections: {
    'people/persons': PEOPLE,
    'people/moments': MOMENTS,
    'people/plans': PLANS,
    'people/ideas': IDEAS,
    'people/rhythms': RHYTHMS,
    'friends/places': PLACES,
  },
  gets: {
    '/mod/friends/week': () => weekOf(),
    '/mod/friends/bank': BANK,
    '/mod/friends/ideas': (_p: string, q: URLSearchParams) => ({ item: AI[q.get('person') ?? ''] ?? null }),
  },
  calls: {
    '/mod/friends/ideas': (body: { person?: string; force?: boolean }) => ({ item: body.person ? answerFor(body.person, !!body.force) : null }),
    '/mod/friends/photo': () => { throw new Error('Photos are not part of the sample preview.'); },
  },
});
