// Sample records for the `?demo` preview of the Soul page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data, nobody's real life. Taps change an in-memory copy, so the preview can be used.
// The phone never loads this file.
import { collection, demoSource, newId, type Doc } from '@/lib/mod';
import { addDays, myDay } from '@/aspects/kit/time';
import type { CleanNow, CleanRec, Entry, JournalDay, JournalOut, Mood, PatternOut, Plan, Reading, Settings, Sit, Urge } from '@/aspects/soul/data';

const S = '/mod/soul';
const day = myDay();
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+05:30`).toISOString();
const istDate = (ms: number) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const istHour = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600_000).getUTCHours();
const DAY_MS = 86_400_000;
const MILESTONES = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 240, 300, 365, 500, 730, 1000];
const words = (x: string) => (x.trim() ? x.trim().split(/\s+/).length : 0);

/** The live records of a collection; the preview loads one at once when asked. */
function live<T extends Doc>(mod: string, coll: string): T[] {
  const c = collection<T>(mod, coll);
  if (!c.get()) void c.refresh();
  return (c.get() ?? []).filter((x) => !x.deleted_at);
}

/** `?demo&aspect=soul&fresh` starts from nothing: the first run, every empty state, Clean's setup. */
const FRESH = typeof location !== 'undefined' && /[?&]fresh\b/.test(location.search);

// ── the count: one run since the last slip, two slips before it ──
type SlipRec = { id: string; at: string; prev: string; change: string | null; before: string | null; feel: string | null };
const slips: SlipRec[] = FRESH ? [] : [
  { id: 'urg-s2', at: at(addDays(day, -41), '00:40'), prev: at(addDays(day, -64), '08:00'), change: null, before: 'Alone', feel: 'Lonely' },
  { id: 'urg-s1', at: at(addDays(day, -16), '23:30'), prev: at(addDays(day, -41), '00:40'), change: 'Phone stays out of the bedroom', before: 'Late night, Scrolling', feel: 'Restless' },
];
const st = {
  since: (slips[slips.length - 1]?.at ?? null) as string | null,
  first: at(addDays(day, -64), '08:00'),
  slips,
  pledged: '',
  pattern: null as Reading<PatternOut> | null,
  journal: null as Reading<JournalOut> | null,
};

const urgeSeed: Urge[] = [
  { id: 'urg-d1', at: at(addDays(day, -2), '23:40'), out: 'rode', place: 'In bed', before: 'Scrolling', feel: 'Restless', mins: 12, level: 2, source: 'moment', steps: ['Leave the room'] },
  { id: 'urg-d2', at: at(addDays(day, -4), '15:20'), out: 'rode', place: 'At my desk', before: 'Bored', feel: null, mins: 6, level: 1, source: 'log' },
  { id: 'urg-d3', at: at(addDays(day, -6), '00:10'), out: 'rode', place: 'In bed', before: 'Late night', feel: 'Tired', mins: 15, level: 3, source: 'moment', steps: ['Cold water on my face'] },
  { id: 'urg-d4', at: at(addDays(day, -9), '23:15'), out: 'rode', place: 'In bed', before: 'Scrolling', feel: null, mins: 9, level: 2, source: 'log' },
  { id: 'urg-d5', at: at(addDays(day, -12), '16:05'), out: 'rode', place: 'Elsewhere', before: 'Nothing planned', feel: 'Lonely', mins: null, level: 1, source: 'log' },
  { id: 'urg-s1', at: at(addDays(day, -16), '23:30'), out: 'slip', place: 'In bed', before: 'Late night, Scrolling', feel: 'Restless', mins: null, level: null, source: 'slip' },
  { id: 'urg-d6', at: at(addDays(day, -20), '23:50'), out: 'rode', place: 'In bed', before: 'Stressed', feel: 'Anxious', mins: 10, level: 2, source: 'moment', steps: ['Walk outside'] },
];

const REASONS = ['More energy in the mornings', 'Sleep before midnight', 'Feel steady instead of foggy'];
const ACTIONS = ['Leave the room', 'Walk outside', 'Cold water on my face', 'Twenty pushups'];

/** Clean's numbers worked out from the sample records, the way the PC does it (server/modules/soul-clean.ts). */
function cleanNow(): CleanNow {
  const nowMs = Date.now();
  const today = istDate(nowMs);
  const rec = live<CleanRec>('soul', 'clean').find((r) => r.id === 'clean');
  const reasons = rec?.reasons ?? (FRESH ? [] : REASONS), actions = rec?.actions ?? (FRESH ? [] : ACTIONS);
  if (!st.since) return { setup: false, today, reasons, actions };
  const sinceMs = Date.parse(st.since);
  const start = istDate(Math.min(Date.parse(st.first), sinceMs));
  const slipDays = new Set(st.slips.map((x) => istDate(Date.parse(x.at))));
  const kept = (from: string) => { let k = 0, of = 0; for (let d = from; d < today; d = addDays(d, 1)) { of++; if (!slipDays.has(d)) k++; } return { kept: k, of }; };
  const full = Math.max(0, Math.floor((nowMs - sinceMs) / DAY_MS));
  const runs = st.slips.map((x) => Math.floor((Date.parse(x.at) - Date.parse(x.prev)) / DAY_MS));
  const from30 = addDays(today, -30), from90 = addDays(today, -90);
  const urges = live<Urge>('soul', 'urges');
  const ids = new Set(urges.map((u) => u.id));
  const events = [
    ...urges.map((u) => ({ at: u.at, out: u.out ?? 'rode', before: u.before ?? null, feel: u.feel ?? null, place: u.place ?? null })),
    ...st.slips.filter((x) => !ids.has(x.id)).map((x) => ({ at: x.at, out: 'slip' as const, before: x.before, feel: x.feel, place: null })),
  ].filter((e) => Date.parse(e.at) >= nowMs - 60 * DAY_MS && Date.parse(e.at) <= nowMs);
  const counts: number[] = Array(24).fill(0), slipsBy: number[] = Array(24).fill(0);
  for (const e of events) { const h = istHour(e.at); counts[h]++; if (e.out === 'slip') slipsBy[h]++; }
  const peak = counts.indexOf(Math.max(...counts));
  const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
  const tally = (pick: (e: (typeof events)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const e of events) for (const k of String(pick(e) ?? '').split(/,\s*/).filter(Boolean)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ k, n }));
  };
  const month = events.filter((e) => Date.parse(e.at) >= nowMs - 30 * DAY_MS);
  const last = st.slips[st.slips.length - 1] ?? null;
  const reached = [...MILESTONES].reverse().find((x) => x <= full) ?? null;
  const next = MILESTONES.find((x) => x > full) ?? null;
  return {
    setup: true, today, since: st.since, start, day: full + 1, full, best: Math.max(full, ...runs),
    kept: kept(start), last30: kept(start > from30 ? start : from30), last90: kept(start > from90 ? start : from90), slips: st.slips.length,
    strip: Array.from({ length: 91 }, (_, i) => {
      const d = addDays(today, i - 90);
      return { d, s: d < start ? 'none' as const : slipDays.has(d) ? 'slip' as const : d === today ? 'today' as const : 'kept' as const };
    }),
    milestone: { next: next == null ? null : { days: next, in: next - full }, reached: reached == null ? null : { days: reached, today: full === reached } },
    pledged: st.pledged === day,
    yesterday: { date: addDays(today, -1), closed: 'auto', slip: slipDays.has(addDays(today, -1)), tracked: addDays(today, -1) >= start },
    reasons, actions,
    change: last?.change ? { text: last.change, at: last.at } : null,
    plans: live<Plan>('soul', 'plans').filter((p) => p.active !== false).sort((a, b) => a.start.localeCompare(b.start)),
    hours: { counts, slips: slipsBy, n: events.length },
    windows: counts[peak] >= 2 ? [{ h: peak, n: counts[peak], start: hh(peak), end: hh(peak + 1), days: [1, 2, 3, 4, 5, 6, 7], label: `Every day ${hh(peak)} to ${hh(peak + 1)}` }] : [],
    tags: { before: tally((e) => e.before), feel: tally((e) => e.feel), place: tally((e) => e.place) },
    month: { urges: month.length, rode: month.filter((e) => e.out !== 'slip').length, slips: month.filter((e) => e.out === 'slip').length },
    recent: [...urges].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12),
    reading: st.pattern,
  };
}

// ── the journal: entries over the last few weeks, shown only by day in the list ──
const entry = (id: string, back: number, hm: string, text: string, p: number | null, extra: Partial<Entry> = {}): Entry => ({
  id, date: addDays(day, -back), at: at(addDays(day, -back), hm), text, words: words(text), kind: 'typed', p, photos: [], prompt: null, asked: [],
  bookmark: false, by: 'me', source: 'app', ...extra,
});
const entrySeed: Entry[] = [
  entry('jr-s1', 1, '22:40', 'Sample entry. Slow start, better evening. A long walk after dinner helped more than I expected, and I slept on time.', 4, { prompt: 'What made today a little better?' }),
  entry('jr-s2', 2, '23:05', 'Sample entry. Busy day at work. Felt scattered in the afternoon. Wrote down three things for tomorrow so they stop circling.', 3),
  entry('jr-s3', 3, '22:15', 'Sample entry. Good conversation with an old friend. Laughed a lot. Want more evenings like this.', 5, { bookmark: true }),
  entry('jr-s4', 5, '21:50', 'Sample entry spoken on a walk. Tired but calm. The ten minute sit in the morning made the day feel less rushed.', 4, { kind: 'voice', raw: 'Sample entry spoken on a walk.' }),
  entry('jr-s5', 6, '23:30', 'Sample entry. A heavy day. Not much to say. Going to bed early.', 2),
  entry('jr-s6', 8, '22:00', 'Sample entry. Finished the thing I kept putting off. Lighter now.', 4),
  entry('jr-s7', 9, '22:45', 'Sample entry. Rain all day, stayed in, read for an hour. Quiet in a good way.', 3),
  entry('jr-s8', 12, '21:35', 'Sample entry. Gym in the morning, focused work after. One of the better days this month.', 5, { bookmark: true }),
  entry('jr-s9', 15, '23:10', 'Sample entry. Restless. Scrolled too long. Tomorrow the phone stays on the desk.', 2),
  entry('jr-s10', 19, '22:20', 'Sample entry. Small win: cooked dinner instead of ordering.', 4),
  entry('jr-s11', 23, '22:05', 'Sample entry. First entry in a while. Two lines are better than none.', 3),
];

const PROMPTS = [
  'What took most of your energy today?',
  'What is one small thing you are glad happened today?',
  'When did you feel most like yourself today?',
  'What did you put off today, and what was in the way?',
  'What would you tell a friend who had your day?',
  'What drained you today, and what filled you back up?',
  'What do you want to remember from this week?',
  'What are you looking forward to tomorrow?',
  'What felt heavy today, and what made it lighter?',
];

function journalDay(): JournalDay {
  const es = live<Entry>('growth', 'journal').filter((e) => e.text?.trim() || e.photos?.length);
  const dates = new Set(es.map((e) => e.date));
  let streak = 0;
  for (let d = dates.has(day) ? day : addDays(day, -1); dates.has(d); d = addDays(d, -1)) streak++;
  let best = 0, run = 0;
  for (let d = addDays(day, -60); d <= day; d = addDays(d, 1)) { run = dates.has(d) ? run + 1 : 0; best = Math.max(best, run); }
  const y = es.filter((e) => e.date === addDays(day, -1)).sort((a, b) => b.at.localeCompare(a.at))[0];
  return {
    date: day,
    suggestions: [
      { id: 'workout', kind: 'workout', title: 'You trained today', detail: null, prompt: "How did your body feel in today's session?" },
      { id: 'people', kind: 'people', title: 'Time with Sam', detail: null, prompt: 'What stayed with you from your time with Sam?' },
      ...(y ? [{ id: `yesterday:${y.id}`, kind: 'yesterday', title: 'Yesterday you wrote', detail: 'Sample title', prompt: 'Where are you today with what you wrote yesterday?' }] : []),
    ],
    prompts: PROMPTS.map((text, i) => ({ id: `bank-${i}`, text, from: 'bank' as const })),
    stats: {
      days: dates.size, entries: es.length, words: es.filter((e) => e.date.slice(0, 4) === day.slice(0, 4)).reduce((n, e) => n + (e.words ?? words(e.text)), 0),
      streak: { current: streak, best, today: dates.has(day) }, week: new Set(es.filter((e) => e.date > addDays(day, -7)).map((e) => e.date)).size,
    },
    reading: st.journal,
  };
}

// ── sits, moods, plans ──
const sitSeed: Sit[] = [[6, 10, 'long'], [5, 5, 'even'], [3, 15, 'long'], [2, 5, 'box'], [1, 10, 'long'], [9, 5, 'long'], [11, 20, 'even']].map(([back, mins, pattern], i) => ({
  id: `sit-s${i + 1}`, date: addDays(day, -(back as number)), at: at(addDays(day, -(back as number)), '07:30'), secs: (mins as number) * 60, mins: mins as number, pattern: pattern as string,
}));
const moodSeed: Mood[] = [3, 4, 4, 2, 4, 5].map((v, i) => ({
  id: `md_soul_${addDays(day, i - 6)}`, date: addDays(day, i - 6), at: at(addDays(day, i - 6), '21:00'), v, word: ['Rough', 'Low', 'Okay', 'Good', 'Great'][v - 1], source: 'soul',
}));
const planSeed: Plan[] = [
  { id: 'pln-s1', if: 'It is late and I am in bed', then: 'Phone goes on the desk', start: '23:00', end: null, days: [1, 2, 3, 4, 5, 6, 7], nudge: true, active: true, from: 'you' },
  { id: 'pln-s2', if: 'I am alone with nothing planned', then: 'I go for a short walk', start: '16:00', end: null, days: [6, 7], nudge: true, active: true, from: 'you' },
];

const COLLECTIONS: Record<string, Doc[]> = FRESH ? { 'soul/clean': [{ id: 'clean', name: 'Clean', active: true, reasons: [], actions: [] } as CleanRec] } : {
  'growth/journal': entrySeed,
  'soul/sits': sitSeed,
  'soul/moods': moodSeed,
  'soul/plans': planSeed,
  'soul/urges': urgeSeed,
  'soul/clean': [{ id: 'clean', name: 'Clean', since: st.since ?? undefined, active: true, reasons: REASONS, actions: ACTIONS } as CleanRec],
  'soul/settings': [{ id: 'journal', remind: '22:00' } as Settings],
};
// The app warms some of these at start (src/aspects/warm.ts, the capture strip), before this file runs: those
// collections are already loaded, empty, so the samples go into them directly.
for (const [key, docs] of Object.entries(COLLECTIONS)) {
  const [mod, coll] = key.split('/');
  const c = collection<Doc>(mod, coll);
  const have = c.get();
  if (have) for (const d of docs) if (!have.some((x) => x.id === d.id)) void c.put(d);
}

demoSource({
  collections: COLLECTIONS,
  gets: {
    [`${S}/clean/now`]: () => cleanNow(),
    [`${S}/journal`]: () => journalDay(),
  },
  calls: {
    [`${S}/clean/pledge`]: () => { st.pledged = day; return { ok: true }; },
    [`${S}/clean/start`]: (body: { at?: string }) => { st.since = body.at ?? new Date().toISOString(); st.first = st.since; return cleanNow(); },
    [`${S}/clean/slip`]: (body: { id: string; at: string; before?: string[]; feel?: string[]; change?: string | null }) => {
      const x: SlipRec = { id: body.id, at: body.at, prev: st.since ?? body.at, change: body.change ?? null, before: body.before?.join(', ') || null, feel: body.feel?.join(', ') || null };
      st.slips = [...st.slips.filter((y) => y.id !== x.id), x];
      st.since = x.at;
      void collection<Urge>('soul', 'urges').put({ id: x.id, at: x.at, out: 'slip', before: x.before, feel: x.feel, source: 'slip' });
      return { ok: true };
    },
    [`${S}/clean/slip/*`]: (_b: unknown, info) => {
      const id = decodeURIComponent(info.path.split('/').at(-2) ?? '');
      const x = st.slips.find((y) => y.id === id);
      if (!x) throw new Error('Nothing to take back.');
      st.slips = st.slips.filter((y) => y.id !== id);
      st.since = x.prev;
      void collection<Urge>('soul', 'urges').remove(id);
      return { ok: true };
    },
    [`${S}/clean/read`]: (body: { force?: boolean }) => {
      const n = live<Urge>('soul', 'urges').length;
      if (n < 5) return { ready: false, need: 5 - n, item: st.pattern };
      if (st.pattern && !body.force) return { ready: true, item: st.pattern };
      st.pattern = {
        id: newId('rd'), kind: 'pattern', date: day, at: new Date().toISOString(), v: 'pattern-1', n,
        out: {
          headline: 'Sample reading: most urges come late at night, in bed, after scrolling.',
          when: 'Most of the urges you logged came between 23:00 and 01:00, a few on weekend afternoons.',
          why: 'They tend to follow scrolling in bed or an evening with nothing planned.',
          kept: 'The ones that passed usually ended with you leaving the room.',
          plans: [
            { if: 'It is late and I am in bed', then: 'Phone goes on the desk', start: '23:00', end: '00:30', days: [1, 2, 3, 4, 5, 6, 7], why: 'Most urges you logged started in bed after 23:00.' },
            { if: 'I catch myself scrolling', then: 'I leave the room', start: '22:30', end: '01:00', days: [1, 2, 3, 4, 5, 6, 7], why: 'Scrolling came before most of them.' },
          ],
        },
      };
      return { ready: true, item: st.pattern };
    },
    [`${S}/urges/*`]: (body: Urge) => { void collection<Urge>('soul', 'urges').put(body); return { item: body }; },
    [`${S}/sits/*`]: (body: Sit) => { void collection<Sit>('soul', 'sits').put(body); return { item: body }; },
    [`${S}/journal/prompts`]: () => ({
      ready: true,
      item: { id: newId('rd'), kind: 'prompts', date: day, at: new Date().toISOString(), v: 'prompts-1', n: entrySeed.length, out: { prompts: [
        'Sample prompt: what made the evening walks feel good this week?',
        'Sample prompt: what would make tomorrow morning easier?',
        'Sample prompt: which conversation this week do you want more of?',
      ] } },
    }),
    [`${S}/journal/read`]: (body: { force?: boolean }) => {
      const n = live<Entry>('growth', 'journal').length;
      if (n < 3) return { ready: false, need: 3 - n, item: st.journal };
      if (st.journal && !body.force) return { ready: true, item: st.journal };
      st.journal = {
        id: newId('rd'), kind: 'journal', date: day, at: new Date().toISOString(), v: 'journal-1', n,
        out: {
          headline: 'Sample reading: steadier weeks when the evenings have a walk in them.',
          good: 'The entries after a walk or a long talk with a friend read lighter and end with a plan for the next day.',
          returning: ['Sleep', 'Work pressure', 'Evening walks'],
          noticed: 'Late nights with the phone show up before the heavier entries.',
          quotes: [{ date: addDays(day, -3), text: 'Sample line: want more evenings like this.' }, { date: addDays(day, -8), text: 'Sample line: lighter now.' }],
        },
      };
      return { ready: true, item: st.journal };
    },
    [`${S}/journal/ask`]: () => ({ q: 'Sample question: what part of today do you want more of tomorrow?', v: 'ask-1', at: new Date().toISOString() }),
    [`${S}/journal/tidy`]: (body: { text: string }) => ({ text: body.text.trim().replace(/\s+/g, ' '), v: 'tidy-1', at: new Date().toISOString() }),
    ['/mod/growth/journal/*']: (body: Entry) => { void collection<Entry>('growth', 'journal').put(body); return { item: body }; },
    [`${S}/photos`]: () => { throw new Error('Photos stay on the PC. The sample preview has none.'); },
  },
});
