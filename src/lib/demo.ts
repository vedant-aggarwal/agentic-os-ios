import { Platform } from 'react-native';
import type { Area, LifePayload, Task, TodayPayload } from './today';

/**
 * Dev-only: open the web build with `?demo` to see Today on sample data without signing in.
 * Never active in a TestFlight/release build or on the phone.
 */
export const DEMO =
  __DEV__ && Platform.OS === 'web' && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

export function demoData(): { today: TodayPayload; life: LifePayload; areas: Area[] } {
  const now = new Date();
  // his day, which rolls at 04:00 (the sample stays on the same day from 00:00 to 03:59)
  const date = new Date(now.getTime() + 5.5 * 3600_000 - 4 * 3600_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
  const at = (h: number, m = 0, d = date) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`).toISOString();
  const t = (id: string, title: string, area: string, extra: Partial<Task> = {}): Task => ({
    id, title, status: 'todo', area, due: date, scheduled: null, owner: 'me', completedAt: null, ...extra,
  });
  const tasks: Task[] = [
    t('1', 'Gym, legs', 'health', { status: 'done', completedAt: at(7, 30) }),
    t('2', 'Read 20 pages', 'learning', { repeat: '1d' }), // a repeating one: cancelling it skips today
    t('3', 'Client call, follow-up', 'norrita', { scheduled: { start: at(16), end: at(16, 30) } }),
    t('4', 'Send invoice', 'finance', { status: 'done', completedAt: at(11) }),
    t('5', 'Family dinner', 'family', { scheduled: { start: at(21), end: at(22) } }),
    t('6', 'Call a friend back', 'friends'),
    // the days around it, for swiping: one done and one left yesterday, one due tomorrow
    t('7', 'Pay the electricity bill', 'finance', { due: shift(-1), status: 'done', completedAt: at(18, 0, shift(-1)) }),
    t('8', 'Plan the week', 'norrita', { due: shift(-1) }),
    t('9', 'Dentist at 11', 'health', { due: shift(1) }),
  ];
  return {
    today: { date, now: now.toISOString(), events: [
      // a real day's calendar: two sleep blocks, the gym block, then shop and work
      { id: 'e1', title: 'Sleep (7.5 Hours)', start: at(0), end: at(5, 30), allDay: false, area: 'health', location: null },
      { id: 'e2', title: 'Morning Gym (Lifting & Mobility - 1.5h)', start: at(6), end: at(7, 30), allDay: false, area: 'health', location: null },
      { id: 'e3', title: 'Business work (BizBrain go-live at shop)', start: at(13, 30), end: at(14, 30), allDay: false, area: 'finance', location: null },
      { id: 'e4', title: 'Shop: sit till Papa arrives', start: at(15), end: at(16, 30), allDay: false, area: 'family', location: 'Sagarpur' },
      { id: 'e5', title: 'Home: work session', start: at(17), end: at(19), allDay: false, area: 'norrita', location: null },
      { id: 'e6', title: 'Sleep (7.5 Hours)', start: at(22), end: new Date(Date.parse(at(0)) + 86400_000).toISOString(), allDay: false, area: 'health', location: null },
    ], tasks, inboxCount: 0 },
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
