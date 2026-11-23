import { ASPECT_COLOR, type AspectKey, type FamilyKey } from '@/theme';

// ── what the phone server sends (GET /today, GET /life) ─────────────────────
export type Task = {
  id: string; title: string; status: 'inbox' | 'todo' | 'doing' | 'done' | 'dropped';
  area: string | null; due: string | null; scheduled: { start: string; end: string } | null;
  owner: string | null; completedAt: string | null; parent?: string | null; repeat?: string | null; position?: number;
};
export type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean; area: string | null; location: string | null };
export type TodayPayload = { date: string; now: string; events: CalEvent[]; tasks: Task[]; inboxCount: number };
export type LifePayload = {
  aspects: { key: AspectKey; family: FamilyKey; name: string }[];
  areaAspects: Record<string, AspectKey[]>;
};
export type Area = { slug: string; name: string };

// ── what the Today screen draws ─────────────────────────────────────────────
export type Row = {
  id: string; title: string; sub: string | null; color: string | null; aspect: AspectKey | null;
  done: boolean; right: string; rightStrong: boolean;
};
export type Group = { key: string; label: string; count: string; rows: Row[] };
export type Moment = {
  state: 'now' | 'next'; title: string; when: string; sub: string | null;
  color: string | null; taskId: string | null; then: string | null;
};
export type Family = { key: FamilyKey; done: number; total: number };
/** One aspect's part of the day: today's plan (done counts against total) and what's carried over. */
export type Section = { key: AspectKey | 'none'; label: string; color: string | null; done: number; total: number; rows: Row[]; carried: Row[] };
export type AspectProgress = Partial<Record<AspectKey, { done: number; total: number }>>;
export type TodayView = {
  dateLabel: string;
  families: Family[];
  /** Today's plan per aspect: lights the orb's life-wheel arc. */
  aspects: AspectProgress;
  /** Everything on his plate per aspect (today's plan plus carried-over tasks): fills the hero's crystals. */
  reach: AspectProgress;
  done: number; total: number;
  moment: Moment | null;
  groups: Group[];
  carried: Group | null;
  /** The day by aspect, in life-wheel order, then tasks with no area. */
  sections: Section[];
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const IST = 5.5 * 3600_000; // the server's day is India time

const istDate = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);
const hhmm = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(11, 16);
function dateLabel(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${DAYS[wd]} ${day} ${MONTHS[m - 1]}`;
}
function shortDate(d: string) {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1].slice(0, 3)}`;
}

