import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';
import { useAspect } from '../context';

/**
 * Runs `reload` when he comes back to the page: the page opening again (pages stay mounted while closed) and the
 * app returning from the background while the page is open. Not on the first open: the page loads itself then.
 * Use it for anything read once on mount that can go stale ("today", summaries, lists other pages change).
 */
export function useOnReturn(reload: () => void) {
  const { open } = useAspect();
  const run = useEffectEvent(reload);
  const was = useRef(open);
  useEffect(() => {
    if (open && !was.current) run();
    was.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') run(); });
    return () => sub.remove();
  }, [open]);
}
