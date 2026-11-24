// What one section shows from the others: the numbers that bear on it, each with the day it was true and the link
// that opens its source. A number that isn't known is left out; an old one says when it was true.
import { addDays, dayLabel, rupees, today as todayOf } from '@/aspects/kit';
import type { AspectKey } from '@/theme';

export type Signal = { key: string; from: AspectKey; text: string; link: string };

// Only the fields read here; the rest of each answer is the page's business.
export type BodyToday = {
  sleep?: { asleep_min: number; date: string } | null;
  readiness?: { score: number | null; word?: string | null } | null;
  weight?: { now: number | null; date: string | null } | null;
  week?: { days: number; target: number } | null;
};
export type SoulSummary = { date: string; clean?: { text: string; private: boolean } | null; habits?: { done: number; total: number } | null };
export type Mood = { date: string; v: number };
export type MindDay = { date: string; kinds?: { work: number; learning: number; social: number; entertainment: number } | null };
export type MoneySummary = {
  today?: { allowance: number; spent: number; left: number } | null;
  month?: { name: string; budget: number; spent: number; left: number; daysLeft: number } | null;
  income?: { earned: number; goal: number; goalSet: boolean } | null;
};
export type Person = { id: string; name: string; aspect: string; birthday?: string | null; next?: { title: string; kind: string; on: string } | null };
export type Sources = { body?: BodyToday; soul?: SoulSummary; moods?: Mood[]; mind?: MindDay; money?: MoneySummary; people?: Person[] };

/** Which other sections each section reads. Growth already draws all of them on its wheel. */
export const NEEDS: Record<AspectKey, (keyof Sources)[]> = {
  body: ['soul', 'moods', 'mind'],
  mind: ['body', 'moods'],
  soul: ['body', 'mind'],
  mission: ['mind', 'money'],
  money: ['people'],
  growth: [],
  family: ['money'],
  romance: ['money', 'body'],
  friends: ['money'],
};

const MOOD = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];
const hm = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};
/** "today", "yesterday" or "on 18 Jul": the day a number was true. */
function on(day: string, now: string) {
  if (day === now) return 'today';
  if (day === addDays(now, -1)) return 'yesterday';
  return `on ${dayLabel(day)}`;
}
/** The next date of a birthday stored as YYYY-MM-DD, --MM-DD or MM-DD; null if it can't be read. */
export function nextBirthday(b: string, now: string): string | null {
  const m = /(\d{2})-(\d{2})$/.exec(b.trim());
  if (!m) return null;
  const year = Number(now.slice(0, 4));
  const thisYear = `${year}-${m[1]}-${m[2]}`;
  return thisYear >= now ? thisYear : `${year + 1}-${m[1]}-${m[2]}`;
}
const daysTo = (day: string, now: string) => Math.round((Date.parse(day) - Date.parse(now)) / 86_400_000);
const PEOPLE: Record<string, AspectKey> = { family: 'family', friends: 'friends', romance: 'romance' };

