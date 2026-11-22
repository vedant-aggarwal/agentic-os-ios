import { createContext, use } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { AspectKey } from '@/theme';

export const ASPECT_NAME: Record<AspectKey, string> = {
  body: 'Body', mind: 'Mind', soul: 'Soul', mission: 'Mission', money: 'Money', growth: 'Growth',
  family: 'Family', romance: 'Romance', friends: 'Friends',
};

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
};

export const AspectContext = createContext<AspectCtx | null>(null);

export function useAspect(): AspectCtx {
  const ctx = use(AspectContext);
  if (!ctx) throw new Error('useAspect() needs an aspect page: render inside AspectHost.');
  return ctx;
}
