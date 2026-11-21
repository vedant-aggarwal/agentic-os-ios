import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useRef } from 'react';
import { API, ApiError, currentToken } from './api';

// GPT dictation: record with this phone's mic, send the clip to the PC, and the PC transcribes it with the Codex
// app's dictation and types it where the cursor is (or hands it to the PC agent). Server: POST /pc/dictate.
// expo-audio's native side arrives with the app build that added it; older builds just report it missing.
type Audio = typeof import('expo-audio');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio: Audio | null = requireOptionalNativeModule('ExpoAudio') ? require('expo-audio') : null;
export const gptAvailable = !!audio;

export type DictateTo = 'type' | 'agent';
export type DictateResult = { text: string; enter: boolean; ms: number };

const OPTIONS = audio ? { ...audio.RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 } : null;

export function useGptRecorder() {
  // the hook exists only when the native module does, which never changes while the app runs
  const recorder = audio && OPTIONS ? audio.useAudioRecorder(OPTIONS) : null;
  const on = useRef(false);
  useEffect(() => () => { if (on.current) recorder?.stop().catch(() => {}); }, [recorder]);

  const start = useCallback(async () => {
    if (!audio || !recorder) throw new Error('GPT mic arrives with the next app build.');
    const perm = await audio.requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('Allow the microphone for Agentic OS in Settings.');
    await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    on.current = true;
  }, [recorder]);

  /** Stop and send the clip; resolves with what the PC heard. */
  const finish = useCallback(async (to: DictateTo): Promise<DictateResult> => {
    if (!recorder || !on.current) throw new Error('Not recording.');
    on.current = false;
    await recorder.stop();
    audio?.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) throw new Error('Nothing was recorded.');
    const clip = await (await fetch(uri)).blob();
    const token = currentToken();
    const res = await fetch(`${API}/pc/dictate?to=${to}`, {
      method: 'POST', body: clip,
      headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, out?.error ?? `The PC couldn't transcribe that (HTTP ${res.status}).`);
    return out as DictateResult;
  }, [recorder]);

  const cancel = useCallback(() => {
    if (!recorder || !on.current) return;
    on.current = false;
    recorder.stop().catch(() => {});
    audio?.setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, [recorder]);

  return { start, finish, cancel };
}
