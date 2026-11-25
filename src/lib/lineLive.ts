import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API, currentToken, onAuth, WEB } from './api';
import { DEMO } from './demo';
import type { LiveLineCall } from './line';
import { lineDemo } from './lineDemo';

// The live socket of Nora's line (contract §3): WebSocket /api/v1/nora/line/live?token=<bearer>, one while a live call
// screen is open. In: state (the call on now, or null) at once and on every change, line (a transcript line grown or
// settled in place, by id), action (Nora's current step), transfer (she wants him on the call), ended, error, and audio
// frames once listening. Out: say, instruct, hangup; listen, takeover, mic and release go through here only on the web
// (src/lib/lineAudio.web.ts). The phone runs those on its own native socket (src/lib/lineAudio.ts).

export type LiveLine = { id: string; who: 'caller' | 'nora' | 'you'; text: string; final: boolean; at: string };
export type LiveState = {
  socket: 'idle' | 'connecting' | 'open' | 'closed';
  /** The call on now; null when there is none (or it has ended). */
  call: LiveLineCall | null;
  /** The call these lines and flags belong to: the screen's call (kept after it ends). */
  callId: string | null;
  /** A state message has arrived since the screen opened (so `call` null means nothing of his is live). */
  seen: boolean;
  /** A different call that is live now, when the screen's own call isn't. */
  other: LiveLineCall | null;
  lines: LiveLine[];
  /** Nora's current step, <= 60 chars. */
  step: string | null;
  /** Why Nora wants him on the call, while she does. */
  transfer: string | null;
  ended: boolean;
  error: string | null;
};
const EMPTY: LiveState = { socket: 'idle', call: null, callId: null, seen: false, other: null, lines: [], step: null, transfer: null, ended: false, error: null };

let st: LiveState = EMPTY;
const subs = new Set<() => void>();
const set = (p: Partial<LiveState>) => { st = { ...st, ...p }; for (const f of subs) f(); };

type Frame = { callId: string; seq: number; data: string };
const frameSubs = new Set<(f: Frame) => void>();
/** Audio frames as they come (base64 PCM16 LE, 16 kHz mono, 20 ms). The web audio player listens here. */
export function onLiveFrame(fn: (f: Frame) => void) { frameSubs.add(fn); return () => { frameSubs.delete(fn); }; }

function onMsg(m: any) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'state': {
      const call: LiveLineCall | null = m.call && typeof m.call.id === 'string' ? m.call : null;
      if (!call || (st.callId && call.id !== st.callId)) {
        // nothing of this screen's is on: if it was on a moment ago, it has ended
        set({ seen: true, call: null, other: call, ended: st.ended || !!st.call, transfer: null });
        return;
      }
      set({
        seen: true, other: null, call, callId: call.id, step: call.action || st.step,
        ended: call.phase === 'ended', transfer: call.phase === 'nora' || call.phase === 'ringing' ? st.transfer : null,
        error: null,
      });
      return;
    }
    case 'line': {
      const l = m.line;
      if (!l || typeof l.id !== 'string' || (st.callId && m.callId && m.callId !== st.callId)) return;
      const i = st.lines.findIndex((x) => x.id === l.id);
      if (!l.text) { if (i >= 0) set({ lines: st.lines.filter((x) => x.id !== l.id) }); return; }
      const line: LiveLine = { id: l.id, who: l.who === 'nora' || l.who === 'you' ? l.who : 'caller', text: String(l.text), final: !!l.final, at: String(l.at ?? new Date().toISOString()) };
      set({ lines: (i < 0 ? [...st.lines, line] : st.lines.map((x, j) => (j === i ? line : x))).slice(-300) });
      return;
    }
    case 'action':
      if (typeof m.text === 'string' && (!st.callId || m.callId === st.callId)) set({ step: m.text });
      return;
    case 'transfer':
      if (!st.callId || m.callId === st.callId) set({ transfer: typeof m.reason === 'string' && m.reason ? m.reason : 'Nora wants you on this call.' });
      return;
    case 'ended':
      if (!st.callId || m.callId === st.callId) set({ ended: true, transfer: null, call: st.call ? { ...st.call, phase: 'ended' } : null });
      return;
    case 'error':
      set({ error: typeof m.message === 'string' ? m.message : 'Something went wrong on the PC.' });
      return;
    case 'audio':
      if (typeof m.data === 'string') for (const f of frameSubs) { try { f({ callId: String(m.callId ?? ''), seq: Number(m.seq) || 0, data: m.data }); } catch {} }
      return;
  }
}

