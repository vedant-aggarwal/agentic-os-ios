import { requireOptionalNativeModule } from 'expo';
import { api, API, ApiError, currentToken } from './api';

// Files between this phone and the PC (server: pc-files.ts). The route is picked per transfer: straight to the PC on
// the same Wi-Fi first, then over Tailscale, then through the internet tunnel. The direct routes use the trackpad's
// short-lived ticket, never the sign-in token. Sends go in 4 MB pieces at byte offsets, so a dropped connection (or a
// switch from Wi-Fi to mobile data) carries on from where it stopped, on whichever route works then.
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
export const filesAvailable = !!fs;

export type RouteKind = 'wifi' | 'tailscale' | 'internet';
type Route = { kind: RouteKind; url: (sub: string, q?: Record<string, string | number>) => string; headers: Record<string, string> };
export type PcFile = { name: string; size: number; modified: string };

const PIECE = 4 * 1024 * 1024;
const PROBE_MS = 800;

const qs = (q: Record<string, string | number>) => Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
const tunnel = (): Route => {
  const t = currentToken();
  return {
    kind: 'internet', headers: t ? { Authorization: `Bearer ${t}` } : {},
    url: (sub, q = {}) => `${API}/pc/files${sub}${Object.keys(q).length ? `?${qs(q)}` : ''}`,
  };
};

async function probe(base: string, ticket: string) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROBE_MS);
  try { return (await fetch(`${base}/f/ping?t=${ticket}`, { signal: ctl.signal })).ok; } catch { return false; } finally { clearTimeout(timer); }
}

/** The best way to the PC right now: Wi-Fi, else Tailscale, else the internet. */
export async function bestRoute(): Promise<Route> {
  try {
    const t = await api<{ ticket: string | null; http?: string[] }>('/pc/pointer-ticket');
    if (t.ticket && t.http?.length) {
      const ok = await Promise.all(t.http.map((b) => probe(b, t.ticket!)));
      // the PC lists its Wi-Fi addresses before Tailscale's, so the first that answered is the nearest
      const i = ok.indexOf(true);
      if (i >= 0) {
        const base = t.http[i], ticket = t.ticket;
        const kind: RouteKind = /^http:\/\/100\./.test(base) ? 'tailscale' : 'wifi';
        return { kind, headers: {}, url: (sub, q = {}) => `${base}/f${sub}?${qs({ ...q, t: ticket })}` };
      }
    }
  } catch {}
  return tunnel();
}

async function call<T>(r: Route, method: string, sub: string, body?: unknown, q?: Record<string, string | number>): Promise<T> {
  const res = await fetch(r.url(sub, q), {
    method, headers: { ...r.headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, out?.error ?? `The PC said HTTP ${res.status}.`);
  return out as T;
}

export type SendProgress = { sent: number; size: number; route: RouteKind };

/** Send a file from this phone to the PC's Downloads\From Phone. Resolves with the name it got there. */
export async function sendFile(uri: string, name: string, onProgress: (p: SendProgress) => void): Promise<string> {
  if (!fs) throw new Error('File sharing arrives with the next app build.');
  const file = new fs.File(uri);
  const size = file.size ?? 0;
  let r = await bestRoute();
  const st = await call<{ id?: string; have?: number; done?: boolean; name?: string }>(r, 'POST', '/start', { name, size });
  if (st.done) return st.name ?? name;
  const id = st.id!;
  let have = 0, fails = 0;
  const h = file.open();
  try {
    while (have < size) {
      onProgress({ sent: have, size, route: r.kind });
      h.offset = have;
      const piece = await h.readBytes(PIECE);
      try {
        const res = await fetch(r.url(`/put/${id}`, { at: have }), { method: 'PUT', body: piece, headers: { ...r.headers, 'Content-Type': 'application/octet-stream' } });
        const out = await res.json().catch(() => null);
        if (res.status === 404) throw new ApiError(404, out?.error ?? 'That transfer expired. Send it again.');
        if (!res.ok && res.status !== 409) throw new Error(out?.error ?? `HTTP ${res.status}`);
        if (out?.done) { onProgress({ sent: size, size, route: r.kind }); return out.name as string; }
        have = Number(out?.have ?? have); fails = 0;
      } catch (e) {
        if (e instanceof ApiError || ++fails > 6) throw e;
        await new Promise((ok) => setTimeout(ok, 500 * fails));
        r = await bestRoute(); // the network may have changed; the PC still has what it got
      }
    }
  } finally { try { h.close(); } catch {} }
  throw new Error('The PC never confirmed the file.');
}

export const listOutbox = async () => call<{ folder: string; files: PcFile[] }>(await bestRoute(), 'GET', '/outbox');
export const listInbox = async () => call<{ folder: string; files: PcFile[] }>(await bestRoute(), 'GET', '/inbox');
/** Open the folder on the PC with that file selected. */
export const showOnPc = async (box: 'inbox' | 'outbox', name?: string) => call(await bestRoute(), 'POST', '/show', { box, name });

/** Download a file from the PC's Downloads\To Phone onto this phone, then open it (share, save to Files or Photos). */
export async function fetchFromPc(name: string): Promise<{ route: RouteKind }> {
  if (!fs) throw new Error('File sharing arrives with the next app build.');
  const r = await bestRoute();
  const dir = new fs.Directory(fs.Paths.document, 'From PC');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new fs.File(dir, name);
  if (dest.exists) dest.delete();
  const f = await fs.File.downloadFileAsync(r.url(`/outbox/${encodeURIComponent(name)}`), dest, { headers: r.headers });
  try { await fs.File.preview(f); } catch { /* older builds: it is saved in the app's Files folder */ }
  return { route: r.kind };
}
