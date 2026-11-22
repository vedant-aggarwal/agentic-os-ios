import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { DEMO } from '@/lib/demo';

// Which of Nora's three surfaces is open: Home (her day, under the dock), Chat (over everything) and a call (over
// everything). The dock's buttons, deep links (agenticos://nora...) and notification taps all go through here.

export type CallAsk = { incomingId?: string | null; reason?: string; follow?: boolean; seq: number };
type S = { home: boolean; chat: boolean; mic: number; call: CallAsk | null; replyTo: { id: string; from: string } | null };

let s: S = { home: false, chat: false, mic: 0, call: null, replyTo: null };
let seq = 0;
const subs = new Set<() => void>();
const set = (p: Partial<S>) => { s = { ...s, ...p }; for (const f of subs) f(); };

export const useNora = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => s, () => s);

/** How a call's audio can run on this build. 'none': the phone needs the call audio module (see call/relay.ts). */
export function callTransport(): 'sim' | 'relay' | 'webrtc' | 'none' {
  if (DEMO) return 'sim';
  if (Platform.OS !== 'web' && requireOptionalNativeModule('NoraRelay')) return 'relay';
  if (Platform.OS === 'web' && typeof globalThis.RTCPeerConnection === 'function' && !!globalThis.navigator?.mediaDevices?.getUserMedia) return 'webrtc';
  return 'none';
}

export const noraUi = {
  openHome: () => set({ home: true }),
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
    if (callTransport() === 'none' && !o.incomingId && !o.follow) { set({ chat: true, mic: s.mic + 1 }); return; }
    set({ call: { ...o, seq: ++seq } });
  },
  closeCall: () => set({ call: null }),
};
