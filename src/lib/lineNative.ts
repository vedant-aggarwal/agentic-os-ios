import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { API, currentToken } from './api';
import type { Blocklist } from './line';
import { openLink } from './links';

// The native side of Nora's line (modules/calls/ios/Line*.swift, the AosLine module). On a build without it, and on
// the web, every call here is a quiet no-op and `available` is false.
//   Call audio: listening to a live call and taking it over run natively, on their own socket to
//     /nora/line/live, so they keep going with the app in the background, and taking over is a CallKit call.
//   Blocking: the list goes into the keychain group the extensions share; the Call Directory extension
//     (targets/calldirectory) reads it when iOS reloads it.
//   Live Activity tokens (kinds linestart and line) go to POST /devices natively at launch; JS asks for a repost
//     after sign-in.
//   Links: a notification's Take over or Listen, or the Live Activity's Take over, open the call's screen through
//     an event (or, when JS wasn't running yet, a link kept until JS takes it).

export type LineAudioState = {
  callId: string | null;
  /** The call's audio is playing. */
  listening: boolean;
  /** His mic goes to the caller (a CallKit call is up). */
  takenOver: boolean;
  connecting: boolean;
  muted: boolean;
  speaker: boolean;
  error: string | null;
};
export const IDLE_AUDIO: LineAudioState = { callId: null, listening: false, takenOver: false, connecting: false, muted: false, speaker: false, error: null };

type Sub = { remove(): void };
type Native = {
  listen(o: { callId: string; on: boolean; url: string; token: string }): Promise<void>;
  takeOver(o: { callId: string; name: string; url: string; token: string }): Promise<void>;
  release(): void;
  hangUp(): boolean;
  stop(): void;
  setMuted(on: boolean): void;
  setSpeaker(on: boolean): void;
  audioState(): Promise<Partial<LineAudioState> | null>;
  takeLink(): Promise<string | null>;
  saveBlocklist(json: string): Promise<boolean>;
  directoryStatus(): Promise<string>;
  openDirectorySettings(): Promise<boolean>;
  repostTokens(): void;
  addListener(event: 'audio' | 'link', fn: (e: Record<string, unknown>) => void): Sub;
};
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('AosLine') : null;

const liveUrl = () => `${API.replace(/^http/, 'ws')}/nora/line/live`;
const auth = () => ({ url: liveUrl(), token: currentToken() ?? '' });

export const toAudioState = (e: Record<string, unknown> | Partial<LineAudioState> | null | undefined): LineAudioState => ({
  callId: typeof e?.callId === 'string' && e.callId ? e.callId : null,
  listening: !!e?.listening,
  takenOver: !!e?.takenOver,
  connecting: !!e?.connecting,
  muted: !!e?.muted,
  speaker: !!e?.speaker,
  error: typeof e?.error === 'string' && e.error ? e.error : null,
});

export type DirectoryStatus = 'enabled' | 'disabled' | 'unknown' | 'none';

export const lineNative = {
  available: !!native,

  // ── call audio ──
  listen: (callId: string, on: boolean) => native?.listen({ callId, on, ...auth() }) ?? Promise.resolve(),
  takeOver: (callId: string, name: string) => native?.takeOver({ callId, name, ...auth() }) ?? Promise.resolve(),
  release: () => { try { native?.release(); } catch {} },
  /** Hangs up through the native socket when it has one. False when there was none to send it on. */
  hangUp: () => { try { return !!native?.hangUp(); } catch { return false; } },
  /** Lets go of the audio and the CallKit call without telling the PC anything. */
  stop: () => { try { native?.stop(); } catch {} },
  setMuted: (on: boolean) => { try { native?.setMuted(on); } catch {} },
  setSpeaker: (on: boolean) => { try { native?.setSpeaker(on); } catch {} },
  async audioState(): Promise<LineAudioState> {
    try { return toAudioState(await native?.audioState()); } catch { return IDLE_AUDIO; }
  },
  onAudio(fn: (s: LineAudioState) => void): () => void {
    if (!native) return () => {};
    const sub = native.addListener('audio', (e) => fn(toAudioState(e)));
    return () => sub.remove();
  },

  // ── blocking ──
  async saveBlocklist(list: Blocklist): Promise<boolean> {
    if (!native) return false;
    try { return await native.saveBlocklist(JSON.stringify({ version: list.version, blocked: list.blocked ?? [], labels: list.labels ?? [] })); } catch { return false; }
  },
  async directoryStatus(): Promise<DirectoryStatus> {
    if (!native) return 'none';
    try {
      const s = await native.directoryStatus();
      return s === 'enabled' || s === 'disabled' ? s : 'unknown';
    } catch { return 'unknown'; }
  },
  async openDirectorySettings(): Promise<boolean> {
    try { return !!(await native?.openDirectorySettings()); } catch { return false; }
  },

  // ── Live Activity tokens ──
  repostTokens: () => { try { native?.repostTokens(); } catch {} },

  /** Opens the links native code hands over; returns the cleanup. The event only says one is waiting: taking it is
   *  what opens it, so a link is opened once even when the event and a foreground both see it. */
  startLinks(): () => void {
    if (!native) return () => {};
    const take = () => { native.takeLink().then((url) => { if (url) openLink(url); }).catch(() => {}); };
    const sub = native.addListener('link', take);
    take();
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') take(); });
    return () => { sub.remove(); app.remove(); };
  },
};
