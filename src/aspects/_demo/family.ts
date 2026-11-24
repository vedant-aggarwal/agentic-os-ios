// Sample records for the `?demo` preview of the Family page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data, nobody's real family. The computed reads (home, memories, a date) are worked out from the
// in-memory collections on every read, so a tap in the preview changes what the page shows. The phone never loads
// this file.
import { collection, demoSource, type Doc } from '@/lib/mod';
import { addDays, daysBetween, myDay, weekStart } from '@/aspects/kit/time';
import type { Cand, DateItem, DateView, Home, Memories, MomentBrief, MomentDoc, PlanDoc, WeekDoc } from '@/aspects/family/types';

const day = myDay();
const monday = weekStart(day);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Person = Doc & { name: string; rel: string; aspect: string; role: string | null; pronoun: 'he' | 'she' | 'they'; sort: number; sample: true };
type DateRec = Doc & { kind: 'birthday' | 'anniversary' | 'festival' | 'other'; people: string[]; aspect: string; md: string | null; date: string | null; annual: boolean; year: number | null; title: string; sample: true };
type IdeaRec = Doc & { person: string; aspect: string; kind: 'gift' | 'plan' | 'showup'; title: string; from: string | null; likes?: boolean; done: boolean; sample: true };

const person = (id: string, name: string, role: string, pronoun: Person['pronoun'], sort: number): Person =>
  ({ id, name, rel: 'family', aspect: 'family', role, pronoun, sort, sample: true });
const PEOPLE: Person[] = [
  person('fam-ma', 'Ma', 'Mother', 'she', 1),
  person('fam-papa', 'Papa', 'Father', 'he', 2),
  person('fam-didi', 'Didi', 'Sister', 'she', 3),
  person('fam-dadi', 'Dadi', 'Grandmother', 'she', 4),
];
const ALL = PEOPLE.map((p) => p.id);

// a day this week other than today (today itself on a Monday), for the week's one done thing
const earlier = day === monday ? day : addDays(day, -1);
const mo = (id: string, date: string, people: string[], title: string, o: Partial<MomentDoc> = {}): MomentDoc & { sample: true } => ({
  id, date, at: o.at ?? '19:30', people, aspect: 'family', kind: 'meet', minutes: 0, title, note: null, photo: null, by: 'you', source: 'you', ...o, sample: true,
});
const MOMENTS = [
  mo('mo-s1', earlier, ['fam-ma'], 'Cooked dinner together', { act: 'cook', showup: true, week: monday }),
  mo('mo-s2', addDays(day, -2), ['fam-dadi'], 'Chai with Dadi', { note: 'She told the story of the first scooter again. We laughed the whole time.', memory: true, act: 'chai', at: '08:10' }),
  mo('mo-s3', addDays(day, -4), ['fam-papa'], 'Evening walk', { act: 'walk' }),
  mo('mo-s4', addDays(day, -9), ['fam-didi'], 'Helped with her slides', { note: 'Stayed up late fixing her slides. She got through the review the next morning.', memory: true }),
  mo('mo-s5', addDays(day, -12), ALL, 'Sunday lunch at home', { note: 'Everyone at one table for the first time in weeks.', memory: true, at: '13:30' }),
  mo('mo-s6', addDays(day, -20), ['fam-papa'], 'Fixed the scooter together', { note: 'He still knows every screw by feel.', memory: true, at: '11:00' }),
  mo('mo-s7', addDays(day, -35), ['fam-ma'], 'Market run', { note: 'She bargained for ten minutes over a bunch of coriander.', memory: true, at: '18:00' }),
  mo('mo-s8', addDays(day, -47), ['fam-didi', 'fam-ma'], 'Shopping for her trip', { at: '17:00' }),
  mo('mo-s9', addDays(day, -61), ['fam-dadi', 'fam-papa'], 'Temple visit', { note: 'Dadi walked all the steps herself.', memory: true, at: '07:30' }),
  mo('mo-s10', addDays(day, -365), ['fam-dadi'], 'Planted the tulsi together', { note: 'She chose the spot by the window. It is still growing there.', memory: true, at: '09:00' }),
];

