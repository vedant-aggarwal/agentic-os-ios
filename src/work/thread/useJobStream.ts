import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError, loadToken, setToken } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { workApi } from '../api';
import { readCache, writeCache } from '../cache';
import { openSSE } from '../sse';
import type { JobEvent, JobFull } from '../types';
import { demoEvents, demoJob, demoRuns, startDemo } from './demoThread';

// One job's thread, live. Order: the phone's cached copy (instant), then the last 200 events from the PC, then the
// stream from the last seq. An assistant, thought, tool or plan event grows in place under the same seq, so events are
// merged by seq. Stream updates are buffered and applied once per animation frame. The stream closes when the page
// goes away or the app goes to the background, and resumes with `after=` when it comes back.

export type StreamLoad = 'loading' | 'ready' | 'error' | 'signedOut';
type State = {
  job: JobFull | null; events: JobEvent[]; load: StreamLoad; error: string | null;
  live: boolean; more: boolean; older: 'idle' | 'loading' | 'error';
};
export type JobStream = State & {
  loadOlder: () => void;
  reload: () => void;
  /** Applies a job (from a POST answer, or a partial patch) and events right away, outside the frame buffer. */
  apply: (job: Partial<JobFull> | null, evs?: JobEvent[]) => void;
};

const TAIL = 200;
const CACHED = 80; // events kept on the phone per job
const INITIAL: State = { job: null, events: [], load: 'loading', error: null, live: false, more: false, older: 'idle' };

/** Merges events by seq: a new seq is appended (or slotted in), a known one replaced. Returns `list` when nothing came. */
export function mergeEvents(list: JobEvent[], incoming: JobEvent[]): JobEvent[] {
  if (!incoming.length) return list;
  const out = list.slice();
  for (const ev of incoming) {
    const last = out.length ? out[out.length - 1].seq : 0;
    if (ev.seq > last) { out.push(ev); continue; }
    let i = out.length - 1; // growing events sit near the end
    while (i >= 0 && out[i].seq > ev.seq) i--;
    if (i >= 0 && out[i].seq === ev.seq) out[i] = ev;
    else out.splice(i + 1, 0, ev);
  }
  return out;
}

/** Newer job wins: a POST answer can arrive after the stream already sent a later state. */
function mergeJob(cur: JobFull | null, next: Partial<JobFull> | null): JobFull | null {
  if (!next) return cur;
  if (!cur) return 'id' in next && 'status' in next ? (next as JobFull) : cur;
  if (next.updatedAt && cur.updatedAt && next.updatedAt < cur.updatedAt && 'id' in next) return cur;
  return { ...cur, ...next };
}

/** Tool output stays off the phone's disk; the PC keeps it. */
const slim = (evs: JobEvent[]) => evs.slice(-CACHED).map((e) => (e.type === 'tool' && e.output ? { ...e, output: undefined } : e));

