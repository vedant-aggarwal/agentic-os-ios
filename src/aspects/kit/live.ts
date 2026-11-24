import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';
import { useAspect } from '../context';

/**
 * Runs `reload` when the page opens again after being closed (it stays mounted in between), and when the app comes
 * back to the foreground while the page is open. Not on the first mount: the page's own first load covers that.
 * Use it on any page that shows data which can change elsewhere (Today, the PC, another page).
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
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') run();
      last = next;
    });
    return () => sub.remove();
  }, [open]);
}
