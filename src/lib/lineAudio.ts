import { useEffect, useSyncExternalStore } from 'react';
import { IDLE_AUDIO, lineNative, type LineAudioState } from './lineNative';

// The audio of a live line call on the phone: listening and taking over run natively (modules/calls/ios/LineAudio.swift)
// on their own socket to /nora/line/live, so they keep going in the background and taking over is a real CallKit call
// (the green pill, the earpiece, Bluetooth, the lock screen's call controls). This file mirrors that state for the live
// screen. The web build has its own player and mic (lineAudio.web.ts).

export type { LineAudioState };

let st: LineAudioState = IDLE_AUDIO;
const subs = new Set<() => void>();
const set = (p: Partial<LineAudioState>) => { st = { ...st, ...p }; for (const f of subs) f(); };
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

let started = false;
function start() {
  if (started || !lineNative.available) return;
  started = true;
  lineNative.onAudio((s) => set(s));
  void lineNative.audioState().then((s) => set(s));
}

export const lineAudio = {
  canListen: lineNative.available,
  canTakeOver: lineNative.available,
  /** Plays the call's audio (both sides), or stops it. */
  async listen(callId: string, on: boolean) {
    set({ callId, connecting: on && !st.listening, error: null });
    try { await lineNative.listen(callId, on); } catch (e) { set({ connecting: false, listening: false, error: msg(e) }); }
  },
  /** His mic goes to the caller and Nora goes quiet: a CallKit call carries the audio. */
  async takeOver(callId: string, name: string) {
    set({ callId, connecting: true, error: null });
    try { await lineNative.takeOver(callId, name); } catch (e) { set({ connecting: false, takenOver: false, error: msg(e) }); }
  },
  /** Hands the call back to Nora; listening goes on if it was on. */
  release: () => lineNative.release(),
  /** True when the native socket sent the hang up; otherwise the screen sends it on its own socket. */
  hangUp: () => lineNative.hangUp(),
  stop: () => lineNative.stop(),
  setMuted: (on: boolean) => { set({ muted: on }); lineNative.setMuted(on); },
  setSpeaker: (on: boolean) => { set({ speaker: on }); lineNative.setSpeaker(on); },
  clearError: () => set({ error: null }),
};

export function useLineAudio(): LineAudioState {
  useEffect(start, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => st, () => st);
}
