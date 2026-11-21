import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError } from './api';
import { type DictateTo, gptAvailable, useGptRecorder } from './gpt';

// The phone's volume buttons drive Wispr Flow on the PC (server: POST /pc/keys).
//   Hold volume up                 hold Wispr's talk keys; let go and it stops and pastes
//   Press volume down              hands-free: it keeps listening after you let go
//   Hold up, then tap down         turns the hold into hands-free
//   Any volume press in hands-free stops it
// Command mode (the PC agent) starts from the Action button control instead; see targets/controls.
// Source 'phone' is GPT: the same controls record with this phone's mic instead, and the PC transcribes the clip
// with the Codex app's dictation (gpt.ts), types it, and presses Enter if it ended with "press enter".
// iOS reports a held button as a step now and then auto-repeat steps, never a release, so a release is the
// steps stopping: QUIET_FIRST after a lone step, QUIET_REPEAT once repeats have started.
const QUIET_FIRST = 650;
const QUIET_REPEAT = 320;
const BEAT = 2000; // keep-alive while holding; the PC lets go by itself after 6 s without one
const SENT_FOR = 1600; // how long "Sent" stays up

export type Phase = 'idle' | 'listening' | 'handsfree' | 'sent' | 'command' | 'transcribing';
export type MicSource = 'pc' | 'phone';
type Native = { start(): void; stop(): void; addListener(e: 'onPress', cb: (p: { button: 'up' | 'down' }) => void): { remove(): void } };
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('VolumeButtons') : null;
export const volumeButtonsAvailable = !!native;

type Action = 'ptt-down' | 'ptt-up' | 'handsfree' | 'stop' | 'beat' | 'cmd-down' | 'cmd-up' | 'say-down' | 'say-up' | 'cmd-lock' | 'cmd-toggle';
const haptic = (s: Haptics.ImpactFeedbackStyle) => { if (Platform.OS !== 'web') Haptics.impactAsync(s).catch(() => {}); };

