import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { DEMO, demoData } from '@/lib/demo';
import { nora, type NoraHome } from '@/lib/nora';
import { demoHome } from '@/lib/noraDemo';
import type { Area, LifePayload, Task, TodayPayload } from '@/lib/today';
import { tasksChanged } from '@/lib/useToday';

// Home's data: his tasks (the same GET /today Today reads), the area map, Nora's home feed and the tasks he tagged her
// on (server modules/tasknora.ts). Every write is optimistic and tells Today to read again.

export type TagState = 'queued' | 'working' | 'ask' | 'found' | 'error';
export type Tag = { taskId: string; state: TagState; text: string | null; question: string | null; options: string[]; answer: string | null; taggedAt: string; at: string };
export type Draft = { title: string; notes: string; area: string | null; due: string | null; nora: boolean };

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
    return () => { clearTimeout(first); clearInterval(id); };
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
  const edit = (id: string, d: Draft) => patch(id, { title: d.title.trim(), area: d.area, due: d.due },
    { title: d.title.trim(), area: d.area, due: d.due, ...(d.notes.trim() ? { notes: d.notes.trim() } : {}) });

  async function tag(id: string, title: string) {
    const at = new Date().toISOString();
    setTags((g) => ({ ...g, [id]: g[id] ?? { taskId: id, state: 'queued', text: null, question: null, options: [], answer: null, taggedAt: at, at } }));
    if (DEMO) return;
    try {
      await api(`/mod/tasknora/tags/${id}`, { method: 'POST', body: {} });
      // her chat is where she works: she reads the task there and writes back with her tasknora_note tool
      await nora.send(`I tagged you on ${id}: "${title}". Work on it and keep me posted under the task with tasknora_note (working, ask, found or error).`).catch(() => {});
    } catch (e) { setTags((g) => { const n = { ...g }; delete n[id]; return n; }); throw e; }
  }
  async function untag(id: string) {
    const was = tags[id];
    setTags((g) => { const n = { ...g }; delete n[id]; return n; });
    if (DEMO) return;
    try { await api(`/mod/tasknora/tags/${id}`, { method: 'DELETE' }); }
    catch (e) { if (was) setTags((g) => ({ ...g, [id]: was })); throw e; }
  }
  async function answer(id: string, text: string) {
    const was = tags[id];
    if (was) setTags((g) => ({ ...g, [id]: { ...was, state: 'working', answer: text, question: null, options: [] } }));
    if (DEMO) return;
    try {
      await api(`/mod/tasknora/tags/${id}/answer`, { method: 'POST', body: { text } });
      await nora.send(`Answer on ${id}: ${text}`).catch(() => {});
    } catch (e) { if (was) setTags((g) => ({ ...g, [id]: was })); throw e; }
  }

  async function add(d: Draft) {
    const title = d.title.trim();
    if (!title) throw new Error('A title, please.');
    const body: Record<string, unknown> = { title, status: 'todo' };
    if (d.area) body.area = d.area;
    if (d.due) body.due = d.due;
    if (d.notes.trim()) body.notes = d.notes.trim();
    let t: Task;
    if (DEMO) {
      t = { id: `t${Date.now() % 100000}`, title, status: 'todo', area: d.area, due: d.due, scheduled: null, owner: 'me', completedAt: null };
    } else t = await api<Task>('/tasks', { method: 'POST', body });
    setToday((x) => (x ? { ...x, tasks: [t, ...x.tasks] } : x));
    if (d.nora) await tag(t.id, title);
    after();
    return t;
  }

  return { today, life, areas, home, tags, error, refreshing, load, toggle, remove, restore, edit, add, tag, untag, answer };
}
export type HomeData = ReturnType<typeof useHomeData>;
