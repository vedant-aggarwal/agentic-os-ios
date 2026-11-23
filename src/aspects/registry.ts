import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AspectKey } from '@/theme';

// One folder per aspect, each default-exporting its page from index.tsx. Loaded on first open, so a page costs
// nothing until it is used and (in development) one page's broken file can't take the others down.
const LOAD: Record<AspectKey, () => Promise<{ default: ComponentType }>> = {
  body: () => import('./body'),
  mind: () => import('./mind'),
  soul: () => import('./soul'),
  mission: () => import('./mission'),
  money: () => import('./money'),
  growth: () => import('./growth'),
  family: () => import('./family'),
  romance: () => import('./romance'),
  friends: () => import('./friends'),
};
export const PAGES = Object.fromEntries(
  Object.entries(LOAD).map(([k, f]) => [k, lazy(f)]),
) as Record<AspectKey, LazyExoticComponent<ComponentType>>;

/** Fetch every page's code ahead of the first tap (web downloads each page as its own file). */
export function preloadPages() {
  for (const f of Object.values(LOAD)) f().catch(() => {});
}

/**
 * What the pages read first when they open, fetched together while Today is on screen (lib/mod warm: one round
 * trip). A page whose reads are here opens drawn; one missing here still works, it just loads on open.
 */
export const WARM: { collections: [string, string][]; gets: string[] } = {
  collections: [
    ['body', 'workouts'], ['body', 'meals'],
    ['soul', 'sits'], ['soul', 'plans'], ['soul', 'clean'], ['soul', 'settings'], ['growth', 'journal'],
    ['mission', 'purpose'], ['mission', 'milestones'], ['mission', 'measures'], ['mission', 'life'],
    ['money', 'transactions'], ['money', 'sources'], ['money', 'recurring'], ['money', 'funds'], ['money', 'accounts'],
    ['growth', 'rules'], ['growth', 'reviews'],
    ['people', 'persons'], ['people', 'ideas'], ['people', 'plans'], ['people', 'dates'], ['people', 'rhythms'], ['people', 'moments'],
    ['romance', 'debriefs'], ['romance', 'sessions'], ['romance', 'prefs'], ['romance', 'follow'],
    ['friends', 'places'],
  ],
  gets: [
    '/mod/body/home', '/mod/mind/home', '/mod/mission/home', '/mod/money/home', '/mod/growth/home', '/mod/growth/handoff', '/mod/family/home',
    '/mod/body/today', '/mod/soul/clean/now', '/mod/soul/journal', '/mod/money/jars', '/goals',
    '/mod/people/calendar?back=0&ahead=60', '/mod/friends/week?days=14', '/mod/friends/bank', '/mod/romance/primer',
  ],
};
