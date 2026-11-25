import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { DEMO } from '@/lib/demo';
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

// Dev web only (`?demo`): each page's sample records load with it, before it draws. The phone's registry never
// names these files, so sample data never reaches the app.
const SAMPLE: Record<AspectKey, () => Promise<unknown>> | null = __DEV__ && DEMO ? {
  body: () => import('./_demo/body'),
  mind: () => import('./_demo/mind'),
  soul: () => import('./_demo/soul'),
  mission: () => import('./_demo/mission'),
  money: () => import('./_demo/money'),
  growth: () => import('./_demo/growth'),
  family: () => import('./_demo/family'),
  romance: () => import('./_demo/romance'),
  friends: () => import('./_demo/friends'),
} : null;
const withSample = (k: AspectKey) => (SAMPLE
  ? () => import('./_demo/shared').then(() => SAMPLE[k]()).catch((e) => { console.warn(`[demo] ${k} samples failed`, e); }).then(() => LOAD[k]())
  : LOAD[k]);

export const PAGES = Object.fromEntries(
  (Object.keys(LOAD) as AspectKey[]).map((k) => [k, lazy(withSample(k))]),
) as Record<AspectKey, LazyExoticComponent<ComponentType>>;

/** Fetch every page's code ahead of the first tap (web downloads each page as its own file). */
export function preloadPages() {
  for (const k of Object.keys(LOAD) as AspectKey[]) withSample(k)().catch(() => {});
}

export { WARM } from './warm';
