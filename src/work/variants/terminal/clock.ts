import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { cancelAnimation, Easing, makeMutable, ReduceMotion, useReducedMotion, withRepeat, withTiming } from 'react-native-reanimated';

// One blink for the whole design: the prompt's cursor and a tile's needs-you lamp keep time together, and only one
// loop runs, on the UI thread. 0..1 per beat; lit for the first half.

export const beat = makeMutable(0);
const PERIOD = 1060; // a terminal caret: 530 ms on, 530 ms off

/** Lit, then a quick phosphor fade to `low`. Holds lit while the beat is stopped. */
export function blinkOpacity(t: number, low: number) {
  'worklet';
  if (t < 0.5) return 1;
  if (t < 0.56) return 1 - ((t - 0.5) / 0.06) * (1 - low);
  return low;
}

/** Runs the beat while the Work page is in focus; stops it (lit) out of focus and under Reduce Motion. The Header
 *  calls this once. */
export function useBeat() {
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!focused || reduce) return;
    beat.set(0);
    beat.set(withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false));
    return () => { cancelAnimation(beat); beat.set(0); };
  }, [focused, reduce]);
}
