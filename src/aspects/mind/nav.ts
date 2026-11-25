import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { StageSpec, TakeSpec } from './types';

// Where the Mind page is: the open tab, and the full screen flows on top (a take, a video on Stage, recall, a drill, a
// review, the end of a reading sitting). Any part of the page can open another without passing callbacks down.

export type Tab = 'today' | 'read' | 'learn' | 'speak';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'today', label: 'Today' }, { key: 'read', label: 'Read' }, { key: 'learn', label: 'Learn' }, { key: 'speak', label: 'Speak' },
];

export type MindNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  /** Record a take on this topic (the think, talk and review flow). */
  take: (spec: TakeSpec, steps?: string[]) => void;
  /** Film a take on this prompt (Stage), or pick up an unfinished one. */
  stage: (spec: StageSpec) => void;
  /** The Gemini key: voice feedback on videos. */
  openKey: () => void;
  openRecall: () => void;
  openDrill: (id: string) => void;
  openReview: (id: string) => void;
  /** End a reading sitting on this book: where he stopped, how long, what stuck. */
  logSitting: (book: string) => void;
};

export const NavContext = createContext<MindNav | null>(null);
export function useNav(): MindNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Mind page.');
  return n;
}
