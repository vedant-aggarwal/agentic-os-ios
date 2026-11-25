import { useMemo } from 'react';
import { useCapture, type BodyCheck } from '@/capture/data';
import type { FrameId, TickId } from '@/capture/moments';
import { DEMO } from '@/lib/demo';
import { useCollection, type Doc } from '@/lib/mod';
import type { BodyToday } from '@/lib/body';
import type { Area, AspectProgress, LifePayload, Task, TodayPayload } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey } from '@/theme';
import { today as calendarDay, myDay } from '@/aspects/kit/time';

// Today's routine as data: what each section holds, what is done, and the writes. The quick capture panel's items
// read and write through capture/data.ts, so a tick in one place shows in the other. Routine rows the panel doesn't
// have (cold shower, skincare, night routine, the parent rows) are body checks `<day>:<item>` in the same
// collection the panel writes; the two practice rows in Mind are mind sessions, like the games. A row cancelled for
// today (held, or its tick tapped twice) is its body check written not done and `skipped`: it shows struck through
// and the day's counts pass over it; tomorrow's row is a new check, so it comes back by itself.

export const IST = 5.5 * 3600_000;

export type CheckId =
  | 'cold-shower' | 'ice-face' | 'skincare-am' | 'gua-sha' | 'squint' | 'voice'
  | 'night-room' | 'night-teeth' | 'night-skin'
  | 'mission-norrita' | 'money-channels' | 'money-social' | 'money-brand' | 'growth-cc'
  | 'leave-washroom' | 'leave-late'
  | `am-${string}` | `night-${string}`; // steps he added in edit mode

export type RoutineItem = { id: CheckId; title: string; sub?: string };
export const DEFAULT_MORNING: RoutineItem[] = [
  { id: 'cold-shower', title: 'Cold shower' },
  { id: 'ice-face', title: 'Ice-block face massage' },
  { id: 'skincare-am', title: 'Skincare', sub: 'Toner, serum, face cream, lip balm, sunscreen' },
  { id: 'gua-sha', title: 'Facial lymphatic drainage', sub: 'Gua sha' },
  { id: 'squint', title: 'Squint hold', sub: 'Eyes shut 5 s, 10 times' },
];
export const DEFAULT_NIGHT: RoutineItem[] = [
  { id: 'night-room', title: 'Clean my room' }, { id: 'night-teeth', title: 'Brush teeth' }, { id: 'night-skin', title: 'Skincare' },
];
export type Routines = { morning: RoutineItem[]; night: RoutineItem[] };
export type RoutineDoc = Doc & Partial<Routines>;

type Session = Doc & { date?: string; kind?: string; title?: string; source?: string };
/** A workout in the body module (a quick log is one too, done at once): the gym row for a day other than today. */
export type Workout = Doc & { date?: string; status?: string };

export const MEALS: { id: FrameId; title: string; plan: string; slot: string }[] = [
  { id: 'breakfast', title: 'Breakfast', plan: 'Protein oats, fruit and milk', slot: 'breakfast' },
  { id: 'salad', title: 'Salad', plan: 'A bowl of salad', slot: 'salad' },
  { id: 'lunch', title: 'Lunch', plan: 'Paneer', slot: 'lunch' },
  { id: 'snack', title: 'Evening snack', plan: 'Something high protein', slot: 'evening_snack' },
  { id: 'dinner', title: 'Dinner', plan: 'Light and high protein', slot: 'dinner' },
];

/** `o.today` is the day's payload (lib/today `payloadFor`): its `date` is the day on screen, and every routine write
 *  lands on that day. `o.body` is today's body read; another day's gym comes from the day's workouts. */
