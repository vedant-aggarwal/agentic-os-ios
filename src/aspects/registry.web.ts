import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AspectKey } from '@/theme';

// Web: one folder per aspect, each default-exporting its page from index.tsx, downloaded as its own file. Today
// fetches them all a moment after it opens (preloadPages), so the first visit's download stays small and a tap
// later finds the page already here. The phone bundles every page instead (registry.ts).
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

export { WARM } from './warm';
