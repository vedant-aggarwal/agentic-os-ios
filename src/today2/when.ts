import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { addDays, DAY_ROLLS_AT, daysBetween, myDay, shortDay, weekday, weekStart } from '@/aspects/kit/time';
import { DEMO } from '@/lib/demo';
import { useGet } from '@/lib/mod';
import type { CalEvent, TodayPayload } from '@/lib/today';

// The day Today is on. His day rolls at 04:00 (`myDay`, as capture, mood and the routines count it), so at 01:30
// Today still shows the evening before and every tick lands there. Swiping or picking another day moves the whole
// page to it: its plan, its ticks and its writes.

const IST = 5.5 * 3600_000;
const DAY = 24 * 3600_000;

/** His day now (rolls at 04:00), kept current: it turns over at 04:00 and is checked again each time the app comes
 *  back to the front. */
export function useMyDay() {
  const [day, setDay] = useState(myDay);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (timer) clearTimeout(timer);
      const into = (((Date.now() + IST - DAY_ROLLS_AT * 3600_000) % DAY) + DAY) % DAY;
      timer = setTimeout(() => { setDay(myDay()); arm(); }, DAY - into + 500);
    };
    arm();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { setDay(myDay()); arm(); } });
    return () => { if (timer) clearTimeout(timer); sub.remove(); };
  }, []);
  return day;
}

/** "Today", "Yesterday", "Tomorrow", else "Mon 23 Nov": counted from his day, not the calendar's. */
export function dayWord(day: string, live: string) {
  const n = daysBetween(live, day);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return `${WD[weekday(day)]} ${shortDay(day)}`;
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Wednesday 25 Nov". */
export const longDay = (day: string) => `${WD_LONG[weekday(day)]} ${shortDay(day)}`;

/** The time a tick on an earlier day is stamped with: that evening, so it counts for that day on every page. */
export const stampOn = (day: string) => new Date(`${day}T21:00:00+05:30`).toISOString();

/** The calendar's blocks for the week around `day` (GET /days), for a day other than the server's today. */
export function useWeekEvents(day: string, serverDay: string | null) {
  const from = weekStart(day);
  const read = useGet<{ days: { date: string; events: CalEvent[] }[] }>(DEMO || !serverDay || day === serverDay ? null : `/days?from=${from}&n=7`);
  return read.data?.days.find((d) => d.date === day)?.events ?? null;
}

/** GET /today's payload as `day`'s: the same tasks, that day's blocks. What was cancelled on Today belongs to the
 *  server's today, so another day leaves it out. */
export function payloadFor(t: TodayPayload, day: string, events: CalEvent[] | null): TodayPayload {
  if (day === t.date) return t;
  return { ...t, date: day, events: events ?? [], cancelled: [] };
}

/** The seven days (Monday first) of the week holding `day`. */
export const weekOf = (day: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i));