// ── the socket ───────────────────────────────────────────────────────────────────────────────────────────────────

let sock: WebSocket | null = null;
let users = 0;
let closeDemo: (() => void) | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let ping: ReturnType<typeof setInterval> | null = null;
let backoff = 2000;
let want = false;

function close() {
  if (retry) { clearTimeout(retry); retry = null; }
  if (ping) { clearInterval(ping); ping = null; }
  closeDemo?.(); closeDemo = null;
  const x = sock; sock = null;
  try { x?.close(); } catch {}
}

function open() {
  if (sock || closeDemo || !want) return;
  if (DEMO) {
    set({ socket: 'open' });
    closeDemo = lineDemo.openLive(onMsg);
    return;
  }
  const token = currentToken();
  if (!token && !WEB) { set({ socket: 'closed', error: 'Sign in again on this phone.' }); return; }
  set({ socket: 'connecting' });
  // the web build signs in with the server's session cookie, which goes with the socket on the same origin
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/nora/line/live${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  sock = ws;
  ws.onopen = () => {
    if (sock !== ws) return;
    backoff = 2000;
    set({ socket: 'open', error: null });
    ping = setInterval(() => { try { ws.send('ping'); } catch {} }, 25_000);
  };
  ws.onmessage = (e) => { if (sock !== ws || e.data === 'pong') return; try { onMsg(JSON.parse(String(e.data))); } catch {} };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onclose = () => {
    if (sock !== ws) return;
    sock = null;
    if (ping) { clearInterval(ping); ping = null; }
    set({ socket: 'closed' });
    if (want) { retry = setTimeout(() => { retry = null; open(); }, backoff); backoff = Math.min(backoff * 2, 30_000); }
  };
}

/** Sends one message on the socket. False when it isn't open. */
export function sendLive(m: Record<string, unknown>): boolean {
  if (DEMO) { if (!closeDemo) return false; lineDemo.sendLive(m as never); return true; }
  if (!sock || sock.readyState !== 1) return false;
  try { sock.send(JSON.stringify(m)); return true; } catch { return false; }
}

export const lineLive = {
  /** Nora says exactly this, next. */
  say: (text: string) => sendLive({ type: 'say', text }),
  /** Guidance for Nora; she isn't to read it out. */
  instruct: (text: string) => sendLive({ type: 'instruct', text }),
  hangup: () => sendLive({ type: 'hangup' }),
  /** Seeds the transcript with what was said before the screen opened (GET /nora/line/calls/:id). */
  seed(callId: string, lines: { who: LiveLine['who']; text: string; at: string }[]) {
    if (st.callId && st.callId !== callId) return;
    const said = new Set(st.lines.filter((l) => l.final).map((l) => `${l.who}:${l.text}`));
    const early = lines.filter((l) => !said.has(`${l.who}:${l.text}`)).map((l, i) => ({ id: `seed:${i}`, who: l.who, text: l.text, final: true, at: l.at }));
    set({ callId, lines: [...early, ...st.lines.filter((l) => !l.id.startsWith('seed:'))] });
  },
};

export const useLineLiveState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st, () => st);

/** Holds the socket open while the screen is up and the app is in front. Returns the live state. */
export function useLineLive(callId: string) {
  useEffect(() => {
    if (st.callId !== callId) set({ ...EMPTY, callId });
    users += 1;
    want = AppState.currentState === 'active' || DEMO;
    open();
    const app = AppState.addEventListener('change', (s) => {
      // in the background the native socket keeps any listening or takeover going; this one comes back on return
      want = s === 'active';
      if (want) open(); else close();
    });
    const auth = onAuth((ok) => { close(); if (ok && want) open(); });
    return () => {
      users -= 1;
      app.remove(); auth();
      if (!users) { want = false; close(); set({ socket: 'idle' }); }
    };
  }, [callId]);
  return useLineLiveState();
}