const md = (d: string) => d.slice(5);
const DATES: DateRec[] = [
  { id: 'dt-bday-fam-didi', kind: 'birthday', people: ['fam-didi'], aspect: 'family', md: md(addDays(day, 6)), date: null, annual: true, year: Number(day.slice(0, 4)) - 24, title: "Didi's birthday", sample: true },
  { id: 'dt-anniv', kind: 'anniversary', people: ['fam-ma', 'fam-papa'], aspect: 'family', md: md(addDays(day, 26)), date: null, annual: true, year: Number(day.slice(0, 4)) - 28, title: "Ma and Papa's anniversary", sample: true },
  { id: 'dt-bday-fam-dadi', kind: 'birthday', people: ['fam-dadi'], aspect: 'family', md: md(addDays(day, -3)), date: null, annual: true, year: null, title: "Dadi's birthday", sample: true },
  { id: 'dt-fest', kind: 'festival', people: ALL, aspect: 'family', md: md(addDays(day, 49)), date: addDays(day, 49), annual: false, year: null, title: 'Lohri at home', sample: true },
];
const PLANS: (PlanDoc & { sample: true })[] = [{
  id: `plan-dt-bday-fam-didi-${addDays(day, 6).slice(0, 4)}`, title: "Didi's birthday", people: ['fam-didi'], aspect: 'family', date: addDays(day, 6), for_date: 'dt-bday-fam-didi',
  year: Number(addDays(day, 6).slice(0, 4)), state: 'tentative', idea: 'A surprise cake and her friends over', idea_from: 'own',
  steps: [
    { id: 'st-s1', title: 'Order the cake', kind: 'buy', done: true },
    { id: 'st-s2', title: 'Invite her two closest friends', kind: 'involve', done: false },
    { id: 'st-s3', title: 'Decorate her room while she is out', kind: 'do', done: false },
  ],
  sample: true,
}];
const IDEAS: IdeaRec[] = [
  { id: 'id-s1', person: 'fam-ma', aspect: 'family', kind: 'gift', title: 'A warm shawl for winter', from: 'mentioned', done: false, sample: true },
  { id: 'id-s2', person: 'fam-didi', aspect: 'family', kind: 'gift', title: 'Sketchbooks with thick paper', from: 'mentioned', likes: true, done: false, sample: true },
  { id: 'id-s3', person: 'fam-papa', aspect: 'family', kind: 'plan', title: 'Watch a match at the old stadium', from: 'mentioned', done: false, sample: true },
  { id: 'id-s4', person: 'fam-dadi', aspect: 'family', kind: 'gift', title: 'A prayer book in large print', from: 'mentioned', done: false, sample: true },
];
const WEEKS: (WeekDoc & { sample: true })[] = [{
  id: `${monday}:fam-ma`, week: monday, person: 'fam-ma', skipped: [], sample: true,
  chosen: { key: 'idea:ma-2', title: 'Cook her favourite dal together', done_title: 'Cooked dinner together', from: 'idea', why: null, idea: null },
  done: { moment: 'mo-s1', at: `${earlier}T14:00:00.000Z`, title: 'Cooked dinner together' },
}];

// this week's small things on offer, as Nora and his own ideas would word them
const cand = (key: string, title: string, done_title: string, from: Cand['from'], why: string | null = null): Cand => ({ key, title, done_title, from, why, idea: null });
const CANDS: Record<string, Cand[]> = {
  'fam-ma': [cand('idea:ma-2', 'Cook her favourite dal together', 'Cooked dinner together', 'idea'), cand('nora:ma-1', 'Take her to the evening market', 'Market run with Ma', 'nora', 'She said she wants fresh flowers for the weekend.')],
  'fam-papa': [
    cand('nora:papa-1', 'Ask him to teach you his old card game', 'Played cards with Papa', 'nora', 'He brought the game up twice this month.'),
    cand('rhythm:papa-2', 'An evening walk after dinner', 'Evening walk with Papa', 'rhythm'),
    cand('idea:papa-3', 'Sort out the backups on his phone', "Sorted Papa's phone", 'idea'),
  ],
  'fam-didi': [
    cand('nora:didi-1', 'Help her set up the new laptop', 'Set up the laptop with Didi', 'nora', 'She asked for help with it last week.'),
    cand('rhythm:didi-2', 'Drop her to the metro on Saturday', 'Dropped Didi to the metro', 'rhythm'),
  ],
  'fam-dadi': [
    cand('nora:dadi-2', 'Look through the old album with her', 'Old album with Dadi', 'nora', 'She asked where the wedding photos went.'),
    cand('rhythm:dadi-1', 'Sit with her for morning chai', 'Morning chai with Dadi', 'rhythm'),
  ],
};
const CHIPS = [
  { key: 'dinner', label: 'Dinner together', people: ALL, act: 'meal', dinner: true, thing: null as string | null },
  { key: 'walk-papa', label: 'Walk with Papa', people: ['fam-papa'], act: 'walk', dinner: false, thing: null as string | null },
  { key: 'chai-dadi', label: 'Chai with Dadi', people: ['fam-dadi'], act: 'chai', dinner: false, thing: null as string | null },
];

// what a tap on "Ask Nora" changes in the preview
const st = { noraAt: `${monday}T01:30:00.000Z` as string | null, dateIdeas: {} as Record<string, NonNullable<DateView['nora']>> };

