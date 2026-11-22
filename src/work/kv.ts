import { requireOptionalNativeModule } from 'expo';

// Native key-value store for the hub cache: expo-sqlite's kv-store on a build that has it, memory on an older build.
// The web build uses kv.web.ts instead, so Metro never bundles sqlite's wasm for web.
export type KV = { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; del(k: string): Promise<void> };

const memory = new Map<string, string>();
const fallback: KV = {
  async get(k) { return memory.get(k) ?? null; },
  async set(k, v) { memory.set(k, v); },
  async del(k) { memory.delete(k); },
};

export const kv: KV = (() => {
  if (!requireOptionalNativeModule('ExpoSQLite')) return fallback;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store');
    return {
      get: (k) => Storage.getItem(k),
      set: (k, v) => Storage.setItem(k, v),
      del: async (k) => { await Storage.removeItem(k); },
    };
  } catch {
    return fallback;
  }
})();
