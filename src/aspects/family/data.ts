import { requireOptionalNativeModule } from 'expo';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { addDays, clock, daysBetween, dayLabel, shortDay, today } from '@/aspects/kit';
import { api } from '@/lib/api';
import { call, collection, fileSource, invalidate, newId, upload } from '@/lib/mod';
import type { MomentDoc, WeekDoc } from './types';

// Family's writes and small helpers. People's records (moments, ideas, dates, plans, persons) go through People's
// collections; Family's own (week records, photos) through Family's. Computed reads are refreshed after each write.

export const HOME = '/mod/family/home';
export const refresh = () => invalidate('/mod/family/');

export const moments = collection<MomentDoc>('people', 'moments');
export const weeks = collection<WeekDoc>('family', 'week');

/** A moment as the page files it: today, now, by him, in Family. */
export function momentDraft(o: Partial<MomentDoc> & { people: string[] }): MomentDoc {
  return {
    aspect: 'family', kind: 'meet', minutes: 0, by: 'you', source: 'you', ...o,
    id: o.id ?? newId('mo'), date: o.date ?? today(), at: o.at === undefined ? clock(Date.now()) : o.at, // null: a past day, time not known
  };
}

/** A moment that exists on the PC, with some fields changed (a photo or a line added later). */
export async function amendMoment(id: string, change: Partial<MomentDoc>) {
  const r = await api<{ item: MomentDoc }>(`/mod/people/moments/${encodeURIComponent(id)}`);
  const { created_at: _c, updated_at: _u, deleted_at: _d, ...cur } = r.item;
  return moments.put({ ...cur, ...change, id });
}

// ── photos ──────────────────────────────────────────────────────────────────────────────────────────────────────
type Picker = typeof import('expo-image-picker');
/* eslint-disable @typescript-eslint/no-require-imports */
const picker: Picker | null = Platform.OS === 'web' || requireOptionalNativeModule('ExponentImagePicker') ? require('expo-image-picker') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export type LocalPhoto = { uri: string; type: string; width: number; height: number };

/** One photo from the library. Null when he cancels; throws a message when the picker isn't on this build. */
export async function pickPhoto(): Promise<LocalPhoto | null> {
  if (!picker) throw new Error('Photos need the next app build.');
  const res = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, exif: false, allowsMultipleSelection: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, type: a.mimeType ?? 'image/jpeg', width: a.width, height: a.height };
}

/** Send a photo to the PC; returns its id for the moment. */
export async function sendPhoto(p: LocalPhoto, people: string[]) {
  const id = newId('ph');
  const type = /^image\/(jpeg|png|heic|heif|webp)$/.test(p.type) ? p.type : 'image/jpeg';
  await upload<{ item: { id: string } }>(`/mod/family/photo?id=${id}&people=${encodeURIComponent(people.join(','))}`, p.uri, type);
  return id;
}

export const photoSource = (id: string, thumb = true) => fileSource(`/mod/family/photo/${encodeURIComponent(id)}${thumb ? '?thumb=1' : ''}`);

// ── Nora's asks: they take seconds to a minute, so their state outlives the screen that started them ─────────────
type AiState = { busy: boolean; error: string | null };
const IDLE: AiState = { busy: false, error: null };
const ai = new Map<string, AiState>();
const subs = new Set<() => void>();
const setAi = (key: string, s: AiState) => { ai.set(key, s); for (const fn of subs) fn(); };

export function useAi(key: string) {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => ai.get(key) ?? IDLE, () => ai.get(key) ?? IDLE);
}
export async function askNora(key: string, path: string) {
  if (ai.get(key)?.busy) return;
  setAi(key, { busy: true, error: null });
  try {
    await call(path, {});
    setAi(key, IDLE);
    refresh();
  } catch (e) {
    setAi(key, { busy: false, error: (e as Error).message });
  }
}

/** When a saved date next comes round (a one-off that has passed: null), the same rule as the PC. */
export function nextOn(d: { annual?: boolean; md?: string | null; date?: string | null }, day = today()): string | null {
  const md = d.md && /^\d{2}-\d{2}$/.test(d.md) ? d.md : null;
  const annual = (y: number) => (`${y}-${md}` >= day ? `${y}-${md}` : `${y + 1}-${md}`);
  if (d.annual && md) return annual(Number(day.slice(0, 4)));
  if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) return d.date >= day ? d.date : null;
  if (md) return annual(Number(day.slice(0, 4)));
  return null;
}

// ── words ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** "today", "yesterday", "3 days ago", "on 12 Oct". */
export function whenDay(day: string) {
  const n = daysBetween(day, today());
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  return `on ${shortDay(day)}`;
}
/** "In 14 days", "Tomorrow", "Today". */
export function inDays(n: number) {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 14) return `In ${n} days`;
  if (n < 60) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
}
/** "A", "A and B", "A, B and C". */
export function names(list: string[]) {
  if (list.length < 2) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
/** A day as a heading line: "Sun 6 Dec". */
export const longDay = (day: string) => dayLabel(day).replace(/^(Today|Tomorrow|Yesterday)$/, (w) => `${w}, ${shortDay(day)}`);
export const errText = (e: unknown) => (e as Error)?.message || 'Something went wrong.';
export const yesterday = () => addDays(today(), -1);
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (day: string) => MO[Number(day.slice(5, 7)) - 1] ?? '';
