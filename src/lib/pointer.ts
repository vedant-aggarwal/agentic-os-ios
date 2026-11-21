import { useCallback, useEffect, useRef, useState } from 'react';
import { API, currentToken } from './api';

// The phone as a trackpad for the PC: one WebSocket (server: /api/v1/pc/pointer), text frames
// "m dx dy" (move), "s dx dy" (scroll), "d|u|c l|r" (button down, up, click). Movement is summed and sent
// at most once a frame, so a fast swipe is a few small frames instead of hundreds.
const URL_WS = API.replace(/^http/, 'ws') + '/pc/pointer';
const FRAME = 16;

export function usePointer(active: boolean) {
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const acc = useRef({ mx: 0, my: 0, sx: 0, sy: 0, timer: null as ReturnType<typeof setTimeout> | null });

  useEffect(() => {
    if (!active) return;
    let alive = true, retry: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      const token = currentToken();
      const sock = new WebSocket(`${URL_WS}?token=${encodeURIComponent(token ?? '')}`);
      ws.current = sock;
      sock.onopen = () => { if (alive) setConnected(true); };
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

  const raw = useCallback((text: string) => {
    const sock = ws.current;
    if (sock && sock.readyState === 1) sock.send(text);
  }, []);

  const flush = useCallback(() => {
    const a = acc.current;
    a.timer = null;
    const mx = Math.trunc(a.mx), my = Math.trunc(a.my), sx = Math.trunc(a.sx), sy = Math.trunc(a.sy);
    a.mx -= mx; a.my -= my; a.sx -= sx; a.sy -= sy; // keep the fractions for the next frame
    if (mx || my) raw(`m ${mx} ${my}`);
    if (sx || sy) raw(`s ${sx} ${sy}`);
  }, [raw]);

  const queue = useCallback(() => { if (!acc.current.timer) acc.current.timer = setTimeout(flush, FRAME); }, [flush]);
  const move = useCallback((dx: number, dy: number) => { acc.current.mx += dx; acc.current.my += dy; queue(); }, [queue]);
  const scroll = useCallback((dx: number, dy: number) => { acc.current.sx += dx; acc.current.sy += dy; queue(); }, [queue]);
  const button = useCallback((op: 'd' | 'u' | 'c', which: 'l' | 'r') => { flush(); raw(`${op} ${which}`); }, [flush, raw]);

  return { connected, move, scroll, button };
}