function sleep(b: BodyToday | undefined, now: string): Signal | null {
  const s = b?.sleep;
  if (!s || !(s.asleep_min > 0)) return null;
  return { key: 'sleep', from: 'body', text: `Slept ${hm(s.asleep_min)} ${s.date === now ? 'last night' : on(s.date, now)}`, link: 'agenticos://body' };
}
function readiness(b: BodyToday | undefined): Signal | null {
  const r = b?.readiness;
  if (!r || r.score == null) return null;
  return { key: 'readiness', from: 'body', text: `Readiness ${r.score}${r.word ? `, ${r.word.toLowerCase()}` : ''}`, link: 'agenticos://body' };
}
function training(b: BodyToday | undefined): Signal | null {
  const w = b?.week;
  if (!w || !w.target) return null;
  return { key: 'training', from: 'body', text: `Trained ${w.days} of ${w.target} days this week`, link: 'agenticos://body/gym' };
}
function mood(moods: Mood[] | undefined, now: string): Signal | null {
  const last = moods?.filter((m) => m.v >= 1 && m.v <= 5).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!last || daysTo(now, last.date) > 7) return null;
  return { key: 'mood', from: 'soul', text: last.date === now ? `Mood today: ${MOOD[last.v].toLowerCase()}` : `Last mood ${on(last.date, now)}: ${MOOD[last.v].toLowerCase()}`, link: 'agenticos://soul' };
}
function clean(s: SoulSummary | undefined): Signal | null {
  const c = s?.clean;
  if (!c?.text || c.private) return null; // private: he chose not to show it outside Soul
  return { key: 'clean', from: 'soul', text: c.text, link: 'agenticos://soul/clean' }; // only ever "Day N" outside Soul
}
function screen(m: MindDay | undefined, now: string): Signal | null {
  const k = m?.kinds;
  if (!k || m.date !== now) return null;
  const total = k.work + k.learning + k.social + k.entertainment;
  if (total < 5) return null;
  const fun = k.social + k.entertainment;
  return { key: 'screen', from: 'mind', text: fun >= 10 ? `Screens today: ${hm(total)}, ${hm(fun)} of it social or fun` : `Screens today: ${hm(total)}`, link: 'agenticos://mind' };
}
function work(m: MindDay | undefined, now: string): Signal | null {
  const k = m?.kinds;
  if (!k || m.date !== now || k.work < 5) return null;
  return { key: 'work', from: 'mind', text: `Work on screens today: ${hm(k.work)}`, link: 'agenticos://mind' };
}
function spendLeft(m: MoneySummary | undefined): Signal | null {
  const d = m?.today, mo = m?.month;
  if (d && d.allowance > 0) return { key: 'left', from: 'money', text: d.left >= 0 ? `${rupees(d.left)} left to spend today` : `${rupees(-d.left)} over today's spend`, link: 'agenticos://money/spend' };
  if (mo && mo.budget > 0) return { key: 'left', from: 'money', text: `${rupees(Math.max(0, mo.left))} left for ${mo.name}, ${mo.daysLeft} days to go`, link: 'agenticos://money/spend' };
  return null;
}
function income(m: MoneySummary | undefined): Signal | null {
  const i = m?.income;
  if (!i) return null;
  if (i.goalSet && i.goal > 0) return { key: 'income', from: 'money', text: `Earned ${rupees(i.earned)} of ${rupees(i.goal)} this month`, link: 'agenticos://money/earn' };
  if (i.earned > 0) return { key: 'income', from: 'money', text: `Earned ${rupees(i.earned)} this month`, link: 'agenticos://money/earn' };
  return null;
}
/** Birthdays in the next three weeks and plans in the next week, for Money (gifts, plans that cost). */
function peopleAhead(people: Person[] | undefined, now: string): Signal[] {
  const out: (Signal & { at: string })[] = [];
  for (const p of people ?? []) {
    const aspect = PEOPLE[p.aspect] ?? 'friends';
    const b = p.birthday ? nextBirthday(p.birthday, now) : null;
    if (b && daysTo(b, now) <= 21) out.push({ key: `bday-${p.id}`, from: aspect, at: b, text: `${p.name}'s birthday ${b === now ? 'today' : on(b, now)}`, link: `agenticos://${aspect}/person/${encodeURIComponent(p.id)}` });
    const n = p.next;
    if (n?.on && n.kind !== 'birthday' && daysTo(n.on.slice(0, 10), now) >= 0 && daysTo(n.on.slice(0, 10), now) <= 7) {
      out.push({ key: `plan-${p.id}`, from: aspect, at: n.on.slice(0, 10), text: `${n.title} ${on(n.on.slice(0, 10), now)}`, link: `agenticos://${aspect}/person/${encodeURIComponent(p.id)}` });
    }
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, 4).map(({ at: _at, ...s }) => s);
}

/** The signals one section shows, most useful first; at most five. */
export function signalsFor(aspect: AspectKey, src: Sources, now = todayOf()): Signal[] {
  const pick: (Signal | null)[] = (() => {
    switch (aspect) {
      case 'body': return [mood(src.moods, now), clean(src.soul), screen(src.mind, now)];
      case 'mind': return [sleep(src.body, now), readiness(src.body), mood(src.moods, now)];
      case 'soul': return [sleep(src.body, now), readiness(src.body), screen(src.mind, now)];
      case 'mission': return [income(src.money), work(src.mind, now)];
      case 'money': return peopleAhead(src.people, now);
      case 'family': return [spendLeft(src.money)];
      case 'romance': return [spendLeft(src.money), training(src.body)];
      case 'friends': return [spendLeft(src.money)];
      default: return [];
    }
  })();
  return pick.filter((s): s is Signal => !!s).slice(0, 5);
}