export function useDay(o: { today: TodayPayload | null; life: LifePayload | null; areas: Area[]; body: BodyToday | null }) {
  const cap = useCapture(o.today?.date);
  const live = cap.live;
  const checks = useCollection<BodyCheck>('body', 'checks');
  const sessions = useCollection<Session>('mind', 'sessions');
  const workouts = useCollection<Workout>('body', 'workouts');
  // his routine steps, edited from Today (hold the Body head); body settings doc `today-routines`
  const settings = useCollection<RoutineDoc>('body', 'settings');
  const savedRoutines = settings.items?.find((x) => x.id === 'today-routines');
  const routines: Routines = { morning: savedRoutines?.morning ?? DEFAULT_MORNING, night: savedRoutines?.night ?? DEFAULT_NIGHT };
  const saveRoutines = (r: Routines) => settings.put({ id: 'today-routines', ...r } as never);
  const day = cap.day;

  const checked = useMemo(() => {
    const m = new Map<string, BodyCheck>();
    for (const c of checks.items ?? []) if (c.date === day) m.set(c.item, c);
    return m;
  }, [checks.items, day]);
  const isOn = (item: string) => !!checked.get(item)?.done;
  const isSkipped = (item: string) => { const c = checked.get(item); return !!c?.skipped && !c.done; };
  const mode = (item: string) => (checked.get(item) as (BodyCheck & { mode?: string }) | undefined)?.mode ?? null;

  const nightAll = isOn('night-routine');
  const on = (id: CheckId) => !isSkipped(id) && ((id.startsWith('night-') && nightAll) || isOn(id));

  async function set(id: CheckId, v: boolean, extra: Record<string, unknown> = {}) {
    if (DEMO) return;
    await checks.put({ id: `${day}:${id}`, date: day, item: id, done: v, at: new Date().toISOString(), by: 'me', source: 'today', ...extra } as never);
    // the panel's single Night tick stands for all three rows: the third row ticked writes it, an untick clears it
    if (id.startsWith('night-')) {
      const nightIds = routines.night.map((x) => x.id);
      const rest = nightIds.filter((x) => x !== id).every((x) => isOn(x) || isSkipped(x));
      if (v && rest && !nightAll) await cap.toggle('night', true);
      if (!v && nightAll) {
        await cap.toggle('night', false);
        // keep the other two as they were before the untick
        for (const x of nightIds) {
          if (x !== id && !isOn(x) && !isSkipped(x)) await checks.put({ id: `${day}:${x}`, date: day, item: x, done: true, at: new Date().toISOString(), by: 'me', source: 'today' } as never);
        }
      }
    }
  }
  const toggle = (id: CheckId) => set(id, !on(id), id === 'cold-shower' ? { mode: mode('cold-shower') ?? 'cold' } : {});
  /** Cancel a routine row for today, or bring it back (`v` false). Works in the sample preview too (its checks live
   *  in memory). */
  async function skip(id: SkipId, v: boolean) {
    // bringing back a night row while the panel's Night tick stands for all three: that tick clears, the others stay done
    if (!v && !DEMO && id.startsWith('night-') && nightAll) return set(id as CheckId, false, { skipped: false });
    await checks.put({ id: `${day}:${id}`, date: day, item: id, done: false, skipped: v, at: new Date().toISOString(), by: 'me', source: 'today' } as never);
  }
  const setShower = (m: 'cold' | 'hot') => set('cold-shower', on('cold-shower'), { mode: m });

  const practice = (k: 'speak' | 'course') => (sessions.items ?? []).some((x) => x.id === `${k}-${day}`);
  async function togglePractice(k: 'speak' | 'course') {
    if (DEMO) return;
    const id = `${k}-${day}`;
    if (practice(k)) await sessions.remove(id);
    else await sessions.put({ id, kind: k, date: day, title: k === 'speak' ? 'Impromptu speaking' : 'Communication course', source: 'today' } as never);
  }
  /** Cancel a practice row for today (a session already logged goes), or bring it back. */
  async function skipPractice(k: 'speak' | 'course', v: boolean) {
    if (v && practice(k) && !DEMO) await sessions.remove(`${k}-${day}`);
    await skip(`practice-${k}`, v);
  }

  // ── his tasks, by the aspect their area maps to ──
  const tasks = useMemo(() => {
    const t = o.today;
    if (!t || !o.life) return { by: new Map<AspectKey | 'none', Task[]>(), dueToday: [] as Task[] };
    const aspectOf = (area: string | null): AspectKey | null => (area ? o.life!.areaAspects[area]?.[0] ?? null : null);
    const mine = t.tasks.filter((x) => !x.parent && (x.owner == null || x.owner === 'me'));
    // what he cancelled on Today today (useToday folds GET /today's `cancelled` in) stays, struck through, until the day
    // ends; another day leaves it out. A task done counts for his day (rolls at 04:00): ticked at 01:30, the evening's.
    const shown = mine.filter((x) => x.status === 'todo' || x.status === 'doing' || (x.status === 'dropped' && live)
      || (x.status === 'done' && !!x.completedAt && myDay(x.completedAt) === t.date && x.due === t.date));
    const by = new Map<AspectKey | 'none', Task[]>();
    for (const x of shown) {
      if (x.due && x.due > t.date) continue; // a later day's task waits on Home
      const k = aspectOf(x.area) ?? 'none';
      (by.get(k) ?? by.set(k, []).get(k)!).push(x);
    }
    const shut = (x: Task) => Number(x.status === 'done' || x.status === 'dropped');
    const order = (a: Task, b: Task) => shut(a) - shut(b)
      || Number(!a.due) - Number(!b.due) || String(a.due ?? '').localeCompare(String(b.due ?? ''));
    for (const list of by.values()) list.sort(order);
    return { by, dueToday: shown.filter((x) => x.due === t.date && x.status !== 'dropped') };
  }, [o.today, o.life, live]);
  const areaName = useMemo(() => new Map(o.areas.map((a) => [a.slug, a.name])), [o.areas]);

  const mealDone = (id: FrameId) => cap.frames[id]?.status === 'logged';
  // today: the body module's answer (a quick log counts); another day: a workout finished that day
  const gymDone = live ? !!o.body && o.body.trained.length > 0 : (workouts.items ?? []).some((w) => w.date === day && w.status === 'done');
  // the gym counts toward the day once the body module answers; another day's always does
  const gymCounted = live ? !!o.body : true;

  return {
    // `day`: the day on screen, his day (rolls at 04:00), which every routine tick lands on; `taskDay`: the day its
    // tasks are due by (the same day: Today's payload for it). `live`: the day is today.
    cap, day, live, taskDay: o.today?.date ?? calendarDay(), on, mode, toggle, setShower, routines, saveRoutines, practice, togglePractice, tasks, areaName, mealDone, gymDone, gymCounted,
    skipped: isSkipped, skip, skipPractice,
    color: ASPECT_COLOR,
  };
}

