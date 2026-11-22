import { useEffect, useSyncExternalStore } from 'react';
import { API, api, ApiError, currentToken, refusal, STAGE, unreachable } from './api';
import { DEMO } from './demo';

// The phone's side of the server's module store (server/modules/_collection.ts). Every aspect module keeps its
// records in collections with one contract:
//   GET    /mod/<module>/<collection>?since=<cursor>  -> { items, cursor }   changed rows; deleted ones carry deleted_at
//   PUT    /mod/<module>/<collection>/<id>  doc       -> { item }            upsert; the WHOLE record is replaced
//   DELETE /mod/<module>/<collection>/<id>            -> { item }            soft delete
// The PC keeps whichever write has the later `updated_at`; one that is equal or older is dropped without an error.
// This file handles that, so pages only call put / patch / remove:
//   - a collection is fetched once and shared by every component that uses it; later pulls ask only for changes
//   - writes show at once and go to the PC in order; if the PC refuses, the record goes back and the call rejects
//   - ids are made here, so a write that is sent twice is the same write
// Nothing is kept on disk yet: with the PC unreachable a page shows what it last loaded this session.

/** Fields the store owns on every record. */
export type Doc = { id: string; created_at?: string; updated_at?: string; deleted_at?: string | null };
/** What a page passes to `put`: its own fields, with an id only when it is changing an existing record. */
export type Draft<T extends Doc> = Omit<T, keyof Doc> & { id?: string };

type Snap = { items: Doc[] | null; error: string | null; busy: boolean };
type Entry = {
  map: Map<string, Doc>; cursor: string | null; loaded: boolean; error: string | null; busy: boolean; at: number;
  snap: Snap; subs: Set<() => void>; inflight: Promise<void> | null;
  stamps: Map<string, number>; // the last updated_at this phone gave each record, so the next is always later
  writing: Map<string, number>; // records with writes on their way; a pull must not put an older copy back
  tails: Map<string, Promise<unknown>>; // one queue per record: its writes reach the PC in the order they were made
};

const STALE = 30_000; // a mounted page re-pulls a collection older than this
const entries = new Map<string, Entry>();

function entryOf(key: string): Entry {
  let e = entries.get(key);
  if (!e) {
    e = {
      map: new Map(), cursor: null, loaded: false, error: null, busy: false, at: 0,
      snap: { items: null, error: null, busy: false }, subs: new Set(), inflight: null,
      stamps: new Map(), writing: new Map(), tails: new Map(),
    };
    entries.set(key, e);
  }
  return e;
}

function publish(e: Entry) {
  e.snap = { items: e.loaded ? [...e.map.values()] : null, error: e.error, busy: e.busy };
  for (const fn of e.subs) fn();
}

/** A new record id: time-ordered, unique enough for one person's phone, inside the server's id rules. */
export function newId(prefix = 'p') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const pathOf = (mod: string, coll: string, id?: string) => `/mod/${mod}/${coll}${id ? `/${encodeURIComponent(id)}` : ''}`;

function pull(mod: string, coll: string): Promise<void> {
  const e = entryOf(`${mod}/${coll}`);
  if (e.inflight) return e.inflight;
  if (DEMO) { // the sample-data preview has no PC: collections start empty and live in memory
    if (!e.loaded) { e.loaded = true; e.at = Date.now(); publish(e); }
    return Promise.resolve();
  }
  e.busy = true;
  publish(e);
  e.inflight = (async () => {
    try {
      const r = await api<{ items: Doc[]; cursor: string }>(pathOf(mod, coll) + (e.cursor != null ? `?since=${e.cursor}` : ''));
      for (const d of r.items) {
        if (e.writing.has(d.id)) continue;
        if (d.deleted_at) e.map.delete(d.id); else e.map.set(d.id, d);
      }
      e.cursor = r.cursor; e.loaded = true; e.error = null; e.at = Date.now();
    } catch (err) {
      e.error = (err as Error).message; // what was loaded before stays on screen
    } finally {
      e.inflight = null; e.busy = false;
      publish(e);
    }
  })();
  return e.inflight;
}

/** Always later than the record's last stamp, even for two writes in one millisecond or a phone clock that runs behind. */
function stamp(e: Entry, id: string, prev: Doc | undefined) {
  const last = Math.max(e.stamps.get(id) ?? 0, prev?.updated_at ? Date.parse(prev.updated_at) || 0 : 0);
  const ts = Math.max(Date.now(), last + 1);
  e.stamps.set(id, ts);
  return new Date(ts).toISOString();
}

