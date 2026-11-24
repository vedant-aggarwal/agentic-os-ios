import { router, type Href } from 'expo-router';
import { work } from '../store';

// Typed routes regenerate only while the dev server runs, so hub paths are cast once here.
const go = (path: string) => router.push(path as Href);

export const openProject = (slug: string) => go(`/work/${encodeURIComponent(slug)}`);
export const openJob = (id: string) => go(`/work/job/${encodeURIComponent(id)}`);
export const openOrcaAgent = (id: string) => go(`/work/orca/${encodeURIComponent(id)}`);
export const openResolved = (id: string) => go(`/work/resolved/${encodeURIComponent(id)}`);

/** Back one page; a hub page opened straight from a link has nothing behind it, so it lands on Today. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as Href);
}

export const notBuilt = (what: string) => work.notify(`${what}: not built yet`);
