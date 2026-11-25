import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { AspectKey } from '@/theme';
import type { Rule } from './types';

// Where the Growth page is: the open tab, the full screen flow on top (the review, scoring, over time, one past
// week), the section picked on the wheel, and the rule being written. Any part can open another.

export type Tab = 'now' | 'review' | 'wheel' | 'rules';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'now', label: 'Now' }, { key: 'review', label: 'Review' }, { key: 'wheel', label: 'Wheel' }, { key: 'rules', label: 'Rules' },
];

export type Flow =
  | { kind: 'review' }
  | { kind: 'score' }
  | { kind: 'time'; section: AspectKey | null }
  | { kind: 'past'; id: string };

export type GrowthNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  flow: Flow | null;
  openFlow: (f: Flow | null) => void;
  /** The section picked on the wheel (the Wheel tab shows its card). */
  pick: AspectKey | null;
  setPick: (k: AspectKey | null) => void;
  /** Write a rule ('new'), or change one. */
  openRule: (r: Rule | 'new' | null) => void;
};

export const NavContext = createContext<GrowthNav | null>(null);
export function useNav(): GrowthNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Growth page.');
  return n;
}
