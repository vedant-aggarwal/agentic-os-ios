import { requireOptionalNativeModule } from 'expo';
import { fetch as streamFetch } from 'expo/fetch';
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
export type PcFile = { name: string; size: number; modified: string; growing?: boolean };

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
type PutOut = { have?: number; done?: boolean; name?: string; error?: string } | null;
/** One piece up, with byte progress as it goes (fetch can't report upload progress; XMLHttpRequest can). */
function putPiece(url: string, headers: Record<string, string>, body: Uint8Array, onSent: (n: number) => void) {
  return new Promise<{ status: number; out: PutOut }>((ok, fail) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    for (const [k, v] of Object.entries({ ...headers, 'Content-Type': 'application/octet-stream' })) x.setRequestHeader(k, v);
    x.timeout = 120_000;
    x.upload.onprogress = (e) => onSent(e.loaded);
    x.onload = () => { let out: PutOut = null; try { out = JSON.parse(x.responseText); } catch {} ok({ status: x.status, out }); };
    x.onerror = () => fail(new Error('The connection dropped.'));
    x.ontimeout = () => fail(new Error('The PC stopped answering.'));
    x.send(body.buffer.byteLength === body.byteLength ? body.buffer : body.slice().buffer);
  });
}

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
        const at = have, kind = r.kind;
        const { status, out } = await putPiece(r.url(`/put/${id}`, { at }), r.headers, piece, (n) => onProgress({ sent: Math.min(at + n, size), size, route: kind }));
        if (status === 404) throw new ApiError(404, out?.error ?? 'That transfer expired. Send it again.');
        if ((status < 200 || status >= 300) && status !== 409) throw new Error(out?.error ?? `HTTP ${status}`);
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

export type Changes = { v: number; outbox: PcFile[]; inbox: PcFile[] };
/** The two folders, answered as soon as either changes after version v (or after `wait` seconds with no change). */
export async function changes(r: Route, v: number, wait: number, signal?: AbortSignal): Promise<Changes> {
  const res = await fetch(r.url('/changes', { v, wait }), { headers: r.headers, signal });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, out?.error ?? `The PC said HTTP ${res.status}.`);
  return out as Changes;
}

/** Keep the folder lists live while `signal` is open: calls onChange with every new state. */
export async function watchFolders(signal: AbortSignal, onChange: (c: Changes, route: RouteKind) => void, onError: (e: unknown) => void) {
  let r = await bestRoute().catch(() => tunnel());
  let v = 0, fails = 0;
  while (!signal.aborted) {
    try {
      const c = await changes(r, v, v ? 25 : 0, signal);
      fails = 0;
      if (c.v !== v) { v = c.v; onChange(c, r.kind); }
    } catch (e) {
      if (signal.aborted) return;
      if (++fails >= 2) onError(e);
      await new Promise((ok) => setTimeout(ok, Math.min(1000 * fails, 5000)));
      r = await bestRoute().catch(() => tunnel()); // ticket expired or the network changed
    }
  }
}

export type GetProgress = { got: number; size: number; route: RouteKind };
const GET_PIECE = 4 * 1024 * 1024;
/** Download a file from the PC's Downloads\To Phone onto this phone in pieces (live progress, carries on after a
 *  dropped connection), then open it (share, save to Files or Photos). */
export async function fetchFromPc(name: string, size: number, onProgress: (p: GetProgress) => void, open = true): Promise<{ route: RouteKind; uri: string }> {
  if (!fs) throw new Error('File sharing arrives with the next app build.');
  let r = await bestRoute();
  const dir = new fs.Directory(fs.Paths.document, 'From PC');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new fs.File(dir, name);
  if (dest.exists) dest.delete();
  dest.create();
  const h = dest.open();
  let got = 0, fails = 0, total = size;
  try {
    while (got < total || total === 0) {
      onProgress({ got, size: total, route: r.kind });
      try {
        const res = await streamFetch(r.url(`/outbox/${encodeURIComponent(name)}`, { at: got, len: GET_PIECE }), { headers: r.headers });
        if (res.status === 404) throw new ApiError(404, 'That file is no longer in To Phone.');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        total = Number(res.headers.get('X-Size') ?? total);
        if (!res.body) { const b = new Uint8Array(await res.arrayBuffer()); h.offset = got; await h.writeBytes(b); got += b.byteLength; }
        else {
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            h.offset = got; await h.writeBytes(value); got += value.byteLength;
            onProgress({ got, size: total, route: r.kind });
          }
        }
        fails = 0;
        if (total === 0) break;
      } catch (e) {
        if (e instanceof ApiError || ++fails > 6) throw e;
        await new Promise((ok) => setTimeout(ok, 500 * fails));
        r = await bestRoute(); // carry on from `got` on whatever route works now
      }
    }
  } catch (e) { try { h.close(); } catch {} try { dest.delete(); } catch {} throw e; }
  try { h.close(); } catch {}
  onProgress({ got: total, size: total, route: r.kind });
  if (open) try { await fs.File.preview(dest); } catch { /* older builds: it is saved in the app's Files folder */ }
  return { route: r.kind, uri: dest.uri };
}

/** Open a file already downloaded from the PC. */
export async function openDownloaded(uri: string) { if (fs) await fs.File.preview(new fs.File(uri)); }

// ---- a PC file by path, for links in chat text (server: pc-files.ts /read, /raw, /send) ----
export type PcFileRead =
  | { kind: 'text'; name: string; size: number; path: string; text: string; truncated: boolean }
  | { kind: 'image' | 'other'; name: string; size: number; path: string };

/** What is at this absolute PC path: its text (the first 1 MB), or an image or other file's name and size. */
export const readPcFile = async (path: string) => call<PcFileRead>(await bestRoute(), 'GET', '/read', undefined, { path });

/** An image on the PC as a source `expo-image` can draw (carries the route's sign-in). */
export async function pcImageSource(path: string) {
  const r = await bestRoute();
  return { uri: r.url('/raw', { path }), headers: r.headers };
}

/** Copy a PC file into Downloads\To Phone and download it onto the phone, then open it. */
export async function sendPathToPhone(path: string, onProgress: (p: GetProgress) => void) {
  const r = await bestRoute();
  const out = await call<{ name: string; size: number }>(r, 'POST', '/send', { path });
  return fetchFromPc(out.name, out.size, onProgress, true);
}