export function useJobStream(id: string): JobStream {
  const [state, setState] = useState<State>(INITIAL);
  const [nonce, setNonce] = useState(0);
  const latest = useRef<State>(INITIAL);
  useEffect(() => { latest.current = state; }, [state]);

  // frame buffer for stream updates
  const buf = useRef<{ evs: Map<number, JobEvent>; job: Partial<JobFull> | null; raf: number | null }>({ evs: new Map(), job: null, raf: null });
  const lastSeq = useRef(0);
  const olderBusy = useRef(false);
  const fresh = useRef(false); // the PC answered at least once; paging only builds on its window, never on the cache

  const flush = useCallback(() => {
    const b = buf.current;
    b.raf = null;
    if (!b.evs.size && !b.job) return;
    const evs = [...b.evs.values()].sort((a, z) => a.seq - z.seq);
    const job = b.job;
    b.evs = new Map();
    b.job = null;
    setState((s) => ({ ...s, events: mergeEvents(s.events, evs), job: mergeJob(s.job, job) }));
  }, []);

  const queue = useCallback((job: Partial<JobFull> | null, evs: JobEvent[]) => {
    const b = buf.current;
    for (const e of evs) { b.evs.set(e.seq, e); if (e.seq > lastSeq.current) lastSeq.current = e.seq; }
    if (job) b.job = { ...(b.job ?? {}), ...job };
    if (b.raf === null) b.raf = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => {
    let alive = true;
    let close: (() => void) | null = null;
    let baseline = false; // the stream starts only once we know where the thread is
    const b = buf.current; // the page is keyed by job id, so a new id is a fresh hook

    const persist = () => {
      const s = latest.current;
      if (!DEMO && s.job && s.events.length) writeCache(`job:${id}`, { job: s.job, events: slim(s.events) });
    };
    const start = () => {
      if (close || !alive || !baseline || DEMO) return;
      close = openSSE(() => `/jobs/${encodeURIComponent(id)}/stream?after=${lastSeq.current}`, {
        // connected: anything the PC missed arrives now, so the saved copy is current again
        onOpen: () => { if (!alive) return; fresh.current = true; setState((s) => ({ ...s, live: true, error: null })); },
        onDown: () => { if (alive) setState((s) => ({ ...s, live: false })); },
        onEvent: (name, data) => {
          if (!alive) return;
          try {
            if (name === 'job') queue(JSON.parse(data) as JobFull, []);
            else if (name === 'ev') queue(null, [JSON.parse(data) as JobEvent]);
          } catch {}
        },
      });
    };
    const stop = () => {
      close?.();
      close = null;
      if (alive) setState((s) => (s.live ? { ...s, live: false } : s));
    };

    (async () => {
      if (DEMO) {
        const events = demoEvents();
        lastSeq.current = events[events.length - 1].seq;
        setState({ ...INITIAL, job: demoJob(id), events, load: 'ready', live: true });
        startDemo(id, queue);
        return;
      }
      const cached = await readCache<{ job: JobFull; events: JobEvent[] }>(`job:${id}`);
      if (!alive) return;
      if (cached?.job) {
        lastSeq.current = cached.events[cached.events.length - 1]?.seq ?? 0;
        const more = (cached.events[0]?.seq ?? 1) > 1;
        setState((s) => (s.job ? s : { ...s, job: cached.job, events: cached.events, more, load: 'ready' }));
      }
      if (!(await loadToken())) { if (alive) setState((s) => ({ ...s, load: 'signedOut' })); return; }
      try {
        const r = await workApi.job(id, TAIL);
        if (!alive) return;
        lastSeq.current = r.events[r.events.length - 1]?.seq ?? 0;
        fresh.current = true;
        setState((s) => ({ ...s, job: r.job, events: r.events, more: r.more, load: 'ready', error: null }));
        writeCache(`job:${id}`, { job: r.job, events: slim(r.events) });
        baseline = true;
        if (AppState.currentState !== 'background') start();
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) { setToken(null).catch(() => {}); setState((s) => ({ ...s, load: 'signedOut' })); return; }
        const message = (e as Error).message || "Couldn't reach your PC.";
        if (cached?.job) {
          // The cached thread stays up; the stream keeps retrying and catches up from the cached seq.
          setState((s) => ({ ...s, error: message }));
          baseline = true;
          start();
        } else setState((s) => ({ ...s, load: 'error', error: message }));
      }
    })();

    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') start();
      else if (a === 'background') { stop(); persist(); }
    });
    return () => {
      alive = false;
      sub.remove();
      close?.();
      close = null;
      if (b.raf !== null) { cancelAnimationFrame(b.raf); b.raf = null; }
      demoRuns.get(id)?.stop();
      demoRuns.delete(id);
      persist();
    };
  }, [id, nonce, queue]);

  const loadOlder = useCallback(async () => {
    const s = latest.current;
    if (DEMO || !fresh.current || olderBusy.current || !s.more || !s.events.length) return;
    olderBusy.current = true;
    setState((x) => ({ ...x, older: 'loading' }));
    try {
      const r = await workApi.events(id, s.events[0].seq);
      setState((x) => {
        const first = x.events[0]?.seq ?? Infinity;
        return { ...x, events: [...r.events.filter((e) => e.seq < first), ...x.events], more: r.more, older: 'idle' };
      });
    } catch {
      setState((x) => ({ ...x, older: 'error' }));
    } finally {
      olderBusy.current = false;
    }
  }, [id]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, load: s.job ? s.load : 'loading', error: null }));
    setNonce((n) => n + 1);
  }, []);
  /** Local changes to known events only (a permission marked answered); new seqs come from the PC. */
  const apply = useCallback((job: Partial<JobFull> | null, evs: JobEvent[] = []) => {
    setState((s) => ({ ...s, job: mergeJob(s.job, job), events: mergeEvents(s.events, evs) }));
  }, []);

  return { ...state, loadOlder, reload, apply };
}
