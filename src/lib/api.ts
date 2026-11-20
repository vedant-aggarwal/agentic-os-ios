import { useCallback, useEffect, useState } from 'react';

const BASE = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4870').replace(/\/$/, '');
const TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || '';

export type Day = { posted: number; queued: number; failed: number };

export type Channel = {
  id: string;
  platform: 'youtube' | 'instagram';
  status: string;
  handle: string | null;
  name: string;
  perDay: number;
  stats: {
    followers: number | null;
    followersDelta: number | null;
    weekViews: number | null;
    weekLikes: number | null;
    weekPosts: number | null;
    weekTarget: number | null;
    totalViews?: number | null;
  };
  days: Record<string, Day>;
  pipeline: { ideas: number; scripts: number; shoot: number; edit: number; ready: number };
};

export type Home = { ok: boolean; today: string; channels: Channel[]; error?: string };

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {} });
  const body = await res.json().catch(() => ({ ok: false, error: `Server answered ${res.status}` }));
  if (!res.ok || body.ok === false) throw new Error(body.error || `Server answered ${res.status}`);
  return body as T;
}

// One shared copy of /api/home so the grid and channel pages stay in step.
let memo: Home | null = null;
let inflight: Promise<Home> | null = null;
const listeners = new Set<(h: Home) => void>();

function fetchHome(fresh: boolean): Promise<Home> {
  if (inflight && !fresh) return inflight;
  const p = api<Home>('/api/home' + (fresh ? '?fresh=1' : '')).finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

export function useHome() {
  const [data, setData] = useState<Home | null>(memo);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!memo);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const h = await fetchHome(fresh);
      memo = h;
      listeners.forEach((l) => l(h));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listeners.add(setData);
    if (!memo) load();
    return () => {
      listeners.delete(setData);
    };
  }, [load]);

  return { data, error, loading, reload: () => load(true) };
}

export function compact(n: number | null | undefined): string {
  if (n == null) return '–';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/** ISO date (YYYY-MM-DD) plus n days. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday that starts the week holding `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return addDays(iso, -d.getUTCDay());
}

export type SlotState = 'posted' | 'queued' | 'missed' | 'open';

/** One state per posting slot on a day, plus how many posts went over the target. */
export function slotsFor(ch: Channel, date: string, today: string): { states: SlotState[]; extra: number } {
  const day = ch.days[date] || { posted: 0, queued: 0, failed: 0 };
  const per = Math.max(ch.perDay, 1);
  const states: SlotState[] = [];
  for (let i = 0; i < per; i++) {
    if (i < day.posted) states.push('posted');
    else if (i < day.posted + day.queued) states.push('queued');
    else states.push(date < today ? 'missed' : 'open');
  }
  return { states, extra: Math.max(0, day.posted + day.queued - per) };
}
