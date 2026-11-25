import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { AspectKey } from '@/theme';
import type { Goal, Horizon } from './types';

export type Tab = 'now' | 'goals' | 'projects' | 'purpose';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'now', label: 'Now' },
  { key: 'goals', label: 'Goals' },
  { key: 'projects', label: 'Projects' },
  { key: 'purpose', label: 'Purpose' },
];

/**
 * What the Add a goal sheet starts with. `start` places it in a period other than the current one (next week on
 * Sunday); `aspects` picks the sections it serves (mission/add?aspect=body from a section's page).
 */
export type AddInit = { horizon?: Horizon; parent?: string | null; start?: string | null; text?: string; aspects?: AspectKey[] };

/** Where any part of the Mission page can go. One goal can open another (what it serves, what serves it). */
export type Nav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  goal: (id: string) => void;
  add: (init?: AddInit) => void;
  /** The clean-up: every goal past its end date, closed one by one. */
  close: () => void;
  record: () => void;
  /** Choose the project that gets the first block (this one picked when given). */
  first: (project?: string) => void;
  measure: (goal: string) => void;
  /** Tie one of his tasks to a goal (or write its next step). */
  tie: (goal: string) => void;
  /** Move a goal measured by hand: the keypad, then Undo. */
  progress: (goal: Goal) => void;
};

export const NavContext = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Mission page.');
  return n;
}
