import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { api, currentToken, onAuth } from './api';
import { openLink } from './links';

// Alarms that ring through silent mode and Focus (modules/alarms: AlarmKit on iOS 26; a notification at that time on
// older iOS or before AlarmKit is allowed). Pages call setAlarm; the PC sets them with POST /api/v1/phone/alarm
// (server/phone-alarm.ts), whose silent push is scheduled natively even when the app is closed.
// An alarm with a url gets an Open button that opens the app on that link; one without gets Snooze.
// The PC's alarms are confirmed back (POST /phone/alarm/ack) once they're set here: when its silent push sets one (if
// the app's code is running then) and whenever the app comes to the front or signs in. One the PC hasn't heard about
// by its time also comes as a visible, time-sensitive notification. Confirming from the native module itself, with the
// app closed, needs a new build; until then an alarm set while the app was closed may ring and notify both.

export type Alarm = {
  id: string;
  /** Unix milliseconds */
  at: number;
  title: string;
  kit: 'alarmkit' | 'notification';
  from: 'app' | 'pc';
  url?: string;
  /** AlarmKit alarms only: scheduled, snoozed, paused, ringing, done */
  state?: string;
};

type Sub = { remove(): void };
type Native = {
  isAvailable(): boolean;
  authorize(): Promise<{ kit: string; status: 'granted' | 'denied' | 'prompt' }>;
  schedule(o: { id?: string; at: number; title: string; url?: string }): Promise<Alarm | { error: string }>;
  cancel(id: string): Promise<void>;
  list(): Promise<Alarm[]>;
  takeOpened(): Promise<{ id: string; url: string }[]>;
  addListener(event: string, fn: (e: Record<string, unknown>) => void): Sub;
  // events: onOpen (an alarm's Open button), onScheduled ({ id, at, title, kit, from, url? } when the PC's push set one)
};
const native = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('AosAlarms') : null;

/** True when this build can set alarms at all. */
export const alarmsInstalled = () => !!native;
/** True on iOS 26, where alarms ring through silent mode and Focus. */
export function alarmsRingThroughSilent(): boolean {
  try { return !!native?.isAvailable(); } catch { return false; }
}

/** Asks for alarm permission (AlarmKit on iOS 26, else notifications). */
export async function authorizeAlarms() {
  if (!native) return { kit: 'none', status: 'denied' as const };
  try { return await native.authorize(); } catch { return { kit: 'none', status: 'denied' as const }; }
}

/** Sets (or, with the same id, moves) an alarm. Throws an Error whose message can be shown as is. */
export async function setAlarm(a: { at: Date | number; title: string; url?: string; id?: string }): Promise<Alarm> {
  if (!native) throw new Error('Alarms need the newest TestFlight build of Agentic OS.');
  const at = a.at instanceof Date ? a.at.getTime() : a.at;
  if (!Number.isFinite(at) || at < Date.now() - 60_000) throw new Error('Pick a time that is still ahead.');
  const r = await native.schedule({ id: a.id, at, title: a.title.trim() || 'Alarm', url: a.url });
  if ('error' in r) throw new Error(r.error);
  return r;
}

export async function cancelAlarm(id: string) {
  try { await native?.cancel(id); } catch {}
}

export async function listAlarms(): Promise<Alarm[]> {
  try { return (await native?.list()) ?? []; } catch { return []; }
}

async function openTapped() {
  try {
    for (const o of (await native?.takeOpened()) ?? []) if (o.url) openLink(o.url);
  } catch {}
}

const confirmed = new Set<string>(); // the PC alarms this launch has confirmed
/** Tells the PC which of its alarms are set on this phone, so it doesn't also notify at their time. */
async function confirmPc(list?: Pick<Alarm, 'id' | 'at' | 'from'>[]) {
  if (!currentToken()) return;
  const now = Date.now();
  const ids = (list ?? await listAlarms()).filter((a) => a.from === 'pc' && a.at > now && !confirmed.has(a.id)).map((a) => a.id);
  if (!ids.length) return;
  for (const id of ids) confirmed.add(id);
  try { await api('/phone/alarm/ack', { method: 'POST', body: { ids } }); }
  catch { for (const id of ids) confirmed.delete(id); } // the next time the app comes to the front
}

/** Mounted once by the root layout: an alarm's Open button opens its link, and the PC's alarms are confirmed. Returns the cleanup. */
export function startAlarms(): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onOpen', () => { openTapped(); });
  const set = native.addListener('onScheduled', (e) => {
    if (e.from === 'pc' && typeof e.id === 'string' && typeof e.at === 'number') void confirmPc([{ id: e.id, at: e.at, from: 'pc' }]);
  });
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') void confirmPc(); });
  const auth = onAuth((on) => { if (on) void confirmPc(); });
  openTapped();
  void confirmPc();
  return () => { sub.remove(); set.remove(); app.remove(); auth(); };
}
