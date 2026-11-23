import { useEffect, useSyncExternalStore } from 'react';

// There is one pet. While the logger's big one is out (it flies out of the mood button), the top bar's small one
// hides and pauses, so the button is empty until it comes back.
let big = 0;
const subs = new Set<() => void>();
const set = (n: number) => { big = n; for (const f of subs) f(); };

/** A big pet is on screen while this is mounted with on = true. */
export function useBigPet(on: boolean) {
  useEffect(() => {
    if (!on) return;
    set(big + 1);
    return () => set(big - 1);
  }, [on]);
}

/** True while a big pet is out. */
export function useBigPetOut() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => { subs.delete(f); }; },
    () => big > 0,
    () => false,
  );
}
