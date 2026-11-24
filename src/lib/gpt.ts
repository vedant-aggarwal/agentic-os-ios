import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API, ApiError, currentToken } from './api';
import { callHoldsMic, onCallChange } from './calls';
import { plog } from './log';

// GPT dictation, streamed. The phone's mic writes a WAV file on the phone (Documents/takes, valid at every moment, so
// a crash keeps everything said), and once a second the new part of that file goes to the PC (PUT at its byte
// offset; the PC keeps it on disk too). The PC cuts the audio at pauses and transcribes each piece with the Codex
// login as you talk, so `live` fills in while you speak and there is no length limit. On stop the PC transcribes the
// last bit and types it where the cursor is, or hands it to the PC agent. Server: pc-take.ts (/pc/take).
// A take the PC never fully got (no connection, the app was killed) is sent on the next launch, saved, not typed.
// expo-audio's native side arrives with the app build that added it; older builds just report it missing.
type Audio = typeof import('expo-audio');
type FS = typeof import('expo-file-system');
/* eslint-disable @typescript-eslint/no-require-imports */
const audio: Audio | null = requireOptionalNativeModule('ExpoAudio') ? require('expo-audio') : null;
const fs: FS | null = requireOptionalNativeModule('FileSystem') ? require('expo-file-system') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
export const gptAvailable = !!audio && !!fs;

export type DictateTo = 'type' | 'agent' | 'none'; // none: save it and return the text (the keyboard inserts it)
export type DictateResult = { text: string; enter: boolean; ms: number };
/** A take as this phone remembers it. */
export type LocalTake = { id: string; uri: string; rate: number; createdAt: string; sent: number; finished: boolean };

const RATE = 16000;
const HEADER = 44;          // the WAV header expo-audio writes; the PCM follows it
const PIECE = 256 * 1024;   // most bytes per upload (8 s of audio)
const TICK = 1000;          // send what's new this often
const KEEP_DAYS = 7;        // the phone keeps its own copy this long after the PC has it

/** fetch that gives up after `ms` (a stuck request must never freeze a take). */
function timed(url: string, init: RequestInit, ms: number) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(t));
}

const auth = (): Record<string, string> => { const t = currentToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };
async function call<T>(method: string, path: string, body?: unknown, ms = 30_000): Promise<T> {
  const res = await timed(`${API}${path}`, {
    method, headers: { ...auth(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, ms);
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, out?.error ?? `The PC said HTTP ${res.status}.`);
  return out as T;
}

// ---- the phone's own list of takes (Documents/takes/index.json) ----
const takesDir = () => new fs!.Directory(fs!.Paths.document, 'takes');
const indexFile = () => new fs!.File(takesDir(), 'index.json');
let index: LocalTake[] | null = null;
function readIndex(): LocalTake[] {
  if (index) return index;
  try { index = JSON.parse(indexFile().textSync()) as LocalTake[]; } catch { index = []; }
  return index;
}
function writeIndex() {
  try {
    const d = takesDir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    indexFile().write(JSON.stringify(index ?? []));
  } catch {}
}
function remember(t: LocalTake) {
  const list = readIndex();
  const i = list.findIndex((x) => x.id === t.id);
  if (i >= 0) list[i] = t; else list.unshift(t);
  writeIndex();
}
/** Takes saved on this phone, newest first (the history uses these to play without the PC). */
export function localTakes(): LocalTake[] { return gptAvailable ? [...readIndex()] : []; }
export function localUri(id: string) {
  const t = gptAvailable ? readIndex().find((x) => x.id === id) : undefined;
  return t && new fs!.File(t.uri).exists ? t.uri : null;
}
function prune() {
  const cut = Date.now() - KEEP_DAYS * 86400_000;
  const list = readIndex();
  const keep = list.filter((t) => {
    if (!t.finished || Date.parse(t.createdAt) > cut) return true;
    try { new fs!.File(t.uri).delete(); } catch {}
    return false;
  });
  if (keep.length !== list.length) { index = keep; writeIndex(); }
}

// ---- sending a take's file to the PC ----
type Sender = { t: LocalTake; h: import('expo-file-system').FileHandle | null; created: boolean; busy: Promise<void> | null; stop?: boolean };

/** Send everything in the file past what the PC has. Throws if the PC can't be reached. */
async function pushAll(s: Sender) {
  if (!s.created) { await call('POST', '/pc/take', { id: s.t.id, rate: s.t.rate }); s.created = true; }
  if (!s.h) s.h = new fs!.File(s.t.uri).open();
  for (;;) {
    s.h.offset = HEADER + s.t.sent;
    let bytes = await s.h.readBytes(PIECE);
    if (bytes.length & 1) bytes = bytes.subarray(0, bytes.length - 1); // whole samples only
    if (!bytes.length) return;
    const res = await timed(`${API}/pc/take/${s.t.id}/pcm?at=${s.t.sent}`, {
      method: 'PUT', body: bytes, headers: { ...auth(), 'Content-Type': 'application/octet-stream' },
    }, 20_000);
    const out = await res.json().catch(() => null);
    if (!res.ok && res.status !== 409) throw new ApiError(res.status, out?.error ?? `Upload failed (HTTP ${res.status}).`);
    s.t.sent = Number(out?.have ?? s.t.sent); // on 409 the PC says where it is; carry on from there
    if (out?.stop) s.stop = true; // the keyboard pressed stop
    if (res.ok && bytes.length < PIECE) return;
  }
}
/** One send at a time; a failed one is retried on the next tick. */
function push(s: Sender) {
  if (s.busy) return s.busy;
  s.busy = pushAll(s).finally(() => { s.busy = null; remember(s.t); });
  return s.busy;
}
async function pushHard(s: Sender, tries = 4) {
  for (let i = 0; ; i++) {
    try { await push(s); await push(s); return; } // the second catches bytes written while the first ran
    catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 600 * 2 ** i)); }
  }
}
function closeFile(s: Sender) { try { s.h?.close(); } catch {} s.h = null; }

