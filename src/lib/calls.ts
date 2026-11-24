import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { api, currentToken } from './api';
import { openLink } from './links';

// Nora's calls ring like a phone call (modules/calls: PushKit + CallKit). The VoIP token goes to the PC
// (POST /devices { kind: 'voip', token }); the PC's VoIP push rings the system call screen even when the app is
// closed. Answering starts the call's audio natively (NoraRelay, src/nora/call/relay.ts), so it talks from the lock
// screen; it also opens agenticos://nora/call?id=<call id>, and Nora's call screen joins that relay.
// Declining is handled natively (Nora calls back later). When Nora's call ends in the app, call endSystemCall(id)
// so the system call screen hangs up too; onSystemCall tells the call screen when he hangs up or mutes there.

export type SystemCallEvent =
  | { type: 'end'; id: string }
  | { type: 'mute'; muted: boolean }
  | { type: 'audio'; active: boolean };

type Answer = { id: string; uuid: string; reason: string; voice: string };
type Sub = { remove(): void };
type Calls = {
  getToken(): Promise<string | null>;
  takePending(): Promise<Answer | null>;
  end(id: string | null): Promise<void>;
  list(): Promise<{ id: string; uuid: string; answered: boolean }[]>;
  addListener(event: string, fn: (e: Record<string, unknown>) => void): Sub;
};
// Native: an older dev client without it gets null; calls then ring as a notification, as the PC already falls back.
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Calls>('AosCalls') : null;

export const callsAvailable = () => !!native;

// A call owns the mic. Dictation (GPT takes in lib/gpt.ts, the volume buttons' Wispr in lib/wispr.ts, the keyboard's
// mic, the PC mic sheet) never starts while one is up, and a take in progress stops when one starts. A call is up while
// Nora's call screen is (src/nora/state.ts says so) or the system call screen has its audio on (answered on the lock
// screen, before the app knows). The relay switching the audio session at either end moves the output volume, which
// the volume buttons read as presses: a short grace after the call keeps those from starting dictation.
const GRACE_MS = 2500;
let callScreen = false, callAudio = false, callOffAt = 0;
const callSubs = new Set<(on: boolean) => void>();
const callOn = () => callScreen || callAudio;
function callChanged(was: boolean) {
  const on = callOn();
  if (on === was) return;
  if (!on) callOffAt = Date.now();
  for (const fn of callSubs) { try { fn(on); } catch {} }
}
/** Nora's call screen opened or closed (src/nora/state.ts). */
export function setCallScreen(on: boolean) { const was = callOn(); callScreen = on; callChanged(was); }
/** True while a call holds the mic, and for a moment after it ends. */
export function callHoldsMic() { return callOn() || Date.now() - callOffAt < GRACE_MS; }
/** Runs `fn(true)` when a call starts and `fn(false)` when it ends. Returns the unsubscribe. */
export function onCallChange(fn: (on: boolean) => void): () => void {
  callSubs.add(fn);
  return () => { callSubs.delete(fn); };
}

const listeners = new Set<(e: SystemCallEvent) => void>();
/** Hang ups, mutes and audio changes from the system call screen. Returns the unsubscribe. */
export function onSystemCall(fn: (e: SystemCallEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const tell = (e: SystemCallEvent) => { for (const fn of listeners) { try { fn(e); } catch {} } };

/** Takes the call off the system call screen (every call when id is empty). */
export async function endSystemCall(id?: string | null) {
  try { await native?.end(id ?? null); } catch {}
}

/** Calls on the system call screen now. */
export async function systemCalls() {
  try { return (await native?.list()) ?? []; } catch { return []; }
}

let sentFor = '';
async function registerVoip(token?: string | null) {
  const session = currentToken();
  if (!native || !session) return;
  try {
    const t = (token ?? (await native.getToken()))?.toLowerCase();
    if (!t || !/^[0-9a-f]{32,400}$/.test(t) || sentFor === `${session}:${t}`) return;
    await api('/devices', { method: 'POST', body: { kind: 'voip', token: t } });
    sentFor = `${session}:${t}`;
  } catch {}
}

async function openAnswered() {
  try {
    const a = await native?.takePending();
    if (!a) return;
    openLink(a.id ? `agenticos://nora/call?id=${encodeURIComponent(a.id)}` : 'agenticos://nora/call');
  } catch {}
}

/** Mounted once by the root layout. Returns the cleanup. */
export function startCalls(): () => void {
  if (!native) return () => {};
  const subs: Sub[] = [
    native.addListener('onToken', (e) => { sentFor = ''; registerVoip(typeof e.token === 'string' ? e.token : null); }),
    native.addListener('onAnswer', () => { openAnswered(); }),
    native.addListener('onEnd', (e) => { const was = callOn(); callAudio = false; callChanged(was); tell({ type: 'end', id: String(e.id ?? '') }); }),
    native.addListener('onMute', (e) => tell({ type: 'mute', muted: !!e.muted })),
    native.addListener('onAudio', (e) => { const was = callOn(); callAudio = !!e.active; callChanged(was); tell({ type: 'audio', active: !!e.active }); }),
  ];
  // A call answered on the lock screen launched the app (or JS was reloading): open it now.
  openAnswered();
  registerVoip();
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') { registerVoip(); openAnswered(); } });
  const poll = setInterval(() => { if (!sentFor.startsWith(`${currentToken()}:`)) registerVoip(); }, 30_000);
  return () => {
    subs.forEach((s) => s.remove());
    app.remove();
    clearInterval(poll);
  };
}
