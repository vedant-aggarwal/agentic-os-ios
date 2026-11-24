import { newId, type Doc } from '@/lib/mod';
import { myDay } from '@/aspects/kit';
import type { FullSession, Prev, SessionItem, SetRow, Target } from '../api';

// The live workout record the phone writes into the body module's `workouts` collection. The PC reads the same
// record for recovery, records and the next plan, so its shape is the module's: items of sets.

export type WItem = { ex: string; name: string; kind: SessionItem['kind']; equip?: string; step?: number; note?: string; target?: Target; sets: SetRow[] };
export type WorkoutDoc = Doc & {
  date: string; status: 'planned' | 'live' | 'done' | 'skipped'; name: string; split?: string | null; why?: string; reasons?: string[]; plan_by?: string;
  started_at?: string | null; ended_at?: string | null; items: WItem[]; source?: string; rest?: number;
};

const blank = (): SetRow => ({ w: null, r: null, t: null, min: null, km: null, done: false, at: null });

/** One set's starting values: what the plan set, else what was done last time, else a sensible default. */
export function startSet(kind: SessionItem['kind'], i: number, cur: Partial<SetRow> | undefined, prev: Partial<SetRow>[] | undefined, target: Target): SetRow {
  const p = prev?.[i] ?? prev?.at(-1);
  const tg = target ?? {};
  const s = blank();
  if (kind === 'weight') { s.w = cur?.w ?? p?.w ?? tg.w ?? null; s.r = cur?.r ?? tg.r ?? p?.r ?? 10; }
  else if (kind === 'bw') s.r = cur?.r ?? tg.r ?? p?.r ?? 10;
  else if (kind === 'time') s.t = cur?.t ?? tg.t ?? p?.t ?? 30;
  else { s.min = cur?.min ?? tg.min ?? p?.min ?? 20; s.km = cur?.km ?? p?.km ?? null; }
  return s;
}

/** Today's session as a live record, every set prefilled. */
export function liveFrom(session: FullSession, existing: WorkoutDoc | null): WorkoutDoc {
  return {
    ...(existing ?? {}),
    id: existing?.id ?? newId('w'), date: myDay(), status: 'live', name: session.name, split: session.split, why: session.why, reasons: session.reasons, plan_by: session.plan_by,
    started_at: new Date().toISOString(), ended_at: null, source: 'app',
    items: session.items.map((it) => {
      const n = Math.max(1, it.sets.length || 3);
      return { ex: it.ex, name: it.name, kind: it.kind, equip: it.equip, step: it.step, note: it.note, target: it.target,
        sets: Array.from({ length: n }, (_, i) => startSet(it.kind, i, it.sets[i], it.prev?.sets, it.target)) };
    }),
  };
}

/** A new exercise for the live record, from the module's /prev answer (last time and the next target). */
export function itemFrom(p: Prev, count = 3): WItem {
  return { ex: p.ex, name: p.name, kind: p.kind, equip: p.equip, step: p.step, note: p.note, target: p.target,
    sets: Array.from({ length: count }, (_, i) => startSet(p.kind, i, undefined, p.prev?.sets, p.target)) };
}

/** An empty session to start from nothing (no plan today). */
export const emptyLive = (): WorkoutDoc => ({ id: newId('w'), date: myDay(), status: 'live', name: 'Workout', items: [], started_at: new Date().toISOString(), source: 'app' });

/** The value line of a set: "40 kg × 8", "60 s", "25 min". */
export function setText(kind: SessionItem['kind'], x: Partial<SetRow>) {
  if (kind === 'weight') return `${x.w != null ? `${x.w} kg` : 'Pick a weight'} × ${x.r ?? 0}`;
  if (kind === 'bw') return `${x.r ?? 0} reps`;
  if (kind === 'time') return `${x.t ?? 0} s`;
  return `${x.min ?? 0} min${x.km ? `, ${x.km} km` : ''}`;
}

/** Seconds of rest after a set: longer after heavy compound work. */
export function restFor(item: WItem) {
  if (item.kind === 'cardio') return 0;
  if (item.kind === 'time') return 60;
  return (item.step ?? 2.5) >= 5 ? 150 : 90;
}

export const doneSets = (w: WorkoutDoc | null | undefined) => (w?.items ?? []).reduce((n, it) => n + it.sets.filter((x) => x.done).length, 0);
export const allSets = (w: WorkoutDoc | null | undefined) => (w?.items ?? []).reduce((n, it) => n + it.sets.length, 0);
export const volumeOf = (w: WorkoutDoc | null | undefined) =>
  Math.round((w?.items ?? []).reduce((v, it) => v + (it.kind === 'weight' ? it.sets.filter((x) => x.done).reduce((a, x) => a + (x.w ?? 0) * (x.r ?? 0), 0) : 0), 0));
