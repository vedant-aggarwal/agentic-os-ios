import { useCallback, useEffect, useRef, useState } from 'react';
import { socketUrl } from './api';
import { useCapture } from './capture';

export type DictationState = 'idle' | 'connecting' | 'live' | 'finishing';

/**
 * Live speech to text through the PC's relay (app/dictation.mjs), which uses Codex's streaming dictation
 * on Vedant's ChatGPT login. `onText` gets the whole transcript of this take each time it grows.
 */
export function useDictation(onText: (text: string, final: boolean) => void) {
  const live = useCapture();
  const cap = useRef(live);
  cap.current = live;
  const capture = { start: (f: (b: string) => void) => cap.current.start(f), stop: () => cap.current.stop() };
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const end = useCallback(() => {
    capture.stop();
    try { ws.current?.close(); } catch {}
    ws.current = null;
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (ws.current) return;
    setError(null);
    setState('connecting');
    const sock = new WebSocket(socketUrl('/api/dictate'));
    ws.current = sock;
    let ready = false;
    const queue: string[] = [];
    const sendAudio = (b64: string) => {
      if (sock.readyState !== 1) return;
      if (ready) sock.send(JSON.stringify({ type: 'audio', audio: b64 }));
      else if (queue.length < 100) queue.push(b64); // hold ~10 s until Codex is listening
    };
    sock.onmessage = (ev) => {
      let m: { type: string; text?: string; message?: string };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === 'ready') {
        ready = true;
        queue.splice(0).forEach((a) => sock.send(JSON.stringify({ type: 'audio', audio: a })));
        setState((s) => (s === 'connecting' ? 'live' : s));
      } else if (m.type === 'text') cb.current(m.text || '', false);
      else if (m.type === 'done') { cb.current(m.text || '', true); end(); }
      else if (m.type === 'error') { setError(m.message || 'Dictation failed'); end(); }
    };
    sock.onerror = () => { setError('Could not reach the PC for dictation.'); end(); };
    sock.onclose = () => { if (ws.current === sock) end(); };
    sock.onopen = async () => {
      try {
        const rate = await capture.start(sendAudio);
        sock.send(JSON.stringify({ type: 'start', sampleRate: rate }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        end();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  const stop = useCallback(() => {
    const sock = ws.current;
    capture.stop();
    if (sock?.readyState === 1) {
      setState('finishing');
      sock.send(JSON.stringify({ type: 'stop' }));
    } else end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end]);

  useEffect(() => end, [end]);
  return { state, error, start, stop };
}
