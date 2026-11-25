// Sample records for the `?demo` preview of the Growth page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data, nobody's real life: the rules come from the PC's own generic rule bank, the weeks, scores and
// headlines are made up. The figures are worked out here the way the PC works them out (GET /mod/growth/home, /wheel,
// /review, /handoff), so ticking a rule, scoring the wheel and closing the week all move them. The phone never loads
// this file.
//
// `?demo&aspect=growth&state=<review|score|sealed|quiet|empty>` picks the week: the Sunday review open (the default),
// the wheel due for a score, this week closed, nothing due, or a first visit with nothing set yet.
import { collection, demoSource, type Doc } from '@/lib/mod';
import { addDays, daysBetween, myDay } from '@/aspects/kit/time';
import type { SealBody } from '@/aspects/growth/data';
import type { Home, MorningRead, ReviewDoc, ReviewDraft, Rule, RuleSum, Section, Trend, WheelData } from '@/aspects/growth/types';
import type { AspectKey } from '@/theme';

type State = 'review' | 'score' | 'sealed' | 'quiet' | 'empty';
const query = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const STATE: State = (['review', 'score', 'sealed', 'quiet', 'empty'] as const).find((x) => x === query.get('state')) ?? 'review';
const EMPTY = STATE === 'empty';

// ── days and weeks ──
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = myDay();
const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));
/** The ISO week a day is in: "2026-W48". */
function weekKey(d: string) {
  const t = new Date(`${mondayOf(d)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 3); // the Thursday decides the year
  const y = t.getUTCFullYear();
  const jan4 = `${y}-01-04`;
  const first = mondayOf(jan4);
  return `${y}-W${String(Math.round(daysBetween(first, mondayOf(d)) / 7) + 1).padStart(2, '0')}`;
}
/** The PC's week label: "23–29 Nov", "30 Nov – 6 Dec". */
function labelOf(monday: string) {
  const to = addDays(monday, 6);
  const d1 = Number(monday.slice(8)), m1 = MON[Number(monday.slice(5, 7)) - 1];
  const d2 = Number(to.slice(8)), m2 = MON[Number(to.slice(5, 7)) - 1];
  return m1 === m2 ? `${d1}–${d2} ${m2}` : `${d1} ${m1} – ${d2} ${m2}`;
}
const thisMon = mondayOf(day);
const monOf = (k: number) => addDays(thisMon, -7 * k);
/** The week k weeks back (W(0) is this week, W(-1) next week). */
const W = (k: number) => weekKey(monOf(k));
const noonOf = (d: string) => `${d}T06:30:00.000Z`;
const stamp = (d: string) => ({ created_at: noonOf(d), updated_at: noonOf(d), deleted_at: null });
/** Days of this week so far: a week under four days old doesn't count toward a trend yet (as on the PC). */
const into = ((weekdayOf(day) + 6) % 7) + 1;

// ── the wheel ──
const ORDER: AspectKey[] = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
const NAME: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth', family: 'Family', romance: 'Romance', friends: 'Friends',
};
/** What the data reads each week for the last twelve, oldest first; the last is this week, still filling. */
const SERIES: Record<AspectKey, (number | null)[]> = {
  body: [4.4, 4.6, 4.8, 4.9, 5.0, 5.1, 5.3, 5.6, 6.1, 6.4, 6.6, 6.8],
  mind: [5.5, 5.2, 5.6, 5.3, 5.0, 5.4, 5.1, 5.3, 5.2, 5.5, 5.0, 5.3],
  soul: [5.4, 5.8, 5.6, 6.0, 5.7, 5.5, 5.9, 5.8, 6.1, 5.6, 5.9, 5.8],
  mission: [5.6, 5.2, 5.5, 5.0, 5.3, 4.9, 5.1, 5.2, 4.8, 5.0, 5.1, 4.9],
  money: [4.8, 5.0, 5.3, 5.1, 5.6, 5.8, 5.7, 6.0, 6.1, 6.0, 6.3, 6.2],
  growth: [5.0, 5.2, 5.4, 5.3, 5.6, 5.5, 5.8, 5.7, 6.0, 5.9, 6.1, 6.0],
  family: [7.0, 7.2, 6.8, 7.1, 7.4, 7.0, 7.3, 7.5, 7.2, 7.6, 7.4, 7.5],
  romance: [null, null, null, null, null, null, null, null, 5.0, 5.8, 5.4, 5.9],
  friends: [6.2, 6.0, 6.1, 5.8, 5.6, 5.2, 4.9, 4.6, 4.0, 3.8, 3.5, 3.2],
};
const EVIDENCE: Record<AspectKey, string[]> = {
  body: ['Workouts: 4 last week, 3 the week before', 'Sleep: 7 h 5 m last week, 6 h 40 m the week before'],
  mind: ['Study sessions: 3 last week, 4 the week before'],
  soul: ['Journal: 5 entries last week, 3 the week before'],
  mission: ['Tasks due last week: 3 of 7 done', 'Focus hours: 9 last week, 11 the week before'],
  money: ['Spends logged: 18 last week, 15 the week before'],
  growth: ['Rules held: 2 last week, 1 the week before'],
  family: ['Calls home: 3 last week, 1 the week before'],
  romance: ['Time together: 2 evenings last week'],
  friends: ['No plans with friends in 3 weeks'],
};
const SOURCES: Record<AspectKey, string[]> = {
  body: ['Workouts', 'Sleep'], mind: ['Study sessions'], soul: ['Journal', 'Moods'], mission: ['Tasks', 'Focus hours'], money: ['Spends logged'],
  growth: ['Rules held', 'Reviews'], family: ['Calls home'], romance: ['Time together'], friends: ['Plans with friends'],
};
const WEEKS = Array.from({ length: 12 }, (_, i) => {
  const from = monOf(11 - i);
  return { key: weekKey(from), label: labelOf(from), from, partial: i === 11 };
});

type Snap = { date: string; scores: Partial<Record<AspectKey, number>> };
const scores = (v: number[]) => Object.fromEntries(ORDER.map((k, i) => [k, v[i]])) as Partial<Record<AspectKey, number>>;
const snaps: Snap[] = EMPTY ? [] : [
  { date: addDays(day, -64), scores: scores([5, 6, 5, 7, 4, 5, 7, 6, 5]) },
  { date: addDays(day, -33), scores: scores([6, 6, 6, 8, 6, 6, 7, 5, 3]) },
  ...(STATE === 'sealed' || STATE === 'quiet' ? [{ date: addDays(day, -9), scores: scores([7, 6, 6, 8, 6, 6, 8, 5, 4]) }] : []),
];

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r1 = (v: number) => Math.round(v * 10) / 10;
/** The PC's trend rule: the last four weeks against the four before, a point or more and beyond twice the noise. */
function trendOf(values: (number | null)[]): Trend {
  const v = values.filter((x): x is number => x != null);
  const now = v.length ? r1(mean(v.slice(-4))) : null;
  if (v.length < 6) return { state: 'early', diff: null, now, before: null, weeks: v.length };
  const a = v.slice(-4), b = v.slice(-8, -4);
  const ma = mean(a), mb = mean(b), diff = ma - mb;
  const ss = (xs: number[], m: number) => xs.reduce((s, x) => s + (x - m) ** 2, 0);
  const df = a.length + b.length - 2;
  const sd = df > 0 ? Math.sqrt((ss(a, ma) + ss(b, mb)) / df) : 0;
  const se = sd * Math.sqrt(1 / a.length + 1 / b.length);
  const real = Math.abs(diff) >= 1 && Math.abs(diff) > 2 * se;
  return { state: real ? (diff > 0 ? 'up' : 'down') : 'steady', diff: r1(diff), now, before: r1(mb), weeks: v.length };
}
const agreement = (felt: number | null, measured: number | null) =>
  felt == null || measured == null ? null : Math.abs(felt - measured) < 2.5 ? 'agree' as const : felt > measured ? 'higher' as const : 'lower' as const;

function scoring() {
  const last = snaps.at(-1) ?? null, prev = snaps.at(-2) ?? null;
  if (!last) return { scored: false, last: null, previous: null, days: null, due: true, next: null };
  const days = daysBetween(last.date, day);
  return { scored: true, last: last.date, previous: prev?.date ?? null, days, due: days >= 30, next: addDays(last.date, 30) };
}

function wheel(): WheelData {
  const last = snaps.at(-1) ?? null, prev = snaps.at(-2) ?? null;
  const sections: Section[] = ORDER.map((key) => {
    const felt = last?.scores[key] ?? null, was = prev?.scores[key] ?? null;
    const change = felt != null && was != null ? felt - was : null;
    const series = EMPTY ? SERIES[key].map(() => null) : SERIES[key]; // a first visit: no weeks read yet
    const trend = trendOf(into >= 4 ? series : series.slice(0, -1));
    return {
      key, name: NAME[key], felt, feltDate: felt != null ? last!.date : null, was, wasDate: was != null ? prev!.date : null,
      change, moved: change != null && Math.abs(change) >= 2, measured: trend.now, trend, agree: agreement(felt, trend.now),
      evidence: EMPTY ? [] : EVIDENCE[key], sources: SOURCES[key], series,
      feltHistory: snaps.filter((s) => s.scores[key] != null).map((s) => ({ date: s.date, v: s.scores[key]! })),
    };
  });
  const ups = sections.filter((s) => s.trend.state === 'up').sort((a, b) => (b.trend.diff ?? 0) - (a.trend.diff ?? 0));
  const downs = sections.filter((s) => s.trend.state === 'down').sort((a, b) => (a.trend.diff ?? 0) - (b.trend.diff ?? 0));
  return {
    today: day, scoring: scoring(), sections, weeks: WEEKS, snapshots: snaps.map((s) => ({ ...s })),
    riser: ups[0]?.key ?? null, sliding: downs[0]?.key ?? null, early: sections.every((s) => s.trend.state === 'early'),
    noise: { felt: 2, trend: 1 },
  };
}

// ── rules ──
const RULES: Rule[] = EMPTY ? [] : [
  {
    id: 'r_bed', when: 'I get into bed', then: 'the phone stays on the desk', status: 'active',
    born: { week: W(4), text: 'Sleep: 6 h 20 m, down from 7 h 5 m', aspect: 'body', why: 'Phone in bed' },
    checks: [{ week: W(3), held: true }, { week: W(2), held: false }, { week: W(1), held: true }], ...stamp(monOf(4)),
  },
  {
    id: 'r_big', when: 'a task feels too big', then: 'I write the smallest first step and do only that', status: 'active',
    born: { week: W(6), text: 'Due this week, not done: Sample: write the project brief', aspect: 'mission', why: 'Felt too big' },
    checks: [{ week: W(5), held: true }, { week: W(4), held: true }, { week: W(3), held: false }, { week: W(2), held: true }, { week: W(1), held: true }, { week: W(0), held: true }],
    ...stamp(monOf(6)),
  },
  {
    id: 'r_yes', when: 'someone asks for my time', then: 'I check my week before I say yes', status: 'active',
    born: { week: W(1), text: 'Plans with friends: 0, down from 1', aspect: 'friends', why: 'Said yes to too much' }, checks: [], ...stamp(addDays(monOf(1), 6)),
  },
  {
    id: 'r_late', when: 'it gets to 23:00', then: 'I start winding down', status: 'retired', retired_at: noonOf(addDays(day, -20)),
    born: { week: W(9), text: 'Sleep: 6 h, down from 6 h 50 m', aspect: 'body', why: 'Slept late' },
    checks: [{ week: W(8), held: true }, { week: W(7), held: false }, { week: W(6), held: false }], ...stamp(monOf(9)),
  },
];

/** A collection's records now. One no screen has opened yet starts from its sample records first (a demo pull is instant). */
function live<T extends Doc>(coll: string): T[] {
  const c = collection<T>('growth', coll);
  if (!c.get()) void c.refresh();
  return (c.get() ?? []).filter((d) => !d.deleted_at);
}
const ruleText = (r: { when: string; then: string }) => `When ${r.when}, ${r.then}.`;
function ruleSummary(r: Rule): RuleSum {
  const checks = r.checks ?? [];
  return {
    id: r.id, when: r.when, then: r.then, text: ruleText(r), status: r.status, born: r.born ?? null, created_at: r.created_at,
    held: checks.filter((c) => c.held).length, of: checks.length, last: checks.length ? { week: checks.at(-1)!.week, held: !!checks.at(-1)!.held } : null,
    retired_at: r.retired_at ?? null,
  };
}
/** The two or three that matter this week: new ones, then the last broken, then the least held. */
function topRules() {
  const recent = weekKey(addDays(day, -14));
  const list = live<Rule>('rules').filter((r) => r.status === 'active').map(ruleSummary);
  const rank = (r: RuleSum) => (r.born?.week && r.born.week >= recent ? 0 : r.last && !r.last.held ? 1 : 2);
  const rate = (r: RuleSum) => (r.of ? r.held / r.of : 0.5);
  const top = list.sort((a, b) => rank(a) - rank(b) || rate(a) - rate(b) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 3);
  return { active: list.length, top, week: W(0) };
}

// ── reviews he closed ──
type Move = NonNullable<ReviewDoc['moves']>[number];
function past(k: number, x: Partial<ReviewDoc> & { status?: string }): ReviewDoc {
  const from = monOf(k), to = addDays(from, 6);
  return {
    id: `rv_${W(k)}`, week: W(k), label: labelOf(from), from, to, status: 'sealed', sealed_at: `${addDays(to, 0)}T13:10:00.000Z`,
    nextWeek: W(k - 1), ...x, ...stamp(to),
  };
}
const REVIEWS: ReviewDoc[] = EMPTY ? [] : [
  past(1, {
    headline: '3 things rose on the week before, 2 slipped.', feel: { line: 'Busy, but the mornings held.' },
    moved: [{ text: 'Workouts: 4, up from 2', aspect: 'body' }, { text: 'Journal entries: 4, up from 2', aspect: 'soul' }, { text: 'Spends logged: 18, up from 11', aspect: 'money' }],
    misses: [
      { text: 'Plans with friends: 0, down from 1', aspect: 'friends', why: 'No time', why2: 'Said yes to too much' },
      { text: 'Due this week, not done: Sample: send the invoice', aspect: 'mission', why: 'Avoided it', why2: 'Felt too big' },
    ],
    closed: [
      { text: 'Sample: ship the client dashboard', aspect: 'mission', verdict: 'partly', carry: true },
      { text: 'Sample: four training days', aspect: 'body', verdict: 'done' },
    ],
    checks: [{ rule: 'r_bed', text: 'When I get into bed, the phone stays on the desk.', held: true }, { rule: 'r_big', text: 'When a task feels too big, I write the smallest first step and do only that.', held: true }],
    ruleText: 'When someone asks for my time, I check my week before I say yes.',
    moves: [
      { id: `${W(1)}:m1`, text: 'Finish Sample: send the invoice', aspect: 'mission', state: 'accepted', goal: 'g201', on: true },
      { id: `${W(1)}:m2`, text: 'One plan with a friend on the calendar', aspect: 'friends', state: 'accepted', goal: 'g202', on: true },
      { id: `${W(1)}:m3`, text: 'One block for Mind on the calendar', aspect: 'mind', state: 'offered', on: true },
    ],
  }),
  past(2, {
    headline: 'A steady week in the data.', feel: { line: 'Quiet week, nothing big.' },
    moved: [{ text: 'Sleep: 7 h 10 m, up from 6 h 40 m', aspect: 'body' }],
    misses: [{ text: 'Study sessions: 2, down from 4', aspect: 'mind', why: 'Tired', why2: 'Slept late' }],
    checks: [{ rule: 'r_bed', text: 'When I get into bed, the phone stays on the desk.', held: false }, { rule: 'r_big', text: 'When a task feels too big, I write the smallest first step and do only that.', held: true }],
    moves: [{ id: `${W(2)}:m1`, text: 'Two study sessions on the calendar', aspect: 'mind', state: 'accepted', goal: 'g203', on: true }],
  }),
  past(3, {
    headline: '2 things rose on the week before, 1 slipped.',
    moved: [{ text: 'Calls home: 2, up from 0', aspect: 'family' }, { text: 'Focus hours: 12, up from 8', aspect: 'mission' }],
    misses: [{ text: 'Workouts: 1, down from 3', aspect: 'body', why: 'No time', why2: 'Late start to the day' }],
    checks: [{ rule: 'r_bed', text: 'When I get into bed, the phone stays on the desk.', held: true }, { rule: 'r_big', text: 'When a task feels too big, I write the smallest first step and do only that.', held: false }],
    moves: [
      { id: `${W(3)}:m1`, text: 'Three workouts, mornings', aspect: 'body', state: 'accepted', goal: 'g204', on: true },
      { id: `${W(3)}:m2`, text: 'Clear the inbox on Friday', aspect: 'mission', state: 'declined', on: true },
    ],
  }),
  // a draft the first app wrote and nobody closed
  past(6, {
    status: 'draft', sealed_at: undefined, headline: '1 thing rose on the week before, 3 slipped.',
    moved: [{ text: 'Spends logged: 12, up from 6', aspect: 'money' }],
    misses: [{ text: 'Journal entries: 0, down from 3', aspect: 'soul' }, { text: 'Workouts: 1, down from 3', aspect: 'body' }],
    moves: [{ text: 'Journal three nights', aspect: 'soul', on: true }],
  }),
  ...(STATE === 'sealed' ? [past(0, {
    sealed_at: noonOf(day), headline: '4 things rose on the week before, 1 slipped.', feel: { line: 'Good week. Evenings still drift.' },
    moved: [{ text: 'Workouts: 4, up from 3', aspect: 'body' }, { text: 'Journal entries: 5, up from 3', aspect: 'soul' }],
    misses: [{ text: 'Plans with friends: 0, down from 1', aspect: 'friends', why: 'No plan', why2: 'Never decided when' }],
    closed: [{ text: 'Sample: ship the client dashboard', aspect: 'mission', verdict: 'done' }],
    checks: [{ rule: 'r_big', text: 'When a task feels too big, I write the smallest first step and do only that.', held: true }],
    moves: [
      { id: `${W(0)}:m1`, text: 'Message one friend about Saturday', aspect: 'friends', state: 'accepted', goal: 'g205', on: true },
      { id: `${W(0)}:m2`, text: 'Phone on the desk by 23:30', aspect: 'body', state: 'accepted', goal: 'g206', on: true },
      { id: `${W(0)}:m3`, text: 'One block for Mind on the calendar', aspect: 'mind', state: 'offered', on: true },
    ],
  })] : []),
];

function lastSealed() {
  return live<ReviewDoc>('reviews').filter((r) => r.status === 'sealed').sort((a, b) => b.week.localeCompare(a.week))[0] ?? null;
}
function handoff() {
  const r = lastSealed();
  if (!r) return { reviewed: null, sealed_at: null, closed: [], moves: { week: null, items: [] } };
  const items = (r.moves ?? []).filter((m) => m.on !== false && m.id?.includes(':')).map((m) => ({
    id: m.id!, text: m.text, aspect: m.aspect, serves: m.serves ?? null, carry: m.carry ?? null, state: m.state ?? 'offered', goal: m.goal ?? null,
  }));
  return { reviewed: r.week, sealed_at: r.sealed_at ?? null, closed: [], moves: { week: r.nextWeek ?? null, items } };
}

/** The review window, as the sample pretends it: the weekend for review and sealed, a weekday otherwise. */
function windowNow(): Home['review'] {
  if (STATE === 'review' || STATE === 'sealed') {
    const sealed = live<ReviewDoc>('reviews').find((r) => r.week === W(0) && r.status === 'sealed') ?? null;
    return {
      week: W(0), label: labelOf(thisMon), open: !sealed, sealed: !!sealed, sealed_at: sealed?.sealed_at ?? null,
      nextOpen: sealed ? addDays(thisMon, 12) : null, nextSunday: sealed ? addDays(thisMon, 13) : null,
    };
  }
  const toSat = (6 - weekdayOf(day) + 7) % 7 || 7;
  return { week: null, label: null, open: false, sealed: false, sealed_at: null, nextOpen: addDays(day, toSat), nextSunday: addDays(day, toSat + 1) };
}

// ── last night's read ──
const READ: MorningRead | null = EMPTY ? null : {
  id: `dream_${day}`, date: day, ran: '04:10', headline: 'A steady day that ended late.', answered: false,
  connections: [
    {
      id: 'c1', title: 'Late screens, slow start', text: 'On the nights the phone was out past midnight, the first task the next day started over an hour later.',
      aspects: ['body', 'mission'], strength: 'medium', verdict: null, move: { text: 'Phone on the desk by 23:30', aspect: 'body' },
    },
    {
      id: 'c2', title: 'Training lifts the next day', text: 'Days after a workout had more focused hours than days after a rest day.',
      aspects: ['body', 'mind'], strength: 'low', verdict: null, move: null,
    },
  ],
};

function home(): Home {
  const w = wheel();
  const win = windowNow();
  const ho = handoff();
  const waiting = ho.moves.week === W(0) || ho.moves.week === W(-1) ? ho.moves.items.filter((m) => m.state === 'offered').length : 0;
  return {
    today: day, week: { key: W(0), label: labelOf(thisMon) },
    wheel: w, lead: win.open ? 'review' : w.scoring.due ? 'score' : null,
    review: win, read: READ, rules: topRules(), mission: { waiting, week: ho.moves.week },
    reviews: live<ReviewDoc>('reviews').filter((r) => r.status === 'sealed').length,
  };
}

// ── this week's review, as the PC drafts it ──
const WHYS = ['Avoided it', 'No time', 'Tired', 'Phone in bed', 'No plan', 'Forgot', "Didn't matter"];
const TASK_WHYS = ['Avoided it', 'No time', 'Unclear next step', 'No plan', "Didn't matter"];
const WHY_TREE: Record<string, string[]> = {
  'Avoided it': ['Felt too big', 'Unclear first step', 'Nervous about it', 'Boring'],
  'No time': ['Something urgent came up', 'Said yes to too much', 'Lost hours on the phone', 'Late start to the day'],
  'Tired': ['Slept late', 'Long day', 'Ate badly', 'Low mood'],
  'Phone in bed': ['Scrolling', 'Messages', "Couldn't sleep", 'Just habit'],
  'No plan': ['Never decided when', 'No slot on the calendar', 'Plan was too vague'],
  'Forgot': ['Not written anywhere', 'No reminder', 'Out of routine'],
  'Unclear next step': ['Too big to start', 'Waiting on someone', "Didn't know how"],
  "Didn't matter": ['Priorities changed', 'Wrong goal', 'Fine to let go'],
};
const RULE_BANK: Record<string, { when: string; then: string }> = {
  'Avoided it': { when: "I notice I'm putting something off", then: 'I do the first five minutes right away' },
  'Felt too big': { when: 'a task feels too big', then: 'I write the smallest first step and do only that' },
  'Unclear first step': { when: "I don't know where to start", then: 'I write the first step before anything else' },
  'Nervous about it': { when: "I'm nervous about how something will go", then: 'I do it early, before I can overthink it' },
  'Boring': { when: 'a task bores me', then: 'I set a 25 minute timer and start' },
  'No time': { when: 'the week fills up', then: 'I put what matters on the calendar first' },
  'Something urgent came up': { when: 'something urgent lands', then: 'I move the plan instead of dropping it' },
  'Said yes to too much': { when: 'someone asks for my time', then: 'I check my week before I say yes' },
  'Lost hours on the phone': { when: 'I pick up the phone without a reason', then: 'I put it down and start the next thing' },
  'Late start to the day': { when: 'I wake up late', then: 'I still do the most important thing first' },
  'Tired': { when: "I'm tired", then: 'I do the smallest version instead of skipping' },
  'Slept late': { when: 'it gets to 23:00', then: 'I start winding down' },
  'Long day': { when: 'a long day is coming', then: 'I do the important thing in the morning' },
  'Ate badly': { when: 'my energy is low', then: 'I eat properly before I decide to skip' },
  'Low mood': { when: 'I feel low', then: 'I do ten minutes and then decide' },
  'Phone in bed': { when: 'I get into bed', then: 'the phone stays on the desk' },
  'Scrolling': { when: 'I catch myself scrolling', then: 'I close the app and stand up' },
  'Messages': { when: "it's past 23:00", then: 'messages wait until morning' },
  "Couldn't sleep": { when: "I can't sleep", then: 'I read instead of picking up the phone' },
  'Just habit': { when: 'I go to bed', then: 'the phone charges outside the room' },
  'No plan': { when: 'I plan the week', then: 'everything that matters gets a day and a time' },
  'Never decided when': { when: 'I plan the week', then: 'everything that matters gets a day and a time' },
  'No slot on the calendar': { when: 'Sunday ends', then: "next week's important things are on the calendar" },
  'Plan was too vague': { when: 'I set a plan', then: 'I write down what done looks like' },
  'Forgot': { when: 'I plan the day', then: 'I pick the first three things before the phone' },
  'Not written anywhere': { when: 'I commit to something', then: 'I write it down that minute' },
  'No reminder': { when: 'I set a task', then: 'it gets a time and a reminder' },
  'Out of routine': { when: 'my routine breaks', then: 'I keep only the three things that matter' },
  'Unclear next step': { when: 'a task feels big', then: 'I write its first step before starting' },
  'Too big to start': { when: 'a task feels too big', then: 'I split it until one piece takes an hour' },
  'Waiting on someone': { when: "I'm waiting on someone", then: 'I ask them the same day' },
  "Didn't know how": { when: "I don't know how to do something", then: 'I ask or look it up in the first ten minutes' },
};
const GOALS = [
  { id: 'g101', title: 'Sample: train four days a week', horizon: 'quarter', aspect: 'body' as AspectKey },
  { id: 'g102', title: 'Sample: finish one course end to end', horizon: 'quarter', aspect: 'mind' as AspectKey },
  { id: 'g106', title: 'Sample: a new plan with a friend every week', horizon: 'month', aspect: 'friends' as AspectKey },
];
let aiDraft = false;

function draft(): ReviewDraft {
  const win = windowNow();
  const week = win.week ?? W(0);
  const from = thisMon, next = addDays(from, 7);
  const w = wheel();
  const code = !aiDraft;
  return {
    week, n: Number(week.slice(6)), label: labelOf(from), from, to: addDays(from, 6), nextWeek: weekKey(next), nextLabel: labelOf(next),
    window: win, status: win.sealed ? 'sealed' : win.open ? 'open' : 'closed',
    drafted_by: code ? 'code' : 'sonnet', drafted_at: new Date().toISOString(), prompt: null,
    headline: code ? '3 things rose on the week before, 2 slipped.' : 'Training held all week. The evenings drifted, and friends slipped again.',
    feel: code ? 'Mood 3.8 of 5 across 5 check-ins.' : 'Steady, a little tired by Friday.',
    commitments: [
      { id: 'g301', kind: 'goal', goal: 'g301', text: 'Sample: ship the client dashboard', aspect: 'mission', progress: 75, tasks: 4, parent: null, suggested: 'partly' },
      { id: 'g302', kind: 'goal', goal: 'g302', text: 'Sample: train four days', aspect: 'body', progress: 100, tasks: 0, parent: 'g101', suggested: 'done' },
      { id: 'g303', kind: 'goal', goal: 'g303', text: 'Sample: call home twice', aspect: 'family', progress: 0, tasks: 0, parent: null, suggested: null },
      { id: `move:${W(1)}:m3`, kind: 'move', goal: null, text: 'One block for Mind on the calendar', aspect: 'mind', progress: null, tasks: 0, parent: null, suggested: null },
    ],
    moved: code ? [
      { id: 'w1', text: 'Workouts: 4, up from 3', aspect: 'body', source: 'data' },
      { id: 'w2', text: 'Journal entries: 5, up from 3', aspect: 'soul', source: 'data' },
      { id: 'w3', text: 'Calls home: 3, up from 1', aspect: 'family', source: 'data' },
    ] : [
      { id: 'w1', text: 'Four training days, the most in a month', aspect: 'body', source: 'ai' },
      { id: 'w2', text: 'You wrote in the journal five nights', aspect: 'soul', source: 'ai' },
    ],
    missed: code ? [
      { id: 't1', text: 'Due this week, not done: Sample: send the invoice', aspect: 'mission', detail: '', whys: TASK_WHYS, source: 'data', task: 't41' },
      { id: 'x1', text: 'Plans with friends: 0, down from 1', aspect: 'friends', detail: 'none in three weeks', whys: WHYS, source: 'data', task: null },
    ] : [
      { id: 'x1', text: 'No plan with friends again', aspect: 'friends', detail: 'the third week running', whys: WHYS, source: 'ai', task: null },
      { id: 'x2', text: 'The invoice stayed unsent', aspect: 'mission', detail: '', whys: TASK_WHYS, source: 'ai', task: 't41' },
    ],
    rules: live<Rule>('rules').filter((r) => r.status === 'active').map(ruleSummary),
    ruleIdeas: code ? [] : [{ id: 'ai1', when: 'Friday comes', then: 'I message one friend about the weekend', why: 'Plans with friends slipped three weeks running' }],
    moves: [
      { id: 's:i1', text: 'Phone on the desk by 23:30', aspect: 'body', serves: null, carry: null, from: 'inbox:i1', source: 'dream' },
      ...(code ? [
        { id: 'c:t41', text: 'Finish Sample: send the invoice', aspect: 'mission' as AspectKey, serves: null, carry: null, from: 'task:t41', source: 'data' },
        { id: 'c:friends', text: 'One block for Friends on the calendar', aspect: 'friends' as AspectKey, serves: 'g106', carry: null, from: null, source: 'data' },
      ] : [
        { id: 'a:1', text: 'Message one friend about Saturday', aspect: 'friends' as AspectKey, serves: 'g106', carry: null, from: null, source: 'ai' },
        { id: 'a:2', text: 'Send the invoice on Monday morning', aspect: 'mission' as AspectKey, serves: null, carry: null, from: null, source: 'ai' },
      ]),
    ],
    goals: GOALS, whys: WHYS, taskWhys: TASK_WHYS, whyTree: WHY_TREE, ruleBank: RULE_BANK,
    wheel: { due: w.scoring.due, last: w.scoring.last, sections: w.sections.map((s) => ({ key: s.key, name: s.name, felt: s.felt, measured: s.measured })) },
  };
}

/** Closing the week, as the PC does it: the review is kept, this week's rule checks replaced, the new rule added. */
async function seal(body: SealBody) {
  const reviews = collection<ReviewDoc>('growth', 'reviews');
  const rules = collection<Rule>('growth', 'rules');
  const week = body.week;
  const done = live<ReviewDoc>('reviews').find((r) => r.week === week && r.status === 'sealed');
  if (done) return { item: done, already: true, rule: null, goals: [] };
  const checks: { rule: string; text: string; held: boolean }[] = [];
  for (const c of body.checks) {
    if (typeof c.held !== 'boolean') continue;
    const r = live<Rule>('rules').find((x) => x.id === c.rule && x.status === 'active');
    if (!r) continue;
    await rules.put({ ...r, checks: [...(r.checks ?? []).filter((x) => x.week !== week), { week, held: c.held }] });
    checks.push({ rule: r.id, text: ruleText(r), held: c.held });
  }
  let made: RuleSum | null = null;
  if (body.rule) {
    const doc: Rule = {
      id: `r_${Date.now().toString(36)}`, when: body.rule.when, then: body.rule.then, status: 'active', checks: [],
      born: { week, text: body.rule.from?.text ?? null, aspect: body.rule.from?.aspect ?? null, why: body.rule.from?.why ?? null },
    };
    made = ruleSummary(await rules.put(doc));
  }
  const from = thisMon, nextWeek = weekKey(addDays(from, 7));
  const moves: Move[] = body.moves.map((m, i) => ({ id: `${week}:m${i + 1}`, text: m.text, aspect: m.aspect, serves: m.serves, carry: m.carry, state: 'offered', on: true }));
  const item = await reviews.put({
    id: `rv_${week}`, week, label: labelOf(from), from, to: addDays(from, 6), status: 'sealed', sealed_at: new Date().toISOString(),
    headline: body.headline, feel: body.feel ? { line: body.feel } : null, wins: body.moved, moved: body.moved, misses: body.missed,
    closed: body.closed.map((c) => ({ text: c.text, aspect: c.aspect, verdict: c.verdict, carry: c.carry, goal: c.goal })),
    checks, ruleText: made ? made.text : null, nextWeek, moves,
  });
  return { item, already: false, rule: made, goals: [] };
}

let goalN = 900;
demoSource({
  collections: { 'growth/rules': RULES, 'growth/reviews': REVIEWS },
  gets: {
    '/mod/growth/home': () => home(),
    '/mod/growth/wheel': () => wheel(),
    '/mod/growth/review': () => draft(),
    '/mod/growth/handoff': () => handoff(),
  },
  calls: {
    '/life/snapshots': (body: { date: string; scores: Partial<Record<AspectKey, number>> }) => {
      const at = snaps.findIndex((s) => s.date === body.date);
      const next = { date: body.date, scores: { ...(at >= 0 ? snaps[at].scores : {}), ...body.scores } };
      if (at >= 0) snaps[at] = next; else snaps.push(next);
      return next;
    },
    '/mod/growth/dream/answer': (body: { connection: string; answer: 'agree' | 'wrong' | 'move'; reason?: string; note?: string }) => {
      if (!READ) throw new Error('No read for today.');
      const c = READ.connections.find((x) => x.id === body.connection);
      if (c) c.verdict = { answer: body.answer, reason: body.reason ?? null, note: body.note ?? null, at: new Date().toISOString() };
      READ.answered = READ.connections.every((x) => x.verdict);
      return { item: READ, saved: null };
    },
    '/mod/growth/review/seal': (body: SealBody) => seal(body),
    '/mod/growth/review/draft': () => { aiDraft = true; return { item: null }; },
    '/mod/mission/week/*': () => ({ goal: `g${goalN++}` }),
    '/mod/growth/moves/*': async (body: { state: string; goal?: string | null }, info) => {
      const id = decodeURIComponent(info.path.split('/').pop() ?? '');
      const r = live<ReviewDoc>('reviews').find((x) => (x.moves ?? []).some((m) => m.id === id));
      if (r) await collection<ReviewDoc>('growth', 'reviews').put({ ...r, moves: (r.moves ?? []).map((m) => (m.id === id ? { ...m, state: body.state, goal: body.goal ?? null } : m)) });
      return { ok: true };
    },
    '/mod/mission/close': () => ({ ok: true }),
  },
});
