import { createElement, type ComponentType } from 'react';
import type { AspectKey } from '@/theme';

export { WARM } from './warm';

// Phone: every page is part of the app's own bundle, so opening one never fetches code. (An import() here used to
// make the dev client download each page from Metro on its first open, 2-3 s through the tunnel.) Each page's module
// runs the first time it is drawn, or earlier when Today calls preloadPages; one that throws shows the host's error
// card for that page only. Web downloads pages as separate files instead (registry.web.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const REQUIRE: Record<AspectKey, () => { default: ComponentType }> = {
  body: () => require('./body'),
  mind: () => require('./mind'),
  soul: () => require('./soul'),
  mission: () => require('./mission'),
  money: () => require('./money'),
  growth: () => require('./growth'),
  family: () => require('./family'),
  romance: () => require('./romance'),
  friends: () => require('./friends'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

const ready = new Map<AspectKey, ComponentType>();
const pageOf = (k: AspectKey) => {
  let c = ready.get(k);
  if (!c) { c = REQUIRE[k]().default; ready.set(k, c); }
  return c;
};

export const PAGES = Object.fromEntries((Object.keys(REQUIRE) as AspectKey[]).map((k) => {
  const Page = () => createElement(pageOf(k));
  Page.displayName = `Aspect(${k})`;
  return [k, Page];
})) as unknown as Record<AspectKey, ComponentType>;

/** Run every page's module ahead of the first tap, one per frame so Today never stutters. */
export function preloadPages() {
  const keys = (Object.keys(REQUIRE) as AspectKey[]).filter((k) => !ready.has(k));
  const next = () => {
    const k = keys.shift();
    if (!k) return;
    try { pageOf(k); } catch {} // drawing it shows the error
    setTimeout(next, 16);
  };
  next();
}