export function useWispr(enabled: boolean) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(0); // when the phase began
  const [command, setCommand] = useState(false); // the command view is open (from the first command until closed)
  const [locked, setLocked] = useState(false); // a command is listening hands-free: Talk was slid up to lock, or tapped
  const [source, setSourceState] = useState<MicSource>('pc');
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  // gesture state, read and written only in handlers and timers
  const g = useRef({
    mode: 'idle' as 'idle' | 'ptt' | 'hfHeld' | 'handsfree' | 'stopHeld' | 'cmd' | 'cmdHf',
    ticks: [] as number[], t0: 0, // this press sequence's step times, ms from its first step
    steps: 0, quiet: null as ReturnType<typeof setTimeout> | null, beat: null as ReturnType<typeof setInterval> | null,
    sent: null as ReturnType<typeof setTimeout> | null,
  });

  const show = useCallback((p: Phase) => { setPhase(p); setSince(Date.now()); }, []);
  const rec = useGptRecorder();
  const gpt = useRef(false); // GPT is the source: record here instead of pressing Wispr's keys
  const recording = useRef(false);

  const send = useCallback(async (action: Action, ticks?: number[]) => {
    try {
      await api('/pc/keys', { method: 'POST', body: ticks ? { action, ticks } : { action } });
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
    setLocked(false);
    if (st.sent) clearTimeout(st.sent);
    if (sent) {
      show('sent');
      st.sent = setTimeout(() => show('idle'), SENT_FOR);
    } else show('idle');
  }, [clearTimers, show]);

  // ---- GPT: record here, the PC transcribes ----
  const gptStart = useCallback(() => {
    recording.current = true;
    rec.start().catch((e) => { recording.current = false; setError(String(e?.message ?? e)); toIdle(false); });
  }, [rec, toIdle]);
  const gptFinish = useCallback((to: DictateTo) => {
    if (!recording.current) { toIdle(false); return; }
    recording.current = false;
    clearTimers();
    g.current.mode = 'idle';
    setLocked(false);
    show('transcribing');
    rec.finish(to)
      .then((r) => { setError(r.text || to === 'agent' ? null : "Didn't catch that."); toIdle(!!r.text && to === 'type'); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : String(e?.message ?? "Couldn't reach your PC.")); toIdle(false); });
  }, [rec, toIdle, clearTimers, show]);

  // ---- the actions, shared by the volume buttons and the on-screen controls ----
  const startTalk = useCallback(() => {
    const st = g.current;
    if (st.mode !== 'idle') return;
    st.mode = 'ptt';
    if (gpt.current) { gptStart(); show('listening'); haptic(Haptics.ImpactFeedbackStyle.Medium); return; }
    send('ptt-down');
    st.beat = setInterval(() => send('beat'), BEAT);
    show('listening');
    haptic(Haptics.ImpactFeedbackStyle.Medium);
  }, [send, show, gptStart]);

  const endTalk = useCallback(() => {
    if (g.current.mode !== 'ptt') return;
    if (gpt.current) { haptic(Haptics.ImpactFeedbackStyle.Light); gptFinish('type'); return; }
    send('ptt-up', g.current.ticks.length ? g.current.ticks : undefined);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    toIdle(true);
  }, [send, toIdle, gptFinish]);

  const handsFree = useCallback((held: boolean) => {
    const st = g.current;
    clearTimers();
    if (gpt.current) { if (!recording.current) gptStart(); }
    else send('handsfree');
    st.mode = held ? 'hfHeld' : 'handsfree';
    show('handsfree');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
  }, [clearTimers, send, show, gptStart]);

  const stopHandsFree = useCallback((held: boolean) => {
    const st = g.current;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    if (gpt.current) gptFinish('type');
    else { send('stop'); toIdle(true); }
    if (held) st.mode = 'stopHeld'; // swallow the rest of this press
  }, [send, toIdle, gptFinish]);

  // ---- command mode ----
  const startCommand = useCallback((follow: boolean) => {
    const st = g.current;
    if (st.mode !== 'idle' && st.mode !== 'ptt') return;
    st.mode = 'cmd';
    if (gpt.current) { if (!recording.current) gptStart(); }
    else {
      if (!st.beat) st.beat = setInterval(() => send('beat'), BEAT);
      send(follow ? 'say-down' : 'cmd-down');
    }
    setCommand(true);
    show('command');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
  }, [send, show, gptStart]);

  const endCommand = useCallback((follow: boolean) => {
    const st = g.current;
    if (st.mode !== 'cmd') return;
    if (gpt.current) { haptic(Haptics.ImpactFeedbackStyle.Light); gptFinish('agent'); return; }
    send(follow ? 'say-up' : 'cmd-up', st.ticks.length ? st.ticks : undefined);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    toIdle(false);
  }, [send, toIdle, gptFinish]);

  // ---- volume steps ----
  const onStep = useCallback((button: 'up' | 'down') => {
    const st = g.current;
    const now = Date.now();
    if (st.mode === 'idle') { st.t0 = now; st.ticks = []; }
    if (st.ticks.length < 60) st.ticks.push(now - st.t0);
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
          handsFree(true); // volume down on its own: straight into hands-free
          quietAfter(QUIET_FIRST, () => { st.mode = 'handsfree'; });
        }
        break;
      case 'ptt':
        if (button === 'down') { handsFree(true); quietAfter(QUIET_FIRST, () => { st.mode = 'handsfree'; }); }
        else quietAfter(st.steps > 1 ? QUIET_REPEAT : QUIET_FIRST, endTalk);
        break;
      case 'cmdHf':
        break;
      case 'cmd':
        if (button === 'up') quietAfter(st.steps > 1 ? QUIET_REPEAT : QUIET_FIRST, () => endCommand(false));
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
  }, [startTalk, endTalk, handsFree, stopHandsFree, endCommand]);

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
  useEffect(() => () => {
    if (g.current.mode === 'ptt') send('ptt-up');
    if (!gpt.current && (g.current.mode === 'cmd' || g.current.mode === 'cmdHf')) send('stop');
    clearTimers();
  }, [send, clearTimers]);

  const toggleHandsFree = useCallback(() => {
    const st = g.current;
    if (st.mode === 'handsfree') stopHandsFree(false);
    else if (st.mode === 'idle' || st.mode === 'ptt') handsFree(false);
  }, [handsFree, stopHandsFree]);

  // The Talk button in the command view: hold to say more to the agent.
  const sayIn = useCallback(() => { g.current.ticks = []; startCommand(true); }, [startCommand]);
  const sayOut = useCallback(() => endCommand(true), [endCommand]);
  // Slid up while holding Talk: the PC turns the hold into hands-free, so he can let go and keep talking.
  const sayLock = useCallback(() => {
    const st = g.current;
    if (st.mode !== 'cmd') return;
    clearTimers(); // hands-free needs no keep-alive
    st.mode = 'cmdHf';
    setLocked(true);
    if (!gpt.current) send('cmd-lock'); // GPT just keeps recording
  }, [clearTimers, send]);
  // A tap on Talk: sends a locked command, or starts one hands-free.
  const sayToggle = useCallback(() => {
    const st = g.current;
    if (st.mode === 'cmdHf') {
      haptic(Haptics.ImpactFeedbackStyle.Light);
      if (gpt.current) { gptFinish('agent'); return; }
      send('cmd-toggle');
      toIdle(false);
    } else if (st.mode === 'idle') {
      st.mode = 'cmdHf';
      if (gpt.current) gptStart(); else send('cmd-toggle');
      setLocked(true); setCommand(true); show('command');
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [send, show, toIdle, gptFinish, gptStart]);
  // The PC took the command (or it was stopped elsewhere): a locked one is over.
  const settle = useCallback(() => { if (!gpt.current && g.current.mode === 'cmdHf') toIdle(false); }, [toIdle]);
  // Stop: drop a GPT recording without sending it, or end a locked PC command.
  const cancel = useCallback(() => {
    if (recording.current) { recording.current = false; rec.cancel(); toIdle(false); return; }
    if (g.current.mode === 'cmdHf') toIdle(false);
  }, [rec, toIdle]);
  const closeCommand = useCallback(() => setCommand(false), []);
  const openCommand = useCallback(() => setCommand(true), []);
  // Phone mic streams this phone's microphone to the PC for Wispr; it needs native audio capture (next build).
  // Switch only between dictations, never mid-recording.
  const setSource = useCallback((v: MicSource) => {
    if (g.current.mode !== 'idle' || recording.current) { setSourceNote('Finish this dictation first.'); return; }
    if (v === 'phone' && !gptAvailable) { setSourceNote('GPT arrives with the next app build.'); return; }
    gpt.current = v === 'phone';
    setSourceState(v); setSourceNote(null);
  }, []);

  return {
    phase, since, error, command, locked, source, sourceNote, setSource, startTalk, endTalk, toggleHandsFree,
    sayIn, sayOut, sayLock, sayToggle, settle, cancel, closeCommand, openCommand,
    live: rec.live, offline: rec.offline, // GPT: the PC's text so far, and whether it is getting the audio
  };
}
