import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { onCallChange } from './calls';
import { useGptRecorder } from './gpt';
import { plog } from './log';

// The keyboard's mic. A keyboard extension can't record, so the app records for it: the keyboard opens
// agenticos://flow?id=<take id> (caught in src/app/+native-intent.tsx, no navigation), this starts a GPT take with that id, and the user swipes back.
// The keyboard follows the take on the PC (live text), and its stop button reaches here through the PC (the take's
// next upload says stop). After a take the mic stays open for a few minutes ("warm"), waiting on the PC for the next
// request, so the keyboard can start again without leaving the app it is in.
// With the PC away that stop never arrives, so the phone used to record until the app was killed: a take the PC hasn't
// taken an upload of for NO_UPLOAD_MS now ends here (it stays saved on the phone) and the mic closes. Today also shows
// a Stop while a keyboard take records. (The keyboard itself saying "Your PC is offline" instead of opening the app
// needs a new build.)
const WARM_MS = 5 * 60_000;
const NO_UPLOAD_MS = 30_000;

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
    let watch: ReturnType<typeof setInterval> | null = null;
    const unwatch = () => { if (watch) { clearInterval(watch); watch = null; } };
    const begin = async (id: string) => {
      const r = latest.current;
      if (r.recording()) return;
      setError(null);
      r.setWarm(WARM_MS, cold); // a take that ended for want of the PC closed the mic outright
      try {
        await r.start({
          id,
          onRemoteStop: () => {
            unwatch();
            latest.current.finish('none').catch((e) => { plog('kb finish', id, e); setError(String(e?.message ?? e)); }).finally(() => setState(warm ? 'warm' : 'idle'));
          },
        });
        warm = true;
        setState('recording');
        unwatch();
        watch = setInterval(() => {
          if (!latest.current.recording()) { unwatch(); return; }
          if (Date.now() - latest.current.lastUpload() > NO_UPLOAD_MS) away();
        }, 5000);
        void poll();
      } catch (e) { plog('kb start', id, e); setError(String((e as Error)?.message ?? e)); }
    };
    /** The PC hasn't taken an upload for NO_UPLOAD_MS, so the keyboard's stop can't arrive: end the take here. */
    const away = () => {
      unwatch();
      const r = latest.current;
      r.setWarm(0); // close the mic at once: the keyboard's next request would come through the PC too
      r.cancel(); // stopped, still saved on the phone; it goes to the PC when it can
      cold();
      setError("Your PC isn't reachable, so the keyboard's mic stopped. What you said is saved on this phone.");
    };
    /** Stop from the app: as the keyboard's stop (the PC writes it out for the keyboard), and the mic closes. */
    const stopNow = async () => {
      unwatch();
      const r = latest.current;
      r.setWarm(0);
      if (r.recording()) {
        try { await r.finish('none'); } catch (e) { plog('kb stop', e); setError(String((e as Error)?.message ?? e)); }
      } else r.close();
      cold();
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
          } catch (e) { plog('kb poll', e); await new Promise((ok) => setTimeout(ok, 3000)); }
        }
      } finally { polling = false; }
    };
    function cold() {
      warm = false; setState('idle');
      api('/pc/kbmic/cold', { method: 'POST', body: {} }).catch(() => {});
    }
    const stop = () => { warm = false; unwatch(); };
    return { begin, cold, stop, stopNow };
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
  // a call took the mic (the recorder stopped the take and closed): the keyboard's warm mic is over
  useEffect(() => onCallChange((on) => { if (on) ctl.cold(); }), [ctl]);

  return { state, error, live: rec.live, close: rec.close, stop: ctl.stopNow };
}
