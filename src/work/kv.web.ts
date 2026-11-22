import type { KV } from './kv';

// Web build of the hub cache: localStorage (absent in private windows, so every call is guarded).
export const kv: KV = {
  async get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  async set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch {} },
  async del(k) { try { globalThis.localStorage?.removeItem(k); } catch {} },
};
