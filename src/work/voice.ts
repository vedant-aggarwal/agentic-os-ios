import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { api, ApiError, currentToken, loadToken } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { gptAvailable, localUri, useGptRecorder } from '@/lib/gpt';
import { onLink } from '@/lib/links';
import { plog } from '@/lib/log';
import { type MicEvent, useMicEvents } from './bus';
import { readCache, writeCache } from './cache';
import { work } from './store';

// Voice for the Projects hub: push to talk ideas from the fan, and the dictate-and-append mic in the capture sheets.
// Both use the app's one recording path, GPT takes (lib/gpt.ts): the phone's WAV streams to the PC each second, the
// PC transcribes while he talks (server pc-take.ts), and finish('none') returns the words without typing them.
//
// Let go rule (UX-SPEC 8c): letting go saves. Before a push to talk take starts, its id and project go into a small
// list on the phone (cache key voice:pending). When the words come back the idea is filed with work.addIdea and the
// entry is dropped. If the app is closed or killed first, gpt.ts sends the rest of the take on the next launch and
// drain() below reads the finished take from the PC and files the idea then. So a released take always becomes an
// idea, at the latest on the next launch.
// Undo is honest: the idea is filed only after the Undo window closes, because the server has no idea delete yet.

type FS = typeof import('expo-file-system');
type Handle = import('expo-file-system').FileHandle;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;

/** Web preview and the demo data: the recorder UI runs without audio. Only the demo store gets the sample idea. */
export const SIM = Platform.OS === 'web' || DEMO;
const UNDO_MS = 4000;    // "Idea saved" offers Undo this long, then the idea is filed
const SAVING_MAX = 8000; // the "Saving idea" chip steps aside after this; the save carries on
const MIN_MS = 600;      // a hold shorter than this was a brush, not a take
const SETTLE_MS = 350;   // after a take stops, the mic needs this long before the next one opens
const KEEP_MS = 7 * 86400_000;
const PENDING_KEY = 'voice:pending';

const SAMPLE_IDEA = 'Show the last three ideas on each project card so I can pick one up fast';
const SAMPLE_DICTATION = 'Keep the folders in the order I set and start every job in the first one.';

