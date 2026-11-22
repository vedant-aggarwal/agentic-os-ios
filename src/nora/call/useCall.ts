import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { currentToken } from '@/lib/api';
import { endSystemCall, onSystemCall } from '@/lib/calls';
import { nora, type LiveCall } from '@/lib/nora';
import { demoMode } from '@/lib/noraDemo';
import { callTransport, type CallAsk } from '../state';
import { relayModule, relayUrl } from './relay';
import { startRtc, type Rtc } from './webrtc';

// One call with Nora, whichever way its audio runs:
//   follow  the call is already on and its audio runs elsewhere (answered on the lock screen): this screen reads
//           GET /nora/call/live each second for whether it's connected, her hand offs and both sides' words
//   relay   the phone's call audio module (call/relay.ts) streams it through the PC; followed the same way, and it
//           also joins a call he answered on the lock screen, whose relay started natively
//   webrtc  a browser holds the audio itself (web build)
//   sim     the ?demo preview: a scripted call, no audio
// Without any of them on this build the screen says so and offers chat instead. A call he answered on the system call
// screen (CallKit, lib/calls.ts) is hung up there whenever it ends here, and hanging up or muting there acts here.

export type Phase = 'connecting' | 'live' | 'ended' | 'failed';
export type Talk = 'listening' | 'speaking' | 'thinking';
type Mode = 'sim' | 'relay' | 'webrtc' | 'follow' | 'none';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One call per mount: the screen keys it by the ask, so a new ask is a new call and unmounting ends it. */
export function useCall(ask: CallAsk | null, onClosed: () => void) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [talk, setTalk] = useState<Talk>('listening');
  const [her, setHer] = useState('');
  const [his, setHis] = useState('');
  const [t0, setT0] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('none');
  const [lasted, setLasted] = useState(0);
  const level = useSharedValue(0);
  const callId = useRef('');
  const rtc = useRef<Rtc | null>(null);
  const stops = useRef<(() => void)[]>([]);
  const phaseRef = useRef<Phase>('connecting');
  const t0Ref = useRef<number | null>(null);
  const speakT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modeRef = useRef<Mode>('none');
  const ringId = useRef(ask?.incomingId ?? null); // the ring he answered, also on the system call screen
  const go = useCallback((p: Phase) => {
    phaseRef.current = p; setPhase(p);
    if ((p === 'ended' || p === 'failed') && ringId.current) void endSystemCall(ringId.current);
  }, []);
  const way = useCallback((m: Mode) => { modeRef.current = m; setMode(m); }, []);
  const started = useCallback((at = Date.now()) => { if (!t0Ref.current) { t0Ref.current = at; setT0(at); } }, []);
  const lvl = useCallback((v: number) => { level.set(withTiming(v, { duration: 100 })); }, [level]);
  /** Her line arrived: she's speaking for about as long as it takes to say it. */
  const spoke = useCallback((text: string, est = true) => {
    setHer(text);
    setTalk('speaking');
    if (speakT.current) clearTimeout(speakT.current);
    if (est) speakT.current = setTimeout(() => setTalk((x) => (x === 'speaking' ? 'listening' : x)), Math.min(12_000, 1200 + text.length * 60));
  }, []);

  // GET /nora/call/live once a second: connected, muted, hand offs and the words, for follow and relay. With the relay
  // her voice's loudness says when she's speaking, so her words only update the text.
  const follow = useCallback((alive: () => boolean, wantId: string | null, byLevel = false) => {
    let lastAt = '', misses = 0;
    const since = Date.now();
    const id = setInterval(async () => {
      if (!alive()) return;
      let call: LiveCall | null;
      try { call = (await nora.liveCall()).call; misses = 0; } catch { if (++misses > 10) { setError('Lost the PC.'); go('failed'); clearInterval(id); } return; }
      if (!alive()) return;
      if (!call || (wantId && call.id !== wantId && callId.current)) {
        if (callId.current) { clearInterval(id); setLasted(t0Ref.current ? Math.round((Date.now() - t0Ref.current) / 1000) : 0); go('ended'); setTimeout(onClosed, 1600); }
        else if (Date.now() - since > 30_000) { clearInterval(id); setError("She couldn't pick up. Try again."); go('failed'); }
        return;
      }
      callId.current = call.id;
      if (call.connected && phaseRef.current === 'connecting') { started(Date.now() - call.seconds * 1000); go('live'); }
      setMuted(call.muted);
      if (call.handoff) setTalk('thinking');
      for (const x of call.transcript.filter((y) => String(y.at) > lastAt)) {
        lastAt = String(x.at);
        if (x.who === 'nora') { if (byLevel) setHer(x.text); else spoke(x.text); } else setHis(x.text);
      }
    }, 1000);
    stops.current.push(() => clearInterval(id));
  }, [go, onClosed, spoke, started]);

  useEffect(() => {
    if (!ask) return;
    let alive = true;
    const isAlive = () => alive;
    stops.current = [];
    const fail = (msg: string) => { if (!alive) return; setError(msg); go('failed'); lvl(0); };

    (async () => {
      const can = callTransport();
      if (can === 'sim') {
        way('sim');
        await sleep(1200); if (!alive) return;
        if (demoMode() === 'call-fail') { fail("Her voice couldn't connect from this phone. Check the network and try again."); return; }
        started(); go('live');
        const wobble = setInterval(() => lvl(0.25 + Math.random() * 0.6), 110);
        const quiet = () => { clearInterval(wobble); lvl(0); };
        stops.current.push(quiet);
        const script: [number, () => void][] = [
          [0, () => spoke(ask.reason && ask.incomingId ? `Hi. Calling about ${ask.reason.toLowerCase()}.` : "Hi. What's on your mind?", false)],
          [2600, () => { quiet(); setTalk('listening'); }],
          [3400, () => setHis('Move the gym to seven tonight')],
          [4800, () => setTalk('thinking')],
          [6600, () => { spoke('Done. The gym is at seven, and the evening after it is free.', false); const w = setInterval(() => lvl(0.25 + Math.random() * 0.6), 110); stops.current.push(() => clearInterval(w)); setTimeout(() => clearInterval(w), 3000); }],
          [9600, () => { lvl(0); setTalk('listening'); }],
        ];
        for (const [at, f] of script) { const id = setTimeout(() => { if (alive) f(); }, at); stops.current.push(() => clearTimeout(id)); }
        return;
      }

      // a call already on (he answered on the lock screen, or rang from another screen): follow it
      let live: LiveCall | null = null;
      try { live = (await nora.liveCall()).call; } catch {}
      // the phone's relay already carries a call (answered on the lock screen): join it rather than follow it
      let joined = false;
      if (can === 'relay') { try { joined = !!(await relayModule()!.current()); } catch {} }
      if (!alive) return;
      if (live && !joined && (ask.follow || ask.incomingId || can === 'none')) {
        way('follow'); callId.current = live.id;
        if (live.connected) { started(Date.now() - live.seconds * 1000); go('live'); }
        follow(isAlive, live.id);
        return;
      }
      // answered on the lock screen: the phone's own audio is bringing the call up; wait for it to show
      if (ask.follow && !joined) { way('follow'); follow(isAlive, null); return; }

      if (can === 'relay') {
        const m = relayModule()!;
        way('relay');
        if (joined && live?.connected) started(Date.now() - live.seconds * 1000);
        const subs = [
          m.addListener('state', (e) => {
            if (!alive) return;
            if (e.callId) callId.current = e.callId;
            if (typeof e.speaker === 'boolean') setSpeaker(e.speaker);
            if (e.state === 'ready') { started(); go('live'); }
            if (e.state === 'ended' && phaseRef.current !== 'ended' && phaseRef.current !== 'failed') {
              if (e.error) fail(e.error);
              else { setLasted(t0Ref.current ? Math.round((Date.now() - t0Ref.current) / 1000) : 0); go('ended'); setTimeout(onClosed, 1600); }
            }
          }),
          m.addListener('level', (e) => {
            if (!alive) return;
            lvl(e.level);
            if (e.level > 0.06) setTalk('speaking'); else setTalk((x) => (x === 'speaking' ? 'listening' : x));
          }),
        ];
        stops.current.push(() => subs.forEach((x) => x.remove()));
        try {
          await m.start({ url: relayUrl(), token: currentToken() ?? '', incomingId: ask.incomingId ?? undefined, reason: ask.reason ?? 'You called' });
        } catch (e) { fail(errText(e)); return; }
        follow(isAlive, null, true);
        return;
      }

      if (can === 'webrtc') {
        way('webrtc');
        try {
          rtc.current = await startRtc({ incomingId: ask.incomingId, reason: ask.reason }, {
            onConnected: () => { if (alive) { started(); go('live'); } },
            onDropped: () => fail('The call dropped.'),
            onCaption: (who, text) => { if (!alive) return; if (who === 'nora') { setHer(text); } else setHis(text); },
            onHandoff: () => { if (alive) setTalk('thinking'); },
            onLevel: (v) => {
              if (!alive) return;
              lvl(v);
              if (v > 0.06) setTalk('speaking'); else setTalk((x) => (x === 'speaking' ? 'listening' : x));
            },
          }, isAlive);
          callId.current = rtc.current.callId;
          const id = setTimeout(() => { if (alive && !t0Ref.current) fail("Her voice couldn't connect. Try again, or check the network."); }, 15_000);
          stops.current.push(() => clearTimeout(id));
        } catch (e) { if (alive) fail(errText(e)); }
        return;
      }

      way('none');
      fail(ask.incomingId ? "Her voice needs the next app build, so this call can't connect here. Talk to her in chat for now."
        : 'Calls need the next app build. Talk to her in chat for now.');
    })();

    return () => {
      alive = false;
      for (const f of stops.current) f();
      stops.current = [];
      if (speakT.current) clearTimeout(speakT.current);
      rtc.current?.close();
      const id = callId.current;
      if (phaseRef.current !== 'ended' && phaseRef.current !== 'failed') {
        if (modeRef.current === 'relay') relayModule()?.stop(); // also while it's still connecting
        if (id) nora.endCall(id).catch(() => {});
      }
    };
  }, [ask, follow, go, lvl, spoke, started, way, onClosed]);

  const end = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'ended') return;
    for (const f of stops.current) f();
    stops.current = [];
    lvl(0);
    if (p === 'failed') { onClosed(); return; }
    const id = callId.current;
    if (mode === 'relay') relayModule()?.stop();
    rtc.current?.close();
    if (id) nora.endCall(id).catch(() => {});
    setLasted(t0Ref.current ? Math.round((Date.now() - t0Ref.current) / 1000) : 0);
    go('ended');
    setTimeout(onClosed, 1400);
  }, [go, lvl, mode, onClosed]);

  const setMute = useCallback((m: boolean) => {
    setMuted(m);
    if (mode === 'webrtc') rtc.current?.mute(m);
    if (mode === 'relay') relayModule()?.setMuted(m);
    if ((mode === 'relay' || mode === 'follow') && callId.current) nora.muteCall(callId.current, m).catch(() => {});
  }, [mode]);
  const toggleMute = useCallback(() => setMute(!muted), [setMute, muted]);

  // the system call screen: he hung up or muted there
  useEffect(() => onSystemCall((e) => {
    if (e.type === 'end' && (!e.id || e.id === ringId.current)) end();
    else if (e.type === 'mute') setMute(e.muted);
  }), [end, setMute]);

  const toggleSpeaker = useCallback(() => {
    const on = !speaker;
    setSpeaker(on);
    relayModule()?.setSpeaker(on);
  }, [speaker]);

  return { phase, talk, her, his, t0, muted, speaker, error, mode, lasted, level, end, toggleMute, toggleSpeaker };
}