export type Day = ReturnType<typeof useDay>;
/** A body check Today can cancel for the day: a routine row's own, or the practice rows' and the book's stand-ins. */
export type SkipId = CheckId | 'practice-speak' | 'practice-course' | 'book';

/** What routineFlags reads of a day: `Day` for the day on screen, or the same shape built from the collections for
 *  any day of the week (today2/tally.ts). */
export type FlagSrc = {
  cap: { doneTicks: Set<TickId>; wakeAt: string | null; water: number; waterTarget: number };
  skipped: (item: string) => boolean;
  on: (id: CheckId) => boolean;
  routines: Routines;
  mealDone: (id: FrameId) => boolean;
  practice: (k: 'speak' | 'course') => boolean;
  gymDone: boolean;
};

/** Every routine tick on Today, by the part of the plan it sits in. The section rings count these, and so do the
 *  hero's crystals, so a tick anywhere on Today fills both. A row cancelled for today is left out. Tasks are counted
 *  apart (Plan's dueOf, lib/today's reach). */
export function routineFlags(d: FlagSrc, hasBody: boolean) {
  const tk = d.cap.doneTicks, woke = !!d.cap.wakeAt, drink = tk.has('drink');
  const keep = (item: string, v: boolean) => (d.skipped(item) ? [] : [v]);
  const ons = (ids: CheckId[]) => ids.flatMap((id) => keep(id, d.on(id)));
  return {
    core: [tk.has('journal'), tk.has('clean'), tk.has('meditate')],
    // the wake-up drink shows once he is up (or already ticked); the gym only when the body module answers
    body: [woke, ...(woke || drink ? keep('wake-drink', drink) : []), ...(hasBody ? [d.gymDone] : []), ...ons(d.routines.morning.map((m) => m.id)),
      ...ons(['voice']), ...ons(d.routines.night.map((n) => n.id))],
    diet: [d.cap.water >= d.cap.waterTarget, ...keep('no-sugar', tk.has('nosugar')), ...MEALS.map((m) => d.mealDone(m.id))],
    // the brain game: any one of chess, sudoku and maths keeps it; the other two are extras that count for nothing
    mind: [tk.has('chess') || tk.has('sudoku') || tk.has('matiks'), ...keep('practice-speak', d.practice('speak')),
      ...keep('practice-course', d.practice('course')), ...keep('book', tk.has('book'))],
    mission: ons(['mission-norrita']),
    money: ons(['money-channels', 'money-social', 'money-brand']),
    growth: ons(['growth-cc']),
    leave: [d.on('leave-washroom'), d.on('leave-late')],
  };
}
export type RoutineFlags = ReturnType<typeof routineFlags>;

/** The routine part of each aspect's crystal: Core habits and Habits to leave are Soul's, Diet is Body's. */
export function routineReach(f: RoutineFlags): AspectProgress {
  const p = (...lists: boolean[][]) => { const all = lists.flat(); return { done: all.filter(Boolean).length, total: all.length }; };
  return {
    soul: p(f.core, f.leave), body: p(f.body, f.diet), mind: p(f.mind),
    mission: p(f.mission), money: p(f.money), growth: p(f.growth),
  };
}

/** Two progress maps added aspect by aspect (today's tasks plus today's routine). */
export function addReach(a: AspectProgress, b: AspectProgress | null): AspectProgress {
  if (!b) return a;
  const out: AspectProgress = { ...a };
  for (const k of Object.keys(b) as AspectKey[]) {
    const x = a[k], y = b[k]!;
    out[k] = { done: (x?.done ?? 0) + y.done, total: (x?.total ?? 0) + y.total };
  }
  return out;
}

/** done / total for a list of booleans plus the tasks due today in that place (one cancelled today counts for neither). */
export function count(flags: boolean[], due: Task[] = []) {
  const dueN = due.filter((x) => x.due && x.status !== 'dropped');
  return { done: flags.filter(Boolean).length + dueN.filter((x) => x.status === 'done').length, total: flags.length + dueN.length };
}
