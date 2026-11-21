import { AudioStudioModule, useAudioRecorder } from '@siteed/audio-studio';

/** Microphone to PCM16 mono chunks (base64), iOS and Android version. */
export function useCapture() {
  const rec = useAudioRecorder();
  return {
    async start(onChunk: (b64: string) => void): Promise<number> {
      const perm = await AudioStudioModule.requestPermissionsAsync();
      if (perm && perm.granted === false) throw new Error('Microphone access is off. Turn it on in Settings > Content OS.');
      const res = await rec.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        output: { primary: { enabled: false } },
        onAudioStream: async (e) => {
          if (typeof e.data === 'string') onChunk(e.data);
        },
      });
      return res.sampleRate || 16000;
    },
    async stop() {
      await rec.stopRecording().catch(() => {});
    },
  };
}
