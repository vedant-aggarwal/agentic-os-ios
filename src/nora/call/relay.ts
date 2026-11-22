import { requireOptionalNativeModule } from 'expo';
import { API } from '@/lib/api';

// The phone's call audio, which this build does not have yet. Calls cannot run in a web view on the iPhone: the
// Capacitor app's WKWebView never brought its WebRTC link to OpenAI up (2026-11-10), and expo-audio's AudioStream
// records with the session in .record mode (nothing can play meanwhile) and without echo cancellation.
//
// What the call screen expects, as an Expo module named NoraRelay: a port of the Capacitor app's
// ios/App/App/NoraRelay.swift (agentic-os-ios-ai). It opens wss://<server>/api/v1/nora/relay?incomingId=&reason=
// with the Bearer token, runs AVAudioEngine with voice processing on (echo cancellation), sends the mic as
// { type: 'audio', data: <base64 24 kHz 16 bit mono PCM> } and plays every { type: 'audio' } it gets, drops what it
// has queued on { type: 'clear' }, and ends on { type: 'end' } or { type: 'error', message }.
//
//   start({ url, token, incomingId?, reason? }): Promise<void>   resolves once the socket is open
//   setMuted(muted: boolean): void                                stop sending the mic (the PC also mutes on /mute)
//   setSpeaker(on: boolean): void                                 loudspeaker on, or the earpiece / headset
//   stop(): void                                                  send { type: 'end' }, close, release the audio
//   events  'state' { state: 'connecting' | 'ready' | 'ended', callId?: string, error?: string }
//           'level' { level: 0..1 }                               her voice's loudness about ten times a second (optional)
//
// A call he answers on the lock screen (CallKit) can run the same module natively; the app then opens
// agenticos://nora/call?id=<incoming id> and the call screen follows it through GET /nora/call/live.

export type RelayState = { state: 'connecting' | 'ready' | 'ended'; callId?: string; error?: string };
type Sub = { remove(): void };
export type NoraRelayModule = {
  start(o: { url: string; token: string; incomingId?: string; reason?: string }): Promise<void>;
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
  stop(): void;
  addListener(event: 'state', fn: (e: RelayState) => void): Sub;
  addListener(event: 'level', fn: (e: { level: number }) => void): Sub;
};

export const relayModule = () => requireOptionalNativeModule<NoraRelayModule>('NoraRelay');
export const relayUrl = () => `${API.replace(/^http/, 'ws')}/nora/relay`;
