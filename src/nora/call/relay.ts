import { requireOptionalNativeModule } from 'expo';
import { API } from '@/lib/api';

// The phone's call audio: the Expo module NoraRelay (modules/calls/ios/NoraRelay.swift). Calls cannot run in a web
// view on the iPhone: the Capacitor app's WKWebView never brought its WebRTC link to OpenAI up (2026-11-10), and
// expo-audio's AudioStream records with the session in .record mode (nothing can play meanwhile) and without echo
// cancellation. Builds without the module have no call audio (state.ts callTransport() says 'none').
//
// The module is a port of the Capacitor app's ios/App/App/NoraRelay.swift (agentic-os-ios-ai). It opens
// wss://<server>/api/v1/nora/relay?incomingId=&reason=
// with the Bearer token, runs AVAudioEngine with voice processing on (echo cancellation), sends the mic as
// { type: 'audio', data: <base64 24 kHz 16 bit mono PCM> } and plays every { type: 'audio' } it gets, drops what it
// has queued on { type: 'clear' }, and ends on { type: 'end' } or { type: 'error', message }.
//
//   start({ url, token, incomingId?, reason? }): Promise<void>   resolves once the socket is open; joins the call on now
//   current(): Promise<RelayNow | null>                           the call on now, if any
//   setMuted(muted: boolean): void                                stop sending the mic (the PC also mutes on /mute)
//   setSpeaker(on: boolean): void                                 loudspeaker on, or the earpiece / headset
//   stop(): void                                                  send { type: 'end' }, close, release the audio
//   events  'state' { state: 'connecting' | 'ready' | 'ended', callId?: string, error?: string, speaker?: boolean }
//           'level' { level: 0..1 }                               her voice's loudness about ten times a second
//
// A call he answers on the lock screen (CallKit) runs the same module natively, with no app UI: the socket opens on
// answer and the audio starts when CallKit turns the audio session on. The app then opens
// agenticos://nora/call?id=<incoming id>, and the call screen joins that relay with start(). A call he starts in the
// app sets up its own audio session and opens on the loudspeaker; one answered on the system call screen opens on
// the earpiece.

export type RelayState = { state: 'connecting' | 'ready' | 'ended'; callId?: string; error?: string; speaker?: boolean };
export type RelayNow = { state: 'connecting' | 'ready'; incomingId?: string; callId?: string; speaker: boolean; owner: 'app' | 'callkit' };
type Sub = { remove(): void };
export type NoraRelayModule = {
  start(o: { url: string; token: string; incomingId?: string; reason?: string }): Promise<void>;
  current(): Promise<RelayNow | null>;
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
  stop(): void;
  addListener(event: 'state', fn: (e: RelayState) => void): Sub;
  addListener(event: 'level', fn: (e: { level: number }) => void): Sub;
};

export const relayModule = () => requireOptionalNativeModule<NoraRelayModule>('NoraRelay');
export const relayUrl = () => `${API.replace(/^http/, 'ws')}/nora/relay`;
