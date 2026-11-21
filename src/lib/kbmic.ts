import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { useGptRecorder } from './gpt';

// The keyboard's mic. A keyboard extension can't record, so the app records for it: the keyboard opens
// agenticos://flow?id=<take id> (src/app/flow.tsx), this starts a GPT take with that id, and the user swipes back.
// The keyboard follows the take on the PC (live text), and its stop button reaches here through the PC (the take's
// next upload says stop). After a take the mic stays open for a few minutes ("warm"), waiting on the PC for the next
// request, so the keyboard can start again without leaving the app it is in.
const WARM_MS = 5 * 60_000;

let listener: ((id: string) => void) | null = null;
let pending: string | null = null;
let last = '';
/** A take the keyboard asked for (from the deep link). */
export function requestKeyboardTake(id: string) {
  if (!/^t_[a-z0-9_]{6,40}$/.test(id) || id === last) return;
  last = id;
  if (listener) listener(id); else pending = id;
}

export type KbMicState = 'idle' | 'recording' | 'warm';

export function useKeyboardMic() {
  const rec = useGptRecorder();
  const [state, setState] = useState<KbMicState>('idle');
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(rec);
  useLayoutEffect(() => { latest.current = rec; });

  // the controller lives in a ref: requests arrive from outside React (the deep link, the PC's long poll)
  const [ctl] = useState(() => {
    let warm = false, polling = false;
    const begin = async (id: string) => {
      const r = latest.current;
      if (r.recording()) return;
      setError(null);
      try {
        await r.start({
          id,
          onRemoteStop: () => {
            latest.current.finish('none').catch((e) => setError(String(e?.message ?? e))).finally(() => setState(warm ? 'warm' : 'idle'));
          },
        });
        warm = true;
        setState('recording');
        void poll();
      } catch (e) { setError(String((e as Error)?.message ?? e)); }
    };
    /** While the mic is warm, wait on the PC for the keyboard's next request. */
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        while (warm) {
          try {
            const r = await api<{ id?: string }>('/pc/kbmic/next?wait=25');
            if (r.id && warm) await begin(r.id);
          } catch { await new Promise((ok) => setTimeout(ok, 3000)); }
        }
      } finally { polling = false; }
    };
    const cold = () => {
      warm = false; setState('idle');
      api('/pc/kbmic/cold', { method: 'POST', body: {} }).catch(() => {});
    };
    const stop = () => { warm = false; };
    return { begin, cold, stop };
  });

  const { setWarm } = rec;
  useEffect(() => {
    setWarm(WARM_MS, ctl.cold);
    listener = (id) => void ctl.begin(id);
    const first = pending;
    pending = null;
    const t = first ? setTimeout(() => void ctl.begin(first), 0) : null;
    return () => { listener = null; ctl.stop(); if (t) clearTimeout(t); };
  }, [setWarm, ctl]);

  return { state, error, live: rec.live, close: rec.close };
}
