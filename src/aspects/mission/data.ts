import { useEffect, useRef } from 'react';
import { addDays, daysBetween, num, rupees, shortDay, today, weekStart } from '@/aspects/kit';
import { ApiError, call, invalidate, useGet } from '@/lib/mod';
import type { AspectKey } from '@/theme';
import type { Goal, GoalRef, Horizon, Outcome, Reading } from './types';

export const M = '/mod/mission';
export const HOME = `${M}/home`;
export const refresh = () => invalidate(`${M}/`);

/** Send a write, then reload every Mission view. A refusal comes back as the PC worded it. */
export async function act<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await call<T>(`${M}${path}`, body);
  refresh();
  return r;
}
/**
 * A 409 means the horizon is full. The client keeps only the message, so the page asks the PC again for what fills
 * that period (a GET path for `useGet`), then asks which one the new goal replaces.
 */
export function slotsPath(e: unknown, horizon: Horizon, start: string | null): string | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  return `${M}/slots?horizon=${horizon}${start ? `&start=${start}` : ''}`;
}
/** The first day of the period after the one `day` is in: where a goal goes when he would rather keep it for later. */
export function nextStart(h: Horizon, day: string): string {
  const [y, m] = day.split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h === 'week') return addDays(weekStart(day), 7);
  if (h === 'month') return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  if (h === 'quarter') { const q = Math.floor((m - 1) / 3) + 1; return q === 4 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 1)}-01`; }
  return `${y + 1}-01-01`;
}
export const message = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

// ── words ───────────────────────────────────────────────────────────────────────────────────────────────────
export const ASPECT_LABEL: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth', family: 'Family', romance: 'Romance', friends: 'Friends',
};
export const ASPECT_KEYS = Object.keys(ASPECT_LABEL) as AspectKey[];
export const HORIZON_NOW: Record<Horizon, string> = { week: 'This week', month: 'This month', quarter: 'This quarter', year: 'This year', decade: 'This decade', life: 'Life' };
export const HORIZON_GOAL: Record<Horizon, string> = { week: 'Week goal', month: 'Month goal', quarter: 'Quarter goal', year: 'Year goal', decade: 'Decade goal', life: 'Life goal' };
export const OUTCOME_WORD: Record<Outcome, string> = { done: 'Done', missed: 'Missed', carried: 'Carried forward', dropped: 'Let go' };
export const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const count = (n: number, one: string, many = `${one}s`) => `${n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : n} ${n === 1 ? one : many}`;
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "Ended 35 days ago", "Ended yesterday". */
export function endedAgo(end: string | null) {
  if (!end) return null;
  const d = daysBetween(end, today());
  return d <= 0 ? null : d === 1 ? 'Ended yesterday' : `Ended ${d} days ago`;
}
export function daysLeftLabel(end: string) {
  const d = daysBetween(today(), end);
  return d <= 0 ? 'Last day' : d === 1 ? 'One day left' : `${count(d, 'day')} left`;
}
/** When a reading was true: "today", "yesterday", "on 18 Jul". */
export const when = (day: string) => {
  const d = daysBetween(day, today());
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `on ${shortDay(day)}`;
};

// ── where a goal's number comes from ─────────────────────────────────────────────────────────────────────────
type MoneySummary = { date: string; income: { earned: number; goal: number; month: number } };
type Fund = { id: string; name: string; target?: number | null; saved?: number; balance?: number; in?: number; goal?: string | null; deleted_at?: string | null };
type BodyToday = { weight: { now: number | null; date: string | null; goal: { goal: number; by: string } | null } | null };
export type Sources = { money: MoneySummary | null; funds: Fund[] | null; body: BodyToday | null; error: string | null };

export const fundIn = (f: Fund) => (typeof f.saved === 'number' ? f.saved : typeof f.balance === 'number' ? f.balance : typeof f.in === 'number' ? f.in : null);

/** Reads Money and Body only when a goal is measured by them. */
export function useSources(goals: Goal[]): Sources {
  const kinds = new Set(goals.map((g) => g.source.kind));
  const money = useGet<MoneySummary>(kinds.has('income') ? '/mod/money/summary' : null);
  const funds = useGet<{ items: Fund[] }>(kinds.has('jar') ? '/mod/money/funds' : null);
  const body = useGet<BodyToday>(kinds.has('weight') ? '/mod/body/today' : null);
  return { money: money.data, funds: funds.data?.items?.filter((f) => !f.deleted_at) ?? null, body: body.data, error: money.error ?? funds.error ?? body.error };
}

/** The number a goal shows, read live from where it lives; null until that place answers. */
export function liveReading(g: Goal, s: Sources): Omit<Reading, 'at' | 'pct'> | null {
  const k = g.source.kind;
  if (k === 'income' && s.money) return { value: s.money.income.earned, of: g.source.target ?? s.money.income.goal ?? null, from: 0, unit: 'rupees', date: s.money.date };
  if (k === 'jar' && s.funds) {
    const f = s.funds.find((x) => x.id === g.source.jar);
    const v = f ? fundIn(f) : null;
    return f && v != null ? { value: v, of: g.source.target ?? f.target ?? null, from: 0, unit: 'rupees', date: today() } : null;
  }
  if (k === 'weight' && s.body?.weight?.now != null && s.body.weight.date)
    return { value: s.body.weight.now, of: g.source.target ?? s.body.weight.goal?.goal ?? null, from: g.source.from ?? s.body.weight.now, unit: 'kg', date: s.body.weight.date };
  return null;
}

/** Keeps the server's dated reading in step with the live number, so the history and Growth see real progress. */
export function useReadingSync(goals: Goal[], s: Sources) {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    for (const g of goals) {
      if (g.status !== 'active') continue;
      const r = liveReading(g, s);
      if (!r) continue;
      const old = g.source.reading;
      const key = `${g.id}:${r.value}:${r.of}:${r.date}`;
      if (sent.current.has(key) || (old && old.value === r.value && old.of === r.of && old.date === r.date)) continue;
      sent.current.add(key);
      void call(`${M}/measure/${g.id}`, { value: r.value, of: r.of, from: r.from, unit: r.unit, date: r.date }).then(refresh).catch(() => {});
    }
  }, [goals, s]);
}

export const fmt = (v: number, unit: string | null | undefined) => (unit === 'rupees' ? rupees(v) : unit === 'kg' ? `${num(v)} kg` : num(v));

/** What a goal's progress line says under its bar. */
export function sourceLine(g: Goal, s: Sources): string {
  const k = g.source.kind;
  const live = liveReading(g, s);
  const r = live ?? g.source.reading ?? null;
  if (k === 'income') return r ? `${fmt(r.value, 'rupees')} of ${r.of != null ? fmt(r.of, 'rupees') : 'no target'} earned this month, from Money` : 'Income this month, from Money';
  if (k === 'jar') return r ? `${fmt(r.value, 'rupees')} in the jar${r.of != null ? ` of ${fmt(r.of, 'rupees')}` : ''}, from Money` : 'A savings jar, from Money';
  if (k === 'weight') return r ? `${fmt(r.value, 'kg')} ${when(r.date)}${r.of != null ? `, aiming for ${fmt(r.of, 'kg')}` : ''}` : 'Weight, from Body';
  if (k === 'manual') return 'Set by hand';
  if (k === 'goals') return `From ${count(g.children, 'goal')} under it`;
  if (k === 'tasks') return `${g.tasks.done} of ${g.tasks.done + g.tasks.open} tasks done`;
  if (k === 'milestones') return `${g.milestones.done} of ${g.milestones.total} milestones`;
  return 'No number yet';
}
/** 0..1 for the bar: the live reading when there is one, else what the server holds. */
export function progressOf(g: Goal, s: Sources) {
  const r = liveReading(g, s);
  if (r && r.of != null) {
    const base = r.from ?? 0;
    if (r.of === base) return r.value === r.of ? 1 : 0;
    return Math.max(0, Math.min(1, (r.value - base) / (r.of - base)));
  }
  return g.status === 'done' ? 1 : g.progress / 100;
}
export const hasNumber = (g: Goal) => g.source.kind !== 'none';

export const refLabel = (r: GoalRef | null) => (r ? r.title : null);

// ── Growth's weekly review, as Mission reads it (GET /mod/growth/handoff) ─────────────────────────────────────
export type HandoffMove = { id: string; text: string; aspect: AspectKey | null; serves: string | null; carry: string | null; state: 'offered' | 'accepted' | 'declined'; goal: string | null };
export type Handoff = {
  reviewed: string | null; sealed_at: string | null;
  closed: { goal: string; verdict: 'done' | 'partly' | 'missed'; carry: boolean }[];
  moves: { week: string | null; items: HandoffMove[] };
};
export const HANDOFF = '/mod/growth/handoff';
export const WHY_MISSED = ['No time', 'Too big', 'Lost interest', 'Plans changed'];
export const WHY_SWITCH = ['A deadline moved', 'The other is done enough', 'Money needs it', 'Lost energy for it'];