// ── reads worked out from the collections ──────────────────────────────────────────────────────────────────────
/** A collection as it stands in memory, loaded from the sample records first if nothing has opened it yet. */
function held<T extends Doc>(key: string): T[] {
  const [mod, coll] = key.split('/');
  const c = collection<T>(mod, coll);
  if (!c.get()) void c.refresh(); // in the preview this loads at once
  return c.get() ?? [];
}
const persons = () => held<Person>('people/persons').filter((p) => p.aspect === 'family').sort((a, b) => a.sort - b.sort);
const momentsOf = (ids: Set<string>) => held<MomentDoc>('people/moments')
  .filter((m) => m.people?.some((p) => ids.has(p)) && m.date <= day)
  .sort((a, b) => (b.date + (b.at ?? '')).localeCompare(a.date + (a.at ?? '')));
const dates = () => held<DateRec>('people/dates').filter((d) => d.aspect === 'family');
const plans = () => held<PlanDoc>('people/plans');
const weeks = () => held<WeekDoc>('family/week');
const isMemory = (m: MomentDoc) => !!(m.memory || m.photo || m.note);
const brief = (m: MomentDoc): MomentBrief => ({
  id: m.id, date: m.date, at: m.at ?? null, title: m.title ?? null, note: m.note ?? null, photo: m.photo ?? null, people: m.people,
  kind: m.kind ?? null, act: m.act ?? null, source: m.source ?? null, showup: !!m.showup, chip: m.chip ?? null,
});

/** When a date next comes round, and the last time it did. */
function occurrence(d: DateRec) {
  if (!d.annual) return { on: d.date && d.date >= day ? d.date : null, last: d.date && d.date < day ? d.date : null };
  const y = Number(day.slice(0, 4));
  const thisYear = `${y}-${d.md}`;
  return thisYear >= day ? { on: thisYear, last: `${y - 1}-${d.md}` } : { on: `${y + 1}-${d.md}`, last: thisYear };
}
function dateItems(): DateItem[] {
  const ps = plans();
  return dates().map((d): DateItem | null => {
    const { on } = occurrence(d);
    if (!on) return null;
    const plan = ps.find((p) => p.for_date === d.id && p.year === Number(on.slice(0, 4))) ?? null;
    const years = d.year ? Number(on.slice(0, 4)) - d.year : null;
    return {
      id: d.id, title: d.title, kind: d.kind, on, days: daysBetween(day, on), people: d.people, annual: d.annual, years, turning: null,
      plan: plan ? { id: plan.id, idea: plan.idea, total: plan.steps.length, done: plan.steps.filter((x) => x.done).length } : null,
    };
  }).filter((x): x is DateItem => !!x).sort((a, b) => a.days - b.days);
}

function home(): Home {
  const people = persons();
  const ids = new Set(people.map((p) => p.id));
  const moments = momentsOf(ids);
  const ideas = held<IdeaRec>('people/ideas');
  const recs = new Map(weeks().filter((w) => w.week === monday).map((w) => [w.person, w]));
  const all = dateItems();
  const cards = people.map((p) => {
    const mine = moments.filter((m) => m.people.includes(p.id));
    const rec = recs.get(p.id) ?? null;
    const own = ideas.filter((i) => i.person === p.id && i.kind === 'showup' && !i.done).map((i) => cand(`own:${i.id}`, i.title, i.title, 'own'));
    const cands = [...own, ...(CANDS[p.id] ?? [])];
    const skipped = rec?.skipped ?? [];
    const pick = rec?.chosen ?? cands.find((c) => !skipped.includes(c.key)) ?? null;
    return {
      id: p.id, name: p.name, role: p.role, pronoun: p.pronoun,
      last: mine[0] ? brief(mine[0]) : null, photo: null,
      quiet: !mine.some((m) => m.date >= monday) && day !== monday,
      week: { id: `${monday}:${p.id}`, pick, options: cands.filter((c) => c.key !== pick?.key && !skipped.includes(c.key)), skipped, done: rec?.done ?? null },
      mentioned: ideas.filter((i) => i.person === p.id && i.kind === 'gift' && !i.done).length,
      birthday: dates().some((d) => d.kind === 'birthday' && d.people.includes(p.id)) ? 'known' as const : 'not known yet' as const,
    };
  });
  const todays = moments.filter((m) => m.date === day);
  const memories = moments.filter(isMemory);
  const passed = dates().map((d) => ({ d, last: occurrence(d).last })).filter((x) => x.last && daysBetween(x.last, day) >= 1 && daysBetween(x.last, day) <= 7)
    .filter((x) => !moments.some((m) => m.date === x.last && isMemory(m)))
    .map((x) => ({ id: x.d.id, title: x.d.title, kind: x.d.kind, on: x.last!, ago: daysBetween(x.last!, day), people: x.d.people }));
  return {
    today: day, week: monday, people: cards,
    together: CHIPS.filter((c) => c.people.every((p) => ids.has(p))).map((c) => ({ ...c, moment: todays.find((m) => m.chip === c.key)?.id ?? null })),
    dates: { soon: all.filter((d) => d.days <= 60), next: all.find((d) => d.days > 60) ?? null, passed, unknown: cards.filter((c) => c.birthday !== 'known').map((c) => ({ id: c.id, name: c.name })) },
    memories: { recent: memories.slice(0, 8).map(brief), onThisDay: memories.filter((m) => m.date.slice(5) === day.slice(5) && m.date < day).map(brief), count: memories.length },
    nora: st.noraAt ? { made_at: st.noraAt, week: monday } : null,
  };
}

