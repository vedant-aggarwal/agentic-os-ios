import { kv } from './kv';

// The phone's own copy of the hub, so every screen draws on the first frame and refreshes after.
// Storage lives in kv.ts (native: expo-sqlite) and kv.web.ts (web: localStorage).

const PREFIX = 'work:v1:';

export async function readCache<T>(key: string): Promise<T | null> {
  const raw = await kv.get(PREFIX + key).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Writes are fire and forget: a failed cache write only costs the next cold start. */
export function writeCache(key: string, value: unknown) {
  kv.set(PREFIX + key, JSON.stringify(value)).catch(() => {});
}

export function dropCache(key: string) {
  kv.del(PREFIX + key).catch(() => {});
}
