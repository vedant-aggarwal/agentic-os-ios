import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { DEMO } from '@/lib/demo';
import { gptAvailable, useGptRecorder } from '@/lib/gpt';
import { haptic } from '@/aspects/kit';

// Talking to Nora instead of typing: the app's one dictation path (GPT takes, lib/gpt.ts). The phone streams the take
// to the PC, which transcribes while he talks (`live`), and stop() returns the words without typing them anywhere.
// The take is still kept in Voices. The web preview has no mic: with ?demo it plays sample words.

const SIM = DEMO || Platform.OS === 'web';
const SAMPLE = 'Move the gym to seven tonight and remind me to call home after.';

export type DictateState = 'idle' | 'recording' | 'finishing';

export function useDictate() {
  const { start: recStart, finish: recFinish, cancel: recCancel, live: recLive, offline: recOffline } = useGptRecorder();
  const [state, setState] = useState<DictateState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [simLive, setSimLive] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const st = useRef<DictateState>('idle');
  const go = useCallback((v: DictateState) => { st.current = v; setState(v); }, []);

  const start = useCallback(async () => {
    if (st.current !== 'idle') return;
    setError(null);
    if (SIM) {
      if (!DEMO) { setError('Talking to Nora works in the phone app.'); return; }
      const words = SAMPLE.split(' ');
      let n = 0;
      setSimLive(''); go('recording');
      timer.current = setInterval(() => { n = Math.min(words.length, n + 1); setSimLive(words.slice(0, n).join(' ')); }, 240);
      return;
    }
    if (!gptAvailable) { setError('Talking to Nora arrives with the next app build. Type for now.'); return; }
    try {
      await recStart();
      go('recording');
      haptic.light();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [go, recStart]);

  /** Stops and resolves with what the PC heard ('' when nothing was caught). */
  const stop = useCallback(async (): Promise<string> => {
    if (st.current !== 'recording') return '';
    go('finishing');
    haptic.light();
    if (SIM) {
      if (timer.current) clearInterval(timer.current);
      await new Promise((r) => setTimeout(r, 450));
      setSimLive(''); go('idle');
      return SAMPLE;
    }
    try {
      const r = await recFinish('none');
      const text = r.text.trim();
      if (!text) setError("Didn't catch that. Try again a little closer.");
      return text;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return '';
    } finally { go('idle'); }
  }, [go, recFinish]);

  const cancel = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (st.current === 'recording' && !SIM) recCancel();
    setSimLive(''); go('idle');
  }, [go, recCancel]);

  // closing the surface mid take drops it (it stays in Voices)
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (st.current === 'recording' && !SIM) recCancel();
  }, [recCancel]);

  return { state, error, clearError: () => setError(null), live: SIM ? simLive : state === 'idle' ? '' : recLive, offline: !SIM && recOffline, start, stop, cancel };
}
