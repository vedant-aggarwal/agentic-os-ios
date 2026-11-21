import { Platform } from 'react-native';

// The phone server on Vedant's PC, public through the Home tunnel.
export const API = 'https://agentic.norrita.com/api/v1';
const KEY = 'aos_token';

// expo-secure-store is native. An older dev client without it falls back to memory,
// so the app still runs (you just sign in again after a restart).
type Store = { get(): Promise<string | null>; set(v: string | null): Promise<void> };
let memory: string | null = null;
const store: Store = (() => {
  if (Platform.OS === 'web') {
    return {
      async get() { try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; } },
      async set(v) {
        try { if (v) globalThis.localStorage?.setItem(KEY, v); else globalThis.localStorage?.removeItem(KEY); } catch {}
      },
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SS = require('expo-secure-store') as typeof import('expo-secure-store');
    return {
      get: () => SS.getItemAsync(KEY),
      async set(v) { if (v) await SS.setItemAsync(KEY, v); else await SS.deleteItemAsync(KEY); },
    };
  } catch {
    return { async get() { return memory; }, async set(v) { memory = v; } };
  }
})();

let token: string | null = null;
export async function loadToken() { token = await store.get(); return token; }
export async function setToken(v: string | null) { token = v; await store.set(v); }
export const currentToken = () => token;

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: init.method ?? 'GET',
      headers: {
        'X-Client': 'native',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach your PC. Check it's on and online.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Server answered ${res.status}.`);
  return data as T;
}

export async function signIn(email: string, password: string) {
  const r = await api<{ token?: string }>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
  if (!r.token) throw new ApiError(500, 'The server did not return a session.');
  await setToken(r.token);
}

export async function signOut() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch {}
  await setToken(null);
}
