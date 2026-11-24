// Sample records every page's `?demo` preview shares (dev web only; see src/lib/mod.ts demoSource): the core goals
// list, moods, and the people overview. Invented sample data, nobody's real life. The phone never loads this file.
import { collection, demoSource, type Doc } from '@/lib/mod';
import { addDays, myDay } from '@/aspects/kit/time';

const day = myDay();
const goal = (id: number, title: string, horizon: string, aspects: string[], extra: Record<string, unknown> = {}) => ({
  id: `g${id}`, title, horizon, period: null, label: horizon === 'quarter' ? 'This quarter' : horizon === 'week' ? 'This week' : horizon === 'year' ? 'This year' : 'This month',
  area: null, aspects, status: 'active', progress: 0, progressMode: 'manual', measure: null, start: addDays(day, -20), end: addDays(day, 40), due: addDays(day, 40),
  parent: null, notes: null, ...extra,
});

type Person = Doc & { name: string; aspect: string; rel?: string | null; role?: string | null; birthday?: string | null };

demoSource({
  gets: {
    '/goals': () => ({
      horizons: ['life', 'year', 'quarter', 'month', 'week'],
      goals: [
        goal(101, 'Sample: train four days a week', 'quarter', ['body'], { progress: 0.45, progressMode: 'measure' }),
        goal(102, 'Sample: finish one course end to end', 'quarter', ['mind'], { progress: 0.3 }),
        goal(103, 'Sample: reach the monthly income target', 'month', ['money'], { progress: 0.62, progressMode: 'measure' }),
        goal(104, 'Sample: plan the anniversary dinner', 'quarter', ['family'], { progress: 0.2 }),
        goal(105, 'Sample: ship the client dashboard', 'week', ['mission'], { progress: 0.5 }),
        goal(106, 'Sample: a new plan with a friend every week', 'month', ['friends'], { progress: 0.25 }),
      ],
    }),
    '/mod/soul/moods': () => ({ items: [3, 4, 4, 2, 4, 5, 4].map((v, i) => ({ id: `mood-${i}`, date: addDays(day, i - 6), at: `${addDays(day, i - 6)}T15:30:00.000Z`, v })) }),
    '/mod/people/': () => ({
      today: day,
      people: (collection<Person>('people', 'persons').get() ?? []).map((p) => ({
        id: p.id, name: p.name, rel: p.rel ?? null, aspect: p.aspect, role: p.role ?? null, rhythm: null, warmth: 'warm', days: null, last: null, next: null,
        birthday: p.birthday ?? null, allow: true,
      })),
    }),
  },
});
