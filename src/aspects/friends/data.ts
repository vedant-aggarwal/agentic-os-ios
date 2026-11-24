import { addDays, daysBetween, myDay, shortDay, today, weekStart } from '@/aspects/kit';
import { useCollection, useGet, type Doc } from '@/lib/mod';

// Friends reads the shared people list (module `people`, rows whose aspect is friends) and keeps only what Friends
// alone needs in its own module (`friends`: places, stored AI ideas, photos). Everything a screen shows is worked
// out here from those records, so a one-tap log shows at once.

export type Person = Doc & {
  name: string; rel?: string | null; aspect?: string | null; role?: string | null; since?: string | null;
  where?: string | null; place?: string | null; note?: string | null; met?: string | null; friend_since?: string | null;
  sort?: number | null; by?: string; sample?: boolean;
};
export type Kind = 'meet' | 'call' | 'chat';
export type Moment = Doc & {
  date: string; at?: string | null; people: string[]; aspect?: string | null; kind?: Kind | null; act?: string | null;
  title?: string | null; line?: string | null; photo?: string | null; plan?: string | null; place?: string | null;
  by?: string; source?: string; minutes?: number | null; sample?: boolean;
};
export type PlanState = 'tentative' | 'confirmed' | 'done' | 'dropped' | 'asked' | 'idea' | 'draft' | 'sent';
export type Plan = Doc & {
  title: string; people: string[]; aspect?: string | null; act?: string | null; date?: string | null; slot?: string | null;
  state: PlanState; invite?: string | null; idea?: string | null; by?: string; sample?: boolean;
};
export type Idea = Doc & { person: string; aspect?: string | null; kind: 'gift' | 'plan' | 'showup'; title: string; done?: boolean; from?: string | null; by?: string };
export type Rhythm = Doc & { person: string; every: number; mode?: 'meet' | 'talk' | 'any'; title?: string; label?: string; act?: string | null; dinner?: boolean };
export type Place = Doc & { name: string; key?: string | null; days?: number[] | null; from?: string; sort?: number; hidden?: boolean };

export type Window = { date: string; from: string; to: string; minutes: number; part: 'evening' | 'day' };
export type Visit = { place: string; date: string; at: string | null; title: string | null; from: 'calendar' | 'weekday' };
export type SeenPlace = { key: string; name: string; days: number[]; count: number };
export type Week = { today: string; now: string; free: Window[]; visits: Record<string, Visit[]>; suggested: SeenPlace[]; here: string | null };
export type BankIdea = { id: string; act: string; title: string; invite: string; near?: boolean };
export type Bank = { ideas: BankIdea[]; acts: string[] };
export type AiIdea = { id: string; title: string; act: string; why: string; invite: string };
export type AiAnswer = Doc & { person: string; date: string; at: string; v: number; model: string; ms: number | null; ideas: AiIdea[] };

export type Stage = 'met' | 'again' | 'friend';
export type Standing = {
  stage: Stage; meetings: number; last: Moment | null; lastMeet: Moment | null; since: number | null; faded: boolean;
  acts: Record<string, number>; second: string | null; planDone: boolean;
};

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────
const ACT_WORD: Record<string, string> = {
  food: 'food out', meal: 'a meal', chai: 'chai', gym: 'the gym', drive: 'a drive', film: 'a film', walk: 'a walk',
  game: 'games', sport: 'sport', cook: 'cooking', market: 'a market', event: 'a show', study: 'studying side by side',
  outing: 'an outing', talk: 'a long talk', shop: 'shopping', help: 'helping out',
};
export const actWord = (act?: string | null) => (act ? ACT_WORD[act] ?? act : null);
/** The acts offered after a one-tap log, in the order he is likely to pick them. */
export const LOG_ACTS = ['food', 'chai', 'gym', 'film', 'drive', 'walk', 'sport', 'game', 'study', 'talk'] as const;
export const ACT_CHIP: Record<string, string> = {
  food: 'Food', chai: 'Chai', gym: 'Gym', film: 'Film', drive: 'Drive', walk: 'Walk', sport: 'Sport', game: 'Games',
  study: 'Study', talk: 'Talk', cook: 'Cook', market: 'Market', event: 'A show', outing: 'Outing', meal: 'Meal',
};

const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** "Two", or the digits past ten. `lower` for the middle of a sentence. */
export const count = (n: number, lower = false) => {
  const w = n <= 10 ? NUM[n] : String(n);
  return lower && n <= 10 ? w.toLowerCase() : w;
};

