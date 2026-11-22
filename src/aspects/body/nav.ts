import { createContext, use } from 'react';
import type { FullSession, Part } from './api';

// Where the Body page is: which part is open on top of Home, which full-screen flow, which quick sheet.
// Any component can open another part, a flow or a sheet without passing callbacks down.

export type Flow =
  | { kind: 'live' }
  | { kind: 'scan' }
  | { kind: 'routine'; when: 'am' | 'pm' | 'day' }
  | { kind: 'drills' }
  | { kind: 'sample' };
export type SheetKind = { kind: 'meal' } | { kind: 'quick'; quick: string } | { kind: 'weigh' } | { kind: 'targets' };

export type BodyNav = {
  part: Part | null;
  openPart: (p: Part | null) => void;
  flow: Flow | null;
  openFlow: (f: Flow | null) => void;
  sheet: SheetKind | null;
  openSheet: (s: SheetKind | null) => void;
  /** Start today's session (or resume the live one) and open the live workout. */
  startWorkout: (session: FullSession | null) => Promise<void>;
};

export const NavContext = createContext<BodyNav | null>(null);
export function useNav(): BodyNav {
  const n = use(NavContext);
  if (!n) throw new Error('useNav() needs the Body page.');
  return n;
}
