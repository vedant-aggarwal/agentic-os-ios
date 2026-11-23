import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { onAuth } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import type { AspectProgress } from '@/lib/today';
import type { AspectKey } from '@/theme';

// The desktop web layout: a sidebar, the page, and Nora beside it. Phones and narrow windows keep the phone UI.
/** Narrowest window that gets the desktop layout. */
export const DESK_MIN = 1000;
/** From here Nora's chat sits open beside the page by default. */
export const NORA_SIDE_MIN = 1320;
export const SIDEBAR_W = 248;
export const NORA_W = 400;

export function useDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= DESK_MIN;
}

/** What the sidebar shows as chosen, and the counts beside each aspect (published by Today). */
type Desk = { view: 'today' | AspectKey; reach: AspectProgress; nora: boolean | null; signedIn: boolean };
let state: Desk = { view: 'today', reach: {}, nora: null, signedIn: DEMO }; // the sample preview needs no sign-in
const subs = new Set<() => void>();
const set = (p: Partial<Desk>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

export const desk = {
  get: () => state,
  open: (view: Desk['view']) => set({ view }),
  setReach: (reach: AspectProgress) => { if (reach !== state.reach) set({ reach }); },
  setSignedIn: (signedIn: boolean) => { if (signedIn !== state.signedIn) set({ signedIn }); },
  toggleNora: (wide: boolean) => set({ nora: !(state.nora ?? wide) }),
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
};

onAuth((signedIn) => desk.setSignedIn(signedIn));

export function useDesk() {
  return useSyncExternalStore(desk.subscribe, desk.get, desk.get);
}
