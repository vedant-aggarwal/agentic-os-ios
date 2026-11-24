import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { DEMO, demoData } from '@/lib/demo';
import { nora, type NoraHome } from '@/lib/nora';
import { demoHome } from '@/lib/noraDemo';
import { aspectFields } from '@/lib/aspects';
import type { Area, LifePayload, Task, TodayPayload } from '@/lib/today';
import { tasksChanged } from '@/lib/useToday';
import type { AspectKey } from '@/theme';

// Home's data: his tasks (the same GET /today Today reads), the area map, Nora's home feed and the tasks he tagged her
// on (server modules/tasknora.ts). Every write is optimistic and tells Today to read again.

export type TagState = 'queued' | 'working' | 'ask' | 'found' | 'error';
export type Tag = { taskId: string; state: TagState; text: string | null; question: string | null; options: string[]; answer: string | null; taggedAt: string; at: string };
/** A task being added or edited. `aspect` is what he picked (one of the nine); `area` is the task's own, kept as is
 *  unless the aspect changes (see lib/aspects.ts). */
export type Draft = { title: string; notes: string; area: string | null; aspect: AspectKey | null; due: string | null; nora: boolean };

// The task view (work/sheets/EditTaskSheet) changed a task: Home reads again, as Today does on tasksChanged().
const changed = new Set<() => void>();
export function homeTasksChanged() { for (const f of changed) f(); }

// Tag Nora on a task, take it back, answer her question: Home's rows and the task view share these.
/** Tags her (tasknora) and tells her in her chat, where she works; she writes back with her tasknora_note tool. */
export async function tagNora(id: string, title: string) {
  if (DEMO) return;
  await api(`/mod/tasknora/tags/${id}`, { method: 'POST', body: {} });
  await nora.send(`I tagged you on ${id}: "${title}". Work on it and keep me posted under the task with tasknora_note (working, ask, found or error).`).catch(() => {});
}
export async function untagNora(id: string) {
  if (!DEMO) await api(`/mod/tasknora/tags/${id}`, { method: 'DELETE' });
}
export async function answerNora(id: string, text: string) {
  if (DEMO) return;
  await api(`/mod/tasknora/tags/${id}/answer`, { method: 'POST', body: { text } });
  await nora.send(`Answer on ${id}: ${text}`).catch(() => {});
}

const IST = 5.5 * 3600_000;
export const istDay = (ms = Date.now()) => new Date(ms + IST).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function demoTags(tasks: Task[]): Record<string, Tag> {
  const at = new Date().toISOString();
  const open = tasks.filter((t) => t.status !== 'done');
  const out: Record<string, Tag> = {};
  const put = (t: Task | undefined, x: Partial<Tag>) => { if (t) out[t.id] = { taskId: t.id, state: 'queued', text: null, question: null, options: [], answer: null, taggedAt: at, at, ...x }; };
  put(open[1], { state: 'working' });
  put(open[3], { state: 'found', text: 'Two options fit: the free tier covers this month; the paid one only matters past 10 lakh requests.' });
  return out;
}

