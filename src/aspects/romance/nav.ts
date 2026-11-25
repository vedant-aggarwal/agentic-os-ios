import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { Entry, PlanItem } from './model';
import type { IdeaRec, Outing, Place } from './types';

export type Tab = 'now' | 'people' | 'plans' | 'ideas';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'now', label: 'Now' }, { key: 'people', label: 'People' }, { key: 'plans', label: 'Plans' }, { key: 'ideas', label: 'Ideas' },
];

/** What a debrief is about: an outing, a plan with someone, or nothing in particular. `view` opens one already made. */
export type DebriefTarget = { outing: Outing | null; view: string | null; plan?: PlanItem | null };

/** What every tab can open. The page holds the screens and sheets; the tabs only ask for them. */
export type RomanceNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  person: (id: string) => void;
  add: (met?: { place: Place | null; session: string | null } | null) => void;
  next: (id: string) => void;
  markDone: (e: Entry) => void;
  looking: () => void;
  target: () => void;
  goOut: () => void;
  backToOut: () => void;
  endLive: () => void;
  addOne: () => void;
  debrief: (t: DebriefTarget) => void;
  debriefs: () => void;
  planDay: (p: PlanItem) => void;
  /** Add an idea (for someone, or anyone), or edit one. */
  idea: (o?: { person?: string | null; edit?: IdeaRec | null }) => void;
  planIdea: (idea: IdeaRec) => void;
};

export const NavContext = createContext<RomanceNav | null>(null);
export function useNav() {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Romance page around it.');
  return n;
}
