import { useEffect } from 'react';

/**
 * Keeps the screen on while `on` (a live workout, a guided routine, a sit), so the phone does not lock between sets.
 * expo-keep-awake ships inside expo; a build or a browser without it just skips this.
 */
export function useKeepAwake(on: boolean, tag: string) {
  useEffect(() => {
    if (!on) return;
    let k: typeof import('expo-keep-awake') | null = null;
    try {
      k = require('expo-keep-awake') as typeof import('expo-keep-awake'); // eslint-disable-line @typescript-eslint/no-require-imports
      void k.activateKeepAwakeAsync(tag).catch(() => {});
    } catch { k = null; }
    return () => { if (k) void k.deactivateKeepAwake(tag).catch(() => {}); };
  }, [on, tag]);
}
