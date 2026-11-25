import { useSyncExternalStore } from 'react';
import { DEMO } from './demo';
import { onLiveFrame, sendLive } from './lineLive';
import { IDLE_AUDIO, type LineAudioState } from './lineNative';

// The audio of a live line call in a browser (the desktop web app). Listening plays the socket's audio frames
// (PCM16 LE, 16 kHz mono, 20 ms each) through Web Audio with a short buffer; taking over sends the microphone the same
// way (`mic` frames, with the browser's echo cancellation). Both go on the live screen's own socket (lineLive.ts).
// The `?demo` preview only flips the state, with no sound and no microphone prompt.

export type { LineAudioState };

let st: LineAudioState = IDLE_AUDIO;
const subs = new Set<() => void>();
const set = (p: Partial<LineAudioState>) => { st = { ...st, ...p }; for (const f of subs) f(); };

const RATE = 16000;
const FRAME = 320; // samples in 20 ms
let ctx: AudioContext | null = null;
let nextAt = 0;
let stopFrames: (() => void) | null = null;
let mic: { stream: MediaStream; src: MediaStreamAudioSourceNode; proc: ScriptProcessorNode } | null = null;
let micSeq = 0;
let pending: number[] = [];

const audioCtx = () => {
  if (!ctx) {
    const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) throw new Error("This browser can't play the call.");
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

function play(b64: string) {
  const c = ctx;
  if (!c) return;
  const bin = atob(b64);
  const n = bin.length >> 1;
  if (!n) return;
  const buf = c.createBuffer(1, n, RATE); // the browser resamples to its own rate
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    ch[i] = (v >= 0x8000 ? v - 0x10000 : v) / 32768;
  }
  const now = c.currentTime;
  // a little ahead of now; a backlog over 0.6 s is dropped so the call stays close to live
  if (nextAt < now + 0.04 || nextAt > now + 0.6) nextAt = now + 0.08;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(nextAt);
  nextAt += buf.duration;
}

function sendMic(input: Float32Array, inRate: number) {
  if (st.muted) return;
  // average down to 16 kHz, then 20 ms frames
  const step = inRate / RATE;
  for (let pos = 0; pos + step <= input.length; pos += step) {
    let sum = 0, k = 0;
    for (let j = Math.floor(pos); j < Math.floor(pos + step); j++) { sum += input[j]; k++; }
    pending.push(k ? sum / k : 0);
  }
  while (pending.length >= FRAME) {
    const frame = pending.splice(0, FRAME);
    let bin = '';
    for (const x of frame) {
      const v = Math.max(-1, Math.min(1, x));
      const i = Math.round(v < 0 ? v * 0x8000 : v * 0x7fff) & 0xffff;
      bin += String.fromCharCode(i & 0xff, i >> 8);
    }
    sendLive({ type: 'mic', seq: ++micSeq, data: btoa(bin) });
  }
}

function stopMic() {
  if (!mic) return;
  try { mic.proc.disconnect(); mic.src.disconnect(); } catch {}
  mic.stream.getTracks().forEach((t) => t.stop());
  mic = null;
  pending = [];
}

function stopListening() {
  stopFrames?.(); stopFrames = null;
  if (!DEMO) sendLive({ type: 'listen', on: false });
}

export const lineAudio = {
  canListen: DEMO || typeof globalThis.AudioContext === 'function',
  canTakeOver: DEMO || !!globalThis.navigator?.mediaDevices?.getUserMedia,
  async listen(callId: string, on: boolean) {
    if (!on) { stopListening(); set({ listening: false, connecting: false }); return; }
    try {
      if (!DEMO) {
        audioCtx();
        stopFrames?.();
        stopFrames = onLiveFrame((f) => { if (!f.callId || f.callId === callId) play(f.data); });
        if (!sendLive({ type: 'listen', on: true })) throw new Error("The call's line to your PC isn't open yet. Try again in a moment.");
      }
      set({ callId, listening: true, error: null });
    } catch (e) { set({ listening: false, error: e instanceof Error ? e.message : String(e) }); }
  },
  async takeOver(callId: string, _name: string) {
    set({ callId, connecting: true, error: null });
    try {
      if (!DEMO) {
        const c = audioCtx();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const src = c.createMediaStreamSource(stream);
        const proc = c.createScriptProcessor(2048, 1, 1);
        proc.onaudioprocess = (e) => {
          sendMic(e.inputBuffer.getChannelData(0), c.sampleRate);
          e.outputBuffer.getChannelData(0).fill(0);
        };
        src.connect(proc);
        proc.connect(c.destination);
        mic = { stream, src, proc };
        if (!st.listening) await lineAudio.listen(callId, true);
      }
      if (!sendLive({ type: 'takeover' })) throw new Error("The call's line to your PC isn't open yet. Try again in a moment.");
      set({ takenOver: true, connecting: false, muted: false });
    } catch (e) {
      stopMic();
      const denied = e instanceof Error && /denied|not allowed|permission/i.test(e.message);
      set({ connecting: false, takenOver: false, error: denied ? 'Allow the microphone for this site, then take over again.' : e instanceof Error ? e.message : String(e) });
    }
  },
  release() {
    stopMic();
    sendLive({ type: 'release' });
    set({ takenOver: false, muted: false });
  },
  hangUp: () => { stopMic(); stopListening(); set({ takenOver: false, listening: false }); return false; },
  stop: () => { stopMic(); stopListening(); set({ takenOver: false, listening: false, connecting: false }); },
  setMuted: (on: boolean) => set({ muted: on }),
  setSpeaker: (_on: boolean) => {},
  clearError: () => set({ error: null }),
};

export function useLineAudio(): LineAudioState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st, () => st);
}
