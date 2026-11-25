import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, loadToken, setToken, WEB } from './api';
import { keep, kept } from './mod';
import { DEMO, demoData } from './demo';
import { onSettled, send as sendOrKeep, waiting, waitingWith } from './outbox';
import { deriveToday, type Area, type LifePayload, type Task, type TodayPayload, type TodayView } from './today';

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error'; message: string }
  /** `from`: the day (YYYY-MM-DD) of the phone's saved copy on screen, when it is an earlier day's and the PC hasn't
   *  answered yet. */
  | { status: 'ready'; today: TodayPayload; life: LifePayload; areas: Area[]; from?: string };

/** The last read of the day failed: since when, and whether the PC was out of reach (off, asleep, the tunnel down)
 *  rather than answering with an error. Cleared by the next read that works. */
export type Offline = { since: number; unreachable: boolean };

type Saved = { day: string; today: TodayPayload; life: LifePayload; areas: Area[] };
const localDay = () => new Date().toDateString();
const usable = (s: Saved | null): s is Saved =>
  !!s && Array.isArray(s.areas) && Array.isArray(s.today?.tasks) && Array.isArray(s.life?.aspects);
// The three reads go out together and each may fail alone: /life and /areas only colour and name the tasks, so
// without them Today still draws (with the last copy of that part, else none).
const fetchAll = () => Promise.allSettled([
  api<TodayPayload>('/today'),
  api<LifePayload>('/life'),
  api<{ areas: Area[] }>('/areas'),
]);
const NO_LIFE: LifePayload = { aspects: [], areaAspects: {} };
const OUT_OF_REACH = [0, 502, 503, 521, 522, 523, 530]; // no answer, or the tunnel's "the PC isn't there" (api.ts refusal)

// Another surface (Home's task list) changed tasks: every mounted Today reads again.
const changed = new Set<() => void>();
export function tasksChanged() { for (const f of changed) f(); }

/** GET /today's `cancelled` (what he cancelled on Today today, status dropped) rides with the day's tasks, so Today can
 *  draw it struck through and bring it back; whatever counts the day passes over that status. Writes still on their
 *  way are laid over the top, so a read that lands before the PC has them doesn't undo a tap: this launch's, and ticks
 *  still waiting on the phone from before (lib/outbox.ts). */
function fold(t: TodayPayload, pending: Map<string, Partial<Task>>): TodayPayload {
  const over = new Map(pending);
  for (const j of waitingWith('task:')) {
    const id = j.id.slice(5), status = (j.body as { status?: Task['status'] } | undefined)?.status;
    if (status && !over.has(id)) over.set(id, { status, completedAt: status === 'done' ? j.at : null });
  }
  const extra = (t.cancelled ?? []).filter((c) => !t.tasks.some((x) => x.id === c.id));
  if (!extra.length && !over.size) return t;
  return { ...t, tasks: [...t.tasks, ...extra].map((x) => (over.has(x.id) ? { ...x, ...over.get(x.id) } : x)) };
}

/** How long a tick waits before it is sent: a second tap inside this makes it a cancel (Tick's DOUBLE_MS is shorter). */
const HOLD = 350;

/** Today from the phone server. The UI only ever renders what this returns. The last day loaded is kept on the
 * device, so a launch draws it at once, whatever day it is from, and the PC's answer replaces it a moment later. With
 * the PC off it stays up, marked as a saved copy (`offline`), and the failure is said once, not every minute. */
