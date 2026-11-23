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

/** Today from the phone server. The UI only ever renders what this returns. The last day loaded is kept on the
 * device, so a launch draws it at once and the PC's answer replaces it a moment later. */
export function useToday() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = useRef(state);
  useEffect(() => { live.current = state; }, [state]);

  const load = useCallback(async () => {
    if (DEMO) return setState((s) => (s.status === 'ready' ? s : { status: 'ready', ...demoData() }));
    if (live.current.status === 'loading') {
      const s = await kept<Saved>('today');
      if (s?.day === localDay() && live.current.status === 'loading') setState({ status: 'ready', today: s.today, life: s.life, areas: s.areas });
    }
    // Web signs in with the cookie, so the reads needn't wait for the sign-in check: both go out together.
    const early = WEB ? fetchAll() : null;
    early?.catch(() => {});
    if (!(await loadToken())) return setState({ status: 'signedOut' });
    try {
      const [today, life, areas] = await (early ?? fetchAll());
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

  /** Tick or untick. Optimistic; reverts with a notice if the PC says no. */
  const toggle = useCallback(async (id: string) => {
    const s = live.current;
    if (s.status !== 'ready') return;
    const before = s.today.tasks.find((t) => t.id === id);
    if (!before) return;
    const done = before.status !== 'done';
    patchTask(id, done ? { status: 'done', completedAt: new Date().toISOString() } : { status: 'todo', completedAt: null });
    if (DEMO) return;
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: { status: done ? 'done' : 'todo' } });
    } catch (e) {
      patchTask(id, { status: before.status, completedAt: before.completedAt });
      setNotice((e as Error).message);
    }
  }, [patchTask]);

  const view: TodayView | null = useMemo(
    () => (state.status === 'ready' ? deriveToday(state.today, state.life, state.areas) : null),
    [state],
  );

  return { state, view, refresh, refreshing, toggle, reload: load, notice, clearNotice: () => setNotice(null) };
}
