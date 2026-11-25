import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { kv } from '@/work/kv';
import { api, ApiError, currentToken, onAuth } from './api';
import { DEMO } from './demo';

// The outbox: writes made while the PC is out of reach wait on this phone and go, in order, once it answers.
// Soul has kept its own since the start (src/aspects/soul/data.ts); this is the same idea for the rest of the app:
// Today's ticks, Capture's logs and moods (every collection write in lib/mod.ts), water, and tasks made in Capture.
// A write that can't reach the PC is kept here instead of bouncing back, and Today says "Saved on phone, sends when
// your PC is back" and how many are waiting. It tries again when the app comes to the front, on sign-in and every 30 s.
// The PC refusing one (any answer but the out-of-reach ones below) drops it, since sending it again wouldn't change
// the answer; whoever wrote it hears through onSettled. A job with the id of one still waiting replaces it: the newest
// write of one thing is the one that counts. Only writes that are safe to send twice go here (a PUT of a whole record,
// an absolute PATCH, a create with an idempotency key).

export type Job = { id: string; method: 'PUT' | 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; idem?: string; at: string };
export type Settled = { ok: true; data: unknown } | { ok: false; error: Error };

/** The PC can't be reached (off, asleep, the tunnel down, the phone gave up waiting), as opposed to answering no. */
export const outOfReach = (e: unknown) => e instanceof ApiError
  && (e.status === 0 || e.status === 408 || e.status === 429 || (e.status >= 502 && e.status <= 504) || (e.status >= 520 && e.status <= 530));

const KEY = 'outbox:v1';
let jobs: Job[] = [];
let loading: Promise<void> | null = null;
let flushing: Promise<void> | null = null;
const subs = new Set<() => void>();
const queuedSubs = new Set<() => void>();
const settledSubs = new Set<(job: Job, r: Settled) => void>();

const load = () => loading ??= kv.get(KEY).then((raw) => {
  const saved = raw ? (JSON.parse(raw) as Job[]) : [];
  jobs = [...saved.filter((s) => !jobs.some((j) => j.id === s.id)), ...jobs]; // anything queued meanwhile goes after
}).catch(() => {});
function publish() {
  kv.set(KEY, JSON.stringify(jobs)).catch(() => {});
  for (const f of subs) f();
}

/** Keeps a write that couldn't reach the PC; it goes with the next flush. */
export async function queue(job: Omit<Job, 'at'>) {
  await load();
  jobs = [...jobs.filter((j) => j.id !== job.id), { ...job, at: new Date().toISOString() }];
  publish();
  for (const f of queuedSubs) f();
}

/** Sends a write now, or (PC out of reach, or older writes still waiting, which go first) keeps it to send later.
 *  Rejects only when the PC answers no. */
export async function send<T>(job: Omit<Job, 'at'>): Promise<{ queued: false; data: T } | { queued: true }> {
  if (DEMO) return { queued: false, data: {} as T };
  await load();
  if (jobs.length) await flush();
  if (jobs.length) { await queue(job); return { queued: true }; } // still out of reach: it waits behind them
  try {
    return { queued: false, data: await api<T>(job.path, { method: job.method, body: job.body, idem: job.idem }) };
  } catch (e) {
    if (!outOfReach(e)) throw e;
    await queue(job);
    return { queued: true };
  }
}

/** Sends what is waiting, oldest first; stops at the first that still can't reach the PC. */
export function flush(): Promise<void> {
  if (DEMO || !currentToken()) return Promise.resolve();
  flushing ??= (async () => {
    try {
      await load();
      // always the oldest next, so a write queued while this runs goes too
      for (let j = jobs[0]; j; j = jobs[0]) {
        let r: Settled;
        try { r = { ok: true, data: await api(j.path, { method: j.method, body: j.body, idem: j.idem }) }; }
        catch (e) { if (outOfReach(e)) break; r = { ok: false, error: e as Error }; }
        jobs = jobs.filter((x) => x !== j); // (replaced meanwhile by a newer write of the same thing: that one goes next)
        publish();
        for (const f of settledSubs) f(j, r);
      }
    } finally { flushing = null; }
  })();
  return flushing;
}

/** True while a write with this id waits on the phone. */
export const waiting = (id: string) => jobs.some((j) => j.id === id);
/** The writes waiting whose ids start with `prefix`, oldest first. */
export const waitingWith = (prefix: string) => jobs.filter((j) => j.id.startsWith(prefix));
/** Something was just kept on the phone (Today says so). */
export function onQueued(f: () => void) { queuedSubs.add(f); return () => { queuedSubs.delete(f); }; }
/** A waiting write reached the PC (`ok`), or the PC refused it and it was dropped. */
export function onSettled(f: (job: Job, r: Settled) => void) { settledSubs.add(f); return () => { settledSubs.delete(f); }; }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** How many writes wait on the phone. */
export function useOutbox() {
  return useSyncExternalStore(subscribe, () => jobs.length, () => 0);
}

/** Mounted once by the root layout: sends what waits at launch, on sign-in, when the app comes to the front and every
 *  30 s. Returns the cleanup. */
export function startOutbox(): () => void {
  if (DEMO) return () => {};
  void load().then(() => { for (const f of subs) f(); return flush(); });
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') void flush(); });
  const auth = onAuth((on) => { if (on) void flush(); });
  const id = setInterval(() => { if (jobs.length) void flush(); }, 30_000);
  return () => { app.remove(); auth(); clearInterval(id); };
}
