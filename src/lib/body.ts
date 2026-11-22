import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { DEMO, demoBody } from './demo';

// ── what the body module sends (GET /mod/body/today), the parts Today draws ──
export type Lift = {
  ex: string; name: string; sets: number | null;
  target: { w?: number | null; r?: number | null; t?: number | null } | null; note?: string;
};
export type BodyToday = {
  today: string;
  live: { id: string; name: string; sets: number } | null;
  trained: { id: string; name: string; sets: number; volume: number }[];
  next: { id: string; date: string; name: string; at: string | null; items: Lift[] } | null;
  week: { days: number; target: number; streak: number };
  food: { protein: number; protein_target: number; water: number; water_target: number };
};

/** "3 sets of 8 at 40 kg", "3 sets of 60 s". */
export function liftTarget(l: Lift): string {
  const t = l.target ?? {};
  const each = t.r ? `${t.r}${t.w ? ` at ${t.w} kg` : ''}` : t.t ? `${t.t} s` : '';
  if (!l.sets) return each;
  const sets = l.sets === 1 ? '1 set' : `${l.sets} sets`;
  return each ? `${sets} of ${each}` : sets;
}

/** Today's body plan, food and water. Null until the module answers; stays null if it can't (Today still works). */
export function useBody(on: boolean) {
  const [body, setBody] = useState<BodyToday | null>(null);
  const cur = useRef(body);
  const put = useCallback((b: BodyToday | null) => { cur.current = b; setBody(b); }, []);

  const load = useCallback(async () => {
    if (DEMO) { if (!cur.current) put(demoBody()); return; }
    try { put(await api<BodyToday>('/mod/body/today')); } catch { /* optional on Today */ }
  }, [put]);

  useEffect(() => {
    if (!on) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after its await
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [on, load]);

  /** One more glass today: the same reading Nora's log_reading writes. Optimistic; returns an error to show. */
  const addWater = useCallback(async (): Promise<string | null> => {
    const b = cur.current;
    if (!b) return null;
    const value = b.food.water + 1;
    put({ ...b, food: { ...b.food, water: value } });
    if (DEMO) return null;
    const id = `water:${b.today}`;
    try {
      await api(`/mod/body/readings/${id}`, { method: 'PUT', body: { id, kind: 'water', date: b.today, value, source: 'phone' } });
      return null;
    } catch (e) {
      const c = cur.current;
      if (c) put({ ...c, food: { ...c.food, water: Math.max(0, c.food.water - 1) } });
      return (e as Error).message;
    }
  }, [put]);

  return { body, reload: load, addWater };
}
