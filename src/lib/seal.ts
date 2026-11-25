import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';
import { DEMO } from './demo';

// Body and face photos are sealed. Right after one is taken it shows once (the preview); from then on every place
// that holds it draws a lock instead of the picture, and a tap asks for Face ID (or the phone's passcode) before the
// sealed viewer (src/components/Sealed.tsx) shows it. The viewer closes when the app goes to the background and, while
// it is open, blurs the snapshot the app switcher keeps.

type LocalAuth = typeof import('expo-local-authentication');
type ScreenCapture = typeof import('expo-screen-capture');
// Both modules arrive with a native build; JS sent over the air to an older build finds them missing, and then a
// sealed photo stays shut (it says why) instead of crashing.
/* eslint-disable @typescript-eslint/no-require-imports */
const auth: LocalAuth | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoLocalAuthentication') ? require('expo-local-authentication') : null;
const capture: ScreenCapture | null = Platform.OS === 'ios' && requireOptionalNativeModule('ExpoScreenCapture') ? require('expo-screen-capture') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export type SealedSource = { uri: string; headers?: Record<string, string> };
export type SealedPhoto = { source: SealedSource | null; caption?: string; label?: string };
export type SealShow = {
  /** "Body, after the shower", "Front profile" */
  title: string;
  photos: SealedPhoto[];
  /** two to a row, first beside last: a before and after */
  pairs?: boolean;
  /** what can be done with it from the viewer: take it again, choose another */
  action?: { label: string; run: () => void };
};
export type Sealed = SealShow & { mode: 'preview' | 'view'; at: number };

let open: Sealed | null = null;
const subs = new Set<() => void>();
const set = (next: Sealed | null) => { open = next; subs.forEach((f) => f()); };

/** The one look, right after the photo is taken. Closing it seals the photo. */
export function previewSealed(s: SealShow) { set({ ...s, mode: 'preview', at: Date.now() }); }
export function closeSealed() { set(null); }
export function useSealed() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => open, () => null);
}

/** Face ID first (the passcode when Face ID fails or isn't set up), then the photo. A cancel stays quiet. */
export async function openSealed(s: SealShow) {
  const said = await unlock();
  if (said === null) set({ ...s, mode: 'view', at: Date.now() });
  else if (said) Alert.alert("Can't open it", said);
}

/** Null when it is him; '' when he cancelled; otherwise why it can't open. */
async function unlock(): Promise<string | null> {
  if (Platform.OS === 'web') return DEMO ? null : 'Sealed photos open on the iPhone.'; // the web preview has no Face ID
  if (!auth) return 'Opening sealed photos comes with the next app build.';
  try {
    const r = await auth.authenticateAsync({ promptMessage: 'Open your sealed photo', cancelLabel: 'Cancel' });
    if (r.success) return null;
    switch (r.error) {
      case 'user_cancel': case 'system_cancel': case 'app_cancel': case 'user_fallback': return '';
      case 'passcode_not_set': case 'not_enrolled': return 'Set a passcode on this iPhone first, in Settings, Face ID & Passcode.';
      case 'lockout': return 'Too many tries. Unlock the iPhone with its passcode, then try again.';
      default: return "Couldn't check it's you. Try again.";
    }
  } catch (e) {
    return (e as Error).message || "Couldn't check it's you. Try again.";
  }
}

/** While a sealed photo is on screen, the app switcher's snapshot of the app is blurred. */
export function guardSwitcher(on: boolean) {
  if (!capture) return;
  const run = on ? capture.enableAppSwitcherProtectionAsync(1) : capture.disableAppSwitcherProtectionAsync();
  void run.catch(() => {});
}
