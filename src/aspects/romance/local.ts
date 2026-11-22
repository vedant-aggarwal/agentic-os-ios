import { requireOptionalNativeModule } from 'expo';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { collection, invalidate, upload } from '@/lib/mod';
import type { Outing, Primer } from './types';

// What Romance keeps on the phone, so going out works with the PC unreachable: the outing that is running, the
// writes still on their way to the PC (an outbox, oldest first, one entry per record), and the last primer the PC
// sent. Saved to a file in the app's documents (localStorage in the web preview) on every change, so a closed app or
// a dead battery loses nothing. The outbox is sent in order whenever the PC answers: on a timer while the page is
// open, when the app comes back to the front, and right after each write.
type FS = typeof import('expo-file-system');
/* eslint-disable @typescript-eslint/no-require-imports */
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export type Pending =
  | { kind: 'put'; coll: 'sessions' | 'debriefs'; id: string; doc: Record<string, unknown> }
  | { kind: 'del'; coll: 'sessions' | 'debriefs'; id: string }
  | { kind: 'audio'; coll: 'debriefs'; id: string; uri: string; type: string; query: string; at: string; session: string | null; day: string; secs: number };
type State = { live: Outing | null; outbox: Pending[]; primer: Primer | null; ended: string | null };

const KEY = 'aos.romance.local';
const EMPTY: State = { live: null, outbox: [], primer: null, ended: null };
const dir = () => new fs!.Directory(fs!.Paths.document, 'romance');
const file = () => new fs!.File(dir(), 'local.json');

function load(): State {
  try {
    const raw = Platform.OS === 'web' || !fs ? globalThis.localStorage?.getItem(KEY) : file().exists ? file().textSync() : null;
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as State) } : EMPTY;
  } catch { return EMPTY; }
}
function persist(s: State) {
  try {
    const raw = JSON.stringify(s);
    if (Platform.OS === 'web' || !fs) { globalThis.localStorage?.setItem(KEY, raw); return; }
    const d = dir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    file().write(raw);
  } catch { /* storage full or unavailable: the state still lives in memory this session */ }
}

let state: State = DEMO ? EMPTY : load();
const subs = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (!DEMO) persist(state);
  for (const fn of subs) fn();
}

export function useLocal(): State {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => state, () => state);
}
export const localState = () => state;

// ── the outing that is running ──
export function setLive(o: Outing | null, ended?: string | null) {
  set({ live: o, ...(ended !== undefined ? { ended } : {}) });
}

// ── the outbox ──
/** Queue a whole record for the PC (it replaces any earlier queued copy) and try to send it now. */
export function queuePut(coll: 'sessions' | 'debriefs', doc: { id: string } & Record<string, unknown>) {
  const rest = state.outbox.filter((p) => !(p.coll === coll && p.id === doc.id));
  set({ outbox: [...rest, { kind: 'put', coll, id: doc.id, doc: { ...doc, updated_at: undefined } }] });
  void flush();
}
export function queueDelete(coll: 'sessions' | 'debriefs', id: string) {
  // any queued copy goes; the delete is sent even if the PC never had it (it answers 200 either way)
  const rest = state.outbox.filter((p) => !(p.coll === coll && p.id === id));
  set({ outbox: [...rest, { kind: 'del', coll, id }] });
  void flush();
}
/** A recording the PC couldn't take yet. On the phone it is copied somewhere it stays until it is sent. */
export function queueAudio(p: Omit<Extract<Pending, { kind: 'audio' }>, 'kind' | 'coll'>) {
  let uri = p.uri;
  if (fs && Platform.OS !== 'web') {
    try {
      const d = dir();
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      const ext = p.type.includes('webm') ? 'webm' : p.type.includes('wav') ? 'wav' : 'm4a';
      const dest = new fs.File(d, `${p.id}.${ext}`);
      if (!dest.exists) new fs.File(p.uri).copy(dest);
      uri = dest.uri;
    } catch { /* keep the recorder's own file */ }
  }
  set({ outbox: [...state.outbox.filter((x) => x.id !== p.id), { kind: 'audio', coll: 'debriefs', ...p, uri }] });
}

let flushing: Promise<void> | null = null;
let lastError: string | null = null;
export const outboxError = () => lastError;

/** Send what is waiting, oldest first. Stops at the first sign the PC is away and keeps the rest for later. */
export function flush(): Promise<void> {
  if (DEMO || flushing || !state.outbox.length) return flushing ?? Promise.resolve();
  flushing = (async () => {
    const touched = new Set<string>();
    for (const p of [...state.outbox]) {
      try {
        const path = `/mod/romance/${p.coll}/${encodeURIComponent(p.id)}`;
        if (p.kind === 'put') await api(path, { method: 'PUT', body: p.doc });
        else if (p.kind === 'del') await api(path, { method: 'DELETE' });
        else {
          await upload(`/mod/romance/debriefs/audio?${p.query}`, p.uri, p.type);
          if (fs && Platform.OS !== 'web' && p.uri.includes('/romance/')) try { new fs.File(p.uri).delete(); } catch {}
        }
        lastError = null;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        // away, busy or broken on the PC's side: keep everything and try later
        if (status === 0 || status >= 500 || status === 408 || status === 429) { lastError = (e as Error).message; break; }
        // the PC refused this one record (it can never go through): drop it so the rest can
        lastError = (e as Error).message;
      }
      // drop it unless a newer copy of the same record was queued while it was on its way
      set({ outbox: state.outbox.filter((x) => x !== p) });
      touched.add(p.coll);
    }
    for (const c of touched) void collection('romance', c).refresh();
    if (touched.size) invalidate('/mod/romance/');
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Keep sending while the page is open: every 15 s while something waits, and when the app comes back to the front. */
export function useOutbox(open: boolean) {
  const waiting = useLocal().outbox.length;
  useEffect(() => {
    if (!open) return;
    void flush();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void flush(); });
    const id = waiting ? setInterval(() => void flush(), 15_000) : null;
    return () => { sub.remove(); if (id) clearInterval(id); };
  }, [open, waiting]);
}

// ── the last primer the PC sent ──
export function rememberPrimer(p: Primer) {
  if (JSON.stringify(p) !== JSON.stringify(state.primer)) set({ primer: p });
}
