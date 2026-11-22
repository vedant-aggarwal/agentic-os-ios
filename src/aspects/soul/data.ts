import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { collection, invalidate, useGet, type Doc } from '@/lib/mod';

// Soul's data: the shapes the server answers (server/modules/soul.ts, soul-clean.ts, soul-journal.ts), the reads the
// page shares, what the phone keeps on its own disk so a rough moment works with the PC away, and the outbox that
// holds a log until the PC answers.

// ── shapes ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Kept = { kept: number; of: number };
export type Plan = Doc & { if?: string | null; then: string; start: string; end?: string | null; days?: number[]; nudge?: boolean; active?: boolean; from?: string | null };
export type Urge = Doc & { at: string; out?: 'rode' | 'slip'; place?: string | null; before?: string | null; feel?: string | null; mins?: number | null; steps?: string[]; level?: number | null; ended?: string | null; source?: string | null };
export type Reading<T> = { id: string; kind: string; date: string; at: string; v: string; model?: string | null; n?: number; out: T };
export type PatternOut = { headline: string; when: string; why: string; kept: string; plans: { if: string; then: string; start: string; end: string; days: number[]; why: string }[] };
export type CleanNow =
  | { setup: false; today: string; reasons: string[]; actions: string[] }
  | {
    setup: true; today: string; since: string; start: string; day: number; full: number; best: number;
    kept: Kept; last30: Kept; last90: Kept; slips: number;
    strip: { d: string; s: 'none' | 'kept' | 'slip' | 'today' }[];
    milestone: { next: { days: number; in: number } | null; reached: { days: number; today: boolean } | null };
    pledged: boolean; yesterday: { date: string; closed: string | null; slip: boolean; tracked: boolean };
    reasons: string[]; actions: string[]; change: { text: string; at: string } | null; plans: Plan[];
    hours: { counts: number[]; slips: number[]; n: number };
    windows: { h: number; n: number; start: string; end: string; days: number[]; label: string }[];
    tags: { before: { k: string; n: number }[]; feel: { k: string; n: number }[]; place: { k: string; n: number }[] };
    month: { urges: number; rode: number; slips: number };
    recent: Urge[]; reading: Reading<PatternOut> | null;
  };
export type CleanRec = Doc & { name?: string; since?: string; active?: boolean; reasons?: string[]; actions?: string[]; pledge?: { date: string; at: string } | null; widget?: boolean; goal?: number; horizon?: number };
export type Suggestion = { id: string; kind: string; title: string; detail: string | null; prompt: string };
export type Prompt = { id: string; text: string; from: 'bank' | 'ai' };
export type JournalOut = { headline: string; good: string; returning: string[]; noticed: string; quotes: { date: string; text: string }[] };
export type JournalDay = {
  date: string; suggestions: Suggestion[]; prompts: Prompt[];
  stats: { days: number; entries: number; words: number; streak: { current: number; best: number; today: boolean }; week: number };
  reading: Reading<JournalOut> | null;
};
export type Photo = { file: string; path: string };
export type Asked = { q: string; a?: string; at: string; v: string };
export type Entry = Doc & {
  date: string; at: string; text: string; title?: string; kind?: string; p?: number | null; e?: number | null; words?: number;
  photos?: Photo[]; prompt?: string | null; asked?: Asked[]; body?: string; raw?: string | null; tidy?: { text: string; v: string; at: string } | null;
  bookmark?: boolean; by?: string; source?: string; lines?: { at: string; by: string; text: string }[];
};
export type Sit = Doc & { date: string; at: string; secs: number; mins: number; pattern: string };
export type Settings = Doc & { remind?: string | null };

export const useCleanNow = () => useGet<CleanNow>('/mod/soul/clean/now');
export const useJournalDay = () => useGet<JournalDay>('/mod/soul/journal');
export const refreshClean = () => invalidate('/mod/soul/clean');
export const refreshJournal = () => invalidate('/mod/soul/journal');

