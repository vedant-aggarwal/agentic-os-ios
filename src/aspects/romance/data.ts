import { useEffect, useMemo, useRef } from 'react';
import { addDays, dayOf, today, weekStart } from '@/aspects/kit';
import { collection, invalidate, useCollection, useGet } from '@/lib/mod';
import { rememberPrimer, useLocal } from './local';
import { plansOf } from './model';
import type { Debrief, Follow, IdeaRec, Moment, Outing, Person, Pref, Primer, SharedPlan } from './types';

// Romance's reads. Outings and debriefs are what the PC has with this phone's unsent writes laid over them, so a
// count made offline shows at once and stays after the app is closed.

// A debrief still in the outbox while the PC is away is marked `waiting`: it shows as saved on this phone, not as being
// read, and nothing polls the PC for it.
function useOverlay<T extends { id: string }>(coll: 'sessions' | 'debriefs', items: T[] | null, live: T | null = null): T[] | null {
  const { outbox, away } = useLocal();
  return useMemo(() => {
    const pending = outbox.filter((p) => p.coll === coll);
    if (items == null && !pending.length && !live) return null;
    const map = new Map<string, T>((items ?? []).map((x) => [x.id, x]));
    for (const p of pending) {
      if (p.kind === 'put') map.set(p.id, { ...(map.get(p.id) ?? {}), ...(p.doc as unknown as T), ...(coll === 'debriefs' && away ? { waiting: true } : {}) });
      else if (p.kind === 'del') map.delete(p.id);
      else map.set(p.id, { id: p.id, day: p.day, at: p.at, session: p.session, kind: 'voice', chips: null, status: 'saved', secs: p.secs, waiting: true } as unknown as T);
    }
    if (live) map.set(live.id, live);
    return [...map.values()];
  }, [items, outbox, away, coll, live]);
}

export function useOutings() {
  const c = useCollection<Outing>('romance', 'sessions');
  const { live } = useLocal();
  const items = useOverlay<Outing>('sessions', c.items, live);
  return { items, error: items == null ? c.error : null, busy: c.busy, refresh: c.refresh };
}

export function useDebriefs() {
  const c = useCollection<Debrief>('romance', 'debriefs');
  const items = useOverlay<Debrief>('debriefs', c.items);
  const sorted = useMemo(() => (items ? [...items].sort((a, b) => String(b.at).localeCompare(String(a.at))) : null), [items]);
  return { items: sorted, error: items == null ? c.error : null, pullError: c.error, busy: c.busy, refresh: c.refresh, put: c.put, remove: c.remove };
}

/** The primer from the PC, or the last one it sent when it can't be reached. */
export function usePrimer() {
  const g = useGet<Primer>('/mod/romance/primer');
  const { primer } = useLocal();
  useEffect(() => { if (g.data) rememberPrimer(g.data); }, [g.data]);
  // a debrief read in the background changes the thing to try, so ask again when a new reading lands
  const d = useCollection<Debrief>('romance', 'debriefs');
  const readAt = d.items?.reduce((m, x) => (x.review?.at && x.review.at > m ? x.review.at : m), '') ?? '';
  const seen = useRef('');
  useEffect(() => {
    if (readAt && seen.current && readAt !== seen.current) void g.refresh();
    seen.current = readAt;
  }, [readAt, g]);
  return { data: g.data ?? primer, error: g.data || primer ? null : g.error, busy: g.busy, refresh: g.refresh, stale: !g.data && !!primer };
}

export function usePrefs() {
  const c = useCollection<Pref>('romance', 'prefs');
  const by = (id: string) => c.items?.find((p) => p.id === id) ?? null;
  return { ...c, target: by('target')?.per_week ?? null, looking: by('looking')?.text ?? null };
}

