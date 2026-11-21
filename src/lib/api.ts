import { useCallback, useEffect, useState } from 'react';

const BASE = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4870').replace(/\/$/, '');
const TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || '';

/** WebSocket URL for a server route, with the app token in the query (sockets can't send headers from the browser). */
export function socketUrl(path: string) {
  return BASE.replace(/^http/, 'ws') + path + (TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : '');
}

export type Day = { posted: number; queued: number; failed: number };

export type Channel = {
  id: string;
  platform: 'youtube' | 'instagram';
  status: string;
  handle: string | null;
  name: string;
  perDay: number;
  slots: { timezone: string; times: string[]; note?: string } | null;
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
  posts: Post[];
  pipeline: { ideas: number; scripts: number; shoot: number; edit: number; ready: number };
};

export type Post = {
  date: string;
  at: string;
  title: string;
  status: 'published' | 'queued' | 'failed';
  url: string | null;
  thumb: string | null;
  views: number | null;
  error: string | null;
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

export type WeekDayState = { state: 'full' | 'part' | 'none' | 'future'; today: boolean };

/** This week (Sunday first) for one channel: day states for the ring, posts out, the target, and slots still open today. */
export function weekOf(ch: Channel, today: string) {
  const start = weekStart(today);
  let posted = 0;
  const days: WeekDayState[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    if (d > today) return { state: 'future', today: false };
    const st = slotsFor(ch, d, today).states;
    const done = st.filter((x) => x === 'posted').length;
    posted += done;
    return { state: done === 0 ? 'none' : done >= st.length ? 'full' : 'part', today: d === today };
  });
  const due = slotsFor(ch, today, today).states.filter((x) => x === 'open').length;
  return { days, posted, target: Math.max(ch.perDay, 1) * 7, due };
}

/** Clock time in IST, e.g. "11:01 pm". Done by hand so it doesn't depend on the device's Intl time zones. */
export function istTime(at: string) {
  const t = new Date(new Date(at).getTime() + 5.5 * 3600e3);
  return clock(t.getUTCHours(), t.getUTCMinutes());
}

/** "19:30" -> "7:30 pm". */
export function clock(h: number, m: number) {
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Consecutive days with at least one post, counting back from today (or yesterday if today has none yet). */
export function streak(ch: Channel, today: string) {
  let d = (ch.days[today]?.posted || 0) > 0 ? today : addDays(today, -1);
  let n = 0;
  while ((ch.days[d]?.posted || 0) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Reels: the new production system, stored by app/server.mjs under app/data ----------

export const REEL_STAGES = ['idea', 'structure', 'script', 'voice', 'visuals', 'edit', 'ready'] as const;
export type ReelStage = (typeof REEL_STAGES)[number];

export type Concept = { title: string; hook: string; premise: string; why: string };
export type Beat = { time: string; beat: string; visual: string; line: string };

export type Reel = {
  id: string;
  channelId: string;
  title: string;
  hook?: string;
  premise?: string;
  why?: string;
  /** Vedant's raw extra context: direction for later steps, never shown as the idea itself. */
  notes?: string;
  sources?: string[];
  direction?: { id: string; name: string; other: string | null } | null;
  structure?: { lengthSeconds: number; beats: Beat[] } | null;
  /** A step the server is building right now, e.g. 'structure'. */
  working?: string | null;
  error?: string | null;
  idea: string;
  /** The furthest step finished. */
  stage: ReelStage;
  createdAt: string;
  updatedAt: string;
};

export type Direction = { id: string; name: string; skill: string | null; summary: string; channels: string[]; preview?: string };
export type Profile = { id: string; name: string; platform: string; language: string | null; promise: string | null };

/** Run one whitelisted write verb on the server (see ACTIONS in app/server.mjs). */
export async function act<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE + '/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await res.json().catch(() => ({ ok: false, error: `Server answered ${res.status}` }));
  if (!res.ok || out.ok === false) throw new Error(out.error || `Server answered ${res.status}`);
  return out as T;
}

// One shared reel list so the channel page, reel page and New reel screen stay in step.
let reelsMemo: Reel[] | null = null;
const reelListeners = new Set<(r: Reel[]) => void>();
const setReels = (r: Reel[]) => {
  reelsMemo = r;
  reelListeners.forEach((l) => l(r));
};

export function useReels() {
  const [reels, set] = useState<Reel[] | null>(reelsMemo);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setReels((await api<{ reels: Reel[] }>('/api/reels')).reels);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    reelListeners.add(set);
    if (!reelsMemo) load();
    return () => {
      reelListeners.delete(set);
    };
  }, [load]);
  return { reels, error, reload: load };
}

/** Ask the server's idea writer for concept drafts. `direction` is raw text and is interpreted, never used verbatim. */
export async function draftConcepts(input: { channelId: string; direction: string; directionId: string; directionOther: string; avoid: string[] }) {
  return (await act<{ ideas: Concept[] }>('ideas.draft', input)).ideas;
}

/** Turn picked concepts into reels: one each ("separate") or one merged reel ("combined"). The structure builds in the background. */
export async function createReels(input: { channelId: string; ideas: Concept[]; notes: string; mode: 'separate' | 'combined'; directionId: string; directionOther: string }) {
  const { reels } = await act<{ reels: Reel[] }>('reels.create', input);
  setReels([...reels, ...(reelsMemo || [])]);
  return reels;
}

export async function rebuildStructure(id: string) {
  await act('reels.restructure', { id });
  if (reelsMemo) setReels(reelsMemo.map((r) => (r.id === id ? { ...r, working: 'structure', error: null } : r)));
}

// Directions and profiles change rarely: fetch once per app session.
let dirMemo: { defaults: Record<string, string>; directions: Direction[] } | null = null;
export function useDirections() {
  const [d, set] = useState(dirMemo);
  useEffect(() => {
    if (dirMemo) return;
    api<{ defaults: Record<string, string>; directions: Direction[] }>('/api/directions')
      .then((x) => set((dirMemo = { defaults: x.defaults, directions: x.directions })))
      .catch(() => {});
  }, []);
  return d;
}

let profMemo: Profile[] | null = null;
export function useProfiles() {
  const [p, set] = useState(profMemo);
  useEffect(() => {
    if (profMemo) return;
    api<{ channels: Profile[] }>('/api/profiles').then((x) => set((profMemo = x.channels))).catch(() => {});
  }, []);
  return p;
}
