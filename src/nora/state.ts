import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import { setCallScreen } from '@/lib/calls';
import { DEMO } from '@/lib/demo';
import { NORA_LINE } from './line';

// Which of Nora's three surfaces is open: Home (her day, under the dock), Chat (over everything) and a call (over
// everything). The dock's buttons, deep links (agenticos://nora...) and notification taps all go through here.

export type CallAsk = { incomingId?: string | null; reason?: string; follow?: boolean; seq: number };
type S = { home: boolean; chat: boolean; mic: number; micSend: number; call: CallAsk | null; replyTo: { id: string; from: string } | null };

let s: S = { home: false, chat: false, mic: 0, micSend: 0, call: null, replyTo: null };
let seq = 0;
const subs = new Set<() => void>();
const set = (p: Partial<S>) => {
  const wasCall = !!s.call;
  s = { ...s, ...p };
  if (!!s.call !== wasCall) setCallScreen(!!s.call); // a call owns the mic: dictation stops and stays off (lib/calls.ts)
  for (const f of subs) f();
};

export const useNora = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => s, () => s);

/** How a call's audio can run on this build. 'none': the phone needs the call audio module (see call/relay.ts). */
export function callTransport(): 'sim' | 'relay' | 'webrtc' | 'none' {
  if (DEMO) return 'sim';
  if (Platform.OS !== 'web' && requireOptionalNativeModule('NoraRelay')) return 'relay';
  if (Platform.OS === 'web' && typeof globalThis.RTCPeerConnection === 'function' && !!globalThis.navigator?.mediaDevices?.getUserMedia) return 'webrtc';
  return 'none';
}

// the My tasks widget's plus: Home opens on the create sheet (a request made before Home is listening waits)
const createSubs = new Set<() => void>();
let createWaiting = false;

export const noraUi = {
  openHome: () => set({ home: true }),
  /** Home with the create sheet up. */
  openCreate: () => {
    set({ home: true });
    if (createSubs.size) for (const f of createSubs) f();
    else createWaiting = true;
  },
  onCreate: (f: () => void) => {
    createSubs.add(f);
    if (createWaiting) { createWaiting = false; queueMicrotask(f); }
    return () => { createSubs.delete(f); };
  },
  closeHome: () => set({ home: false }),
  toggleHome: () => set({ home: !s.home }),
  /** `mic`: start dictating as it opens. `replyTo`: the composer answers that agent's question. */
  openChat: (o: { mic?: boolean; replyTo?: { id: string; from: string } } = {}) =>
    set({ chat: true, mic: o.mic ? s.mic + 1 : s.mic, replyTo: o.replyTo ?? s.replyTo }),
  closeChat: () => set({ chat: false }),
  clearReply: () => set({ replyTo: null }),
  /**
   * Joins the call `incomingId` rang with, or rings her. `follow`: show the call that is already on (its audio runs
   * elsewhere, as when he answered on the lock screen). Without call audio on this build, ringing her opens chat to talk.
   */
  call: (o: { incomingId?: string | null; reason?: string; follow?: boolean } = {}) => {
    // no in-app call audio on this build: ring her SIM line, a real phone call, never dictation
    if (callTransport() === 'none' && !o.incomingId && !o.follow) {
      Linking.openURL(`tel:${NORA_LINE}`).catch(() => set({ chat: true }));
      return;
    }
    set({ call: { ...o, seq: ++seq } });
  },
  closeCall: () => set({ call: null }),
  /** Volume down held: chat opens recording a voice note... */
  voiceNote: () => { if (!s.call) set({ chat: true, mic: s.mic + 1, micSend: s.micSend }); },
  /** ...and let go: the take stops and goes to her. */
  voiceNoteSend: () => { if (!s.call) set({ micSend: s.micSend + 1 }); },
  /** Is a call up (volume down shouldn't ring her again)? */
  inCall: () => !!s.call,
};