function enqueue<R>(e: Entry, id: string, run: () => Promise<R>): Promise<R> {
  e.writing.set(id, (e.writing.get(id) ?? 0) + 1);
  const next = (e.tails.get(id) ?? Promise.resolve()).catch(() => {}).then(run).finally(() => {
    const n = (e.writing.get(id) ?? 1) - 1;
    if (n <= 0) e.writing.delete(id); else e.writing.set(id, n);
    if (e.tails.get(id) === next) e.tails.delete(id);
  });
  e.tails.set(id, next);
  return next;
}

async function putDoc<T extends Doc>(mod: string, coll: string, input: Draft<T>): Promise<T> {
  const e = entryOf(`${mod}/${coll}`);
  const id = input.id ?? newId();
  const prev = e.map.get(id);
  const updated_at = stamp(e, id, prev);
  const doc = { ...input, id, created_at: prev?.created_at ?? updated_at, updated_at, deleted_at: null } as unknown as T;
  e.map.set(id, doc);
  publish(e);
  if (DEMO) return doc;
  return enqueue(e, id, async () => {
    try {
      const r = await api<{ item: T }>(pathOf(mod, coll, id), { method: 'PUT', body: doc });
      if (e.map.get(id) === doc) { e.map.set(id, r.item); publish(e); } // unless a newer local write is already showing
      return r.item;
    } catch (err) {
      if (e.map.get(id) === doc) { if (prev) e.map.set(id, prev); else e.map.delete(id); publish(e); }
      throw err;
    }
  });
}

async function removeDoc(mod: string, coll: string, id: string): Promise<void> {
  const e = entryOf(`${mod}/${coll}`);
  const prev = e.map.get(id);
  e.map.delete(id);
  publish(e);
  if (DEMO) return;
  return enqueue(e, id, async () => {
    try {
      await api(pathOf(mod, coll, id), { method: 'DELETE' });
    } catch (err) {
      if (prev && !e.map.has(id)) { e.map.set(id, prev); publish(e); }
      throw err;
    }
  });
}

export type Collection<T extends Doc> = {
  /** Every live record, in the order the PC keeps them (oldest write first). `null` until the first load answers. */
  items: T[] | null;
  /** Why the last pull failed. With `items` still null the page has nothing to show: offer `refresh`. */
  error: string | null;
  /** A pull is on its way. */
  busy: boolean;
  refresh: () => Promise<void>;
  /** Create (no id) or replace (with id) a record. Shows at once; rejects and puts the old record back if the PC refuses. */
  put: (doc: Draft<T>) => Promise<T>;
  /** Change some fields of an existing record. The rest of the record is kept. */
  patch: (id: string, change: Partial<Omit<T, keyof Doc>>) => Promise<T>;
  remove: (id: string) => Promise<void>;
};

/** One collection of a module, loaded once and shared: `useCollection<Meal>('body', 'meals')`. */
export function useCollection<T extends Doc>(mod: string, coll: string): Collection<T> {
  const e = entryOf(`${mod}/${coll}`);
  const snap = useSyncExternalStore(
    (fn) => { e.subs.add(fn); return () => { e.subs.delete(fn); }; },
    () => e.snap,
    () => e.snap,
  );
  useEffect(() => {
    if (!e.loaded || Date.now() - e.at > STALE) void pull(mod, coll);
  }, [e, mod, coll]);
  return {
    items: snap.items as T[] | null,
    error: snap.error,
    busy: snap.busy,
    refresh: () => pull(mod, coll),
    put: (doc) => putDoc<T>(mod, coll, doc),
    patch: (id, change) => {
      const cur = e.map.get(id);
      if (!cur) return Promise.reject(new ApiError(404, 'That record is gone.'));
      return putDoc<T>(mod, coll, { ...(cur as T), ...change, id } as Draft<T>);
    },
    remove: (id) => removeDoc(mod, coll, id),
  };
}

/** The same collection outside a component (a timer callback, a helper). Reads what is loaded; does not subscribe. */
export function collection<T extends Doc>(mod: string, coll: string) {
  const e = entryOf(`${mod}/${coll}`);
  return {
    get: () => (e.loaded ? ([...e.map.values()] as T[]) : null),
    refresh: () => pull(mod, coll),
    put: (doc: Draft<T>) => putDoc<T>(mod, coll, doc),
    remove: (id: string) => removeDoc(mod, coll, id),
  };
}

