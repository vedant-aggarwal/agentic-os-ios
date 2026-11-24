import { requestKeyboardTake } from '@/lib/kbmic';
import { isPlainRoute, openLink, parseLink, routeFor } from '@/lib/links';

// Links into the app (src/lib/links.ts has the list). agenticos://flow?id=<take id> is the keyboard asking for the mic
// (src/lib/kbmic.ts): start that take and stay on the screen that is open. Navigating anywhere would remount Today and
// cut the recording off.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const m = /(?:^|[/:])flow\?(?:.*&)?id=([a-z0-9_]+)/i.exec(path);
    if (m) { requestKeyboardTake(m[1]); return initial ? '/' : null; }
    const link = parseLink(path);
    if (!link || isPlainRoute(link)) return path;
    // Job and Orca pushes ("needs you", "finished"), the Projects hub and its pages: a route.
    const route = routeFor(link);
    if (route) return route;
    // Everything else opens on Today (a section, Nora, Today itself; an unknown link falls back to Today) or over the
    // open screen (the Capture widget's voice idea, a task). openLink closes any Projects page above Today first, so
    // the app lands on Today, or stays put when it was already there.
    openLink(path);
    return initial ? '/' : null;
  } catch {}
  return path;
}
