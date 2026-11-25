import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { Entry } from './data';
import type { Seed } from './Editor';

// Where the Soul page is: the open tab and the flows on top. Any tab can open a flow without passing callbacks down.

export type Tab = 'today' | 'practice' | 'journal' | 'clean';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'today', label: 'Today' }, { key: 'practice', label: 'Practice' }, { key: 'journal', label: 'Journal' }, { key: 'clean', label: 'Clean' },
];

export type SoulNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  /** The rough moment, full screen. */
  moment: () => void;
  /** After a slip: a few taps of context, then what stays. */
  slip: () => void;
  /** A new journal entry, with a prompt or straight into speaking. */
  write: (seed: Seed) => void;
  /** An entry he wrote. */
  openEntry: (e: Entry) => void;
  /** A sit of this many minutes, starting now. */
  sit: (mins: number) => void;
};

export const NavContext = createContext<SoulNav | null>(null);
export function useNav(): SoulNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Soul page.');
  return n;
}
