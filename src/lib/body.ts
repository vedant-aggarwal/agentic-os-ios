import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { DEMO, demoBody } from './demo';
import { invalidate, useGet } from './mod';

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

const TODAY = '/mod/body/today';

/** "3 sets of 8 at 40 kg", "3 sets of 60 s". */
export function liftTarget(l: Lift): string {
  const t = l.target ?? {};
  const each = t.r ? `${t.r}${t.w ? ` at ${t.w} kg` : ''}` : t.t ? `${t.t} s` : '';
  if (!l.sets) return each;
  const sets = l.sets === 1 ? '1 set' : `${l.sets} sets`;
  return each ? `${sets} of ${each}` : sets;
}

/**
 * Today's body plan, food and water. Null until the module answers; stays null if it can't (Today still works).
 * It is the same cached read the Body and Mission pages use (src/lib/mod.ts), so a write on either side shows on
 * both: the Body page refetches everything under /mod/body/ after a write, and a glass added here does the same.
 */
export function useBody(on: boolean) {
  const read = useGet<BodyToday>(on && !DEMO ? TODAY : null);
  const [demo, setDemo] = useState<BodyToday | null>(() => (DEMO ? demoBody() : null));
  // a glass added here shows at once; it lasts until the read answers again (with it, or without it if it failed)
  const [glass, setGlass] = useState<{ base: BodyToday; water: number } | null>(null);
  const data = DEMO ? demo : read.data;
  const body = useMemo(() => (data && glass?.base === data ? { ...data, food: { ...data.food, water: glass.water } } : data), [data, glass]);
  const cur = useRef(body);
  useEffect(() => { cur.current = body; }, [body]);

  // fetch again now (pull to refresh, back in the app): the same as any write under /mod/body/ asks for
  const reload = useCallback(() => { if (!DEMO) invalidate(TODAY); }, []);
  useEffect(() => {
    if (!on) return;
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') reload(); });
    return () => sub.remove();
  }, [on, reload]);

  /** One more glass today: the reading the Body page's Diet and Nora's log_reading write. Returns an error to show. */
  const addWater = useCallback(async (): Promise<string | null> => {
    const b = cur.current;
    if (!b) return null;
    const value = b.food.water + 1;
    if (DEMO) { setDemo({ ...b, food: { ...b.food, water: value } }); return null; }
    const base = read.data;
    if (base) setGlass({ base, water: value });
    const id = `water:${b.today}`;
    const at = new Date().toISOString();
    try {
      await api(`/mod/body/readings/${id}`, { method: 'PUT', body: { id, kind: 'water', date: b.today, value, at, updated_at: at, source: 'phone' } });
      invalidate('/mod/body/'); // Today's own read and the Body page's Home and Diet
      return null;
    } catch (e) {
      setGlass(null);
      return (e as Error).message;
    }
  }, [read.data]);

  return { body, reload, addWater };
}