// ── computed reads: a module's own GET routes (a summary, today's plan) ─────────────────────────────────────
type GetSnap = { data: unknown; error: string | null; busy: boolean };
type GetEntry = { snap: GetSnap; subs: Set<() => void>; inflight: Promise<void> | null; at: number };
const gets = new Map<string, GetEntry>();

function getOf(path: string): GetEntry {
  let g = gets.get(path);
  if (!g) { g = { snap: { data: null, error: null, busy: false }, subs: new Set(), inflight: null, at: 0 }; gets.set(path, g); }
  return g;
}

function fetchGet(path: string): Promise<void> {
  const g = getOf(path);
  if (g.inflight) return g.inflight;
  const set = (snap: GetSnap) => { g.snap = snap; for (const fn of g.subs) fn(); };
  if (DEMO) { set({ data: null, error: 'Not in the sample preview.', busy: false }); return Promise.resolve(); }
  set({ ...g.snap, busy: true });
  g.inflight = (async () => {
    try {
      const data = await api<unknown>(path);
      g.at = Date.now();
      set({ data, error: null, busy: false });
    } catch (err) {
      set({ data: g.snap.data, error: (err as Error).message, busy: false });
    } finally {
      g.inflight = null;
    }
  })();
  return g.inflight;
}

export type Read<T> = { data: T | null; error: string | null; busy: boolean; refresh: () => Promise<void> };

/**
 * A GET route, shared and cached by its path: `useGet<BodyToday>('/mod/body/today')`. Pass null to wait.
 * After a write that changes what the route answers, call `invalidate('/mod/body/')`.
 */
export function useGet<T>(path: string | null): Read<T> {
  const g = path ? getOf(path) : null;
  const snap = useSyncExternalStore(
    (fn) => { g?.subs.add(fn); return () => { g?.subs.delete(fn); }; },
    () => (g ? g.snap : IDLE),
    () => (g ? g.snap : IDLE),
  );
  useEffect(() => {
    if (path && g && (g.at === 0 || Date.now() - g.at > STALE)) void fetchGet(path);
  }, [path, g]);
  return {
    data: snap.data as T | null, error: snap.error, busy: snap.busy,
    refresh: () => (path ? fetchGet(path) : Promise.resolve()),
  };
}
const IDLE: GetSnap = { data: null, error: null, busy: false };

/** Mark every cached GET whose path starts with `prefix` as stale; the ones on screen are fetched again now. */
export function invalidate(prefix: string) {
  for (const [path, g] of gets) {
    if (!path.startsWith(prefix)) continue;
    g.at = 0;
    if (g.subs.size) void fetchGet(path);
  }
}

/** A module route that does something (POST by default): `call<Plan>('/mod/body/plan', { day })`. */
export function call<T>(path: string, body: unknown = {}, method = 'POST'): Promise<T> {
  return api<T>(path, { method, body });
}

/**
 * Send a file to a module route as raw bytes: a photo, a recording. JSON bodies stop at 200,000 characters, so
 * anything bigger than a thumbnail goes this way. `file` is a local uri (from the picker or the recorder), a data
 * URL, or a Blob; `type` is its media type ('image/jpeg', 'audio/mp4'). The route reads `ctx.req` itself and
 * answers JSON. Put what the route needs to know in the path or its query string.
 */
export async function upload<T>(path: string, file: string | Blob, type: string): Promise<T> {
  if (DEMO) throw new ApiError(0, 'The demo has no PC to send this to.');
  let bytes: Blob;
  try {
    bytes = typeof file === 'string' ? await (await fetch(file)).blob() : file;
  } catch {
    throw new ApiError(0, "Couldn't read that file on this phone.");
  }
  const token = currentToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: 'POST',
      headers: { 'X-Client': 'native', 'Content-Type': type, ...(token && !STAGE ? { Authorization: `Bearer ${token}` } : {}) },
      body: bytes,
    });
  } catch (e) {
    throw unreachable(e);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw refusal(res.status, data);
  return data as T;
}

/**
 * Where a file the PC keeps is loaded from, with the sign-in an image or a player needs:
 * `<Image source={fileSource('/mod/body/photos/abc')} />`, `useAudioPlayer(fileSource(path))`.
 */
export function fileSource(path: string): { uri: string; headers?: Record<string, string> } {
  const token = currentToken();
  return token && !STAGE ? { uri: API + path, headers: { Authorization: `Bearer ${token}` } } : { uri: API + path };
}

export { ApiError };
