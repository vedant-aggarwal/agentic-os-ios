import { useSyncExternalStore } from 'react';
import { call, invalidate } from '@/lib/mod';

// Plan ideas from Claude, asked for when he picks a person. The PC answers at once with today's stored ideas when
// it has them, otherwise it asks Claude (a few seconds) and stores the answer. The wait lives here, outside any
// screen, so he can leave the plan and come back to it still waiting, or already answered.

const pending = new Set<string>();
const errors = new Map<string, string>();
const subs = new Set<() => void>();
let version = 0;
const emit = () => { version++; for (const fn of subs) fn(); };

export function askIdeas(person: string, force = false) {
  if (pending.has(person)) return;
  pending.add(person);
  errors.delete(person);
  emit();
  call('/mod/friends/ideas', { person, force })
    .catch((e: Error) => { errors.set(person, e.message || 'No ideas this time.'); })
    .finally(() => { pending.delete(person); invalidate(`/mod/friends/ideas?person=${encodeURIComponent(person)}`); emit(); });
}

export function useIdeasState(person: string | null) {
  useSyncExternalStore((fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, () => version, () => version);
  return { busy: person ? pending.has(person) : false, error: person ? errors.get(person) ?? null : null };
}
