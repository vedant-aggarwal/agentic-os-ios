import { nora } from '@/lib/nora';

// A call in a browser (the web build): the page's mic goes to OpenAI over WebRTC. The offer goes to the PC
// (POST /nora/call), which hands it to Codex on his ChatGPT login and returns the answer; audio then flows between
// the browser and OpenAI, and the data channel carries both sides' words and her hand offs to Codex.
// Events (realtime, seen 2026-11-08): turn.created { turn: { id, role, transcript } }, turn.delta { turn_id, delta },
// turn.done { turn }, delegation.created. The OpenAI engine's own transcript events are read too.

export type RtcEvents = {
  onConnected(): void;
  onDropped(): void;
  onCaption(who: 'nora' | 'you', text: string): void;
  onHandoff(): void;
  onLevel(v: number): void;
};
export type Rtc = { callId: string; mute(m: boolean): void; close(): void };

export async function startRtc(o: { incomingId?: string | null; reason?: string }, ev: RtcEvents, alive: () => boolean): Promise<Rtc> {
  let vm: { codex: boolean } | null = null;
  try { vm = await nora.voiceMode(); } catch {}
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    throw new Error('The microphone is off for this page. Allow it in the browser and try again.');
  }
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  const dc = pc.createDataChannel('oai-events');
  let audio: HTMLAudioElement | null = null, actx: AudioContext | null = null, meter: ReturnType<typeof setInterval> | null = null;
  let callId = '';
  const close = () => {
    try { dc.close(); } catch {}
    try { pc.close(); } catch {}
    stream.getTracks().forEach((t) => t.stop());
    if (audio) { audio.pause(); audio.srcObject = null; audio.remove(); }
    actx?.close().catch(() => {});
    if (meter) clearInterval(meter);
  };

  const roles: Record<string, string> = {};
  const text: Record<'nora' | 'you', string> = { nora: '', you: '' };
  const say = (who: 'nora' | 'you', t: string, add = false) => { text[who] = add ? text[who] + t : t; ev.onCaption(who, text[who].trim()); };
  dc.onmessage = (e) => {
    let j: Record<string, any>;
    try { j = JSON.parse(String(e.data)); } catch { return; }
    if (j.type === 'turn.created' && j.turn) {
      roles[j.turn.id] = j.turn.role;
      say(j.turn.role === 'assistant' ? 'nora' : 'you', String(j.turn.transcript ?? ''));
    } else if (j.type === 'turn.delta' && typeof j.delta === 'string') say(roles[j.turn_id] === 'assistant' ? 'nora' : 'you', j.delta, true);
    else if (j.type === 'turn.done' && j.turn?.role === 'user') say('you', String(j.turn.transcript ?? text.you));
    else if (j.type === 'delegation.created') ev.onHandoff();
    else if (j.type === 'response.created') say('nora', '');
    else if ((j.type === 'response.output_audio_transcript.delta' || j.type === 'response.audio_transcript.delta') && j.delta) say('nora', j.delta, true);
    else if (j.type === 'conversation.item.input_audio_transcription.completed') say('you', String(j.transcript ?? ''));
  };
  pc.ontrack = (e) => {
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = e.streams[0];
    document.body.appendChild(audio);
    audio.play().catch(() => {});
    try {
      actx = new AudioContext();
      const an = actx.createAnalyser();
      an.fftSize = 512;
      actx.createMediaStreamSource(e.streams[0]).connect(an);
      const buf = new Float32Array(an.fftSize);
      meter = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        ev.onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
      }, 90);
    } catch {}
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') { ev.onConnected(); if (callId) nora.callReady(callId).catch(() => {}); }
    else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') ev.onDropped();
  };
  try {
    await pc.setLocalDescription(await pc.createOffer());
    const r = await nora.startCall({ sdp: pc.localDescription!.sdp, incomingId: o.incomingId ?? null, reason: o.reason ?? 'You called', engine: vm?.codex ? 'codex' : undefined });
    callId = r.callId;
    if (!alive()) { nora.endCall(callId).catch(() => {}); close(); throw new Error('Stopped.'); }
    await pc.setRemoteDescription({ type: 'answer', sdp: r.sdp });
    if (pc.connectionState === 'connected') nora.callReady(callId).catch(() => {});
  } catch (e) {
    close();
    throw e;
  }
  return {
    callId,
    mute: (m) => stream.getAudioTracks().forEach((t) => { t.enabled = !m; }),
    close,
  };
}
