import { useEffect, useSyncExternalStore } from 'react';

// How the fan, the hub pages and the capture sheets talk without importing each other.
// Anyone calls openSheet(); the one <WorkSheets /> host (src/work/sheets) shows it.
// Push to talk goes the same way: the fan reports mic events, the recorder owns the audio.

export type SheetRequest =
  | { kind: 'idea' | 'task' | 'job'; project: string | null; seq: number; text?: string; idea?: string | null; tasks?: string[] }
  | { kind: 'project'; seq: number; name?: string }
  | { kind: 'projectSettings'; project: string; seq: number };

let current: SheetRequest | null = null;
let n = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

type Open =
  | { kind: 'idea' | 'task' | 'job'; project: string | null; text?: string; idea?: string | null; tasks?: string[] }
  | { kind: 'project'; name?: string }
  | { kind: 'projectSettings'; project: string };

export function openSheet(r: Open) {
  current = { ...r, seq: ++n } as SheetRequest;
  subs.forEach((f) => f());
}
export function closeSheet() {
  current = null;
  subs.forEach((f) => f());
}
export const useSheetRequest = () => useSyncExternalStore(subscribe, () => current);

// ---- push to talk from the fan ----
export type MicEvent =
  | { type: 'start'; project: string | null } // finger rested on a project's mic: start recording into it (null: Inbox)
  | { type: 'lock' }                      // slid up: keep recording hands free
  | { type: 'release' }                   // let go on the mic (or anywhere while locked = no-op): save the idea
  | { type: 'cancel' };                   // slid off before letting go: throw the take away

const micSubs = new Set<(e: MicEvent) => void>();
export function emitMic(e: MicEvent) { micSubs.forEach((f) => f(e)); }
export function useMicEvents(fn: (e: MicEvent) => void) {
  useEffect(() => { micSubs.add(fn); return () => { micSubs.delete(fn); }; }, [fn]);
}