/** Takes the PC never fully got: send the rest and save them there (not typed: that moment has passed). */
let recovering = false;

// One mic at a time across the app: several screens hold a recorder (PC mic, keyboard, Voices). A recorder that is
// open but idle (the keyboard's warm mic) is closed when another one starts; a busy one blocks it.
type MicOwner = { me: object; busy: () => boolean; close: () => void };
let openMic: MicOwner | null = null;

// Opening or closing the mic switches iOS's audio session, and that moves the output volume, which the volume-button
// watcher (lib/wispr.ts) reads as a button press: a phantom press rang Nora and started the PC's dictation when a
// take started. Every switch is stamped here so the watcher can drop presses that are really the mic switching.
// Stopping is stamped from its first moment (before the file closes), since the take is no longer busy by then: a
// phantom up while the capture panel's Save stopped its take started the PC's Wispr dictation.
let micSwitchAt = 0;
const micSwitched = () => { micSwitchAt = Date.now(); };
/** True while some recorder holds the mic, or within `ms` of the audio session switching for the mic. */
export function micMoving(ms = 2500) { return Date.now() - micSwitchAt < ms || !!openMic?.busy(); }
/** The audio session back to playing only. Not while a call is starting or on: the call sets the session up itself,
 *  and switching it here would fight the call for the mic. */
function unsetMode() {
  if (callHoldsMic()) return;
  audio?.setAudioModeAsync({ allowsRecording: false }).catch(() => {}).finally(micSwitched);
}
async function recover(skip?: string) {
  if (!gptAvailable || recovering) return;
  recovering = true;
  try {
    prune();
    for (const t of readIndex().filter((x) => !x.finished && x.id !== skip)) {
      if (!new fs!.File(t.uri).exists) { t.finished = true; remember(t); continue; }
      const s: Sender = { t, h: null, created: false, busy: null };
      try {
        await pushHard(s, 2);
        await call('POST', `/pc/take/${t.id}/finish`, { bytes: t.sent, to: 'none' });
        t.finished = true; remember(t);
      } catch { /* the PC is away; next launch */ } finally { closeFile(s); }
    }
  } finally { recovering = false; }
}

