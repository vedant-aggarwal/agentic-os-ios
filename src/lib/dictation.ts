import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { socketUrl } from './api';
import { useCapture } from './capture';

export type DictationState = 'idle' | 'connecting' | 'live' | 'finishing';

// The phone records at 16 kHz, so the relay can open Codex the moment the socket connects instead of
// waiting for the microphone to report its rate. The browser's rate is only known once it starts.
const KNOWN_RATE = Platform.OS === 'web' ? 0 : 16000;

/**
 * Live speech to text through the PC's relay (app/dictation.mjs), which uses Codex's streaming dictation
 * on Vedant's ChatGPT login. The mic starts at once; audio recorded while Codex is still connecting is
 * held and sent first, so nothing said in the first second is lost.
 * `onText` gets the whole transcript of this take each time it grows; `final` is true once at the end.
 */
export function useDictation(onText: (text: string, final: boolean) => void) {
  const live = useCapture();
  const cap = useRef(live);
  cap.current = live;
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const run = useRef<{ ready: boolean; stopWanted: boolean; queue: string[]; chunks: number } | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  const watch = useRef<ReturnType<typeof setTimeout>[]>([]);
  const end = useCallback(() => {
    watch.current.splice(0).forEach(clearTimeout);
    cap.current.stop();
    try { ws.current?.close(); } catch {}
    ws.current = null;
    run.current = null;
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (ws.current) return;
    setError(null);
    setState('connecting');
    const r = { ready: false, stopWanted: false, queue: [] as string[], chunks: 0 };
    run.current = r;
    const sock = new WebSocket(socketUrl('/api/dictate'));
    ws.current = sock;
    let rate = KNOWN_RATE;
    let started = false;
    const sendStart = () => {
      if (started || !rate || sock.readyState !== 1) return;
      started = true;
      sock.send(JSON.stringify({ type: 'start', sampleRate: rate }));
    };
    const sendAudio = (b64: string) => {
      r.chunks++;
      if (r.ready && sock.readyState === 1) sock.send(JSON.stringify({ type: 'audio', audio: b64 }));
      else if (r.queue.length < 300) r.queue.push(b64); // up to ~30 s held while Codex connects
    };
    // Say why instead of hanging silently: no answer from the PC, or a mic that records nothing.
    const fail = (msg: string) => {
      if (run.current !== r) return;
      try { if (sock.readyState === 1) sock.send(JSON.stringify({ type: 'diag', note: msg, chunks: r.chunks })); } catch {}
      setError(msg);
      cb.current('', true);
      end();
    };
    watch.current.push(setTimeout(() => { if (!r.ready) fail('The PC did not answer. Check the Content OS server is running.'); }, 12000));
    sock.onopen = sendStart;
    sock.onmessage = (ev) => {
      let m: { type: string; text?: string; message?: string };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === 'ready') {
        r.ready = true;
        r.queue.splice(0).forEach((a) => sock.send(JSON.stringify({ type: 'audio', audio: a })));
        if (r.stopWanted) sock.send(JSON.stringify({ type: 'stop' }));
      } else if (m.type === 'text') cb.current(m.text || '', false);
      else if (m.type === 'done') { cb.current(m.text || '', true); end(); }
      else if (m.type === 'error') { setError(m.message || 'Dictation failed'); cb.current('', true); end(); }
    };
    sock.onerror = () => { setError('Could not reach the PC for dictation.'); cb.current('', true); end(); };
    sock.onclose = () => { if (ws.current === sock) { cb.current('', true); end(); } };
    // Start the mic in parallel with the socket: recording begins right away.
    try {
      const actual = await cap.current.start(sendAudio);
      if (!rate) rate = actual;
      watch.current.push(setTimeout(() => { if (!r.chunks) fail('The microphone is not sending any sound. Close the app fully and try again.'); }, 3000));
      if (run.current === r) setState((s) => (s === 'connecting' ? 'live' : s));
      sendStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      cb.current('', true);
      end();
    }
  }, [end]);

  /** Stop listening. The transcript keeps arriving until Codex finishes, then onText(..., true). */
  const stop = useCallback(() => {
    const sock = ws.current;
    const r = run.current;
    cap.current.stop();
    if (!sock || !r) return end();
    setState('finishing');
    if (r.ready && sock.readyState === 1) sock.send(JSON.stringify({ type: 'stop', chunks: r.chunks }));
    else r.stopWanted = true; // sent as soon as Codex is listening and the held audio has gone out
  }, [end]);

  /** Drop the take without a transcript (e.g. the + button was only tapped). */
  const cancel = useCallback(() => {
    const prev = cb.current;
    cb.current = () => {};
    end();
    cb.current = prev;
  }, [end]);

  useEffect(() => end, [end]);
  return { state, error, start, stop, cancel };
}
