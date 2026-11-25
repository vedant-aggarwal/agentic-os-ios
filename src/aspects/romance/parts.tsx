import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { CheckRing, daysBetween, dayLabel, Glyph, Press, shortDay, today } from '@/aspects/kit';
import { C } from '@/theme';
import { PLACE } from './copy';
import type { Place } from './types';

type Clip = typeof import('expo-clipboard');
/* eslint-disable @typescript-eslint/no-require-imports */
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Copy text to the clipboard. Only copies: nothing is sent anywhere. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (clip) { await clip.setStringAsync(text); return true; }
    if (Platform.OS === 'web' && globalThis.navigator?.clipboard) { await globalThis.navigator.clipboard.writeText(text); return true; }
  } catch {}
  return false;
}

/** The time now, ticking every `ms` while `on`. */
export function useNow(ms: number, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ms, on]);
  return now;
}

/** "Coworking", "Cafe"; "Not in an outing" for added ones. */
export const placeName = (p: Place | 'logged' | null | undefined) => (p && p !== 'logged' ? PLACE[p] : 'Not in an outing');
const AT: Record<Place, string> = { cowork: 'at the coworking space', cafe: 'at a cafe', college: 'at college', other: 'out' };
/** "at a cafe", "at the coworking space", for inside a sentence. */
export const placeAt = (p: Place | 'logged' | null | undefined) => (p && p !== 'logged' ? AT[p] : null);

/** "today", "yesterday", "on Sat 21 Nov", for inside a sentence. */
export function whenIn(day: string) {
  const l = dayLabel(day);
  return l === 'Today' || l === 'Yesterday' || l === 'Tomorrow' ? l.toLowerCase() : `on ${l}`;
}
/** "3 days ago", "today", "21 Nov", for a short line. */
export function sinceDay(day: string) {
  const n = daysBetween(day, today());
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  return shortDay(day);
}
/** A due date as a short phrase: "today", "tomorrow", "Sat 29 Nov"; a day gone by stays gentle as "since Thu 20 Nov". */
export function dueWords(due: string | null | undefined) {
  if (!due) return null;
  const n = daysBetween(today(), due);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 0) return `since ${dayLabel(due)}`;
  return dayLabel(due);
}
/** A plan's day as a short phrase: "today", "yesterday", "Sat 29 Nov", or "no day yet". */
export const planDay = (day: string | null) => (day ? (whenIn(day).startsWith('on ') ? dayLabel(day) : whenIn(day)) : 'no day yet');
export const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── Romance's own icons (SF Symbols on the phone; these paths on the web preview) ──
const G = {
  scope: ['scope', 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 11.5v1'],
  note: ['note.text', 'M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 9h8M8 13h8M8 17h5'],
  face: ['face.smiling', 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0'],
  speak: ['waveform', 'M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2'],
  walk: ['figure.walk', 'M13 4a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3zM10 21l2-6 2 2v4M9 11l3-2.5 3 2.5 2 1M12 8.5V13'],
  bubble: ['bubble.left', 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  bulb: ['lightbulb', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
  copy: ['doc.on.doc', 'M9 9h10v10H9zM5 15V5h10'],
  lock: ['lock', 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z'],
  plus: ['plus.bubble', 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12 8v5M9.5 10.5h5'],
} as const;
export type GlyphKey = keyof typeof G;
export const Gl = ({ k, size = 20, color = C.text }: { k: GlyphKey; size?: number; color?: string }) => (
  <Glyph sf={G[k][0] as never} d={G[k][1]} size={size} color={color} />
);

/** A ring that ticks something done: a 24 pt ring with a 44 pt target. */
export function CheckButton({ done = false, label, onPress }: { done?: boolean; label: string; onPress: () => void }) {
  return (
    <Press label={label} role="checkbox" state={{ checked: done }} onPress={onPress} feel="none" hitSlop={10} style={s.check}>
      <CheckRing done={done} />
    </Press>
  );
}

/**
 * While the app is in the app switcher, the page is covered: nothing of it shows in the snapshot iOS takes.
 * The web preview has no switcher, so it never covers there.
 */
export function PrivacyCover() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (st) => setHidden(st !== 'active'));
    return () => sub.remove();
  }, []);
  if (!hidden) return null;
  return <View style={[StyleSheet.absoluteFill, s.cover]} pointerEvents="none" />;
}

const s = StyleSheet.create({
  cover: { backgroundColor: C.scene },
  check: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
});
