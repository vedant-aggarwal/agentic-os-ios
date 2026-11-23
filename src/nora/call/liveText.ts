import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API, currentToken, onAuth, WEB } from '@/lib/api';
import { DEMO } from '@/lib/demo';

// A call's words as they are spoken, his and hers (server: WebSocket /api/v1/nora/call/stream, nora-live.ts).
// Whichever way the call runs (her SIM line, the in-app call), the PC's realtime relay streams both transcripts here.
// In: hello, then { call, lines } for each call on now, then line (a line grown or settled in place, by id) and ended.
// One socket while the app is in front; the live card over Today and the call screen both read this store.

export type LiveLine = { id: string; who: 'you' | 'nora'; text: string; final: boolean; at: string };
export type LiveCallText = { id: string; started: string; ended: boolean; lines: LiveLine[] };
type S = { calls: LiveCallText[] };

let s: S = { calls: [] };
const subs = new Set<() => void>();
const set = (calls: LiveCallText[]) => { s = { calls }; for (const f of subs) f(); };

function onMsg(m: any) {
  if (m?.type === 'hello') set([]); // a fresh snapshot follows
  else if (m?.type === 'call' && m.call?.id) {
    const c: LiveCallText = { id: m.call.id, started: m.call.started, ended: !!m.call.ended, lines: Array.isArray(m.lines) ? m.lines : [] };
    set([...s.calls.filter((x) => x.id !== c.id), c].slice(-4));
  } else if (m?.type === 'line' && m.callId && m.line?.id) {
    set(s.calls.map((c) => {
      if (c.id !== m.callId) return c;
      const i = c.lines.findIndex((l) => l.id === m.line.id);
      if (!m.line.text) return i < 0 ? c : { ...c, lines: c.lines.filter((l) => l.id !== m.line.id) };
      const lines = i < 0 ? [...c.lines, m.line] : c.lines.map((l, j) => (j === i ? m.line : l));
      return { ...c, lines: lines.slice(-200) };
    }));
  } else if (m?.type === 'ended' && m.callId) set(s.calls.map((c) => (c.id === m.callId ? { ...c, ended: true } : c)));
}

/** Every call the PC told us about (live, or just ended), oldest first. */
export const useLiveText = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => s, () => s);

/** The call on now, else the one that just ended. */
export function currentCall(st: S, id?: string | null): LiveCallText | null {
  if (id) { const c = st.calls.find((x) => x.id === id); if (c) return c; }
  return [...st.calls].reverse().find((c) => !c.ended) ?? st.calls[st.calls.length - 1] ?? null;
}

/** Holds the socket open while the app is in front and signed in; mounted once (NoraHost). */
export function useLiveTextSocket() {
  useEffect(() => {
    if (DEMO) return;
    let sock: WebSocket | null = null, retry: ReturnType<typeof setTimeout> | null = null, ping: ReturnType<typeof setInterval> | null = null;
    let wait = 2000; // between tries, doubling to 30 s while the PC can't be reached
    let want = AppState.currentState === 'active';
    const close = () => {
      if (retry) { clearTimeout(retry); retry = null; }
      if (ping) { clearInterval(ping); ping = null; }
      const x = sock; sock = null;
      try { x?.close(); } catch {}
    };
    const open = () => {
      if (sock || !want) return;
      // the web build signs in with the server's session cookie, which goes with the socket on the same origin
      const token = currentToken();
      if (!token && !WEB) return;
      const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/nora/call/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      sock = ws;
      ws.onopen = () => { wait = 2000; ping = setInterval(() => { try { ws.send('ping'); } catch {} }, 25_000); };
      ws.onmessage = (e) => { if (sock !== ws || e.data === 'pong') return; try { onMsg(JSON.parse(String(e.data))); } catch {} };
      ws.onerror = () => { try { ws.close(); } catch {} };
      ws.onclose = () => {
        if (sock !== ws) return;
        sock = null;
        if (ping) { clearInterval(ping); ping = null; }
        if (want) { retry = setTimeout(() => { retry = null; open(); }, wait); wait = Math.min(wait * 2, 30_000); }
      };
    };
    const app = AppState.addEventListener('change', (st) => {
      want = st === 'active';
      if (want) open(); else close();
    });
    const auth = onAuth((ok) => { close(); if (ok) open(); else set([]); });
    open();
    return () => { want = false; app.remove(); auth(); close(); };
  }, []);
}

/** Dev-only preview (?demo&nora=live, and the demo call): a scripted call streams through the same store. */
export function demoLiveText() {
  const id = 'demo_call', at = new Date().toISOString();
  const steps: [number, any][] = [[0, { type: 'call', call: { id, started: at, ended: false }, lines: [] }]];
  let t = 400;
  const say = (n: number, who: 'you' | 'nora', text: string) => {
    const words = text.split(' ');
    words.forEach((_, i) => { t += 180; steps.push([t, { type: 'line', callId: id, line: { id: `${id}:${n}`, who, text: words.slice(0, i + 1).join(' '), final: false, at } }]); });
    t += 900; steps.push([t, { type: 'line', callId: id, line: { id: `${id}:${n}`, who, text, final: true, at } }]);
    t += 300;
  };
  say(1, 'nora', "Hey, what's on your mind?");
  say(2, 'you', 'Move the gym to seven tonight and tell me what is left after that');
  say(3, 'nora', 'Done. The gym is at seven, and after it you only have the client deck to finish.');
  say(4, 'you', 'Okay, remind me at nine');
  const timers = steps.map(([ms, m]) => setTimeout(() => onMsg(m), ms));
  return () => timers.forEach(clearTimeout);
}
