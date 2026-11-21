import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError } from './api';

// The phone's volume buttons drive Wispr Flow on the PC (server: POST /pc/keys).
//   Hold volume up                 hold Wispr's talk keys; let go and it stops and pastes
//   Hold up, then tap down         hands-free: it keeps listening after you let go
//   Press up and down together     hands-free too
//   Any volume press in hands-free stops it
// iOS reports a held button as a step now and then auto-repeat steps, never a release, so a release is the
// steps stopping: QUIET_FIRST after a lone step, QUIET_REPEAT once repeats have started.
const QUIET_FIRST = 650;
const QUIET_REPEAT = 320;
const BOTH = 220; // up and down this close together count as pressed together
const BEAT = 2000; // keep-alive while holding; the PC lets go by itself after 6 s without one
const SENT_FOR = 1600; // how long "Sent" stays up

export type Phase = 'idle' | 'listening' | 'handsfree' | 'sent';
type Native = { start(): void; stop(): void; addListener(e: 'onPress', cb: (p: { button: 'up' | 'down' }) => void): { remove(): void } };
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('VolumeButtons') : null;
export const volumeButtonsAvailable = !!native;

type Action = 'ptt-down' | 'ptt-up' | 'handsfree' | 'stop' | 'beat';
const haptic = (s: Haptics.ImpactFeedbackStyle) => { if (Platform.OS !== 'web') Haptics.impactAsync(s).catch(() => {}); };

export function useWispr(enabled: boolean) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(0); // when the phase began
  // gesture state, read and written only in handlers and timers
  const g = useRef({
    mode: 'idle' as 'idle' | 'ptt' | 'downFirst' | 'hfHeld' | 'handsfree' | 'stopHeld',
    steps: 0, quiet: null as ReturnType<typeof setTimeout> | null, beat: null as ReturnType<typeof setInterval> | null,
    sent: null as ReturnType<typeof setTimeout> | null,
  });

  const show = useCallback((p: Phase) => { setPhase(p); setSince(Date.now()); }, []);

  const send = useCallback(async (action: Action) => {
    try {
      await api('/pc/keys', { method: 'POST', body: { action } });
      if (action !== 'beat') setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach your PC.");
    }
  }, []);

  const clearTimers = useCallback(() => {
    const st = g.current;
    if (st.quiet) clearTimeout(st.quiet);
    if (st.beat) clearInterval(st.beat);
    st.quiet = null; st.beat = null;
  }, []);

  const toIdle = useCallback((sent: boolean) => {
    const st = g.current;
    clearTimers();
    st.mode = 'idle'; st.steps = 0;
    if (st.sent) clearTimeout(st.sent);
    if (sent) {
      show('sent');
      st.sent = setTimeout(() => show('idle'), SENT_FOR);
    } else show('idle');
  }, [clearTimers, show]);

  // ---- the actions, shared by the volume buttons and the on-screen controls ----
  const startTalk = useCallback(() => {
    const st = g.current;
    if (st.mode !== 'idle') return;
    st.mode = 'ptt';
    send('ptt-down');
    st.beat = setInterval(() => send('beat'), BEAT);
    show('listening');
    haptic(Haptics.ImpactFeedbackStyle.Medium);
  }, [send, show]);

  const endTalk = useCallback(() => {
    if (g.current.mode !== 'ptt') return;
    send('ptt-up');
    haptic(Haptics.ImpactFeedbackStyle.Light);
    toIdle(true);
  }, [send, toIdle]);

  const handsFree = useCallback((held: boolean) => {
    const st = g.current;
    clearTimers();
    send('handsfree');
    st.mode = held ? 'hfHeld' : 'handsfree';
    show('handsfree');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
  }, [clearTimers, send, show]);

  const stopHandsFree = useCallback((held: boolean) => {
    const st = g.current;
    send('stop');
    haptic(Haptics.ImpactFeedbackStyle.Light);
    toIdle(true);
    if (held) st.mode = 'stopHeld'; // swallow the rest of this press
  }, [send, toIdle]);

  // ---- volume steps ----
  const onStep = useCallback((button: 'up' | 'down') => {
    const st = g.current;
    st.steps += 1;
    const quietAfter = (ms: number, fn: () => void) => {
      if (st.quiet) clearTimeout(st.quiet);
      st.quiet = setTimeout(() => { st.quiet = null; fn(); }, ms);
    };
    switch (st.mode) {
      case 'idle':
        st.steps = 1;
        if (button === 'up') {
          startTalk();
          quietAfter(QUIET_FIRST, endTalk);
        } else {
          st.mode = 'downFirst'; // up may follow within BOTH: pressed together
          quietAfter(BOTH, () => { st.mode = 'stopHeld'; quietAfter(QUIET_FIRST, () => { st.mode = 'idle'; st.steps = 0; }); });
        }
        break;
      case 'downFirst':
        if (button === 'up') { handsFree(true); quietAfter(QUIET_FIRST, () => { st.mode = 'handsfree'; }); }
        else quietAfter(BOTH, () => { st.mode = 'stopHeld'; quietAfter(QUIET_FIRST, () => { st.mode = 'idle'; st.steps = 0; }); });
        break;
      case 'ptt':
        if (button === 'down') { handsFree(true); quietAfter(QUIET_FIRST, () => { st.mode = 'handsfree'; }); }
        else quietAfter(st.steps > 1 ? QUIET_REPEAT : QUIET_FIRST, endTalk);
        break;
      case 'hfHeld':
        quietAfter(QUIET_REPEAT, () => { st.mode = 'handsfree'; });
        break;
      case 'handsfree':
        stopHandsFree(true);
        quietAfter(QUIET_FIRST, () => { st.mode = 'idle'; st.steps = 0; });
        break;
      case 'stopHeld':
        quietAfter(QUIET_REPEAT, () => { st.mode = 'idle'; st.steps = 0; });
        break;
    }
  }, [startTalk, endTalk, handsFree, stopHandsFree]);

  // Listen only while asked to and the app is in front.
  useEffect(() => {
    if (!native || !enabled) return;
    let on = false;
    const sub = native.addListener('onPress', (p) => onStep(p.button));
    const sync = (state: string | null | undefined) => {
      const want = state === 'active';
      if (want && !on) { native.start(); on = true; }
      if (!want && on) { native.stop(); on = false; }
    };
    sync(AppState.currentState);
    const app = AppState.addEventListener('change', sync);
    return () => { app.remove(); sub.remove(); if (on) native.stop(); };
  }, [enabled, onStep]);

  // Leaving with a hold still on lets it go.
  useEffect(() => () => { if (g.current.mode === 'ptt') send('ptt-up'); clearTimers(); }, [send, clearTimers]);

  const toggleHandsFree = useCallback(() => {
    const st = g.current;
    if (st.mode === 'handsfree') stopHandsFree(false);
    else if (st.mode === 'idle' || st.mode === 'ptt') handsFree(false);
  }, [handsFree, stopHandsFree]);

  return { phase, since, error, startTalk, endTalk, toggleHandsFree };
}