export function useToday() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState<Offline | null>(null);
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);
  const shown = useRef<Saved | null>(null); // the day on screen: the saved copy, then each answer from the PC
  const down = useRef<Offline | null>(null);
  // Per task: what the screen shows ahead of the PC, the tick waiting out the double-tap window, the PATCH queue.
  const pending = useRef(new Map<string, Partial<Task>>());
  const held = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; drop: () => void; base: Partial<Task> }>());
  const tails = useRef(new Map<string, Promise<unknown>>());

  /** `loud`: he asked for it (Try again, pull to refresh), so a failure is said even when it was said before. */
  const load = useCallback(async (loud: boolean = false) => {
    if (DEMO) return setState((s) => (s.status === 'ready' ? s : { status: 'ready', ...demoData() }));
    // signed out: the next account starts from nothing
    const out = () => { shown.current = null; down.current = null; setOffline(null); setState({ status: 'signedOut' }); };
    if (live.current.status === 'loading' && !shown.current) {
      // Each morning the copy is yesterday's: drawn anyway (Today says so), rather than a blank screen until the PC
      // answers, or "Today didn't load" with the PC off.
      const s = await kept<Saved>('today');
      if (usable(s) && live.current.status === 'loading' && !shown.current) {
        shown.current = s;
        setState({ status: 'ready', today: s.today, life: s.life, areas: s.areas, ...(s.day === localDay() ? {} : { from: s.today.date }) });
      }
    }
    // Web signs in with the cookie, so the reads needn't wait for the sign-in check: both go out together.
    const early = WEB ? fetchAll() : null;
    if (!(await loadToken())) return out();
    const [read, life, areas] = await (early ?? fetchAll());
    const errors = [read, life, areas].flatMap((r) => (r.status === 'rejected' ? [r.reason as Error] : []));
    if (errors.some((e) => e instanceof ApiError && e.status === 401)) { await setToken(null); return out(); }
    if (read.status === 'rejected') {
      const e = read.reason as Error;
      const first = !down.current;
      if (first) {
        down.current = { since: Date.now(), unreachable: e instanceof ApiError && OUT_OF_REACH.includes(e.status) };
        setOffline(down.current);
      }
      if (!shown.current) setState({ status: 'error', message: e.message });
      else if (first || loud === true) setNotice(e.message);
      return;
    }
    const before = shown.current;
    const day: Saved = {
      day: localDay(),
      today: fold(read.value, pending.current),
      life: life.status === 'fulfilled' ? life.value : before?.life ?? NO_LIFE,
      areas: areas.status === 'fulfilled' ? areas.value.areas : before?.areas ?? [],
    };
    shown.current = day;
    if (down.current) { down.current = null; setOffline(null); }
    setState({ status: 'ready', today: day.today, life: day.life, areas: day.areas });
    keep('today', day);
    if (errors.length && !before) setNotice(errors[0].message); // the tasks drew without their colours: say why
  }, []);

  useEffect(() => {
    // Fetch on mount: load() only sets state after its awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const tick = setInterval(() => { void load(); }, 60_000); // keeps Now / Next current
    const again = () => { void load(); };
    // a tick that waited on the phone has reached the PC (or the PC said no): read the day again
    const sent = onSettled((job, r) => {
      if (!job.id.startsWith('task:')) return;
      const id = job.id.slice(5);
      if (!waiting(job.id) && !held.current.has(id) && !tails.current.has(id)) pending.current.delete(id);
      if (!r.ok) setNotice(r.error.message);
      again();
    });
    changed.add(again);
    return () => { sub.remove(); clearInterval(tick); changed.delete(again); sent(); };
  }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(true); setRefreshing(false); }, [load]);
  /** Try again (the offline pill, "Today didn't load"): `retrying` while it reads. */
  const retry = useCallback(async () => { setRetrying(true); await load(true); setRetrying(false); }, [load]);

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => s.status !== 'ready' ? s : {
      ...s, today: { ...s.today, tasks: s.today.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) },
    });
  }, []);

  const show = useCallback((id: string, patch: Partial<Task>) => {
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    patchTask(id, patch);
  }, [patchTask]);
  /** A task's PATCHes reach the PC in the order they were made. With the PC out of reach one waits on the phone
   *  (lib/outbox.ts, which Today mentions) and the tick stays on screen until it has gone. */
  const send = useCallback((id: string, body: Record<string, unknown>) => {
    const run = (tails.current.get(id) ?? Promise.resolve()).catch(() => {})
      .then(() => sendOrKeep({ id: `task:${id}`, method: 'PATCH', path: `/tasks/${id}`, body }));
    tails.current.set(id, run);
    const settle = () => {
      if (tails.current.get(id) !== run) return;
      tails.current.delete(id);
      if (!held.current.has(id) && !waiting(`task:${id}`)) pending.current.delete(id);
    };
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

  const reload = useCallback(() => load(), [load]);
  return { state, view, refresh, refreshing, retry, retrying, offline, toggle, cancel, restore, reload, notice, clearNotice: () => setNotice(null) };
}