export function useGptRecorder() {
  // the hooks exist only when the native module does, which never changes while the app runs
  const stream = audio ? audio.useAudioStream({ sampleRate: RATE, channels: 1, encoding: 'int16' }).stream : null;
  const cur = useRef<Sender | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [live, setLive] = useState('');
  const [offline, setOffline] = useState(false); // the PC isn't getting the audio right now (it's still saved here)
  const streaming = useRef(false); // the mic is open (recording, or kept warm between keyboard takes)
  const cool = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCold = useRef<(() => void) | null>(null);
  const warmFor = useRef(0); // ms to keep the mic open after a take (the keyboard's warm mic); 0 closes it at once
  const [me] = useState(() => ({}));
  const closeRef = useRef<() => void>(() => {});

  useEffect(() => { void recover(); }, []);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); if (cool.current) clearTimeout(cool.current); if (openMic?.me === me) openMic = null; try { stream?.stop(); } catch {} }, [stream, me]);

  /** Show the PC's text as it comes, until the take is done or another one starts. */
  const follow = useCallback(async (s: Sender) => {
    let v: number | undefined;
    while (cur.current === s && s.created) {
      try {
        const t = await call<{ v: number; text: string; status: string }>('GET', `/pc/take/${s.t.id}${v == null ? '' : `?v=${v}&wait=20`}`, undefined, 35_000);
        if (cur.current !== s) return;
        v = t.v; setLive(t.text);
        if (t.status === 'done') return;
      } catch { await new Promise((r) => setTimeout(r, 1500)); }
    }
  }, []);

  /** Start a take. `id` comes from the keyboard (it follows the take by that id); `onRemoteStop` runs when the
   *  keyboard presses stop. */
  const start = useCallback(async (opts: { id?: string; onRemoteStop?: () => void } = {}) => {
    if (!audio || !fs || !stream) throw new Error('GPT mic arrives with the next app build.');
    if (callHoldsMic()) throw new Error('The call has the mic. Dictate after it ends.');
    if (cur.current) throw new Error('Already recording.');
    const d = takesDir();
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
    const id = opts.id ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (cool.current) { clearTimeout(cool.current); cool.current = null; }
    if (openMic && openMic.me !== me) {
      if (openMic.busy()) throw new Error('The mic is busy with another recording.');
      openMic.close();
    }
    if (!streaming.current) {
      const perm = await audio.requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('Allow the microphone for Agentic OS in Settings.');
      micSwitched();
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true, shouldPlayInBackground: true });
      await stream.start();
      micSwitched();
      streaming.current = true;
      openMic = { me, busy: () => !!cur.current, close: () => closeRef.current() };
    }
    let uri: string;
    try { ({ uri } = await stream.startFileRecordingAsync({ uri: new fs.File(d, `${id}.wav`).uri, format: 'wav' })); }
    catch (e) { plog('mic file', e); try { stream.stop(); } catch {} streaming.current = false; if (openMic?.me === me) openMic = null; throw e; }
    const s: Sender = { t: { id, uri, rate: stream.sampleRate || RATE, createdAt: new Date().toISOString(), sent: 0, finished: false }, h: null, created: false, busy: null };
    remember(s.t);
    cur.current = s;
    setLive(''); setOffline(false);
    let following = false, stopped = false;
    timer.current = setInterval(() => {
      push(s).then(() => {
        setOffline(false);
        if (!following && s.created) { following = true; void follow(s); }
        if (s.stop && !stopped && cur.current === s) { stopped = true; opts.onRemoteStop?.(); }
      }, (e) => { setOffline(true); plog('take upload', s.t.id, s.t.sent, e); });
    }, TICK);
  }, [stream, follow, me]);

  /** Close the mic now. */
  const close = useCallback(() => {
    if (cool.current) { clearTimeout(cool.current); cool.current = null; }
    if (!streaming.current || cur.current) return;
    streaming.current = false;
    if (openMic?.me === me) openMic = null;
    try { stream?.stop(); } catch {}
    micSwitched();
    unsetMode();
    onCold.current?.();
  }, [stream, me]);
  useEffect(() => { closeRef.current = close; }, [close]);

  /** Stop recording this take; the mic closes, or stays open for `warmFor` so the next take starts at once (never
   *  during a call: the call needs the mic). */
  const stop = useCallback(async () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    micSwitched(); // closing the file can move the session too: stamp before the first await, not only after
    try { await stream?.stopFileRecordingAsync(); } catch {}
    micSwitched();
    const keep = callHoldsMic() ? 0 : warmFor.current;
    if (keep > 0) { if (cool.current) clearTimeout(cool.current); cool.current = setTimeout(close, keep); return; }
    streaming.current = false;
    if (openMic?.me === me) openMic = null;
    try { stream?.stop(); } catch {}
    micSwitched();
    unsetMode();
  }, [stream, close, me]);

  /** Stop and deliver: resolves with what the PC heard. */
  const finish = useCallback(async (to: DictateTo): Promise<DictateResult> => {
    const s = cur.current;
    if (!s) throw new Error('Not recording.');
    const t0 = Date.now();
    cur.current = null; // free for the next take as soon as the mic file is closed
    await stop();
    try {
      await pushHard(s);
      const r = await call<{ text: string; enter: boolean; error?: string }>('POST', `/pc/take/${s.t.id}/finish`, { bytes: s.t.sent, to }, 120_000);
      s.t.finished = true; remember(s.t);
      setLive(r.text);
      if (!r.text && r.error) throw new ApiError(502, r.error);
      return { text: r.text, enter: r.enter, ms: Date.now() - t0 };
    } catch (e) {
      plog('take finish', s.t.id, s.t.sent, e);
      if (e instanceof ApiError && (s.t.finished || (e.status < 500 && e.status !== 409))) throw e;
      throw new Error('Saved on this phone. It goes to the PC when it can be reached.');
    } finally {
      closeFile(s);
      void recover(s.t.id);
    }
  }, [stop]);

  /** Stop without typing anything: the take is still saved, on both sides. */
  const cancel = useCallback(() => {
    const s = cur.current;
    if (!s) return;
    cur.current = null;
    setLive('');
    void stop().then(async () => {
      try {
        await pushHard(s);
        await call('POST', `/pc/take/${s.t.id}/finish`, { bytes: s.t.sent, to: 'none' });
        s.t.finished = true; remember(s.t);
      } catch {} finally { closeFile(s); }
    });
  }, [stop]);

  // A call started: stop the take (it is still saved, on both sides) and close a warm mic, so the call gets the mic.
  useEffect(() => onCallChange((on) => { if (!on) return; if (cur.current) cancel(); else close(); }), [cancel, close]);

  /** Keep the mic open `ms` after each take (0: close at once); `cold` runs when it finally closes. */
  const setWarm = useCallback((ms: number, cold?: () => void) => { warmFor.current = ms; onCold.current = cold ?? null; }, []);
  const recording = useCallback(() => !!cur.current, []);

  return { start, finish, cancel, live, offline, setWarm, close, recording };
}
