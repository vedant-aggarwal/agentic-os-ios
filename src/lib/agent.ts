import { useCallback, useEffect, useRef, useState } from 'react';
import { API, currentToken } from './api';

// Command mode: the PC agent's live transcript (server: WebSocket /api/v1/pc/agent, pc-agent.ts).
// In: a snapshot on connect, then reset / state / item / listening / nothing. Out: say, stop.
const URL_WS = API.replace(/^http/, 'ws') + '/pc/agent';

export type AgentItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; title: string; status: string; output?: string };
export type AgentState = 'idle' | 'starting' | 'thinking' | 'working' | 'done' | 'stopped' | 'error';

export function useAgent(active: boolean) {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<AgentState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AgentItem[]>([]);
  const [heard, setHeard] = useState<'listening' | 'nothing' | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true, retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      const sock = new WebSocket(`${URL_WS}?token=${encodeURIComponent(currentToken() ?? '')}`);
      ws.current = sock;
      sock.onopen = () => { if (alive) setConnected(true); };
      sock.onmessage = (e) => {
        if (!alive) return;
        let m: any; try { m = JSON.parse(String(e.data)); } catch { return; }
        switch (m.type) {
          case 'snapshot': setState(m.state); setError(m.error ?? null); setItems(m.items ?? []); break;
          case 'reset': setItems([]); setError(null); break;
          case 'state': setState(m.state); setError(m.error ?? null); if (m.state !== 'idle') setHeard(null); break;
          case 'listening': setHeard('listening'); break;
          case 'nothing': setHeard('nothing'); break;
          case 'item': setItems((prev) => {
            const i = prev.findIndex((x) => x.id === m.item.id && x.kind === m.item.kind);
            if (i < 0) return [...prev, m.item];
            const next = prev.slice(); next[i] = m.item; return next;
          }); break;
        }
      };
      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        if (!alive) return;
        setConnected(false);
        retry = setTimeout(open, 1500);
      };
      sock.onerror = () => sock.close();
    };
    open();
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      ws.current?.close();
      ws.current = null;
      setConnected(false);
    };
  }, [active]);

  const raw = useCallback((m: object) => {
    const sock = ws.current;
    if (sock && sock.readyState === 1) { sock.send(JSON.stringify(m)); return true; }
    return false;
  }, []);
  const say = useCallback((text: string) => raw({ type: 'say', text }), [raw]);
  const stop = useCallback(() => raw({ type: 'stop' }), [raw]);

  const busy = state === 'starting' || state === 'thinking' || state === 'working';
  return { connected, state, error, items, heard, busy, say, stop };
}