export function deriveToday(t: TodayPayload, life: LifePayload, areas: Area[]): TodayView {
  const aspectOf = (area: string | null): AspectKey | null => (area ? life.areaAspects[area]?.[0] ?? null : null);
  const familyOf = new Map((life.aspects ?? []).map((a) => [a.key, a.family]));
  const areaName = new Map((areas ?? []).map((a) => [a.slug, a.name]));
  const colorOf = (area: string | null) => { const a = aspectOf(area); return a ? ASPECT_COLOR[a] : null; };

  // His own top-level tasks; agents' tasks live on the Work page.
  const mine = (t.tasks ?? []).filter((x) => !x.parent && (x.owner == null || x.owner === 'me'));
  const open = (x: Task) => x.status === 'todo' || x.status === 'doing';
  const doneToday = mine.filter((x) => x.status === 'done' && x.completedAt && istDate(x.completedAt) === t.date);
  const dueToday = mine.filter((x) => open(x) && x.due === t.date);
  const carried = mine.filter((x) => open(x) && x.due != null && x.due < t.date).sort((a, b) => (a.due! < b.due! ? -1 : 1));

  // Crystals: today's plan per family (due today + done today, done carry-overs included).
  const counted = [...dueToday, ...doneToday];
  const families: Family[] = (['self', 'work', 'people'] as FamilyKey[]).map((key) => {
    const mineF = counted.filter((x) => { const a = aspectOf(x.area); return a && familyOf.get(a) === key; });
    return { key, total: mineF.length, done: mineF.filter((x) => x.status === 'done').length };
  });
  const perAspect = (list: Task[]) => {
    const out: AspectProgress = {};
    for (const x of list) {
      const a = aspectOf(x.area);
      if (!a) continue;
      const p = (out[a] ??= { done: 0, total: 0 });
      p.total += 1;
      if (x.status === 'done') p.done += 1;
    }
    return out;
  };
  const aspects = perAspect(counted);
  // one finished task fills its crystal only by its share of everything open in that aspect
  const reach = perAspect([...counted, ...carried]);

  const row = (x: Task, right: string, rightStrong = false): Row => ({
    id: x.id, title: x.title, sub: x.area ? areaName.get(x.area) ?? x.area : null,
    color: colorOf(x.area), aspect: aspectOf(x.area), done: x.status === 'done', right, rightStrong,
  });
  const timeOf = (x: Task) => (x.scheduled ? hhmm(x.scheduled.start) : 'Today');
  const todayRows = [...dueToday, ...doneToday]
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || timeOf(a).localeCompare(timeOf(b)));

  const groups: Group[] = [];
  const LABEL: Record<FamilyKey | 'none', string> = { self: 'Self', work: 'Work', people: 'People', none: 'No area' };
  for (const key of ['self', 'work', 'people', 'none'] as const) {
    const items = todayRows.filter((x) => {
      const a = aspectOf(x.area);
      return key === 'none' ? !a : a != null && familyOf.get(a) === key;
    });
    if (!items.length) continue;
    groups.push({
      key, label: LABEL[key], count: `${items.filter((x) => x.status === 'done').length} of ${items.length}`,
      rows: items.map((x) => row(x, x.status === 'done' ? 'Done' : timeOf(x), x.status !== 'done' && !!x.scheduled)),
    });
  }

  const carriedRows = carried.map((x) => row(x, `Since ${shortDate(x.due!)}`));
  const sections: Section[] = [];
  for (const key of [...life.aspects.map((a) => a.key), 'none' as const]) {
    const plan = todayRows.filter((x) => (aspectOf(x.area) ?? 'none') === key);
    const late = carriedRows.filter((r) => (r.aspect ?? 'none') === key);
    if (!plan.length && !late.length) continue;
    sections.push({
      key, label: key === 'none' ? 'Other' : life.aspects.find((a) => a.key === key)?.name ?? key,
      color: key === 'none' ? null : ASPECT_COLOR[key],
      done: plan.filter((x) => x.status === 'done').length, total: plan.length,
      rows: plan.map((x) => row(x, x.status === 'done' ? 'Done' : timeOf(x), x.status !== 'done' && !!x.scheduled)),
      carried: late,
    });
  }

  // Now / next: calendar blocks and scheduled tasks, whichever is happening.
  const now = Date.parse(t.now);
  const slots = [
    ...t.events.filter((e) => !e.allDay).map((e) => ({ title: e.title, start: e.start, end: e.end, area: e.area, sub: e.location, taskId: null as string | null })),
    ...mine.filter((x) => open(x) && x.scheduled && istDate(x.scheduled.start) === t.date)
      .map((x) => ({ title: x.title, start: x.scheduled!.start, end: x.scheduled!.end, area: x.area, sub: null, taskId: x.id })),
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const cur = slots.find((s) => Date.parse(s.start) <= now && now < Date.parse(s.end));
  const nxt = slots.find((s) => Date.parse(s.start) > now);
  let moment: Moment | null = null;
  const pick = cur ?? nxt;
  if (pick) {
    const after = slots.find((s) => s !== pick && Date.parse(s.start) >= Date.parse(cur ? pick.end : pick.start));
    moment = {
      state: cur ? 'now' : 'next',
      title: pick.title,
      when: cur ? `Now, until ${hhmm(pick.end)}` : `Next at ${hhmm(pick.start)}`,
      sub: pick.sub ?? (pick.area ? areaName.get(pick.area) ?? null : null),
      color: colorOf(pick.area), taskId: pick.taskId,
      then: after ? `Then ${after.title} at ${hhmm(after.start)}` : null,
    };
  }

  return {
    dateLabel: dateLabel(t.date),
    families,
    aspects,
    reach,
    done: counted.filter((x) => x.status === 'done').length,
    total: counted.length,
    moment,
    groups,
    carried: carried.length ? { key: 'carried', label: 'Carried over', count: String(carried.length), rows: carriedRows } : null,
    sections,
  };
}
