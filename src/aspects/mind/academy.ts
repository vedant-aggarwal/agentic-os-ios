import { requireOptionalNativeModule } from 'expo';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { fetchOnce, useGet } from '@/lib/mod';

// Stage Academy: the course that lives on his PC, in its own classroom site that plays the lessons from the PC's disk.
// The PC tells the phone where it is (GET /mod/mind/academy, read from the site's own config on the PC, so the
// address is never in this public source) and the lesson he was on. It opens in Safari inside the app, on that
// lesson, and plays there. The site has its own sign-in; it asks once and remembers.

export type Academy = {
  title: string; url: string | null; up: boolean; why: string | null;
  lesson: { id: string; title: string; module: string | null; seconds: number; watched: boolean } | null;
  progress: { done: number; total: number; percent: number; watched_minutes: number } | null;
};
export const ACADEMY = '/mod/mind/academy';

type Browser = typeof import('expo-web-browser');
/* eslint-disable @typescript-eslint/no-require-imports */
const browser: Browser | null = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoWebBrowser') ? require('expo-web-browser') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Open a page in Safari inside the app (its own Done button, video full screen and picture in picture work). */
export async function openInApp(url: string) {
  if (browser) {
    try { await browser.openBrowserAsync(url, { presentationStyle: browser.WebBrowserPresentationStyle.FULL_SCREEN, dismissButtonStyle: 'done', controlsColor: '#FFFFFF' }); return; }
    catch { /* fall through to Safari */ }
  }
  await Linking.openURL(url);
}

/** Where Stage Academy is and the lesson he was on. */
export const useAcademy = (on: boolean) => useGet<Academy>(on ? ACADEMY : null);

/** Open Stage Academy on the lesson he was on. `fail` gets a sentence when the PC can't say where it is. */
export async function openAcademy(fail: (msg: string) => void, known?: Academy | null) {
  let a = known ?? null;
  if (!a?.url) {
    try { a = await fetchOnce<Academy>(ACADEMY); } catch (e) { fail((e as Error).message || "Your PC didn't answer."); return; }
  }
  if (!a?.url) { fail(a?.why ?? "Stage Academy isn't set up on your PC."); return; }
  try { await openInApp(a.url); } catch { fail("Stage Academy didn't open."); }
}
