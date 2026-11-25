// The words Soul offers as one-tap choices, and its icons. Generic on purpose: his own words come from his records.
// Copy rules: plain, sentence case, nothing explicit anywhere (someone glancing at the phone learns nothing).

export const PLACES = ['In bed', 'At my desk', 'Bathroom', 'Out', 'Elsewhere'];
export const BEFORE = ['Scrolling', 'Bored', 'Alone', 'Stressed', 'Tired', 'Late night', "Couldn't sleep", 'After a fight', 'Nothing planned'];
export const FEELINGS = ['Restless', 'Lonely', 'Anxious', 'Low', 'Angry', 'Tired', 'Fine'];
export const LEVELS = [{ v: 1, label: 'Mild' }, { v: 2, label: 'Strong' }, { v: 3, label: 'Very strong' }];

/** Things to do right now. Movement first: it has the best backing for riding out a craving. */
export const ACTION_BANK = [
  'Walk outside', 'Twenty pushups', 'Leave the room', 'Cold water on my face', 'Take a shower', 'Phone in another room',
  'Go where people are', 'Call or text a friend', 'Make tea', 'Write it down', 'Stretch for five minutes', 'Tidy one thing',
];
export const CHANGES = [
  'Phone stays out of the bedroom', 'Lights out earlier', 'A plan for that hour', 'Less scrolling at night', 'Move more in the day', 'Tell someone I trust',
];
export const PLAN_IF = ['It is late and I am in bed', 'I am alone with nothing planned', 'I catch myself scrolling', 'I feel low or stressed', 'I cannot sleep'];
export const PLAN_THEN = ['Phone goes on the desk', 'I leave the room', 'I go for a short walk', 'I open Soul and breathe', 'I text a friend', 'Lights out'];
export const PLAN_TIMES = ['21:00', '22:00', '23:00', '00:00', '01:00'];

export type Pattern = { key: 'even' | 'box' | 'long'; label: string; line: string; inhale: number; hold: number; exhale: number; rest: number };
export const PATTERNS: Pattern[] = [
  { key: 'long', label: 'Long exhale', line: 'In for 4, out for 6. About six breaths a minute.', inhale: 4, hold: 0, exhale: 6, rest: 0 },
  { key: 'even', label: 'Even', line: 'In for 5, out for 5. Smooth and steady.', inhale: 5, hold: 0, exhale: 5, rest: 0 },
  { key: 'box', label: 'Box', line: 'In 4, hold 4, out 4, hold 4.', inhale: 4, hold: 4, exhale: 4, rest: 4 },
];
export const patternOf = (k?: string | null) => PATTERNS.find((p) => p.key === k) ?? PATTERNS[0];
export const SIT_LENGTHS = [2, 5, 10, 15, 20];

export const MOODS = [{ p: 1, label: 'Rough' }, { p: 2, label: 'Low' }, { p: 3, label: 'Okay' }, { p: 4, label: 'Good' }, { p: 5, label: 'Great' }];
export const moodWord = (p?: number | null) => MOODS.find((m) => m.p === p)?.label ?? null;

/** SF Symbol and the path the web preview draws (24 grid, 1.75 line). */
export const G = {
  wind: ['wind', 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8'],
  leaf: ['leaf', 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19l7-7'],
  book: ['book.closed', 'M6 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V6a2 2 0 0 1 1-2zM5 18a2 2 0 0 1 2-2h11'],
  photo: ['photo', 'M4 6h16v12H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01'],
  bookmark: ['bookmark', 'M7 4h10v16l-5-4-5 4z'],
  bookmarkOn: ['bookmark.fill', 'M7 4h10v16l-5-4-5 4z'],
  sparkles: ['sparkles', 'M12 4l1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8zM18 15l.8 1.7 1.7.8-1.7.8L18 20l-.8-1.7-1.7-.8 1.7-.8z'],
  search: ['magnifyingglass', 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4-4'],
  moon: ['moon', 'M20 14a8 8 0 1 1-10-10a7 7 0 0 0 10 10z'],
  lock: ['lock', 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'],
  shuffle: ['shuffle', 'M4 7h3l10 10h3M4 17h3l3-3M14 10l3-3h3M18 4l2 3-2 3M18 14l2 3-2 3'],
  bell: ['bell', 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0'],
  wave: ['waveform', 'M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2'],
  stop: ['stop.fill', 'M7 7h10v10H7z'],
  circle: ['circle', 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z'],
} as const;
