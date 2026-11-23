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
