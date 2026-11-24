import { Geist_300Light, Geist_800ExtraBold } from '@expo-google-fonts/geist';
import { isLoaded, loadAsync } from 'expo-font';
import { useSyncExternalStore } from 'react';
import { F } from '@/theme';
import type { UsageWindow } from '../../types';
import { EASE, FAILED, LIVE, NEEDS } from '../../ui/tokens';

// Editorial: the Work page set like a design magazine cover. Warm paper-white ink on the app's near-black, hairline
// rules on a Swiss grid, one cobalt accent for structure (progress rules, chapter numbers, the pin ribbon), and the
// hub's amber and red only when a limit runs high.

export const INK = '#F5F3EE';
export const INK_SOFT = 'rgba(245,243,238,0.78)';
export const INK_FAINT = 'rgba(245,243,238,0.52)';
export const INK_GHOST = 'rgba(245,243,238,0.3)';
export const RULE = 'rgba(245,243,238,0.16)';
export const PAPER = 'rgba(245,243,238,0.035)';
export const ACCENT = '#5B76FF';
export { EASE, LIVE };
export const WARN = NEEDS;
export const DANGER = FAILED;

/** Amber from 70 %, red from 90 %; null below, where the accent and ink carry it. */
export const level = (p: number) => (p >= 90 ? DANGER : p >= 70 ? WARN : null);
export const pctOf = (w: UsageWindow) => Math.round(Math.min(100, Math.max(0, w.usedPercent)));

/** When a window resets, short: "4:30 pm" within 20 hours, else "Sun 6:30 pm". */
export function resetWhen(w: UsageWindow, now = Date.now()) {
  const t = w.resetsAt ? Date.parse(w.resetsAt) : NaN;
  if (!Number.isFinite(t)) return w.reset;
  const d = new Date(t);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return t - now < 20 * 3_600_000 ? time : `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${time}`;
}

/** The masthead's dateline: "Tuesday", "24 November". */
export function dateline(now = new Date()) {
  return {
    day: now.toLocaleDateString('en-IN', { weekday: 'long' }),
    date: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
  };
}

/**
 * Display type cropped to its figures. Geist's metrics: ascent 1.005 em, descent 0.295 em, figures 0.73 em tall.
 * The line height stays at the font's own 1.3 em, where iOS and web both seat the glyphs the same way, and negative
 * margins trim the box to the figure height, so the rhythm is set by the ink, not the line box.
 */
export function display(size: number) {
  const lineHeight = Math.ceil(size * 1.3);
  const base = (lineHeight - 1.3 * size) / 2 + 1.005 * size;
  return { fontSize: size, lineHeight, marginTop: -(base - 0.73 * size), marginBottom: -(lineHeight - base) };
}

// The poster's two extra Geist cuts (light figures, heavy masthead) load once, from the font package the app
// already ships; the app's own cuts stand in until they arrive, or for good if they can't load.
const FACES = { Geist_300Light, Geist_800ExtraBold };
const LOADED = { light: 'Geist_300Light', heavy: 'Geist_800ExtraBold' } as const;
const STAND_IN = { light: F.regular, heavy: F.semibold } as const;
let ready = Object.keys(FACES).every((f) => isLoaded(f));
let asked = false;
const subs = new Set<() => void>();
function subscribe(f: () => void) {
  subs.add(f);
  if (!ready && !asked) {
    asked = true;
    loadAsync(FACES).then(() => { ready = true; subs.forEach((s) => s()); }, () => {});
  }
  return () => { subs.delete(f); };
}

export function useFaces(): { light: string; heavy: string } {
  return useSyncExternalStore(subscribe, () => ready) ? LOADED : STAND_IN;
}
