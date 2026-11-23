import { useMemo } from 'react';
import { useCapture, type BodyCheck } from '@/capture/data';
import type { FrameId } from '@/capture/moments';
import { DEMO } from '@/lib/demo';
import { useCollection, type Doc } from '@/lib/mod';
import type { BodyToday } from '@/lib/body';
import type { Area, LifePayload, Task, TodayPayload } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey } from '@/theme';

// Today's routine as data: what each section holds, what is done, and the writes. The quick capture panel's items
// read and write through capture/data.ts, so a tick in one place shows in the other. Routine rows the panel doesn't
// have (cold shower, skincare, night routine, the parent rows) are body checks `<day>:<item>` in the same
// collection the panel writes; the two practice rows in Mind are mind sessions, like the games.

export const IST = 5.5 * 3600_000;
const istDay = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);

export type CheckId =
  | 'cold-shower' | 'ice-face' | 'skincare-am' | 'gua-sha' | 'squint' | 'voice'
  | 'night-room' | 'night-teeth' | 'night-skin'
  | 'mission-norrita' | 'money-channels' | 'money-social' | 'money-brand' | 'growth-cc'
  | 'leave-washroom' | 'leave-late';

type Session = Doc & { date?: string; kind?: string; title?: string; source?: string };

export const MEALS: { id: FrameId; title: string; plan: string; slot: string }[] = [
  { id: 'breakfast', title: 'Breakfast', plan: 'Protein oats, fruit and milk', slot: 'breakfast' },
  { id: 'salad', title: 'Salad', plan: 'A bowl of salad', slot: 'salad' },
  { id: 'lunch', title: 'Lunch', plan: 'Paneer', slot: 'lunch' },
  { id: 'snack', title: 'Evening snack', plan: 'Something high protein', slot: 'evening_snack' },
  { id: 'dinner', title: 'Dinner', plan: 'Light and high protein', slot: 'dinner' },
];

export function useDay(o: { today: TodayPayload | null; life: LifePayload | null; areas: Area[]; body: BodyToday | null }) {
  const cap = useCapture();
  const checks = useCollection<BodyCheck>('body', 'checks');
  const sessions = useCollection<Session>('mind', 'sessions');
  const day = cap.day;

  const checked = useMemo(() => {
    const m = new Map<string, BodyCheck>();
    for (const c of checks.items ?? []) if (c.date === day) m.set(c.item, c);
    return m;
  }, [checks.items, day]);
  const isOn = (item: string) => !!checked.get(item)?.done;
  const mode = (item: string) => (checked.get(item) as (BodyCheck & { mode?: string }) | undefined)?.mode ?? null;

  const nightAll = isOn('night-routine');
  const on = (id: CheckId) => (id.startsWith('night-') && nightAll) || isOn(id);

  async function set(id: CheckId, v: boolean, extra: Record<string, unknown> = {}) {
    if (DEMO) return;
    await checks.put({ id: `${day}:${id}`, date: day, item: id, done: v, at: new Date().toISOString(), by: 'me', source: 'today', ...extra } as never);
    // the panel's single Night tick stands for all three rows: the third row ticked writes it, an untick clears it
    if (id.startsWith('night-')) {
      const rest = (['night-room', 'night-teeth', 'night-skin'] as const).filter((x) => x !== id).every((x) => isOn(x));
      if (v && rest && !nightAll) await cap.toggle('night', true);
      if (!v && nightAll) {
        await cap.toggle('night', false);
        // keep the other two as they were before the untick
        for (const x of ['night-room', 'night-teeth', 'night-skin'] as const) {
          if (x !== id && !isOn(x)) await checks.put({ id: `${day}:${x}`, date: day, item: x, done: true, at: new Date().toISOString(), by: 'me', source: 'today' } as never);
        }
      }
    }
  }
  const toggle = (id: CheckId) => set(id, !on(id), id === 'cold-shower' ? { mode: mode('cold-shower') ?? 'cold' } : {});
  const setShower = (m: 'cold' | 'hot') => set('cold-shower', on('cold-shower'), { mode: m });

  const practice = (k: 'speak' | 'course') => (sessions.items ?? []).some((x) => x.id === `${k}-${day}`);
  async function togglePractice(k: 'speak' | 'course') {
    if (DEMO) return;
    const id = `${k}-${day}`;
    if (practice(k)) await sessions.remove(id);
    else await sessions.put({ id, kind: k, date: day, title: k === 'speak' ? 'Impromptu speaking' : 'Communication course', source: 'today' } as never);
  }

  // ── his tasks, by the aspect their area maps to ──
  const tasks = useMemo(() => {
    const t = o.today;
    if (!t || !o.life) return { by: new Map<AspectKey | 'none', Task[]>(), dueToday: [] as Task[] };
    const aspectOf = (area: string | null): AspectKey | null => (area ? o.life!.areaAspects[area]?.[0] ?? null : null);
    const mine = t.tasks.filter((x) => !x.parent && (x.owner == null || x.owner === 'me'));
    const live = mine.filter((x) => x.status === 'todo' || x.status === 'doing'
      || (x.status === 'done' && !!x.completedAt && istDay(x.completedAt) === t.date && x.due === t.date));
    const by = new Map<AspectKey | 'none', Task[]>();
    for (const x of live) {
      if (x.due && x.due > t.date) continue; // a later day's task waits on Home
      const k = aspectOf(x.area) ?? 'none';
      (by.get(k) ?? by.set(k, []).get(k)!).push(x);
    }
    const order = (a: Task, b: Task) => Number(a.status === 'done') - Number(b.status === 'done')
      || Number(!a.due) - Number(!b.due) || String(a.due ?? '').localeCompare(String(b.due ?? ''));
    for (const list of by.values()) list.sort(order);
    return { by, dueToday: live.filter((x) => x.due === t.date) };
  }, [o.today, o.life]);
  const areaName = useMemo(() => new Map(o.areas.map((a) => [a.slug, a.name])), [o.areas]);

  const mealDone = (id: FrameId) => cap.frames[id]?.status === 'logged';
  const gymDone = !!o.body && o.body.trained.length > 0;

  return {
    cap, day, on, mode, toggle, setShower, practice, togglePractice, tasks, areaName, mealDone, gymDone,
    color: ASPECT_COLOR,
  };
}

export type Day = ReturnType<typeof useDay>;

/** done / total for a list of booleans plus the tasks due today in that place. */
export function count(flags: boolean[], due: Task[] = []) {
  const dueN = due.filter((x) => x.due);
  return { done: flags.filter(Boolean).length + dueN.filter((x) => x.status === 'done').length, total: flags.length + dueN.length };
}
