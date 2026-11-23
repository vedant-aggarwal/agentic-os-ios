import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Dev-only, web-only: `?stage=<port>` points the app at a stage server on this PC (the server's stage.ts: the real
// modules on a copy of the data, no sign-in). Never active in a TestFlight/release build or on the phone.
const stagePort = __DEV__ && Platform.OS === 'web' && typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('stage') : null;
export const STAGE = !!stagePort && /^\d{2,5}$/.test(stagePort);
// The web build is served by the phone server itself (agentic.norrita.com), so it signs in with the server's
// HttpOnly session cookie on the same origin; the phone apps use a Bearer token.
export const WEB = Platform.OS === 'web' && !STAGE;
const webOrigin = WEB && typeof location !== 'undefined' ? location.origin : null;
// The phone server on Vedant's PC, public through the Home tunnel.
export const API = STAGE ? `http://127.0.0.1:${stagePort}/api/v1` : webOrigin ? `${webOrigin}/api/v1` : 'https://agentic.norrita.com/api/v1';
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

// The Action button control (targets/controls) runs without the app, so it reads the sign-in from a shared keychain.
const shared = Platform.OS === 'ios' ? requireOptionalNativeModule<{ set(token: string | null, api: string): boolean }>('SharedAuth') : null;
const share = (v: string | null) => { try { shared?.set(v, API); } catch {} };

let token: string | null = null;
// Who else wants to know when sign-in changes (the desktop sidebar shows only once signed in).
const authSubs = new Set<(signedIn: boolean) => void>();
export function onAuth(f: (signedIn: boolean) => void) { authSubs.add(f); return () => { authSubs.delete(f); }; }
const told = () => authSubs.forEach((f) => f(!!token));
const COOKIE = 'cookie'; // web: signed in through the session cookie, which JS never sees
export async function loadToken() {
  if (STAGE) { token = 'stage'; told(); return token; } // the stage server asks for no sign-in
  if (WEB) {
    try { token = (await fetch(`${API}/me`, { credentials: 'same-origin' })).ok ? COOKIE : null; } catch { token = COOKIE; } // offline: let the next call say so
    told();
    return token;
  }
  token = await store.get(); share(token); return token;
}
export async function setToken(v: string | null) {
  if (WEB) { token = v ? COOKIE : null; told(); return; }
  token = v; await store.set(v); share(v); told();
}
/** The Bearer token to send, or null. On web the cookie carries the session, so there is none to send. */
export const currentToken = () => (token === COOKIE ? null : token);

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// A Nora answer can take longer than the phone or the tunnel will hold a request open: iOS gives up on a request that
// has heard nothing for about a minute, Cloudflare after 100 s (524), and while the PC restarts the tunnel answers
// 502 or 530 with an HTML page. Each used to read "Can't reach your PC" or "Server answered 524." even though the PC
// was up and often still finishing the answer, which it then keeps.
const SLOW = 'Your PC took too long to answer. If Nora was working on it, the answer may still land; look again in a minute.';
/** What a fetch that threw means: the phone's own timeout, or no way through to the PC. */
export function unreachable(e: unknown) {
  return new ApiError(0, /timed? ?out/i.test(String((e as Error)?.message ?? e)) ? SLOW : "Can't reach your PC. Check it's on and online.");
}
/** A refusal: the PC's own words when it sent them, else what the tunnel's status means. */
export function refusal(status: number, data: unknown) {
  const said = (data as { error?: unknown } | null)?.error;
  if (typeof said === 'string' && said) return new ApiError(status, said);
  if (status === 504 || status === 524) return new ApiError(status, SLOW);
  if ([502, 503, 521, 522, 523, 530].includes(status)) return new ApiError(status, "Your PC isn't answering right now. It may be restarting; try again in a moment.");
  return new ApiError(status, `Server answered ${status}.`);
}

/** `idem`: a key that makes a create safe to send twice (the PC answers the second with the first's result). */
export async function api<T>(path: string, init: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(WEB ? {} : { 'X-Client': 'native' }),
        ...(currentToken() ? { Authorization: `Bearer ${currentToken()}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.idem ? { 'Idempotency-Key': init.idem } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    throw unreachable(e);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw refusal(res.status, data);
  return data as T;
}

export async function signIn(email: string, password: string) {
  const r = await api<{ token?: string; user?: unknown }>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
  if (WEB && r.user) return setToken(COOKIE);
  if (!r.token) throw new ApiError(500, 'The server did not return a session.');
  await setToken(r.token);
}

export async function signOut() {
  try { await api('/auth/logout', { method: 'POST', body: {} }); } catch {}
  await setToken(null);
}
