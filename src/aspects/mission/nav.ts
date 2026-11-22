import { createContext, use } from 'react';
import type { AspectKey } from '@/theme';
import type { Horizon } from './types';

/**
 * What the Add a goal sheet starts with. `start` places it in a period other than the current one (next week on
 * Sunday); `aspects` picks the sections it serves (mission/add?aspect=body from a section's page).
 */
export type AddInit = { horizon?: Horizon; parent?: string | null; start?: string | null; text?: string; aspects?: AspectKey[] };

/** Where any part of the Mission page can go. One goal can open another (what it serves, what serves it). */
export type Nav = {
  goal: (id: string) => void;
  add: (init?: AddInit) => void;
  close: () => void;
  ladder: () => void;
  projects: () => void;
  purpose: () => void;
  record: () => void;
  first: (project?: string) => void;
  measure: (goal: string) => void;
};

export const NavContext = createContext<Nav | null>(null);
export function useNav(): Nav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Mission page.');
  return n;
}
