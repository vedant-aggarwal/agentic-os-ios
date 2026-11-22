import { useRef } from 'react';
import { AudioStudioModule, useAudioRecorder, type RecordingConfig } from '@siteed/audio-studio';

// The phone has one native recorder, but every mic on screen (dock, Kai bar, text boxes) has its own hook.
// Only the field that started the take may stop it, and a new take waits for the last stop to finish:
// otherwise one field's cleanup kills another's take, or a start fails with "already recording".
let owner: symbol | null = null;
let stopOwner: (() => Promise<void>) | null = null;
let lastStop: Promise<unknown> = Promise.resolve();

const native = AudioStudioModule as unknown as { stopRecording?: () => Promise<unknown> };

/** Microphone to PCM16 mono chunks (base64), iOS and Android version. */
export function useCapture() {
  const rec = useAudioRecorder();
  const me = useRef<symbol>(Symbol('mic')).current;

  const stop = async () => {
    if (owner !== me) return; // never stop another field's take
    owner = null;
    stopOwner = null;
    lastStop = rec.stopRecording().catch(() => {});
    await lastStop;
  };

  return {
    async start(onChunk: (b64: string) => void): Promise<number> {
      const perm = await AudioStudioModule.requestPermissionsAsync();
      if (perm && perm.granted === false) throw new Error('Microphone access is off. Turn it on in Settings > Content OS.');
      if (owner && owner !== me && stopOwner) await stopOwner(); // another mic still has it: end that take first
      await lastStop;
      const opts: RecordingConfig = {
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        output: { primary: { enabled: false } },
        onAudioStream: async (e) => {
          if (typeof e.data === 'string') onChunk(e.data);
        },
      };
      let res;
      try {
        res = await rec.startRecording(opts);
      } catch {
        // A take left running (an app reload, a crash mid-take) blocks a new one: stop it and try once more.
        await native.stopRecording?.().catch(() => {});
        res = await rec.startRecording(opts);
      }
      owner = me;
      stopOwner = stop;
      return res.sampleRate || 16000;
    },
    stop,
  };
}