/** People he is talking to: People rows with aspect romance, each with its Romance follow up record. */
export function usePeople() {
  const persons = useCollection<Person>('people', 'persons');
  const follow = useCollection<Follow>('romance', 'follow');
  const list = useMemo(() => {
    if (!persons.items) return null;
    const f = new Map((follow.items ?? []).map((x) => [x.id, x]));
    return persons.items.filter((p) => p.aspect === 'romance')
      .map((p) => ({ person: p, follow: f.get(p.id) ?? null }))
      .sort((a, b) => dueKey(a.follow).localeCompare(dueKey(b.follow)) || String(b.person.created_at).localeCompare(String(a.person.created_at)));
  }, [persons.items, follow.items]);
  return { list, error: list == null ? persons.error : follow.error, busy: persons.busy || follow.busy, persons, follow,
    refresh: () => Promise.all([persons.refresh(), follow.refresh()]).then(() => {}) };
}
const dueKey = (f: Follow | null) => (f?.next?.what ? f.next.due ?? '0000' : '9999');

// ── the week ──
export type Week = { start: string; days: { day: string; n: number }[]; count: number; lastWeek: number; total: number; todayN: number };
export function weekOf(outings: Outing[], day = today()): Week {
  const start = weekStart(day);
  const per = new Map<string, number>();
  let total = 0;
  for (const o of outings) for (const r of o.reps ?? []) { const d = dayOf(r.at); per.set(d, (per.get(d) ?? 0) + 1); total++; }
  const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(start, i); return { day: d, n: per.get(d) ?? 0 }; });
  const lastWeek = Array.from({ length: 7 }, (_, i) => per.get(addDays(start, i - 7)) ?? 0).reduce((a, b) => a + b, 0);
  return { start, days, count: days.reduce((a, b) => a + b.n, 0), lastWeek, total, todayN: per.get(day) ?? 0 };
}

/** The latest outing that ended in the last three days and has no debrief yet. */
export function undebriefed(outings: Outing[], debriefs: Debrief[]) {
  const since = addDays(today(), -3);
  const done = new Set(debriefs.map((d) => d.session).filter(Boolean));
  return outings.filter((o) => o.place !== 'logged' && o.end && o.day >= since && !done.has(o.id))
    .sort((a, b) => String(b.end).localeCompare(String(a.end)))[0] ?? null;
}

// ── everything the tabs read, together ──
/** Every read Romance makes, fetched again: pull to refresh, and coming back to the page. */
export function reloadAll() {
  invalidate('/mod/romance/');
  const all: [string, string][] = [['romance', 'sessions'], ['romance', 'debriefs'], ['romance', 'follow'], ['romance', 'prefs'],
    ['people', 'persons'], ['people', 'moments'], ['people', 'ideas'], ['people', 'plans']];
  for (const [m, c] of all) collection(m, c).refresh().catch(() => {});
}

/**
 * The page's records and what the tabs work out from them. People's moments (time together that Nora filed), ideas
 * and plans are shared with Family and Friends; Romance reads only its own people's.
 */
export function useRomance() {
  const outings = useOutings();
  const debriefs = useDebriefs();
  const people = usePeople();
  const prefs = usePrefs();
  const primer = usePrimer();
  const moments = useCollection<Moment>('people', 'moments');
  const ideas = useCollection<IdeaRec>('people', 'ideas');
  const shared = useCollection<SharedPlan>('people', 'plans');
  const { live } = useLocal();
  const list = people.list;
  const plans = useMemo(() => (list ? plansOf(list, shared.items) : null), [list, shared.items]);
  const week = useMemo(() => (outings.items ? weekOf(outings.items) : null), [outings.items]);
  const pending = outings.items && debriefs.items ? undebriefed(outings.items, debriefs.items) : null;
  const active = list?.filter((e) => !e.follow?.archived) ?? null;
  const archived = list?.filter((e) => e.follow?.archived) ?? [];
  const mine = ideas.items?.filter((i) => i.aspect === 'romance') ?? null;
  return { outings, debriefs, people, prefs, primer, moments, ideas, shared, live, list, active, archived, plans, week, pending, mine };
}
export type Romance = ReturnType<typeof useRomance>;
