import { requestKeyboardTake } from '@/lib/kbmic';

// Links into the app. agenticos://flow?id=<take id> is the keyboard asking for the mic (src/lib/kbmic.ts): start that
// take and stay on the screen that is open. Navigating anywhere would remount Today and cut the recording off.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const m = /(?:^|[/:])flow\?(?:.*&)?id=([a-z0-9_]+)/i.exec(path);
    if (m) { requestKeyboardTake(m[1]); return initial ? '/' : null; }
    // Job pushes ("Job needs you", "Job finished") carry agenticos://job/<id>: open its thread in the Projects hub.
    const job = /(?:^|[/:])job\/(j?\d+)/i.exec(path);
    if (job) return `/work/job/${job[1]}`;
  } catch {}
  return path;
}
