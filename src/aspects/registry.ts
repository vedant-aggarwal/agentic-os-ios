import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AspectKey } from '@/theme';

// One folder per aspect, each default-exporting its page from index.tsx. Loaded on first open, so a page costs
// nothing until it is used and (in development) one page's broken file can't take the others down.
export const PAGES: Record<AspectKey, LazyExoticComponent<ComponentType>> = {
  body: lazy(() => import('./body')),
  mind: lazy(() => import('./mind')),
  soul: lazy(() => import('./soul')),
  mission: lazy(() => import('./mission')),
  money: lazy(() => import('./money')),
  growth: lazy(() => import('./growth')),
  family: lazy(() => import('./family')),
  romance: lazy(() => import('./romance')),
  friends: lazy(() => import('./friends')),
};
