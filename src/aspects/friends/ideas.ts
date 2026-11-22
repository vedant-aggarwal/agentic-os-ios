import { useSyncExternalStore } from 'react';
import { call, invalidate } from '@/lib/mod';

// Plan ideas from Claude, asked for when he picks a person. The PC answers at once with today's stored ideas when
// it has them, otherwise it asks Claude (a few seconds) and stores the answer. The wait lives here, outside any
// screen, so he can leave the plan and come back to it still waiting, or already answered.
//
// The state is one immutable object replaced on every change and returned as the store's snapshot, so a render
// always reads it through useSyncExternalStore (the React Compiler would otherwise keep an old answer per person).

type Ask = { busy: boolean; error: string | null };
let state: Record<string, Ask> = {};
const subs = new Set<() => void>();
const set = (person: string, ask: Ask) => { state = { ...state, [person]: ask }; for (const fn of subs) fn(); };
const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const snapshot = () => state;
const IDLE: Ask = { busy: false, error: null };

export function askIdeas(person: string, force = false) {
  if (state[person]?.busy) return;
  set(person, { busy: true, error: null });
  call('/mod/friends/ideas', { person, force })
    .then(() => set(person, IDLE))
    .catch((e: Error) => set(person, { busy: false, error: e.message || 'No ideas this time.' }))
    .finally(() => invalidate(`/mod/friends/ideas?person=${encodeURIComponent(person)}`));
}

export function useIdeasState(person: string | null): Ask {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot);
  return (person ? all[person] : null) ?? IDLE;
}
