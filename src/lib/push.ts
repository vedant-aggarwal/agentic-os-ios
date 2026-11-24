import { requireOptionalNativeModule } from 'expo';
import { Alert, AppState, Platform } from 'react-native';
import { api, currentToken } from './api';
import { authorizeAlarms } from './alarms';
import { openLink, parseLink } from './links';

// Push notifications: the APNs token goes to the PC (POST /devices { kind: 'apns', token }, as the old app sent it),
// notifications show while the app is open, and every tap opens its agenticos:// link through openLink.
// Permission is asked once he has used the app a little (second launch, signed in, after a while on screen), with a
// line saying what for first; a "Not now" asks again in three days. The token is sent even before permission: the
// PC's silent alarm pushes (server/phone-alarm.ts) need no permission to arrive.

type Notif = typeof import('expo-notifications');
type Response = import('expo-notifications').NotificationResponse;
// expo-notifications is native: an older dev client without it gets null and push stays off until the new build.
const N: Notif | null = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoPushTokenManager')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('expo-notifications') as Notif) : null;

type Store = { getItemAsync(k: string): Promise<string | null>; setItemAsync(k: string, v: string): Promise<void> };
const store: Store | null = requireOptionalNativeModule('ExpoSecureStore')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? (require('expo-secure-store') as Store) : null;

export const pushAvailable = () => !!N;

// ── where a tap goes ──────────────────────────────────────────────────────────

