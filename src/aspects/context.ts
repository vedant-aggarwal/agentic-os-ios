import { createContext, use, useEffect, useEffectEvent } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { AspectKey } from '@/theme';

export const ASPECT_NAME: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth',
  family: 'Family', romance: 'Romance', friends: 'Friends',
};

/**
 * A link into a page: agenticos://body/diet/meal?x=1 reaches Body as { parts: ['diet', 'meal'], query: { x: '1' } }.
 * Every link gets a new stamp, a repeat of the same link too, so the page acts on each one once.
 */
export type AspectEntry = { parts: string[]; query: Record<string, string>; stamp: number };

/** What the host hands every aspect page. Read it with `useAspect()`. */
export type AspectCtx = {
  aspect: AspectKey;
  /** The aspect's colour. It marks what belongs to the aspect and what is done or live; it is not decoration. */
  color: string;
  /** False while the page is closed or closing (it stays mounted): pause timers, polling and looping motion. */
  open: boolean;
  /** Back to Today. */
  close: () => void;
  insets: EdgeInsets;
  width: number;
  height: number;
  /** Space to keep clear at the bottom: the dock while it shows, only the safe area while immersive. */
  dock: number;
  /** One short line above the dock that clears itself: a failed save, "Saved", and so on. */
  notice: (text: string) => void;
  /** Hide the dock for a full-screen flow (a live workout, a timer, a camera). Turn it off again when the flow ends. */
  setImmersive: (on: boolean) => void;
  /** Jump to another aspect's page. */
  openAspect: (key: AspectKey) => void;
  /**
   * Take over "back" (the drag in from the left edge) while something of yours is open on top of the page.
   * The newest handler wins. Returns the function that hands it back. `Screen` does this for you.
   */
  onBack: (handler: () => void) => () => void;
  /**
   * The link that opened this page, or arrived while it was open, until the page marks it handled. Pages read it
   * through `useEntry`, which opens the screen it names and marks it handled.
   */
  entry: AspectEntry | null;
  /** Mark the entry with this stamp handled. */
  doneEntry: (stamp: number) => void;
};

export const AspectContext = createContext<AspectCtx | null>(null);

export function useAspect(): AspectCtx {
  const ctx = use(AspectContext);
  if (!ctx) throw new Error('useAspect() needs an aspect page: render inside AspectHost.');
  return ctx;
}

/**
 * Opens what a link into this page asks for (the list of parts is at the top of src/lib/links.ts). `handle` runs
 * once for each link, also one that arrives while the page is already open, and the link is then marked handled.
 * A link with no parts means the page's home: close whatever is open on top.
 */
export function useEntry(handle: (e: AspectEntry) => void) {
  const { entry, doneEntry } = useAspect();
  const run = useEffectEvent(handle);
  useEffect(() => {
    if (!entry) return;
    run(entry);
    doneEntry(entry.stamp);
  }, [entry, doneEntry]);
}