export function useHomeData(open: boolean) {
  const [today, setToday] = useState<TodayPayload | null>(null);
  const [life, setLife] = useState<LifePayload | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [home, setHome] = useState<NoraHome | null>(null);
  const [tags, setTags] = useState<Record<string, Tag>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // the task just added (Home scrolls to it and lights it up), and each added task's first id so its row keeps its key
  const [fresh, setFresh] = useState<string | null>(null);
  const [alias, setAlias] = useState<Record<string, string>>({});
  const lowest = useRef<number | null>(null);
  const live = useRef<TodayPayload | null>(null);
  useEffect(() => { live.current = today; }, [today]);

  const load = useCallback(async (quiet = true) => {
    if (!quiet) setRefreshing(true);
    try {
      if (DEMO) {
        await new Promise((r) => setTimeout(r, 300));
        const d = live.current ? null : demoData();
        if (d) { setToday(d.today); setLife(d.life); setAreas(d.areas); setTags(demoTags(d.today.tasks)); }
        setHome(demoHome());
      } else {
        const [t, l, a, g, h] = await Promise.all([
          api<TodayPayload>('/today'), api<LifePayload>('/life'), api<{ areas: Area[] }>('/areas'),
          api<{ tags: Record<string, Tag> }>('/mod/tasknora/tags').catch(() => ({ tags: {} })),
          nora.home().catch(() => null),
        ]);
        setToday(t); setLife(l); setAreas(a.areas); setTags(g.tags); setHome(h);
      }
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), 60_000);
    const again = () => { void load(); };
    changed.add(again);
    return () => { clearTimeout(first); clearInterval(id); changed.delete(again); };
  }, [open, load]);

  const patchLocal = (id: string, p: Partial<Task>) => setToday((t) => (t ? { ...t, tasks: t.tasks.map((x) => (x.id === id ? { ...x, ...p } : x)) } : t));
  const after = () => { tasksChanged(); };

  async function patch(id: string, p: Partial<Task> & { notes?: string }, body: Record<string, unknown>) {
    const before = live.current?.tasks.find((x) => x.id === id);
    patchLocal(id, p);
    if (DEMO) return;
    try { await api(`/tasks/${id}`, { method: 'PATCH', body }); after(); }
    catch (e) { if (before) patchLocal(id, before); throw e; }
  }
  const toggle = (id: string) => {
    const t = live.current?.tasks.find((x) => x.id === id);
    if (!t) return Promise.resolve();
    const done = t.status !== 'done';
    return patch(id, done ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'todo', completedAt: null }, { status: done ? 'done' : 'todo' });
  };
  const remove = (id: string) => patch(id, { status: 'dropped' }, { status: 'dropped' });
  const restore = (id: string) => patch(id, { status: 'todo' }, { status: 'todo' });
  /** Home's drag: a new place in the order, and the bucket's date when it moved buckets (undefined = keep). */
  const reorder = (id: string, position: number, due?: string | null) => {
    const p = { position, ...(due !== undefined ? { due } : {}) };
    return patch(id, p, p);
  };
  /** The aspect is sent only when he changed it, so a task keeps its own area otherwise. */
  const edit = (id: string, d: Draft, was: AspectKey | null) => {
    const a = d.aspect !== was ? aspectFields(life, d.aspect) : null;
    const area = a ? (a.area !== undefined ? a.area : d.area) : d.area;
    return patch(id, { title: d.title.trim(), area, due: d.due },
      { title: d.title.trim(), due: d.due, ...(a ?? {}), ...(d.notes.trim() ? { notes: d.notes.trim() } : {}) });
  };

  async function tag(id: string, title: string) {
    const at = new Date().toISOString();
    setTags((g) => ({ ...g, [id]: g[id] ?? { taskId: id, state: 'queued', text: null, question: null, options: [], answer: null, taggedAt: at, at } }));
    try { await tagNora(id, title); } catch (e) { setTags((g) => { const n = { ...g }; delete n[id]; return n; }); throw e; }
  }
  async function untag(id: string) {
    const was = tags[id];
    setTags((g) => { const n = { ...g }; delete n[id]; return n; });
    try { await untagNora(id); } catch (e) { if (was) setTags((g) => ({ ...g, [id]: was })); throw e; }
  }
  async function answer(id: string, text: string) {
    const was = tags[id];
    if (was) setTags((g) => ({ ...g, [id]: { ...was, state: 'working', answer: text, question: null, options: [] } }));
    try { await answerNora(id, text); } catch (e) { if (was) setTags((g) => ({ ...g, [id]: was })); throw e; }
  }

  async function add(d: Draft) {
    const title = d.title.trim();
    if (!title) throw new Error('A title, please.');
    const body: Record<string, unknown> = { title, status: 'todo' };
    const a = d.aspect ? aspectFields(life, d.aspect) : null;
    const area = a ? a.area ?? null : d.area;
    if (a) Object.assign(body, a); else if (d.area) body.area = d.area;
    if (d.due) body.due = d.due;
    if (d.notes.trim()) body.notes = d.notes.trim();
    // On top of its bucket at once, before the server answers: a position below every open task's, so it sorts first
    // in Today, Tomorrow or No date (Later sorts by date, then this). The server files it on top of its area's list,
    // which is not the top of Home's mixed buckets, so the position is sent after.
    const open = (live.current?.tasks ?? []).filter((x) => !x.parent && x.status !== 'done' && x.status !== 'dropped');
    const floor = Math.min(0, lowest.current ?? 0, ...open.map((x) => x.position ?? 0));
    const position = floor - 1024;
    lowest.current = position;
    const tmp = `tmp${Date.now()}`;
    const draft: Task = { id: tmp, title, status: 'todo', area, due: d.due, scheduled: null, owner: 'me', completedAt: null, position };
    setToday((x) => (x ? { ...x, tasks: [draft, ...x.tasks] } : x));
    setFresh(tmp);
    let t: Task;
    try {
      t = DEMO ? { ...draft, id: `t${Date.now() % 100000}` } : await api<Task>('/tasks', { method: 'POST', body });
    } catch (e) {
      setToday((x) => (x ? { ...x, tasks: x.tasks.filter((y) => y.id !== tmp) } : x));
      setFresh((f) => (f === tmp ? null : f));
      throw e;
    }
    const top = (t.position ?? 0) <= position;
    const shown: Task = { ...t, position: top ? t.position : position };
    setAlias((a) => ({ ...a, [t.id]: tmp }));
    setToday((x) => {
      if (!x) return x;
      if (x.tasks.some((y) => y.id === tmp)) return { ...x, tasks: x.tasks.map((y) => (y.id === tmp ? shown : y)) };
      // a reload landed while it was saving
      return { ...x, tasks: x.tasks.some((y) => y.id === t.id) ? x.tasks.map((y) => (y.id === t.id ? shown : y)) : [shown, ...x.tasks] };
    });
    setFresh((f) => (f === tmp ? t.id : f));
    if (!DEMO && !top) api(`/tasks/${t.id}`, { method: 'PATCH', body: { position } }).catch(() => {});
    if (d.nora) await tag(t.id, title);
    after();
    if (a && a.area === undefined) void load(); // the PC made an area for that aspect: read the new map
    return t;
  }
  const clearFresh = useCallback(() => setFresh(null), []);

  return { today, life, areas, home, tags, error, refreshing, load, toggle, remove, restore, edit, reorder, add, tag, untag, answer, fresh, clearFresh, alias };
}
export type HomeData = ReturnType<typeof useHomeData>;
