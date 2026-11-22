import { requireOptionalNativeModule } from 'expo';
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

// The microphone for Mind: a take (one to two minutes) or one spoken line. expo-audio records on the phone (m4a);
// the web preview records through the browser. A build without expo-audio's native side reports it missing instead
// of crashing. The dev web build can also pick an audio file, so the whole loop can be driven without a microphone.

type Audio = typeof import('expo-audio');
/* eslint-disable @typescript-eslint/no-require-imports */
const audio: Audio | null = Platform.OS === 'web' || requireOptionalNativeModule('ExpoAudio') ? require('expo-audio') : null;
/* eslint-enable @typescript-eslint/no-require-imports */
export const canRecord = !!audio;
export const canPickFile = __DEV__ && Platform.OS === 'web';

export type Recorded = { uri: string | Blob; type: string; secs: number | null };

const OPTIONS = audio ? { ...audio.RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true } : null;
type RecorderLike = { prepareToRecordAsync: () => Promise<void>; record: () => void; stop: () => Promise<void>; uri: string | null };
type StateLike = { isRecording: boolean; durationMillis: number; metering?: number };
const noRecorder = (): RecorderLike | null => null;
const noState = (): StateLike => ({ isRecording: false, durationMillis: 0 });
// the hook is chosen once, when this file loads, so the hooks a component calls never change between renders
const useRec: (o: unknown) => RecorderLike | null = audio ? (o) => audio.useAudioRecorder(o as never) as unknown as RecorderLike : noRecorder;
const useRecState: (r: RecorderLike | null, ms: number) => StateLike = audio
  ? (r, ms) => audio.useAudioRecorderState(r as never, ms) as unknown as StateLike : noState;

/** Start, stop and the live state of one recording. */
export function useRecorder() {
  const rec = useRec(OPTIONS);
  const state = useRecState(rec, 200);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(0);

  const start = useCallback(async () => {
    setError(null);
    if (!audio || !rec) { setError('Recording arrives with the next app build.'); return false; }
    try {
      const perm = await audio.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Allow the microphone for Agentic OS in Settings.'); return false; }
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await rec.prepareToRecordAsync();
      rec.record();
      started.current = Date.now();
      return true;
    } catch (e) {
      setError(Platform.OS === 'web' ? 'This browser has no microphone to record with.' : `The microphone didn't start: ${(e as Error).message}`);
      return false;
    }
  }, [rec]);

  const stop = useCallback(async (): Promise<Recorded | null> => {
    if (!audio || !rec) return null;
    const secs = started.current ? Math.round((Date.now() - started.current) / 1000) : null;
    started.current = 0;
    try { await rec.stop(); } catch { /* already stopped */ }
    audio.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = rec.uri;
    if (!uri) { setError("The recording didn't save on this phone."); return null; }
    return { uri, type: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', secs };
  }, [rec]);

  /** Throw the recording away (Cancel). */
  const discard = useCallback(async () => {
    started.current = 0;
    if (!rec) return;
    try { await rec.stop(); } catch { /* not recording */ }
    audio?.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, [rec]);

  // metering is dBFS (about -60 quiet to 0 loud); 0..1 for a level meter
  const level = state.metering == null ? 0 : Math.min(1, Math.max(0, (state.metering + 55) / 50));
  return { start, stop, discard, error, setError, recording: state.isRecording, ms: state.durationMillis, level };
}

/** Dev web only: choose an audio file in place of the microphone. */
export function pickAudioFile(): Promise<Recorded | null> {
  if (!canPickFile || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.setAttribute('aria-label', 'Audio file for a take');
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files?.[0] ?? null;
      input.remove();
      resolve(f ? { uri: f, type: f.type || 'audio/wav', secs: null } : null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** Play a take the PC keeps. */
type PlayerLike = { play: () => void; pause: () => void; seekTo: (s: number) => Promise<void> };
type PlayerStatus = { playing: boolean; currentTime: number; duration: number; isLoaded: boolean };
const usePlayerHook: (src: { uri: string; headers?: Record<string, string> } | null) => PlayerLike | null = audio
  ? (src) => audio.useAudioPlayer(src as never) as unknown as PlayerLike : () => null;
const usePlayerStatusHook: (p: PlayerLike | null) => PlayerStatus = audio
  ? (p) => audio.useAudioPlayerStatus(p as never) as unknown as PlayerStatus : () => ({ playing: false, currentTime: 0, duration: 0, isLoaded: false });
export function usePlayer(src: { uri: string; headers?: Record<string, string> } | null) {
  const p = usePlayerHook(src);
  const st = usePlayerStatusHook(p);
  const toggle = useCallback(() => {
    if (!p) return;
    if (st.playing) { p.pause(); return; }
    audio?.setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    if (st.duration > 0 && st.currentTime >= st.duration - 0.2) void p.seekTo(0).then(() => p.play()); else p.play();
  }, [p, st.playing, st.currentTime, st.duration]);
  return { available: !!p, playing: st.playing, at: st.currentTime, duration: st.duration, loaded: st.isLoaded, toggle };
}
