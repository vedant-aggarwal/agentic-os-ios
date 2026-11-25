import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Home } from '@/aspects/body/api';
import { api } from './api';
import { DEMO } from './demo';
import { call, invalidate, useGet } from './mod';

// ── what Today draws of the body: the gym card, water and protein ──
export type Lift = {
  ex: string; name: string; sets: number | null;
  target: { w?: number | null; r?: number | null; t?: number | null } | null; note?: string;
};
export type Plan = { id: string; date: string; name: string; at: string | null; items: Lift[] };
export type Trained = { id: string; name: string; sets: number; volume: number; minutes?: number | null; quick?: string | null };
export type BodyToday = {
  today: string;
  /** live: a session is running. done: he trained today (a quick log counts). planned: today's session waits. rest. */
  state: 'live' | 'done' | 'planned' | 'rest';
  live: { id: string; name: string; sets: number; items?: Lift[] } | null;
  trained: Trained[];
  /** Today's session when there is one (waiting, or still there after other training), else the next one. */
  next: Plan | null;
  /** The first session after today, once today is trained or a rest day. */
  upcoming: Plan | null;
  week: { days: number; target: number; streak: number };
  food: { protein: number; protein_target: number; water: number; water_target: number };
};

// The Body page's own Today read: Home's card and Body show one answer, from one cached request.
const HOME = '/mod/body/home';

function fromHome(h: Home): BodyToday {
  const g = h.gym;
  return {
    today: h.today, state: g.state, live: g.session, trained: g.trained,
    next: g.plan ?? g.next,
    upcoming: g.state !== 'planned' && g.next && g.next.date > h.today ? g.next : null,
    week: g.week,
    food: { protein: h.diet.protein, protein_target: h.diet.protein_target, water: h.diet.water, water_target: h.diet.water_target },
  };
}

/** "3 sets of 8 at 40 kg", "3 sets of 60 s". */
export function liftTarget(l: Lift): string {
  const t = l.target ?? {};
  const each = t.r ? `${t.r}${t.w ? ` at ${t.w} kg` : ''}` : t.t ? `${t.t} s` : '';
  if (!l.sets) return each;
  const sets = l.sets === 1 ? '1 set' : `${l.sets} sets`;
  return each ? `${sets} of ${each}` : sets;
}

/** What a session he did comes to: "45 min" for boxing or a walk, "12 sets" for lifting. */
export function trainedWords(t: Pick<Trained, 'sets' | 'minutes' | 'quick'>): string {
  if (t.quick && t.minutes) return `${t.minutes} min`;
  return `${t.sets} ${t.sets === 1 ? 'set' : 'sets'}`;
}

/** The week's streak in words, from two weeks: "3 weeks in a row". One week isn't a streak yet. */
export const streakWords = (n: number | null | undefined) => (n && n >= 2 ? `${n} weeks in a row` : null);

/** "today", "tomorrow", or the weekday for a day within the week ahead, else "on 12 Dec". */
export function dayAhead(day: string, today: string): string {
  const n = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  const d = new Date(`${day}T00:00:00Z`);
  if (n < 7) return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  return `on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

/**
 * Today's training, food and water. Null until the module answers; stays null if it can't (Today still works).
 * It is the Body page's own read (GET /mod/body/home, shared and cached in src/lib/mod.ts), so Home's gym card and
 * Body's Today and Train show the same state, sets, week and next session: a workout or a quick log on the Body page
 * refetches every read under /mod/body/, and a glass added here does the same.
 */
export function useBody(on: boolean) {
  const read = useGet<Home>(on ? HOME : null);
  // a glass added here shows at once; it lasts until the read answers again (with it, or without it if it failed)
  const [glass, setGlass] = useState<{ base: Home; water: number } | null>(null);
  const base = useMemo(() => (read.data ? fromHome(read.data) : null), [read.data]);
  const body = useMemo(() => (base && read.data && glass?.base === read.data ? { ...base, food: { ...base.food, water: glass.water } } : base), [base, read.data, glass]);
  const cur = useRef(body);
  useEffect(() => { cur.current = body; }, [body]);

  // fetch again now (pull to refresh, back in the app): the same as any write under /mod/body/ asks for
  const reload = useCallback(() => invalidate(HOME), []);
  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reload(); });
    return () => sub.remove();
  }, [on, reload]);

  // the sample preview (?demo): Body's sample records come with its page's code a moment after Today opens; ask
  // again until they are there
  const tries = useRef(0);
  const has = !!read.data;
  useEffect(() => {
    if (!DEMO || !on || has) return;
    const id = setInterval(() => { if (++tries.current > 30) clearInterval(id); else invalidate(HOME); }, 500);
    return () => clearInterval(id);
  }, [on, has]);

  /** One more glass today: the reading the Body page's Diet and Nora's log_reading write. Returns an error to show. */
  const addWater = useCallback(async (): Promise<string | null> => {
    const b = cur.current;
    if (!b) return null;
    const value = b.food.water + 1;
    const data = read.data;
    if (data) setGlass({ base: data, water: value });
    const id = `water:${b.today}`;
    const at = new Date().toISOString();
    const doc = { id, kind: 'water', date: b.today, value, at, updated_at: at, source: 'phone' };
    try {
      if (DEMO) await call(`/mod/body/readings/${id}`, doc, 'PUT');
      else await api(`/mod/body/readings/${id}`, { method: 'PUT', body: doc });
      invalidate('/mod/body/'); // this read and the Body page's Diet
      return null;
    } catch (e) {
      setGlass(null);
      return (e as Error).message;
    }
  }, [read.data]);

  return { body, reload, addWater };
}
