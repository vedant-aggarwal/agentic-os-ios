import { addDays, daysBetween, num, shortDay, today, weekday } from '@/aspects/kit';
import type { AspectKey } from '@/theme';
import type { RuleSum, Section, Trend } from './types';

// Small shared pieces of the Growth page.

export const ORDER: AspectKey[] = ['body', 'mind', 'soul', 'mission', 'money', 'growth', 'family', 'romance', 'friends'];
export const NAME: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth', family: 'Family', romance: 'Romance', friends: 'Friends',
};

/** "6 Jul" with how long ago, in words that never pass an old date off as now: "6 Jul, 4 months ago". */
export function whenSaid(day: string) {
  const d = daysBetween(day, today());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  const ago = d < 14 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`;
  return `${shortDay(day)}, ${ago}`;
}

/** The server's week labels use a dash; copy never does: "16 to 22 Nov". */
export const range = (label: string | null | undefined) => (label ?? '').replace(/\s*[–—-]\s*/g, ' to ');

/** An ISO week key as the day it starts: "2026-W47" is "16 Nov". */
export function weekWords(key: string) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = `${y}-01-04`;
  const monday = addDays(jan4, -((weekday(jan4) + 6) % 7));
  return shortDay(addDays(monday, (w - 1) * 7));
}

/** A 0 to 10 value as text: 2.7, 6. */
export const v10 = (v: number | null | undefined) => (v == null ? 'not known' : num(v, 1));

export const TREND_WORD: Record<Trend['state'], string> = { up: 'Rising', down: 'Sliding', steady: 'Steady', early: 'Too early to tell' };

/** The felt against data paragraph for one section, in plain sentences. */
export function feltLine(sec: Section) {
  const head = sec.felt != null
    ? `You scored ${sec.name} ${num(sec.felt, 1)}${sec.feltDate ? ` on ${shortDay(sec.feltDate)}` : ''}.`
    : `${sec.name} isn't scored yet.`;
  const data = sec.measured != null ? `The data reads ${num(sec.measured, 1)}.` : 'No data from this part of your life yet.';
  const verdict = sec.agree === 'agree' ? 'Your score and the data roughly agree.'
    : sec.agree === 'higher' ? 'You rate it higher than the data shows.'
    : sec.agree === 'lower' ? 'The data reads higher than your score.'
    : sec.felt != null && sec.measured == null ? 'Only your score counts here for now.' : '';
  return { head, data, verdict };
}

/** "Held 3 of 4 times", "New this week", "Not checked yet". */
export function ruleSub(r: RuleSum, week?: string) {
  if (r.status === 'retired') return r.retired_at ? `Retired ${shortDay(r.retired_at.slice(0, 10))}` : 'Retired';
  if (r.of) return `Held ${r.held} of ${r.of} ${r.of === 1 ? 'time' : 'times'}`;
  if (week && r.born?.week === week) return 'New this week';
  return 'Not checked yet';
}

