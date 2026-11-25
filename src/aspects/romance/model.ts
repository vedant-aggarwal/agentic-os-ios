import { addDays, dayOf, today } from '@/aspects/kit';
import type { Done, Follow, Moment, Person, Plan, SharedPlan } from './types';

// What the tabs work out from the records: where things stand with each person, the plans in date order, and which
// follow up or plan matters now. Pure functions of what the page already holds; nothing here is stored.

export type Entry = { person: Person; follow: Follow | null };

// ── a person ──
export type Stage = 'met' | 'messaged' | 'plan' | 'again';
export const STAGE: Record<Stage, string> = { met: 'Met', messaged: 'Messaged', plan: 'Plan made', again: 'Met again' };

/** How far it has gone, from what he logged: a plan he hasn't debriefed, one he has, a message, or only the meeting. */
export function stageOf(f: Follow | null): Stage {
  if (f?.plan && !f.plan.debrief) return 'plan';
  if (f?.plan?.debrief || f?.done?.some((d) => d.kind === 'plan')) return 'again';
  if (f?.done?.some((d) => /message/i.test(d.what)) || f?.next?.what === 'Wait for a reply') return 'messaged';
  return 'met';
}

/** The last day they were in touch: the day they met, a step he did, time together filed in People, a plan debriefed. */
export function lastContact(e: Entry, moments: Moment[] | null): string | null {
  const f = e.follow;
  const now = today();
  const days = [
    f?.met?.day, e.person.added, e.person.created_at ? dayOf(e.person.created_at) : null,
    ...(f?.done ?? []).map((d) => dayOf(d.at)),
    ...(moments ?? []).filter((m) => m.people?.includes(e.person.id)).map((m) => m.date),
    f?.plan?.debrief ? f.plan.date : null,
  ].filter((d): d is string => !!d && d <= now);
  return days.length ? days.reduce((a, b) => (b > a ? b : a)) : null;
}

/** Follow ups to do: a step due today or before, or one with no day that isn't waiting on them. */
export function dueNow(list: Entry[]) {
  const now = today();
  return list.filter((e) => !e.follow?.archived && e.follow?.next?.what
    && (e.follow.next.due ? e.follow.next.due <= now : e.follow.next.what !== 'Wait for a reply'));
}

/** The next step that matters: one due now, else the soonest one coming. Waiting on a reply is not a thing to do. */
export function nextUp(list: Entry[]): Entry | null {
  const due = dueNow(list);
  if (due.length) return due[0];
  return list.filter((e) => !e.follow?.archived && e.follow?.next?.due && e.follow.next.what !== 'Wait for a reply')
    .sort((a, b) => String(a.follow?.next?.due).localeCompare(String(b.follow?.next?.due)))[0] ?? null;
}

// ── plans ──
/** A plan to meet someone, from either place it can live: a person's Romance record, or People's plans. */
export type PlanItem = {
  key: string; kind: 'follow' | 'shared'; id: string;
  person: Person | null; names: string;
  title: string; date: string | null; steps: { text: string; done: boolean }[]; debrief: string | null;
};

const and = (names: string[]) => (names.length < 2 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function plansOf(list: Entry[], shared: SharedPlan[] | null): PlanItem[] {
  const out: PlanItem[] = [];
  const byId = new Map(list.map((e) => [e.person.id, e.person]));
  for (const e of list) {
    const p = e.follow?.plan;
    if (!p || e.follow?.archived) continue;
    out.push({ key: `f:${e.person.id}`, kind: 'follow', id: e.person.id, person: e.person, names: e.person.name, title: p.title, date: p.date ?? null, steps: p.steps ?? [], debrief: p.debrief ?? null });
  }
  for (const p of shared ?? []) {
    const who = (p.people ?? []).map((id) => byId.get(id)).filter((x): x is Person => !!x);
    if (!who.length || p.state === 'dropped') continue;
    if (p.state === 'done' && p.debrief) continue;
    out.push({ key: `p:${p.id}`, kind: 'shared', id: p.id, person: who[0], names: and(who.map((x) => x.name)), title: p.title, date: p.date ?? null, steps: [], debrief: p.debrief ?? null });
  }
  return out;
}

/** Plans still to come (and ones with no day yet), soonest first. */
export function upcoming(plans: PlanItem[]) {
  const now = today();
  return plans.filter((p) => !p.debrief && (!p.date || p.date >= now))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

/** Plans whose day has gone by with no debrief, newest first. `within` keeps only the last few days. */
export function afterPlans(plans: PlanItem[], within?: number) {
  const now = today();
  const since = within != null ? addDays(now, -within) : '0000';
  return plans.filter((p) => !p.debrief && p.date && p.date < now && p.date >= since)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * A new plan (or none) for someone. A plan that already happened and was debriefed moves into what he has done, so
 * the record keeps it and the last contact still counts it.
 */
export function withPlan(f: Follow | null, plan: Plan | null): { plan: Plan | null; done: Done[] } {
  const old = f?.plan;
  const done = f?.done ?? [];
  if (!old?.debrief) return { plan, done };
  return { plan, done: [...done, { what: old.title, at: new Date(`${old.date ?? today()}T12:00:00+05:30`).toISOString(), kind: 'plan' }] };
}