// ── the phone's own disk ────────────────────────────────────────────────────────────────────────────────────────────
// Documents/soul/<key>.json on the phone (expo-file-system), localStorage in the web preview. Reads never throw.
type FS = typeof import('expo-file-system');
/* eslint-disable @typescript-eslint/no-require-imports */
const fs: FS | null = Platform.OS !== 'web' && requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const memory = new Map<string, string>();
function readRaw(key: string): string | null {
  try {
    if (fs) { const f = new fs.File(new fs.Directory(fs.Paths.document, 'soul'), `${key}.json`); return f.exists ? f.textSync() : null; }
    return globalThis.localStorage?.getItem(`soul.${key}`) ?? memory.get(key) ?? null;
  } catch { return memory.get(key) ?? null; }
}
function writeRaw(key: string, v: string) {
  memory.set(key, v);
  try {
    if (fs) {
      const d = new fs.Directory(fs.Paths.document, 'soul');
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      new fs.File(d, `${key}.json`).write(v);
      return;
    }
    globalThis.localStorage?.setItem(`soul.${key}`, v);
  } catch {}
}
export function readLocal<T>(key: string): T | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
export const writeLocal = (key: string, v: unknown) => writeRaw(key, JSON.stringify(v));

/** What a rough moment needs with the PC away: his reasons, his things to do, his plans, the run's start. */
export type MomentKit = { reasons: string[]; actions: string[]; plans: Plan[]; since: string | null; at: string };
export function rememberKit(c: CleanNow | null) {
  if (!c) return;
  writeLocal('kit', { reasons: c.reasons, actions: c.actions, plans: c.setup ? c.plans : [], since: c.setup ? c.since : null, at: new Date().toISOString() } satisfies MomentKit);
}
export const kit = () => readLocal<MomentKit>('kit');

// ── the outbox: logs made with the PC away, sent in order when it answers ───────────────────────────────────────────
type Job = { id: string; method: 'PUT' | 'POST'; path: string; body: unknown; at: string };
let jobs: Job[] = readLocal<Job[]>('outbox') ?? [];
let flushing = false;
const subs = new Set<() => void>();
const publish = () => { writeLocal('outbox', jobs); for (const fn of subs) fn(); };

/** Send it now; if the PC can't be reached it waits on the phone and goes later. Resolves either way. */
export async function send(job: Omit<Job, 'at'>): Promise<'sent' | 'queued'> {
  jobs = [...jobs.filter((j) => j.id !== job.id), { ...job, at: new Date().toISOString() }];
  publish();
  await flush();
  return jobs.some((j) => j.id === job.id) ? 'queued' : 'sent';
}

/** Take a log back before it left the phone. True when it was still waiting. */
export function cancel(id: string) {
  if (!jobs.some((j) => j.id === id)) return false;
  jobs = jobs.filter((j) => j.id !== id);
  publish();
  return true;
}

export async function flush() {
  if (flushing || !jobs.length) return;
  flushing = true;
  try {
    for (const j of [...jobs]) {
      try {
        await api(j.path, { method: j.method, body: j.body });
      } catch (e) {
        const refused = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
        if (!refused) break; // the PC is away: keep this and everything after it, in order
      }
      jobs = jobs.filter((x) => x.id !== j.id);
      publish();
    }
  } finally {
    flushing = false;
  }
  collection('soul', 'urges').refresh().catch(() => {});
  refreshClean();
}

/** How many logs are waiting for the PC. Flushes when the app comes back to the front. */
export function useOutbox() {
  const n = useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => jobs.length, () => jobs.length);
  useEffect(() => {
    void flush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flush(); });
    const id = setInterval(() => { void flush(); }, 30_000);
    return () => { sub.remove(); clearInterval(id); };
  }, []);
  return n;
}

// ── small clocks ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Now, refreshed every `ms` while `on`. */
export function useNow(ms: number, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms, on]);
  return now;
}

/** True while the app is in the foreground. */
export function useForeground() {
  const [on, setOn] = useState(AppState.currentState === 'active' || Platform.OS === 'web');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setOn(s === 'active' || Platform.OS === 'web'));
    return () => sub.remove();
  }, []);
  return on;
}

/** The IST hour and minute of an instant, "23:40". */
export const hm = (at: string | number) => new Date(new Date(at).getTime() + 5.5 * 3600_000).toISOString().slice(11, 16);
/** Minutes into the IST day. */
export const istMin = (ms = Date.now()) => { const d = new Date(ms + 5.5 * 3600_000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
/** 1 Monday .. 7 Sunday for an IST day. */
export const isoDow = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
