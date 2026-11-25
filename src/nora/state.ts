import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import { setCallScreen } from '@/lib/calls';
import { DEMO } from '@/lib/demo';
import type { AspectKey } from '@/theme';
import { NORA_LINE } from './line';

// Which of Nora's three surfaces is open: Home (her day, under the dock), Chat (over everything) and a call (over
// everything). The dock's buttons, deep links (agenticos://nora...) and notification taps all go through here.

export type CallAsk = { incomingId?: string | null; reason?: string; follow?: boolean; seq: number };
/** The list Home should show when it opens: a Life aspect, 'none' (no aspect) or null (all). `seq` makes a repeat ask
 * apply again after he changed the filter by hand. */
export type HomeList = { list: AspectKey | 'none' | null; seq: number };
/** One of her items Home should open on, on her page (a tapped push about it). */
export type HomeFocus = { item: string; seq: number };
type S = {
  home: boolean; chat: boolean; mic: number; micSend: number; call: CallAsk | null; replyTo: { id: string; from: string } | null;
  homeList: HomeList | null; homeFocus: HomeFocus | null;
};

let s: S = { home: false, chat: false, mic: 0, micSend: 0, call: null, replyTo: null, homeList: null, homeFocus: null };
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
  /** Home; with `list`, showing that aspect's tasks (Today's "N more on Home"). */
  openHome: (list?: AspectKey | 'none' | null) => set(list === undefined ? { home: true } : { home: true, homeList: { list, seq: ++seq } }),
  /** Her page on Home, with feed item `id` first (a push about it was tapped). */
  openItem: (id: string) => set({ home: true, chat: false, replyTo: null, homeFocus: { item: id, seq: ++seq } }),
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
  /** `mic`: start dictating as it opens. `replyTo`: the composer answers that agent's question (`from` '' when not
   *  known yet: the chat finds it on the question's message). Answer mode lasts only while chat stays open. */
  openChat: (o: { mic?: boolean; replyTo?: { id: string; from: string } } = {}) =>
    set({ chat: true, mic: o.mic ? s.mic + 1 : s.mic, replyTo: o.replyTo ?? (s.chat ? s.replyTo : null) }),
  closeChat: () => set({ chat: false, replyTo: null }),
  clearReply: () => set({ replyTo: null }),
  /** The answer to `id` reached the PC: answer mode ends, unless he has moved on to answering another question. */
  answered: (id: string) => { if (s.replyTo?.id === id) set({ replyTo: null }); },
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
