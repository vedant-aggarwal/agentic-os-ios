import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { daysBetween, dayLabel, shortDay, SURF, t, today, tint, weekLetter } from '@/aspects/kit';
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
/** A due date as a short phrase: "today", "tomorrow", "Sat 29 Nov", "2 days late" stays gentle as "since Thu". */
export function dueWords(due: string | null | undefined) {
  if (!due) return null;
  const n = daysBetween(today(), due);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 0) return `since ${dayLabel(due)}`;
  return dayLabel(due);
}

/**
 * The week as one dot per conversation, a column per day, Monday first. Every conversation is the same dot whatever
 * came of it. Today's letter is brighter; a day with none shows a faint ring so the week still reads as seven days.
 */
export function DotWeek({ days, color, max = 5 }: { days: { day: string; n: number }[]; color: string; max?: number }) {
  const now = today();
  const tall = Math.max(2, Math.min(max, Math.max(...days.map((d) => d.n)))) + (days.some((d) => d.n > max) ? 1 : 0);
  return (
    <View style={s.week} accessibilityRole="image"
      accessibilityLabel={days.map((d) => `${dayLabel(d.day)}: ${d.n}`).join(', ')}>
      {days.map((d) => {
        const shown = Math.min(d.n, max);
        const future = d.day > now;
        return (
          <View key={d.day} style={s.col}>
            <View style={[s.stack, { height: tall * 14 }]}>
              {d.n > max ? <Text style={[t.caption, t.num, { color }]}>+{d.n - max}</Text> : null}
              {Array.from({ length: shown }, (_, i) => <View key={i} style={[s.dot, { backgroundColor: color }]} />)}
              {d.n === 0 ? <View style={[s.dot, s.none, future && s.future]} /> : null}
            </View>
            <Text style={[t.caption, d.day === now && { color: C.text }, d.day === now && { fontFamily: t.strong.fontFamily }]}>{weekLetter(d.day)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A small label above a value inside a card. */
export function Label({ children, color }: { children: string; color?: string }) {
  return <Text style={[t.label, color ? { color } : null]}>{children}</Text>;
}

export const soft = (color: string) => tint(color, 0.16);

const s = StyleSheet.create({
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: 36, alignItems: 'center', gap: 8 },
  stack: { justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  none: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: SURF.line },
  future: { borderColor: SURF.track },
});
