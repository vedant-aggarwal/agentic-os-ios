import { Platform } from 'react-native';

// A quiet local notification when a rest ends, for when the phone has locked between sets. Only when he has already
// allowed notifications: a workout never stops to ask. A build or a browser without expo-notifications skips it.

type N = typeof import('expo-notifications');
let mod: N | null | undefined;
function notifications(): N | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web') { mod = null; return mod; }
  try { mod = require('expo-notifications') as N; } catch { mod = null; } // eslint-disable-line @typescript-eslint/no-require-imports
  return mod;
}

let pending: string | null = null;

export async function alertRestEnd(seconds: number) {
  await cancelRestAlert();
  const n = notifications();
  if (!n || seconds < 10) return;
  try {
    const p = await n.getPermissionsAsync();
    if (!p.granted) return;
    pending = await n.scheduleNotificationAsync({
      content: { title: 'Rest over', body: 'Next set when you are ready.', sound: true },
      trigger: { type: n.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds), repeats: false },
    });
  } catch { pending = null; }
}

export async function cancelRestAlert() {
  const n = notifications();
  if (!n || !pending) return;
  const id = pending; pending = null;
  try { await n.cancelScheduledNotificationAsync(id); } catch {}
}