/** "today", "yesterday", "4 days ago", "last week", "3 weeks ago", "on 2 Oct". */
export function whenAgo(day: string, ref = today()) {
  const d = daysBetween(day, ref);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `on ${shortDay(day)}`;
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "today", "tomorrow", "on Thursday" (this week), "on 4 Dec". */
export function whenAhead(day: string, ref = today()) {
  const d = daysBetween(ref, day);
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return `on ${WD[new Date(`${day}T00:00:00Z`).getUTCDay()]}`;
  return `on ${shortDay(day)}`;
}
/** A day label inside a sentence: "today" and "yesterday" go lower case, a weekday or a date keeps its capital. */
export const inLine = (label: string) => (/^(Today|Yesterday|Tomorrow)$/.test(label) ? label.toLowerCase() : label);
/** "Today", "Tomorrow", "Thursday", "Thu 4 Dec": a heading for a day ahead. */
export function dayAhead(day: string, ref = today()) {
  const d = daysBetween(ref, day);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d > 1 && d < 7) return WD[new Date(`${day}T00:00:00Z`).getUTCDay()];
  if (d === -1) return 'Yesterday';
  const [, m, dd] = day.split('-').map(Number);
  return `${WD[new Date(`${day}T00:00:00Z`).getUTCDay()].slice(0, 3)} ${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
}

/** A role from the people list, written for this page: no dot-joined fragments. */
export const roleText = (p: Person) => (p.role ? p.role.split(/\s*[·•|]\s*/).filter(Boolean).join(', ') : null);
export const firstName = (p: Person) => p.name.trim().split(/\s+/)[0];
export const initial = (p: Person) => (p.name.trim()[0] ?? '?').toUpperCase();
export const fillName = (text: string, p: Person | null) => text.replace(/\{name\}/g, p ? firstName(p) : '').replace(/\s+,/g, ',').replace(/,\s*([?.])/g, '$1').trim();
/** A plan time rounded up to the half hour: free from 18:45 → "19:00". */
export function roundSlot(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  const t = Math.ceil((h * 60 + m) / 30) * 30;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// ── where each person stands (the server's friends-people.ts works this out the same way) ───────────────────────
export function standingOf(p: Person, moments: Moment[], plans: Plan[], ref = today()): Standing {
  const mine = moments.filter((m) => m.people?.includes(p.id) && m.date && m.date <= ref).sort((a, b) => (a.date + (a.at ?? '')).localeCompare(b.date + (b.at ?? '')));
  const meets = mine.filter((m) => (m.kind ?? 'meet') === 'meet');
  const days = [...new Set(meets.map((m) => m.date))].sort();
  const last = mine.at(-1) ?? null;
  const stage: Stage = p.rel === 'friend' ? 'friend' : days.length >= 2 ? 'again' : 'met';
  const since = last ? daysBetween(last.date, ref) : p.met ? daysBetween(p.met, ref) : null;
  const faded = stage !== 'friend' && since != null && since > (stage === 'met' ? 30 : 60);
  const acts: Record<string, number> = {};
  for (const m of mine) if (m.act) acts[m.act] = (acts[m.act] ?? 0) + 1;
  const planDone = plans.some((x) => x.state === 'done' && x.people?.includes(p.id));
  return { stage, meetings: days.length, last, lastMeet: meets.at(-1) ?? null, since, faded, acts, second: days[1] ?? null, planDone };
}

/** A plan they keep without planning it: one act in at least three different weeks of the last six. */
export function standingPlan(p: Person, moments: Moment[], rhythm: Rhythm | null, ref = today()) {
  const from = addDays(ref, -42);
  const weeks = new Map<string, Set<string>>();
  for (const m of moments) {
    if (!m.people?.includes(p.id) || !m.act || (m.kind ?? 'meet') !== 'meet' || m.date < from || m.date > ref) continue;
    const s = weeks.get(m.act) ?? new Set<string>();
    s.add(weekStart(m.date));
    weeks.set(m.act, s);
  }
  const top = [...weeks.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  const act = top && top[1].size >= 3 ? top[0] : rhythm?.act && rhythm.act !== 'meal' ? rhythm.act : top && top[1].size >= 3 ? top[0] : null;
  if (!act) return null;
  const thisWeek = moments.some((m) => m.people?.includes(p.id) && m.act === act && m.date >= weekStart(ref) && m.date <= ref);
  return { act, thisWeek };
}

/** How a friend stands against the rhythm he set: the People module's bands, never shown as a score. */
export function warmthOf(rhythm: Rhythm | null, st: Standing): 'warm' | 'due' | 'drift' | 'none' {
  const ref = rhythm?.mode === 'meet' ? st.lastMeet : st.last;
  if (!ref) return 'none';
  if (!rhythm?.every) return 'warm';
  const x = daysBetween(ref.date, today()) / rhythm.every;
  return x <= 1 ? 'warm' : x <= 2 ? 'due' : 'drift';
}

/** One line on when they last met, kindly: "Met yesterday, a film", "Talked 5 days ago", "Nothing logged yet".
 *  Counted from his day (rolls at 04:00), so a log at 01:00 reads "today", the same as the button beside it. */
export function lastLine(st: Standing) {
  const m = st.last;
  if (!m) return 'Nothing logged yet';
  const verb = (m.kind ?? 'meet') === 'meet' ? 'Met' : 'Talked';
  const what = actWord(m.act);
  return `${verb} ${whenAgo(m.date, myDay())}${what ? `, ${what}` : ''}`;
}

// ── the data, shared by every part of the page ───────────────────────────────────────────────────────────────
export function useFriends() {
  const persons = useCollection<Person>('people', 'persons');
  const moments = useCollection<Moment>('people', 'moments');
  const plans = useCollection<Plan>('people', 'plans');
  const ideas = useCollection<Idea>('people', 'ideas');
  const rhythms = useCollection<Rhythm>('people', 'rhythms');
  const places = useCollection<Place>('friends', 'places');
  const week = useGet<Week>('/mod/friends/week?days=14');
  const bank = useGet<Bank>('/mod/friends/bank');
  return { persons, moments, plans, ideas, rhythms, places, week, bank };
}
export type Friends = ReturnType<typeof useFriends>;

