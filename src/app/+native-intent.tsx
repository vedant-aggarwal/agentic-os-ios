import { SECTION_TARGETS } from '@/lib/aspectLinks';
import { requestKeyboardTake } from '@/lib/kbmic';
import { openLink, parseLink } from '@/lib/links';

// Targets that open on Today rather than as a route: the section pages, Today itself and Nora (src/lib/links.ts).
const ON_TODAY = new Set([...SECTION_TARGETS, 'today', 'nora']);

// Links into the app. agenticos://flow?id=<take id> is the keyboard asking for the mic (src/lib/kbmic.ts): start that
// take and stay on the screen that is open. Navigating anywhere would remount Today and cut the recording off.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const m = /(?:^|[/:])flow\?(?:.*&)?id=([a-z0-9_]+)/i.exec(path);
    if (m) { requestKeyboardTake(m[1]); return initial ? '/' : null; }
    // Job pushes ("Job needs you", "Job finished") carry agenticos://job/<id>: open its thread in the Projects hub.
    const job = /(?:^|[/:])job\/(j?\d+)/i.exec(path);
    if (job) return `/work/job/${job[1]}`;
    // agenticos://<aspect>/<part>, agenticos://today and agenticos://nora/...: Today opens them (a link that arrives
    // before Today is up waits for it), so the app lands on Today and stays put if it was already open.
    const link = parseLink(path);
    if (link && ON_TODAY.has(link.target)) { openLink(path); return initial ? '/' : null; }
  } catch {}
  return path;
}
