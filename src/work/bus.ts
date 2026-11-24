import { useEffect, useSyncExternalStore } from 'react';
import type { Idea, ResolvedItem } from './types';

// How the fan, the hub pages and the capture sheets talk without importing each other.
// Anyone calls openSheet(); the one <WorkSheets /> host (src/work/sheets) shows it.
// Push to talk goes the same way: the fan reports mic events, the recorder owns the audio.
// A task opens the same way from anywhere it is listed (Today's plan, Home, Work): openTask() shows its full view.

/** What a list already knows about a task, drawn at once while the task view reads the rest from the PC. */
export type TaskSeed = {
  id: string; title: string; status?: 'inbox' | 'todo' | 'doing' | 'done' | 'dropped'; due?: string | null; notes?: string | null;
  area?: string | null; project?: string | null; owner?: string | null; repeat?: string | null;
};
/** Where the task view opens: its details, or straight on its date row or its edit form. */
export type TaskFocus = 'view' | 'date' | 'edit';

export type SheetRequest =
  | { kind: 'idea' | 'task' | 'job'; project: string | null; seq: number; text?: string; idea?: string | null; tasks?: string[]; resume?: ResolvedItem }
  | { kind: 'project'; seq: number; name?: string }
  | { kind: 'projectSettings'; project: string; seq: number }
  | { kind: 'editIdea'; idea: Idea; seq: number }
  | { kind: 'editTask'; task: TaskSeed; focus?: TaskFocus; seq: number };

let current: SheetRequest | null = null;
let n = 0;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

type Open =
  | { kind: 'idea' | 'task' | 'job'; project: string | null; text?: string; idea?: string | null; tasks?: string[]; resume?: ResolvedItem }
  | { kind: 'project'; name?: string }
  | { kind: 'projectSettings'; project: string }
  | { kind: 'editIdea'; idea: Idea }
  | { kind: 'editTask'; task: TaskSeed; focus?: TaskFocus };

export function openSheet(r: Open) {
  current = { ...r, seq: ++n } as SheetRequest;
  subs.forEach((f) => f());
}
/** The task's full view: title and notes in full, its aspect, date, project, Nora, and Edit, Done, Move, Cancel, Delete. */
export function openTask(task: TaskSeed, focus: TaskFocus = 'view') {
  openSheet({ kind: 'editTask', task, focus });
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
