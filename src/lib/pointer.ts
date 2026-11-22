import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API, currentToken } from './api';

// The phone as a trackpad for the PC: one WebSocket, text frames "m dx dy" (move), "s dx dy" (scroll),
// "d|u|c l|r" (button down, up, click). Movement is summed and sent once per display frame; the PC glides each
// one out smoothly.
// Route: straight to the PC over Wi-Fi or Tailscale when it answers (no internet round trip, so far less lag),
// with a short-lived ticket from /pc/pointer-ticket; otherwise through the tunnel (/pc/pointer).
const TUNNEL_WS = API.replace(/^http/, 'ws') + '/pc/pointer';
const DIRECT_WAIT = 700; // ms to wait for a direct address before trying the next

export type Route = 'direct' | 'tunnel';

function connect(url: string, wait: number): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let done = false;
    const sock = new WebSocket(url);
    const finish = (ok: boolean) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (ok) resolve(sock); else { try { sock.close(); } catch {} resolve(null); }
    };
    const timer = setTimeout(() => finish(false), wait);
    sock.onopen = () => finish(true);
    sock.onerror = () => finish(false);
    sock.onclose = () => finish(false);
  });
}

async function openBest(): Promise<{ sock: WebSocket; route: Route } | null> {
  try {
    const t = await api<{ ticket: string | null; urls: string[] }>('/pc/pointer-ticket');
    for (const url of t.urls ?? []) {
      const sock = await connect(url, DIRECT_WAIT);
      if (sock) return { sock, route: 'direct' };
    }
  } catch {}
  const sock = await connect(`${TUNNEL_WS}?token=${encodeURIComponent(currentToken() ?? '')}`, 8000);
  return sock ? { sock, route: 'tunnel' } : null;
}

export function usePointer(active: boolean) {
  const [route, setRoute] = useState<Route | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const acc = useRef({ mx: 0, my: 0, sx: 0, sy: 0, frame: null as number | null });

  useEffect(() => {
    if (!active) return;
    let alive = true, retry: ReturnType<typeof setTimeout> | null = null;
    const open = async () => {
      const got = await openBest();
      if (!alive) { got?.sock.close(); return; }
      if (!got) { retry = setTimeout(open, 1500); return; }
      const { sock } = got;
      ws.current = sock;
      setRoute(got.route);
      sock.onerror = () => sock.close();
      sock.onclose = () => {
        if (ws.current === sock) ws.current = null;
        if (!alive) return;
        setRoute(null);
        retry = setTimeout(open, 600);
      };
    };
    open();
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      ws.current?.close();
      ws.current = null;
      setRoute(null);
    };
  }, [active]);

  const raw = useCallback((text: string) => {
    const sock = ws.current;
    if (sock && sock.readyState === 1) sock.send(text);
  }, []);

  const flush = useCallback(() => {
    const a = acc.current;
    a.frame = null;
    const mx = Math.trunc(a.mx), my = Math.trunc(a.my), sx = Math.trunc(a.sx), sy = Math.trunc(a.sy);
    a.mx -= mx; a.my -= my; a.sx -= sx; a.sy -= sy; // keep the fractions for the next frame
    if (mx || my) raw(`m ${mx} ${my}`);
    if (sx || sy) raw(`s ${sx} ${sy}`);
  }, [raw]);

  const queue = useCallback(() => { if (acc.current.frame === null) acc.current.frame = requestAnimationFrame(flush); }, [flush]);
  const move = useCallback((dx: number, dy: number) => { acc.current.mx += dx; acc.current.my += dy; queue(); }, [queue]);
  const scroll = useCallback((dx: number, dy: number) => { acc.current.sx += dx; acc.current.sy += dy; queue(); }, [queue]);
  const button = useCallback((op: 'd' | 'u' | 'c', which: 'l' | 'r') => {
    if (acc.current.frame !== null) cancelAnimationFrame(acc.current.frame);
    flush();
    raw(`${op} ${which}`);
  }, [flush, raw]);

  // keyboard: "t <text>" types it on the PC, "k <combo>" presses keys ("ctrl+c", "backspace", "f5")
  const type = useCallback((text: string) => { if (text) raw(`t ${text}`); }, [raw]);
  const key = useCallback((combo: string) => { if (combo) raw(`k ${combo}`); }, [raw]);
  // "kd <key>" / "ku <key>": hold a key down and let it go (hold Alt, tap Tab); the PC lets go of all if this drops
  const keyDown = useCallback((k: string) => raw(`kd ${k}`), [raw]);
  const keyUp = useCallback((k: string) => raw(`ku ${k}`), [raw]);
  // the remote screen: put the cursor at a point on one of the PC's monitors (0 = main), x and y from 0 to 1
  const abs = useCallback((x: number, y: number, d = 0) => raw(`a ${x.toFixed(4)} ${y.toFixed(4)} ${d}`), [raw]);

  return { connected: route !== null, route, move, scroll, button, type, key, keyDown, keyUp, abs };
}
