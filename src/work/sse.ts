import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { API, currentToken } from '@/lib/api';

// Server-sent events with the Bearer token. React Native's fetch can't stream and EventSource can't send headers,
// so this reads expo/fetch's body stream (the browser's fetch on web) and splits it into events.
// Reconnects with backoff; `lastId` lets the caller resume from where it was (`?after=`).

export type SSEHandlers = {
  onEvent: (name: string, data: string) => void;
  onOpen?: () => void;
  onDown?: (message: string) => void;
};

export function openSSE(path: () => string, h: SSEHandlers) {
  let closed = false, ctl: AbortController | null = null, wait = 1000, timer: ReturnType<typeof setTimeout> | null = null;
  const doFetch = (Platform.OS === 'web' ? globalThis.fetch : expoFetch) as typeof globalThis.fetch;

  const run = async () => {
    if (closed) return;
    ctl = new AbortController();
    try {
      const token = currentToken();
      const res = await doFetch(API + path(), {
        headers: { Accept: 'text/event-stream', 'X-Client': 'native', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Live updates answered ${res.status}.`);
      wait = 1000;
      h.onOpen?.();
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let cut: number;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, cut);
          buf = buf.slice(cut + 2);
          let name = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue; // keep-alive comment
            if (line.startsWith('event:')) name = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
          if (data.length) h.onEvent(name, data.join('\n'));
        }
      }
      if (!closed) h.onDown?.('Live updates paused. Reconnecting.');
    } catch (e) {
      if (closed || (e as Error).name === 'AbortError') return;
      h.onDown?.((e as Error).message || 'Live updates paused. Reconnecting.');
    }
    if (closed) return;
    timer = setTimeout(run, wait);
    wait = Math.min(wait * 2, 15_000);
  };
  run();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ctl?.abort();
  };
}