export const newTakeId = () => `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e ?? 'Something went wrong.'));
const haptic = (fn: () => Promise<void>) => { if (Platform.OS !== 'web') fn().catch(() => {}); };
const softDouble = () => {
  haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  setTimeout(() => haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)), 90);
};

/** Spoken words as an idea: a short take is the title; a long one gets its first sentence as the title. */
export function splitIdea(text: string): { title: string; body?: string } {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= 100) return { title: t };
  const first = t.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? t;
  const title = first.length > 100 ? `${first.slice(0, 97).replace(/\s+\S*$/, '')}…` : first;
  return { title, body: t };
}

/** Adds dictated words after what is already typed. Never replaces. */
export function appendText(prev: string, add: string) {
  const a = add.trim();
  if (!a) return prev;
  if (!prev.trim()) return a;
  return /\n$/.test(prev) ? `${prev}${a}` : `${prev.replace(/\s+$/, '')} ${a}`;
}

// ---- what the overlay draws ----
export type Ptt =
  | { phase: 'idle' }
  | { phase: 'recording'; id: string; project: string | null; since: number | null; locked: boolean }
  | { phase: 'error'; project: string | null; message: string };
export type ChipKind = 'saving' | 'saved' | 'phone' | 'failed' | 'empty' | 'undone' | 'short';
export type VoiceChip = { kind: ChipKind; id: string; project: string | null; detail: string | null; undo: boolean; seq: number };

let ptt: Ptt = { phase: 'idle' };
let chip: VoiceChip | null = null;
let chipSeq = 0;
let chipTimer: ReturnType<typeof setTimeout> | null = null;
let errorTimer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const emit = () => subs.forEach((f) => f());
const setPtt = (p: Ptt) => { ptt = p; emit(); };

export const usePtt = () => useSyncExternalStore(subscribe, () => ptt);
export const useVoiceChip = () => useSyncExternalStore(subscribe, () => chip);

function showChip(c: Omit<VoiceChip, 'seq'>, ttl: number | null) {
  if (chipTimer) clearTimeout(chipTimer);
  const mine = { ...c, seq: ++chipSeq };
  chip = mine;
  chipTimer = ttl == null ? null : setTimeout(() => { if (chip === mine) { chip = null; emit(); } }, ttl);
  emit();
}
function hideChip(id: string) { if (chip?.id === id) { if (chipTimer) clearTimeout(chipTimer); chip = null; emit(); } }
function showError(project: string | null, text: string) {
  if (errorTimer) clearTimeout(errorTimer);
  setPtt({ phase: 'error', project, message: text });
  errorTimer = setTimeout(() => { if (ptt.phase === 'error') setPtt({ phase: 'idle' }); }, 3500);
}

// ---- takes waiting to become ideas (survives the app being closed) ----
type Pending = { id: string; project: string | null; at: string };
let pending: Pending[] | null = null;
let pendingLoad: Promise<Pending[]> | null = null;
function loadPending(): Promise<Pending[]> {
  if (pending) return Promise.resolve(pending);
  pendingLoad ??= readCache<Pending[]>(PENDING_KEY).then((l) => { pending = [...(l ?? []), ...(pending ?? [])]; return pending; });
  return pendingLoad;
}
async function addPending(p: Pending) {
  const l = await loadPending();
  pending = [p, ...l.filter((x) => x.id !== p.id)];
  writeCache(PENDING_KEY, pending);
}
async function dropPending(id: string) {
  const l = await loadPending();
  if (!l.some((x) => x.id === id)) return;
  pending = l.filter((x) => x.id !== id);
  writeCache(PENDING_KEY, pending);
}

// ---- push to talk ----
type Rec = ReturnType<typeof useGptRecorder>;
type Session = { id: string; project: string | null; started: boolean; end: null | 'release' | 'cancel' };
const host: { rec: Rec | null } = { rec: null };
let session: Session | null = null;
let lastStopAt = 0;
const undone = new Set<string>();
const claimed = new Set<string>();   // a take being turned into an idea right now, so it is never filed twice
const filed = new Set<string>();     // filed this run
const deferred = new Map<string, { project: string | null; text: string; timer: ReturnType<typeof setTimeout> }>();

const recordingSince = (s: Session) => (ptt.phase === 'recording' && ptt.id === s.id ? ptt.since : null);

async function begin(project: string | null) {
  if (session) return;
  const s: Session = { id: newTakeId(), project, started: false, end: null };
  session = s;
  setPtt({ phase: 'recording', id: s.id, project, since: null, locked: false });
  if (SIM) {
    s.started = true;
    setPtt({ phase: 'recording', id: s.id, project, since: Date.now(), locked: false });
    softDouble();
    return;
  }
  const rec = host.rec;
  if (!rec || !gptAvailable) { session = null; showError(project, 'Voice ideas arrive with the next app build.'); return; }
  const wait = lastStopAt + SETTLE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  if (s.end) { session = null; if (s.end === 'release') showShort(s); return; }
  await addPending({ id: s.id, project, at: new Date().toISOString() });
  try {
    await rec.start({ id: s.id });
  } catch (e) {
    plog('idea voice start', e);
    void dropPending(s.id);
    if (session === s) session = null;
    if (s.end) setPtt({ phase: 'idle' }); else showError(project, message(e));
    return;
  }
  s.started = true;
  if (s.end) { // let go or cancelled while the mic was opening
    rec.cancel();
    void dropPending(s.id);
    if (session === s) session = null;
    if (s.end === 'release') showShort(s);
    return;
  }
  if (ptt.phase === 'recording' && ptt.id === s.id) setPtt({ ...ptt, since: Date.now() });
  softDouble();
}

function showShort(s: Session) {
  showChip({ kind: 'short', id: s.id, project: s.project, detail: null, undo: false }, 2500);
}

/** Let go on the mic: save. While locked this is a no-op (the bus contract). `stop` is the locked Stop button. */
function release(stop = false) {
  const s = session;
  if (!s || ptt.phase !== 'recording' || ptt.id !== s.id) return;
  if (ptt.locked && !stop) return;
  if (!s.started) { s.end = 'release'; setPtt({ phase: 'idle' }); return; }
  const since = recordingSince(s);
  if (!stop && since != null && Date.now() - since < MIN_MS) { drop(s); showShort(s); return; }
  session = null;
  lastStopAt = Date.now();
  setPtt({ phase: 'idle' });
  void save(s);
}

/** Throw the take away (it stays in Voices, as every take does). */
function drop(s: Session) {
  session = null;
  lastStopAt = Date.now();
  setPtt({ phase: 'idle' });
  if (!SIM) host.rec?.cancel();
  void dropPending(s.id);
}
function cancel() {
  const s = session;
  if (!s) return;
  if (!s.started) { s.end = 'cancel'; setPtt({ phase: 'idle' }); return; }
  drop(s);
}

async function save(s: Session) {
  const { id, project } = s;
  showChip({ kind: 'saving', id, project, detail: null, undo: true }, SAVING_MAX);
  let text: string;
  if (SIM) {
    await sleep(900);
    text = SAMPLE_IDEA;
  } else {
    claimed.add(id);
    try {
      text = (await host.rec!.finish('none')).text;
    } catch (e) {
      claimed.delete(id);
      if (undone.has(id)) return;
      const m = message(e);
      if (/^Saved on this phone/.test(m)) {
        // the PC can't be reached: the take waits on the phone and drain() files the idea once it is through
        showChip({ kind: 'phone', id, project, detail: null, undo: false }, 3500);
      } else {
        plog('idea voice finish', id, e);
        void dropPending(id);
        showChip({ kind: 'failed', id, project, detail: m, undo: false }, 4500);
      }
      return;
    }
  }
  if (undone.has(id)) { claimed.delete(id); return; }
  if (!text.trim()) {
    claimed.delete(id);
    void dropPending(id);
    showChip({ kind: 'empty', id, project, detail: null, undo: false }, 3000);
    return;
  }
  showChip({ kind: 'saved', id, project, detail: splitIdea(text).title, undo: true }, UNDO_MS);
  deferred.set(id, { project, text, timer: setTimeout(() => commitNow(id), UNDO_MS) });
}

function commitNow(id: string) {
  const d = deferred.get(id);
  if (!d) return;
  clearTimeout(d.timer);
  deferred.delete(id);
  file(id, d.project, d.text);
}
/** Going to the background: nobody can tap Undo, so file what is waiting now. */
function flushDeferred() { for (const id of [...deferred.keys()]) commitNow(id); }

function file(id: string, project: string | null, text: string) {
  if (filed.has(id)) return;
  filed.add(id);
  claimed.delete(id);
  void dropPending(id);
  if (SIM && !DEMO) return; // the plain web preview never writes to the real agentos
  const { title, body } = splitIdea(text);
  void work.addIdea(project, title, body, 'voice');
}

/** Undo from the chip: the idea is never filed. The recording stays in Voices. */
export function undoVoiceIdea(id: string) {
  undone.add(id);
  const d = deferred.get(id);
  if (d) { clearTimeout(d.timer); deferred.delete(id); }
  claimed.delete(id);
  void dropPending(id);
  showChip({ kind: 'undone', id, project: chip?.id === id ? chip.project : null, detail: null, undo: false }, 2500);
}
export function dismissVoiceChip(id: string) { hideChip(id); }
/** The locked recording's Stop and Cancel buttons. */
export const stopVoiceIdea = () => release(true);
export const cancelVoiceIdea = () => cancel();

/** Takes left from an earlier run (closed, killed, or the PC was away): file the ones the PC has finished. */
let draining = false;
async function drain(): Promise<number> {
  if (SIM || draining) return 0;
  draining = true;
  let left = 0;
  try {
    const list = [...(await loadPending())];
    if (!list.length) return 0;
    if (!currentToken()) await loadToken();
    if (!currentToken()) return list.length;
    for (const p of list) {
      if (session?.id === p.id || claimed.has(p.id) || deferred.has(p.id) || undone.has(p.id) || filed.has(p.id)) continue;
      if (Date.now() - Date.parse(p.at) > KEEP_MS) { await dropPending(p.id); continue; }
      try {
        const t = await api<{ status: string; text: string; error?: string }>(`/pc/take/${p.id}`);
        if (t.status !== 'done') { left++; continue; } // still on its way: gpt.ts sends the rest and finishes it
        if (t.text.trim()) {
          file(p.id, p.project, t.text);
          showChip({ kind: 'saved', id: p.id, project: p.project, detail: splitIdea(t.text).title, undo: false }, 3000);
        } else {
          await dropPending(p.id);
          showChip({ kind: t.error ? 'failed' : 'empty', id: p.id, project: p.project, detail: t.error ?? null, undo: false }, 4000);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) { left++; continue; } // the PC hasn't got it yet
        left++;
        if (e instanceof ApiError && e.status === 0) break; // PC away: next time
      }
    }
  } finally { draining = false; }
  return left;
}

/** agenticos://record (the Capture widget): a hands-free idea into the Inbox, as the fan's mic slid up to lock. */
function quickCapture() {
  if (session) return;
  void begin(null);
  if (ptt.phase === 'recording') setPtt({ ...ptt, locked: true });
}

function onMic(e: MicEvent) {
  switch (e.type) {
    case 'start': void begin(e.project); break;
    case 'lock': if (ptt.phase === 'recording') setPtt({ ...ptt, locked: true }); break;
    case 'release': release(); break;
    case 'cancel': cancel(); break;
  }
}

/** The one recorder for the hub. Mount once (WorkSheets). Subscribes to the fan's mic events and files waiting takes. */
export function useVoiceHost() {
  const rec = useGptRecorder();
  useLayoutEffect(() => { host.rec = rec; });
  useMicEvents(onMic);
  // a widget tap that launched the app waits in links.ts until this registers, after host.rec is set
  useEffect(() => onLink('record', quickCapture), []);
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        const left = await drain();
        if (left && tries++ < 5 && AppState.currentState === 'active') run(20_000);
      }, ms);
    };
    run(4000); // after gpt.ts has started sending any unsent takes
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'background') flushDeferred();
      if (a === 'active') { tries = 0; run(2500); }
    });
    return () => { sub.remove(); if (timer) clearTimeout(timer); };
  }, []);
  return rec;
}

// ---- the live level, read from the take's own WAV as it is written ----
const TAIL = 3200; // 100 ms of 16 kHz mono int16
function rmsLevel(b: Uint8Array) {
  const n = b.length >> 1;
  if (!n) return 0;
  const dv = new DataView(b.buffer, b.byteOffset, n * 2);
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = dv.getInt16(i * 2, true); sum += v * v; }
  const db = 20 * Math.log10(Math.sqrt(sum / n) / 32768 + 1e-9);
  return Math.min(1, Math.max(0, (db + 55) / 45)); // -55 dB is silence, -10 dB is loud speech
}

/** 0..1, about ten times a second, while take `id` records. */
export function useTakeLevel(id: string | null): SharedValue<number> {
  const level = useSharedValue(0);
  useEffect(() => {
    if (!id) { level.set(withTiming(0, { duration: 160 })); return; }
    let alive = true;
    let h: Handle | null = null;
    let t = 0;
    const timer = setInterval(async () => {
      if (SIM) {
        t++;
        const speech = 0.35 + 0.45 * Math.abs(Math.sin(t * 0.55)) * (0.6 + 0.4 * Math.random());
        level.set(withTiming(t % 9 < 2 ? 0.08 : speech, { duration: 90 }));
        return;
      }
      try {
        if (!h) {
          const uri = localUri(id);
          if (!uri || !fs) return;
          h = new fs.File(uri).open();
        }
        const size = h.size ?? 0;
        if (size < 44 + TAIL) return;
        h.offset = 44 + Math.floor((size - 44 - TAIL) / 2) * 2; // whole samples
        const bytes = await h.readBytes(TAIL);
        if (alive) level.set(withTiming(rmsLevel(bytes), { duration: 90 }));
      } catch { /* the level is a nicety; the take itself is unaffected */ }
    }, 100);
    return () => { alive = false; clearInterval(timer); try { h?.close(); } catch {} };
  }, [id, level]);
  return level;
}

// ---- dictate and append (the Idea and Job sheets' mic buttons) ----
export const VoiceContext = createContext<Rec | null>(null);
export type DictationState = 'idle' | 'recording' | 'finishing';
export type Dictation = {
  state: DictationState; live: string; since: number | null; error: string | null; offline: boolean;
  toggle: () => void; cancel: () => void;
};

/** A mic button's brain: tap to talk, tap again and the words go to `onText` (the sheet appends them). */
export function useDictation(onText: (text: string) => void): Dictation {
  const rec = useContext(VoiceContext);
  const [state, setState] = useState<DictationState>('idle');
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simLive, setSimLive] = useState('');
  const latest = useRef({ rec, onText, state });
  useLayoutEffect(() => { latest.current = { rec, onText, state }; });
  const simTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    setError(null);
    if (SIM) {
      const words = SAMPLE_DICTATION.split(' ');
      let n = 0;
      setSimLive(''); setState('recording'); setSince(Date.now());
      simTimer.current = setInterval(() => { n = Math.min(words.length, n + 1); setSimLive(words.slice(0, n).join(' ')); }, 260);
      return;
    }
    const r = latest.current.rec;
    if (!r || !gptAvailable) { setError('Dictation arrives with the next app build.'); return; }
    if (r.recording() || session) { setError('The mic is busy with another recording.'); return; }
    try {
      await r.start({ id: newTakeId() });
      setState('recording'); setSince(Date.now());
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    } catch (e) { setError(message(e)); }
  }, []);

  const stop = useCallback(async () => {
    setState('finishing');
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    if (SIM) {
      if (simTimer.current) clearInterval(simTimer.current);
      await sleep(500);
      latest.current.onText(SAMPLE_DICTATION);
      setSimLive(''); setState('idle'); setSince(null);
      return;
    }
    try {
      const r = await latest.current.rec!.finish('none');
      if (r.text.trim()) latest.current.onText(r.text.trim());
      else setError('Didn’t catch that. Try again a little closer.');
    } catch (e) { setError(message(e)); } finally { setState('idle'); setSince(null); }
  }, []);

  const cancelIt = useCallback(() => {
    if (simTimer.current) clearInterval(simTimer.current);
    if (latest.current.state === 'recording' && !SIM) latest.current.rec?.cancel();
    setSimLive(''); setState('idle'); setSince(null);
  }, []);

  // leaving the sheet mid dictation drops the take (it is still kept in Voices)
  useEffect(() => () => {
    if (simTimer.current) clearInterval(simTimer.current);
    if (latest.current.state === 'recording' && !SIM) latest.current.rec?.cancel();
  }, []);

  const toggle = useCallback(() => {
    const st = latest.current.state;
    if (st === 'idle') void start(); else if (st === 'recording') void stop();
  }, [start, stop]);

  return {
    state, since, error, toggle, cancel: cancelIt,
    live: SIM ? simLive : state === 'idle' ? '' : (rec?.live ?? ''),
    offline: !SIM && state !== 'idle' && !!rec?.offline,
  };
}
