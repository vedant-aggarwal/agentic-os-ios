import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, loadToken, setToken, WEB } from './api';
import { keep, kept } from './mod';
import { DEMO, demoData } from './demo';
import { deriveToday, type Area, type LifePayload, type Task, type TodayPayload, type TodayView } from './today';

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error'; message: string }
  | { status: 'ready'; today: TodayPayload; life: LifePayload; areas: Area[] };

type Saved = { day: string; today: TodayPayload; life: LifePayload; areas: Area[] };
const localDay = () => new Date().toDateString();
const fetchAll = () => Promise.all([
  api<TodayPayload>('/today'),
  api<LifePayload>('/life'),
  api<{ areas: Area[] }>('/areas'),
]);

// Another surface (Home's task list) changed tasks: every mounted Today reads again.
const changed = new Set<() => void>();
export function tasksChanged() { for (const f of changed) f(); }

/** GET /today's `cancelled` (what he cancelled on Today today, status dropped) rides with the day's tasks, so Today can
 *  draw it struck through and bring it back; whatever counts the day passes over that status. Writes still on their
 *  way are laid over the top, so a read that lands before the PC has them doesn't undo a tap. */
function fold(t: TodayPayload, pending: Map<string, Partial<Task>>): TodayPayload {
  const extra = (t.cancelled ?? []).filter((c) => !t.tasks.some((x) => x.id === c.id));
  if (!extra.length && !pending.size) return t;
  return { ...t, tasks: [...t.tasks, ...extra].map((x) => (pending.has(x.id) ? { ...x, ...pending.get(x.id) } : x)) };
}

/** How long a tick waits before it is sent: a second tap inside this makes it a cancel (Tick's DOUBLE_MS is shorter). */
const HOLD = 350;

/** Today from the phone server. The UI only ever renders what this returns. The last day loaded is kept on the
 * device, so a launch draws it at once and the PC's answer replaces it a moment later. */
