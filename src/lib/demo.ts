import { Platform } from 'react-native';
import type { BodyToday } from './body';
import type { Area, LifePayload, Task, TodayPayload } from './today';

/**
 * Dev-only: open the web build with `?demo` to see Today on sample data without signing in.
 * Never active in a TestFlight/release build or on the phone.
 */
export const DEMO =
  __DEV__ && Platform.OS === 'web' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export function demoData(): { today: TodayPayload; life: LifePayload; areas: Area[] } {
  const now = new Date();
  const date = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const at = (h: number, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).toISOString();
  const t = (id: string, title: string, area: string, extra: Partial<Task> = {}): Task => ({
    id, title, status: 'todo', area, due: date, scheduled: null, owner: 'me', completedAt: null, ...extra,
  });
  const tasks: Task[] = [
    t('1', 'Gym, legs', 'health', { status: 'done', completedAt: at(7, 30) }),
    t('2', 'Read 20 pages', 'learning'),
    t('3', 'Client call, follow-up', 'norrita', { scheduled: { start: at(16), end: at(16, 30) } }),
    t('4', 'Send invoice', 'finance', { status: 'done', completedAt: at(11) }),
    t('5', 'Family dinner', 'family', { scheduled: { start: at(21), end: at(22) } }),
    t('6', 'Call a friend back', 'friends'),
  ];
  return {
    today: { date, now: now.toISOString(), events: [], tasks, inboxCount: 0 },
    life: {
      aspects: [
        { key: 'body', family: 'self', name: 'Body' }, { key: 'mind', family: 'self', name: 'Mind' }, { key: 'soul', family: 'self', name: 'Soul' },
        { key: 'mission', family: 'work', name: 'Mission' }, { key: 'money', family: 'work', name: 'Money' }, { key: 'growth', family: 'work', name: 'Growth' },
        { key: 'family', family: 'people', name: 'Family' }, { key: 'romance', family: 'people', name: 'Romance' }, { key: 'friends', family: 'people', name: 'Friends' },
      ],
      areaAspects: { health: ['body'], learning: ['mind'], norrita: ['mission'], finance: ['money'], family: ['family'], friends: ['friends'] },
    },
    areas: [
      { slug: 'health', name: 'Health' }, { slug: 'learning', name: 'Learning' }, { slug: 'norrita', name: 'Norrita' },
      { slug: 'finance', name: 'Finance' }, { slug: 'family', name: 'Family' }, { slug: 'friends', name: 'Friends' },
    ],
  };
}

/** Dev-only sample body plan for `?demo`: a generic push day, nobody's real numbers. */
export function demoBody(): BodyToday {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const l = (ex: string, name: string, sets: number, r: number | null, t: number | null = null) => ({ ex, name, sets, target: { r, t } });
  return {
    today, live: null, trained: [],
    next: {
      id: `plan-${today}`, date: today, name: 'Push', at: null,
      items: [
        l('bench', 'Bench press', 3, 8), l('ohp', 'Overhead press', 3, 10), l('incline-db', 'Incline dumbbell press', 3, 10),
        l('lat-raise', 'Lateral raise', 3, 15), l('pushdown', 'Triceps pushdown', 3, 12), l('plank', 'Plank', 3, null, 45),
      ],
    },
    week: { days: 2, target: 5, streak: 1 },
    food: { protein: 60, protein_target: 140, water: 3, water_target: 8 },
  };
}