/** Links the PC still sends under the old app's names, moved to the targets this app listens on. */
function modern(url: string): string {
  const l = parseLink(url);
  if (!l) return url;
  const [a, b] = l.parts;
  if (l.target === 'agent' && (a === 'feed' || a === 'alarm') && b) return `agenticos://nora/chat?feed=${encodeURIComponent(b)}`;
  if (l.target === 'agent') return 'agenticos://nora/chat';
  if (l.target === 'ask' && a) return `agenticos://nora/chat?ask=${encodeURIComponent(a)}`;
  return url;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

/** The link a notification's payload points at. Order: aos.url, data.url, data.link, url, link, then by kind. */
export function linkFor(payload: Record<string, unknown> | null | undefined): string {
  const p = payload ?? {};
  const aos = obj(p.aos), data = obj(p.data);
  const url = str(aos?.url) ?? str(data?.url) ?? str(data?.link) ?? str(p.url) ?? str(p.link);
  if (url && /^agenticos:\/\//i.test(url)) return modern(url);
  // Nora's own pushes (server/nora.ts push): a call she's making, a message, an agent's question.
  if (p.kind === 'call') return str(p.incomingId) ? `agenticos://nora/call?id=${encodeURIComponent(String(p.incomingId))}` : 'agenticos://nora/call';
  if (str(p.ask)) return `agenticos://nora/chat?ask=${encodeURIComponent(String(p.ask))}`;
  if (p.kind === 'message' || data?.feed != null) return data?.feed != null ? `agenticos://nora/chat?feed=${encodeURIComponent(String(data.feed))}` : 'agenticos://nora/chat';
  if (str(data?.jobId)) return `agenticos://job/${data!.jobId}`;
  return 'agenticos://today';
}

/** Opens a tapped link: a route (job, Orca agent, Projects hub), a screen on Today or a sheet (src/lib/links.ts). */
export function openTapped(url: string) {
  openLink(url);
}

const seen = new Set<string>();
function handleResponse(r: Response | null) {
  if (!r || !N) return;
  // Only a tap on the notification itself; no action buttons are registered.
  if (r.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
  const req = r.notification.request;
  const key = `${req.identifier}:${r.notification.date}`;
  if (seen.has(key)) return; // the launch tap arrives both as the last response and through the listener
  seen.add(key);
  const trig = req.trigger as { type?: string; payload?: Record<string, unknown> } | null;
  const payload = (trig?.type === 'push' && trig.payload) || (req.content.data as Record<string, unknown> | null) || {};
  openTapped(linkFor(payload));
}

// ── the token on the PC ───────────────────────────────────────────────────────

let sentFor = ''; // "<session token>:<device token>" last registered
let busy = false;

/** Sends the APNs token to the PC when signed in and not sent yet for this sign-in. */
export async function registerPush(): Promise<void> {
  const session = currentToken();
  if (!N || !session || busy) return;
  busy = true;
  try {
    const t = await Promise.race([
      N.getDevicePushTokenAsync(),
      new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 20_000)),
    ]);
    const hex = String(t.data ?? '').toLowerCase();
    if (!/^[0-9a-f]{32,400}$/.test(hex) || sentFor === `${session}:${hex}`) return;
    await api('/devices', { method: 'POST', body: { kind: 'apns', token: hex } });
    sentFor = `${session}:${hex}`;
  } catch {
    // offline or APNs unreachable: the next foreground tries again
  } finally {
    busy = false;
  }
}

// ── permission ────────────────────────────────────────────────────────────────

/** Asks iOS for notification permission (once; after that iOS answers without asking). True when allowed. */
export async function askForPush(): Promise<boolean> {
  if (!N) return false;
  const now = await N.getPermissionsAsync();
  if (now.granted || now.ios?.status === N.IosAuthorizationStatus.PROVISIONAL) return true;
  if (!now.canAskAgain) return false;
  const r = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (r.granted) registerPush();
  return r.granted;
}

const LATER_KEY = 'aos_push_later';
const LAUNCH_KEY = 'aos_launches';
let askTimer: ReturnType<typeof setTimeout> | null = null;

/** On the second launch onward, signed in, after 20 seconds on screen: say what notifications are for, then ask. */
async function maybeAsk() {
  if (!N || !store || !currentToken()) return;
  const p = await N.getPermissionsAsync();
  if (p.granted || !p.canAskAgain || p.ios?.status !== N.IosAuthorizationStatus.NOT_DETERMINED) return;
  const launches = Number((await store.getItemAsync(LAUNCH_KEY)) ?? 0);
  const later = Number((await store.getItemAsync(LATER_KEY)) ?? 0);
  if (launches < 2 || Date.now() < later) return;
  Alert.alert(
    'Turn on notifications?',
    "Nora's messages, finished jobs and your alarms show up here, even when the app is closed.",
    [
      { text: 'Not now', style: 'cancel', onPress: () => { store.setItemAsync(LATER_KEY, String(Date.now() + 3 * 86400_000)).catch(() => {}); } },
      { text: 'Turn on', onPress: () => { askForPush().then(() => authorizeAlarms()).catch(() => {}); } },
    ],
  );
}

// ── start ─────────────────────────────────────────────────────────────────────

/** Mounted once by the root layout. Returns the cleanup. */
export function startPush(): () => void {
  if (!N) return () => {};
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
  const subs = [
    N.addNotificationResponseReceivedListener(handleResponse),
    N.addPushTokenListener(() => { sentFor = ''; registerPush(); }),
  ];
  N.getLastNotificationResponseAsync().then(handleResponse).catch(() => {});
  store?.getItemAsync(LAUNCH_KEY)
    .then((n) => store.setItemAsync(LAUNCH_KEY, String(Number(n ?? 0) + 1)))
    .catch(() => {});

  const onActive = () => {
    registerPush();
    if (askTimer) clearTimeout(askTimer);
    askTimer = setTimeout(() => { maybeAsk().catch(() => {}); }, 20_000);
  };
  onActive();
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') onActive();
    else if (askTimer) { clearTimeout(askTimer); askTimer = null; }
  });
  // Signing in doesn't announce itself: look again every 30 seconds until the token is on the PC.
  const poll = setInterval(() => { if (!sentFor || !sentFor.startsWith(`${currentToken()}:`)) registerPush(); }, 30_000);
  return () => {
    subs.forEach((s) => s.remove());
    app.remove();
    clearInterval(poll);
    if (askTimer) clearTimeout(askTimer);
  };
}