export function useToday() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);
  // Per task: what the screen shows ahead of the PC, the tick waiting out the double-tap window, the PATCH queue.
  const pending = useRef(new Map<string, Partial<Task>>());
  const held = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; drop: () => void; base: Partial<Task> }>());
  const tails = useRef(new Map<string, Promise<unknown>>());

  const load = useCallback(async () => {
    if (DEMO) return setState((s) => (s.status === 'ready' ? s : { status: 'ready', ...demoData() }));
    if (live.current.status === 'loading') {
      const s = await kept<Saved>('today');
      if (s?.day === localDay() && Array.isArray(s.areas) && Array.isArray(s.today?.tasks) && Array.isArray(s.life?.aspects) && live.current.status === 'loading') setState({ status: 'ready', today: s.today, life: s.life, areas: s.areas });
    }
    // Web signs in with the cookie, so the reads needn't wait for the sign-in check: both go out together.
    const early = WEB ? fetchAll() : null;
    early?.catch(() => {});
    if (!(await loadToken())) return setState({ status: 'signedOut' });
    try {
      const [read, life, areas] = await (early ?? fetchAll());
      const today = fold(read, pending.current);
      setState({ status: 'ready', today, life, areas: areas.areas });
      keep('today', { day: localDay(), today, life, areas: areas.areas } satisfies Saved);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { await setToken(null); return setState({ status: 'signedOut' }); }
      if (live.current.status !== 'ready') setState({ status: 'error', message: (e as Error).message });
      else setNotice((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount: load() only sets state after its awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const tick = setInterval(load, 60_000); // keeps Now / Next current
    const again = () => { void load(); };
    changed.add(again);
    return () => { sub.remove(); clearInterval(tick); changed.delete(again); };
  }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => s.status !== 'ready' ? s : {
      ...s, today: { ...s.today, tasks: s.today.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
    });
  }, []);

  const show = useCallback((id: string, patch: Partial<Task>) => {
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    patchTask(id, patch);
  }, [patchTask]);
  /** A task's PATCHes reach the PC in the order they were made. */
  const send = useCallback((id: string, body: Record<string, unknown>) => {
    const run = (tails.current.get(id) ?? Promise.resolve()).catch(() => {}).then(() => api(`/tasks/${id}`, { method: 'PATCH', body }));
    tails.current.set(id, run);
    const settle = () => { if (tails.current.get(id) === run) { tails.current.delete(id); if (!held.current.has(id)) pending.current.delete(id); } };
    run.then(settle, settle);
    return run;
  }, []);
  /** Takes back a tick still waiting to be sent; returns the status from before it. */
  const unhold = useCallback((id: string) => {
    const h = held.current.get(id);
    if (!h) return null;
    clearTimeout(h.timer);
    held.current.delete(id);
    h.drop();
    return h.base;
  }, []);
  const failed = useCallback((id: string, back: Partial<Task>, e: unknown) => {
    pending.current.delete(id);
    patchTask(id, back);
    setNotice((e as Error).message);
  }, [patchTask]);

  /** Tick or untick. Shows at once; the PATCH waits out the double-tap window, so a second tap that turns the tick into
   *  a cancel sends only the cancel (a repeating task must not file its next one as done first). Reverts with a
   *  notice if the PC says no. */
  const toggle = useCallback(async (id: string) => {
    const s = live.current;
    if (s.status !== 'ready') return;
    const before = s.today.tasks.find((t) => t.id === id);
    if (!before) return;
    const done = before.status !== 'done';
    const patch: Partial<Task> = done ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'todo', completedAt: null };
    if (DEMO) { patchTask(id, patch); return; }
    const base = unhold(id) ?? { status: before.status, completedAt: before.completedAt };
    show(id, patch);
    const go = await new Promise<boolean>((resolve) => {
      held.current.set(id, { base, drop: () => resolve(false), timer: setTimeout(() => { held.current.delete(id); resolve(true); }, HOLD) });
    });
    if (!go) return;
    try { await send(id, { status: done ? 'done' : 'todo' }); } catch (e) { failed(id, base, e); }
  }, [patchTask, show, send, unhold, failed]);

  /** Cancel for today: the PC skips this occurrence of a repeating task (its next one is filed) and drops a one-off.
   *  Today keeps it struck through until `restore` or the day ends. Reverts with a notice if the PC says no. */
  const cancel = useCallback(async (id: string) => {
    const s = live.current;
    if (s.status !== 'ready') return;
    const before = s.today.tasks.find((t) => t.id === id);
    if (!before || before.status === 'dropped') return;
    const patch: Partial<Task> = { status: 'dropped', completedAt: null };
    if (DEMO) { patchTask(id, patch); return; }
    const base = unhold(id) ?? { status: before.status, completedAt: before.completedAt };
    show(id, patch);
    try { await send(id, { status: 'dropped', skip: true }); } catch (e) { failed(id, base, e); }
  }, [patchTask, show, send, unhold, failed]);

  /** Back from cancelled, open again. A repeating task's next occurrence, already filed, stays. */
  const restore = useCallback(async (id: string) => {
    const s = live.current;
    if (s.status !== 'ready') return;
    const before = s.today.tasks.find((t) => t.id === id);
    if (!before || before.status !== 'dropped') return;
    const patch: Partial<Task> = { status: 'todo', completedAt: null, next: null };
    if (DEMO) { patchTask(id, patch); return; }
    show(id, patch);
    try { await send(id, { status: 'todo' }); } catch (e) { failed(id, { status: 'dropped', next: before.next ?? null }, e); }
  }, [patchTask, show, send, failed]);

  const view: TodayView | null = useMemo(
    () => (state.status === 'ready' ? deriveToday(state.today, state.life, state.areas) : null),
    [state],
  );

  return { state, view, refresh, refreshing, toggle, cancel, restore, reload: load, notice, clearNotice: () => setNotice(null) };
}
