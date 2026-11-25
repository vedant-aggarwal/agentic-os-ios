import { useMemo } from 'react';
import { ticksOn, type BodyCheck } from '@/capture/data';
import { MEAL_SLOT, type FrameId } from '@/capture/moments';
import { myDay } from '@/aspects/kit/time';
import { useCollection, type Doc } from '@/lib/mod';
import type { Task } from '@/lib/today';
import { DEFAULT_MORNING, DEFAULT_NIGHT, routineFlags, type CheckId, type FlagSrc, type RoutineDoc, type Workout } from './day';

// The week at a glance (Today pinched out): each day's ticks and tasks, done against planned, counted by the same
// rules as the day itself (routineFlags, lib/today's plan), from the records the ticks write. So a day's row here
// and that day's own page always agree.

type Session = Doc & { date: string; kind?: string };
type Entry = Doc & { date: string; text: string };
type Sit = Doc & { date: string };
type SoulDay = Doc & { pledge?: string | null };
type Reading = Doc & { value?: number };
type Meal = Doc & { date?: string; slot?: string };

export type DayTally = { day: string; done: number; total: number };

/** Done and planned for each of `days`. `tasks`: everything GET /today sends (his own top-level ones count);
 *  `waterTarget`: glasses a day; `todayHasBody`: today's gym counts (the body module answered). */
export function useWeekTally(days: string[], o: { tasks: Task[]; waterTarget: number; todayHasBody: boolean }): DayTally[] {
  const checks = useCollection<BodyCheck>('body', 'checks').items;
  const sessions = useCollection<Session>('mind', 'sessions').items;
  const journal = useCollection<Entry>('growth', 'journal').items;
  const sits = useCollection<Sit>('soul', 'sits').items;
  const soulDays = useCollection<SoulDay>('soul', 'days').items;
  const readings = useCollection<Reading>('body', 'readings').items;
  const meals = useCollection<Meal>('body', 'meals').items;
  const workouts = useCollection<Workout>('body', 'workouts').items;
  const settings = useCollection<RoutineDoc>('body', 'settings').items;
  const { tasks, waterTarget, todayHasBody } = o;

  return useMemo(() => {
    const saved = (settings ?? []).find((x) => x.id === 'today-routines');
    const routines = { morning: saved?.morning ?? DEFAULT_MORNING, night: saved?.night ?? DEFAULT_NIGHT };
    const mine = tasks.filter((x) => !x.parent && (x.owner == null || x.owner === 'me'));
    const src = { checks: checks ?? [], sessions: sessions ?? [], journal: journal ?? [], sits: sits ?? [] };
    const live = myDay();
    return days.map((day) => {
      const c = new Map(src.checks.filter((x) => x.date === day).map((x) => [x.item, x]));
      const isOn = (item: string) => !!c.get(item)?.done;
      const isSkipped = (item: string) => { const k = c.get(item); return !!k?.skipped && !k.done; };
      const nightAll = isOn('night-routine');
      const f: FlagSrc = {
        cap: {
          doneTicks: ticksOn(day, src, !!(soulDays ?? []).find((x) => x.id === day)?.pledge),
          wakeAt: isOn('wake') ? c.get('wake')?.time ?? 'logged' : null,
          water: (readings ?? []).find((r) => r.id === `water:${day}`)?.value ?? 0,
          waterTarget,
        },
        skipped: isSkipped,
        on: (id: CheckId) => !isSkipped(id) && ((id.startsWith('night-') && nightAll) || isOn(id)),
        routines,
        mealDone: (id: FrameId) => (meals ?? []).some((m) => m.date === day && m.slot === MEAL_SLOT[id]),
        practice: (k) => src.sessions.some((x) => x.id === `${k}-${day}`),
        gymDone: (workouts ?? []).some((w) => w.date === day && w.status === 'done'),
      };
      const flags = Object.values(routineFlags(f, day === live ? todayHasBody : true)).flat();
      // tasks as the day's plan counts them (lib/today): open ones due that day, and those done that day that had a date
      const open = mine.filter((x) => (x.status === 'todo' || x.status === 'doing') && x.due === day).length;
      const done = mine.filter((x) => x.status === 'done' && !!x.completedAt && x.due != null && myDay(x.completedAt) === day).length;
      return { day, done: flags.filter(Boolean).length + done, total: flags.length + open + done };
    });
  }, [days, tasks, waterTarget, todayHasBody, checks, sessions, journal, sits, soulDays, readings, meals, workouts, settings]);
}
