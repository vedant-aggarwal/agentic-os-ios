import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';

// Where the Money page is: the open tab and the sheet or screen on top. Any part can open another without passing
// callbacks down.

export type Tab = 'today' | 'spend' | 'save' | 'earn';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'today', label: 'Today' }, { key: 'spend', label: 'Spend' }, { key: 'save', label: 'Save' }, { key: 'earn', label: 'Earn' },
];

export type SheetKind =
  | { kind: 'spend' }
  | { kind: 'moneyIn' }
  | { kind: 'target' }
  | { kind: 'jar' }
  | { kind: 'bill' };

export type MoneyNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  sheet: SheetKind | null;
  openSheet: (s: SheetKind | null) => void;
  /** The bank statement screen: an import to review, or the start (null). */
  openStatement: (id: string | null) => void;
};

export const NavContext = createContext<MoneyNav | null>(null);
export function useNav(): MoneyNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Money page.');
  return n;
}