function memoriesOf(personId: string | null): Memories {
  const people = persons();
  let moments = momentsOf(new Set(people.map((p) => p.id)));
  if (personId) moments = moments.filter((m) => m.people.includes(personId));
  const months: Memories['months'] = [];
  for (const m of moments) {
    const k = m.date.slice(0, 7);
    let g = months.find((x) => x.month === k);
    if (!g) { g = { month: k, label: `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`, items: [] }; months.push(g); }
    g.items.push(brief(m));
  }
  const memories = moments.filter(isMemory);
  const lastYear = memories.filter((m) => m.date > addDays(day, -365));
  const year = lastYear.length >= 5 ? [...new Map(lastYear.map((m) => [m.date.slice(0, 7), m])).values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-6).map(brief) : [];
  return {
    today: day, person: personId, people: people.map((p) => ({ id: p.id, name: p.name })), count: moments.length, memories: memories.length,
    onThisDay: memories.filter((m) => m.date.slice(5) === day.slice(5) && m.date < day).map(brief), year, months,
  };
}

function dateView(id: string): DateView {
  const d = dates().find((x) => x.id === id);
  if (!d) throw new Error('No such date.');
  const { on, last } = occurrence(d);
  const people = persons().filter((p) => d.people.includes(p.id));
  const ideas = held<IdeaRec>('people/ideas').filter((i) => d.people.includes(i.person) && !i.done && i.kind !== 'showup');
  const after = last && daysBetween(last, day) <= 7 ? daysBetween(last, day) : null;
  const plan = on ? plans().find((p) => p.for_date === d.id && p.year === Number(on.slice(0, 4))) ?? null : null;
  const past = momentsOf(new Set(d.people)).filter((m) => last && m.date.slice(5) === last.slice(5) && m.date < day && isMemory(m)).map(brief);
  return {
    today: day,
    date: { id: d.id, title: d.title, kind: d.kind, on, days: on ? daysBetween(day, on) : null, people: people.map((p) => ({ id: p.id, name: p.name })), annual: d.annual,
      year: d.year, years: d.year && on ? Number(on.slice(0, 4)) - d.year : null, turning: null, md: d.md },
    plan, ideas: ideas.map((i) => ({ id: i.id, person: i.person, kind: i.kind, title: i.title, from: i.from })), past, after, lastOn: last, nora: st.dateIdeas[id] ?? null,
  };
}

demoSource({
  collections: {
    'people/persons': PEOPLE,
    'people/moments': MOMENTS,
    'people/dates': DATES,
    'people/plans': PLANS,
    'people/ideas': IDEAS,
    'family/week': WEEKS,
  },
  gets: {
    '/mod/family/home': () => home(),
    '/mod/family/memories': (_p: string, q: URLSearchParams) => memoriesOf(q.get('person') || null),
    '/mod/family/date/*': (p: string) => dateView(decodeURIComponent(p.split('?')[0].split('/').pop() ?? '')),
    '/mod/people/calendar': () => ({ items: [] }),
  },
  calls: {
    '/mod/family/suggest': () => { st.noraAt = new Date().toISOString(); return { made_at: st.noraAt, week: monday, people: {} }; },
    '/mod/family/date/*': (_b, info) => {
      const id = decodeURIComponent(info.path.split('/').slice(-2)[0] ?? '');
      st.dateIdeas[id] = {
        made_at: new Date().toISOString(), year: day.slice(0, 4),
        ideas: [
          { title: 'Breakfast in bed, then a day out of her choosing', why: 'She likes being asked what she wants to do.', steps: [{ title: 'Ask Ma to help with breakfast', kind: 'involve' }, { title: 'Buy her favourite jam', kind: 'buy' }] },
          { title: 'A small party with her friends at home', why: 'Last year she wished more of her friends were there.', steps: [{ title: 'Message her friends', kind: 'involve' }, { title: 'Order the cake', kind: 'buy' }, { title: 'Clear the living room', kind: 'do' }] },
        ],
      };
      return st.dateIdeas[id];
    },
  },
});
