import { useRef } from 'react';

/** Microphone to PCM16 mono chunks (base64), browser version. */
export function useCapture() {
  const ref = useRef<{ stop: () => void } | null>(null);
  return {
    async start(onChunk: (b64: string) => void): Promise<number> {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let ctx: AudioContext;
      try { ctx = new Ctx({ sampleRate: 24000 }); } catch { ctx = new Ctx(); }
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      proc.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
        const bytes = new Uint8Array(pcm.buffer);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        onChunk(btoa(bin));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      ref.current = {
        stop: () => {
          proc.disconnect();
          src.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          ctx.close().catch(() => {});
        },
      };
      return ctx.sampleRate;
    },
    async stop() {
      ref.current?.stop();
      ref.current = null;
    },
  };
}
