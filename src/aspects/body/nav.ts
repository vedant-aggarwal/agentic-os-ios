import { createContext, use } from 'react';
import type { TabDef } from '@/aspects/kit';
import type { FullSession, Part } from './api';

// Where the Body page is: the open tab, the full-screen flow, the quick sheet and the detail screen on top. Any
// component can open another without passing callbacks down.

export type Tab = 'today' | 'train' | 'diet' | 'face' | 'voice';
export const TABS: readonly TabDef<Tab>[] = [
  { key: 'today', label: 'Today' }, { key: 'train', label: 'Train' }, { key: 'diet', label: 'Diet' }, { key: 'face', label: 'Face' }, { key: 'voice', label: 'Voice' },
];
/** The parts the server names (and links use) to the tab that holds each. */
export const TAB_OF: Record<Part, Tab> = { gym: 'train', diet: 'diet', face: 'face', voice: 'voice' };

export type Flow =
  | { kind: 'live' }
  | { kind: 'scan' }
  | { kind: 'routine'; when: 'am' | 'pm' | 'day' }
  | { kind: 'drills' }
  | { kind: 'sample' };
export type SheetKind = { kind: 'meal' } | { kind: 'quick'; quick: string } | { kind: 'weigh' } | { kind: 'targets' };
export type Detail = { kind: 'session'; id: string } | { kind: 'exercise'; ex: string } | { kind: 'weight' };

export type BodyNav = {
  tab: Tab;
  openTab: (t: Tab) => void;
  /** Older name: open the tab that holds a part (null goes to Today). */
  openPart: (p: Part | null) => void;
  flow: Flow | null;
  openFlow: (f: Flow | null) => void;
  sheet: SheetKind | null;
  openSheet: (s: SheetKind | null) => void;
  detail: Detail | null;
  openDetail: (d: Detail | null) => void;
  /** Start today's session (or resume the live one) and open the live workout. */
  startWorkout: (session: FullSession | null) => Promise<void>;
};

export const NavContext = createContext<BodyNav | null>(null);
export function useNav(): BodyNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Body page.');
  return n;
}
