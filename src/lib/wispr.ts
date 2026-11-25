import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ApiError } from './api';
import { callHoldsMic, onCallChange } from './calls';
import { type DictateTo, gptAvailable, micMoving, useGptRecorder } from './gpt';

// The phone's volume buttons drive Wispr Flow on the PC (server: POST /pc/keys).
//   Hold volume up                 hold Wispr's talk keys; let go and it stops and pastes
//   Press volume down              call Nora (the `nora` handlers; nothing goes to the PC)
//   Hold volume down               a voice note to Nora: it records while held and sends when let go
//   Hold up, then tap down         turns the hold into hands-free (the PC mic screen's orb also toggles it)
//   Any volume press in hands-free stops it
// Command mode (the PC agent) starts from the Action button control instead; see targets/controls.
// Source 'phone' is GPT: the same controls record with this phone's mic instead, and the PC transcribes the clip
// with the Codex app's dictation (gpt.ts), types it, and presses Enter if it ended with "press enter".
// iOS reports a held button as a step now and then auto-repeat steps, never a release, so a release is the
// steps stopping: QUIET_FIRST after a lone step, QUIET_REPEAT once repeats have started.
// A call owns the mic and the volume buttons (lib/calls.ts): while one is up nothing here listens or starts, so the
// buttons set the call's volume, and a call starting stops whatever was going.
// A take says "Sent to PC" only once the PC has answered each of its key presses ("Sending" until then). A press
// that doesn't get there, or isn't answered within ANSWER_IN, ends the take as "PC not reached" with an error buzz,
// at once even mid-hold: the keep-alive stops and the PC is told to let go.
const QUIET_FIRST = 650;
const QUIET_REPEAT = 320;
const BEAT = 2000; // keep-alive while holding; the PC lets go by itself after 6 s without one
const SENT_FOR = 1600; // how long "Sent" stays up
const FAILED_FOR = 4000; // how long "PC not reached" stays up
const ANSWER_IN = 6000; // a key press the PC hasn't answered by then didn't reach it

export type Phase = 'idle' | 'listening' | 'handsfree' | 'sending' | 'sent' | 'failed' | 'command' | 'transcribing';
export type MicSource = 'pc' | 'phone';
type Native = { start(): void; stop(): void; addListener(e: 'onPress', cb: (p: { button: 'up' | 'down' }) => void): { remove(): void } };
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('VolumeButtons') : null;
export const volumeButtonsAvailable = !!native;

type Action = 'ptt-down' | 'ptt-up' | 'handsfree' | 'stop' | 'beat' | 'cmd-down' | 'cmd-up' | 'say-down' | 'say-up' | 'cmd-lock' | 'cmd-toggle';
const haptic = (s: Haptics.ImpactFeedbackStyle) => { if (Platform.OS !== 'web') Haptics.impactAsync(s).catch(() => {}); };
const buzz = () => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };

/** What volume down does: a press calls Nora, a hold records a voice note to her (holdStart, then holdEnd). */
export type NoraKeys = { tap: () => void; holdStart: () => void; holdEnd: () => void };

export function useWispr(enabled: boolean, nora?: NoraKeys) {
  const noraRef = useRef(nora);
  noraRef.current = nora;
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState(0); // when the phase began
  const [command, setCommand] = useState(false); // the command view is open (from the first command until closed)
  const [locked, setLocked] = useState(false); // a command is listening hands-free: Talk was slid up to lock, or tapped
  const [source, setSourceState] = useState<MicSource>('pc');
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  // gesture state, read and written only in handlers and timers
  const g = useRef({
    mode: 'idle' as 'idle' | 'ptt' | 'hfHeld' | 'handsfree' | 'stopHeld' | 'cmd' | 'cmdHf' | 'noraWait' | 'noraHold',
    ticks: [] as number[], t0: 0, // this press sequence's step times, ms from its first step
    steps: 0, quiet: null as ReturnType<typeof setTimeout> | null, beat: null as ReturnType<typeof setInterval> | null,
    sent: null as ReturnType<typeof setTimeout> | null, // ends "Sent" or "PC not reached"
    // the take: which one (an answer that comes late belongs to the take it was for), whether one of its presses
    // didn't reach the PC, how many still wait for the PC's answer, and whether its last press has gone
    take: 0, dead: false, pending: 0, over: false,
  });

  const show = useCallback((p: Phase) => {
    const st = g.current;
    if (st.sent) { clearTimeout(st.sent); st.sent = null; } // a new phase is never cut short by the last one's timer
    setPhase(p); setSince(Date.now());
  }, []);
  const rec = useGptRecorder();
  const gpt = useRef(false); // GPT is the source: record here instead of pressing Wispr's keys
  const recording = useRef(false);

  // Presses a key on the PC: null once it got there, else why not (no answer within ANSWER_IN counts as not).
  const reach = useCallback(async (action: Action, ticks?: number[]): Promise<string | null> => {
    let late: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        api('/pc/keys', { method: 'POST', body: ticks ? { action, ticks } : { action } }),
        new Promise((_, no) => { late = setTimeout(() => no(new ApiError(0, "Your PC didn't answer in time.")), ANSWER_IN); }),
      ]);
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Couldn't reach your PC.";
    } finally {
      if (late) clearTimeout(late);
    }
  }, []);
  // A press outside a take's own (the keep-alive, command mode, letting go): its error shows under the orb.
  const send = useCallback(async (action: Action, ticks?: number[]) => {
    const e = await reach(action, ticks);
    if (e) setError(e);
    else if (action !== 'beat' && !g.current.dead) setError(null); // a failed take keeps saying why
  }, [reach]);

  const clearTimers = useCallback(() => {
    const st = g.current;
    if (st.quiet) clearTimeout(st.quiet);
    if (st.beat) clearInterval(st.beat);
    st.quiet = null; st.beat = null;
  }, []);

  // How the take went, for a moment.
  const outcome = useCallback((p: 'sent' | 'failed') => {
    show(p);
    g.current.sent = setTimeout(() => show('idle'), p === 'sent' ? SENT_FOR : FAILED_FOR);
  }, [show]);

  // Back to idle, showing `after` first: "Sending" waits for the PC's answers to the take's presses; anything else
  // settles the take, so answers still on their way no longer show.
  const toIdle = useCallback((after: 'idle' | 'sending' | 'sent' | 'failed' = 'idle') => {
    const st = g.current;
    clearTimers();
    st.mode = 'idle'; st.steps = 0;
    if (after !== 'sending') st.take += 1;
    setLocked(false);
    if (after === 'sent' || after === 'failed') outcome(after); else show(after);
  }, [clearTimers, show, outcome]);

  // ---- a take's key presses ----
  // A new take: answers still on their way for an earlier one no longer show.
  const begin = useCallback(() => { const st = g.current; st.take += 1; st.dead = false; st.pending = 0; st.over = false; }, []);
  // Lets go of whatever the PC may still hold for a take that is over, quietly.
  const letGo = useCallback(() => { api('/pc/keys', { method: 'POST', body: { action: 'stop' } }).catch(() => {}); }, []);
  // A press of this take didn't reach the PC: "PC not reached" and an error buzz now. A hold still going ends when it
  // is let go (endTalk, or the hands-free hold's quiet); hands-free ends here.
  const lost = useCallback(() => {
    const st = g.current;
    if (st.dead) return;
    st.dead = true;
    buzz();
    if (st.beat) { clearInterval(st.beat); st.beat = null; }
    letGo();
    if (st.over || st.mode === 'idle') { st.over = false; outcome('failed'); }
    else if (st.mode === 'handsfree') toIdle('failed');
    else show('failed');
  }, [letGo, outcome, toIdle, show]);
  // Sends a press of this take. `last`: it ends the take, which says "Sent to PC" once the PC has answered them all.
  const press = useCallback((action: Action, ticks?: number[], last = false) => {
    const st = g.current, n = st.take;
    st.pending += 1;
    if (last) st.over = true;
    void reach(action, ticks).then((e) => {
      if (n !== st.take) return;
      st.pending -= 1;
      if (st.dead) return; // it has said so, with the first press's reason
      if (e) { setError(e); lost(); return; }
      setError(null);
      if (st.over && !st.pending) { st.over = false; outcome('sent'); }
    });
  }, [reach, lost, outcome]);

  // ---- GPT: record here, the PC transcribes ----
  const gptStart = useCallback(() => {
    recording.current = true;
    rec.start().catch((e) => { recording.current = false; setError(String(e?.message ?? e)); toIdle(); });
  }, [rec, toIdle]);
  const gptFinish = useCallback((to: DictateTo) => {
    if (!recording.current) { toIdle(); return; }
    recording.current = false;
    clearTimers();
    g.current.mode = 'idle';
    setLocked(false);
    show('transcribing');
    // a failure here is saved on the phone (gpt.ts says so), so it is no "PC not reached"
    rec.finish(to)
      .then((r) => { setError(r.text || to === 'agent' ? null : "Didn't catch that."); toIdle(r.text && to === 'type' ? 'sent' : 'idle'); })
      .catch((e) => { setError(e instanceof ApiError ? e.message : String(e?.message ?? "Couldn't reach your PC.")); toIdle(); });
  }, [rec, toIdle, clearTimers, show]);

  // ---- the actions, shared by the volume buttons and the on-screen controls ----
  const startTalk = useCallback(() => {
    const st = g.current;
    if (st.mode !== 'idle' || callHoldsMic()) return;
    st.mode = 'ptt';
    begin();
    if (gpt.current) { gptStart(); show('listening'); haptic(Haptics.ImpactFeedbackStyle.Medium); return; }
    press('ptt-down');
    st.beat = setInterval(() => send('beat'), BEAT);
    show('listening');
    haptic(Haptics.ImpactFeedbackStyle.Medium);
  }, [begin, press, send, show, gptStart]);

  const endTalk = useCallback(() => {
    const st = g.current;
    if (st.mode !== 'ptt') return;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    if (gpt.current) { gptFinish('type'); return; }
    if (st.dead) { toIdle('failed'); return; } // it said so when the press failed, and told the PC to let go
    press('ptt-up', st.ticks.length ? st.ticks : undefined, true);
    toIdle('sending');
  }, [press, toIdle, gptFinish]);

  const handsFree = useCallback((held: boolean) => {
    const st = g.current;
    if (callHoldsMic()) return;
    // a hold the PC never got doesn't become hands-free: a volume hold ends when let go, one locked on screen ends now
    if (st.mode === 'ptt' && st.dead) { if (!held) toIdle('failed'); return; }
    clearTimers();
    if (st.mode === 'idle') begin();
    if (gpt.current) { if (!recording.current) gptStart(); }
    else press('handsfree');
    st.mode = held ? 'hfHeld' : 'handsfree';
    show('handsfree');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
  }, [clearTimers, toIdle, begin, press, show, gptStart]);

  const stopHandsFree = useCallback((held: boolean) => {
    const st = g.current;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    if (gpt.current) gptFinish('type');
    else if (st.dead) toIdle('failed');
    else { press('stop', undefined, true); toIdle('sending'); }
    if (held) st.mode = 'stopHeld'; // swallow the rest of this press
  }, [press, toIdle, gptFinish]);

  // ---- command mode ----
  const startCommand = useCallback((follow: boolean) => {
    const st = g.current;
    if ((st.mode !== 'idle' && st.mode !== 'ptt') || callHoldsMic()) return;
    begin(); // a command is its own take (its errors show in the command view)
    st.mode = 'cmd';
    if (gpt.current) { if (!recording.current) gptStart(); }
    else {
      if (!st.beat) st.beat = setInterval(() => send('beat'), BEAT);
      send(follow ? 'say-down' : 'cmd-down');
    }
    setCommand(true);
    show('command');
    haptic(Haptics.ImpactFeedbackStyle.Heavy);
  }, [begin, send, show, gptStart]);

  const endCommand = useCallback((follow: boolean) => {
    const st = g.current;
    if (st.mode !== 'cmd') return;
    if (gpt.current) { haptic(Haptics.ImpactFeedbackStyle.Light); gptFinish('agent'); return; }
    send(follow ? 'say-up' : 'cmd-up', st.ticks.length ? st.ticks : undefined);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    toIdle();
  }, [send, toIdle, gptFinish]);

  // ---- volume steps ----
  const onStep = useCallback((button: 'up' | 'down') => {
    const st = g.current;
    // another part of the app opening or closing the mic moves the volume too (a dictation in Nora's chat or the
    // capture panel): those are not presses, and never ring Nora or start the PC's dictation. Our own take is exempt,
    // since a held talk lives on its repeat steps.
    if (!recording.current && st.mode === 'idle' && micMoving()) return;
    if (callHoldsMic()) return; // the call's own volume, or its audio session switching at either end
    const now = Date.now();
    if (st.mode === 'idle') { st.t0 = now; st.ticks = []; }
    if (st.ticks.length < 60) st.ticks.push(now - st.t0);
    st.steps += 1;
    const quietAfter = (ms: number, fn: () => void) => {
      if (st.quiet) clearTimeout(st.quiet);
      st.quiet = setTimeout(() => { st.quiet = null; fn(); }, ms);
    };
    // the hold that turned into hands-free is let go: hands-free goes on, unless the PC never got it
    const heldHf = () => { if (st.dead) toIdle('failed'); else st.mode = 'handsfree'; };
    switch (st.mode) {
      case 'idle':
        st.steps = 1;
        if (button === 'up') {
          startTalk();
          quietAfter(QUIET_FIRST, endTalk);
        } else {
          // volume down: a lone step is a press (call Nora); auto-repeat steps mean it is held (a voice note)
          st.mode = 'noraWait';
          haptic(Haptics.ImpactFeedbackStyle.Medium);
          quietAfter(QUIET_FIRST, () => { st.mode = 'idle'; st.steps = 0; noraRef.current?.tap(); });
        }
        break;
      case 'noraWait':
        if (button !== 'down') break;
        st.mode = 'noraHold';
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        noraRef.current?.holdStart();
        quietAfter(QUIET_REPEAT, () => { st.mode = 'idle'; st.steps = 0; haptic(Haptics.ImpactFeedbackStyle.Light); noraRef.current?.holdEnd(); });
        break;
      case 'noraHold':
        if (button !== 'down') break;
        quietAfter(QUIET_REPEAT, () => { st.mode = 'idle'; st.steps = 0; haptic(Haptics.ImpactFeedbackStyle.Light); noraRef.current?.holdEnd(); });
        break;
      case 'ptt':
        if (button === 'down') { handsFree(true); quietAfter(QUIET_FIRST, heldHf); }
        else quietAfter(st.steps > 1 ? QUIET_REPEAT : QUIET_FIRST, endTalk);
        break;
      case 'cmdHf':
        break;
      case 'cmd':
        if (button === 'up') quietAfter(st.steps > 1 ? QUIET_REPEAT : QUIET_FIRST, () => endCommand(false));
        break;
      case 'hfHeld':
        quietAfter(QUIET_REPEAT, heldHf);
        break;
      case 'handsfree':
        stopHandsFree(true);
        quietAfter(QUIET_FIRST, () => { st.mode = 'idle'; st.steps = 0; });
        break;
      case 'stopHeld':
        quietAfter(QUIET_REPEAT, () => { st.mode = 'idle'; st.steps = 0; });
        break;
    }
  }, [startTalk, endTalk, handsFree, stopHandsFree, endCommand, toIdle]);

  // A call started: let go of whatever was going (a GPT take is still saved), and stop listening until it ends.
  const [callUp, setCallUp] = useState(false);
  const { cancel: recCancel } = rec;
  useEffect(() => onCallChange((on) => {
    setCallUp(on);
    if (!on) return;
    const st = g.current;
    if (recording.current) { recording.current = false; recCancel(); }
    else if (st.mode === 'ptt' || st.mode === 'hfHeld' || st.mode === 'handsfree' || st.mode === 'cmd' || st.mode === 'cmdHf') send('stop');
    toIdle(); // and a take still waiting for the PC's answer no longer shows it
  }), [recCancel, send, toIdle]);

  // Listen only while asked to, the app is in front and no call is up.
  useEffect(() => {
    if (!native || !enabled || callUp) return;
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
  }, [enabled, onStep, callUp]);

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
      toIdle();
    } else if (st.mode === 'idle' && !callHoldsMic()) {
      begin();
      st.mode = 'cmdHf';
      if (gpt.current) gptStart(); else send('cmd-toggle');
      setLocked(true); setCommand(true); show('command');
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, [begin, send, show, toIdle, gptFinish, gptStart]);
  // The PC took the command (or it was stopped elsewhere): a locked one is over.
  const settle = useCallback(() => { if (!gpt.current && g.current.mode === 'cmdHf') toIdle(); }, [toIdle]);
  // Stop: drop a GPT recording without sending it, or end a locked PC command.
  const cancel = useCallback(() => {
    if (recording.current) { recording.current = false; rec.cancel(); toIdle(); return; }
    if (g.current.mode === 'cmdHf') toIdle();
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
