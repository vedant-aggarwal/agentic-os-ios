import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import {
  cancelAnimation, Easing, makeMutable, type SharedValue, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';

// Liquid's motion runs on clocks: a shared value that climbs one unit per lap, linearly, on the UI thread. Every
// loop drawn from a clock turns a whole number of times per lap, so laps join without a seam, and pausing keeps the
// phase. Clocks stop when the screen loses focus and never start under Reduce Motion.

/** The header's lap: waves turn 3 or 2 times in it, bubbles 2 to 4, the Orca dot breathes 3 times. */
export const LAP = 12_000;

function spin(t: SharedValue<number>, ms: number) {
  const from = t.get() % 1;
  t.set(from);
  t.set(withRepeat(withTiming(from + 1, { duration: ms, easing: Easing.linear }), -1, false));
}

/** A clock for one surface. `moving` false: it holds still (screen not focused, or Reduce Motion). */
export function useClock(ms = LAP) {
  const t = useSharedValue(0.3);
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  const run = focused && !reduce;
  useEffect(() => {
    if (!run) return;
    spin(t, ms);
    return () => cancelAnimation(t);
  }, [run, t, ms]);
  return { t, moving: run };
}

// Every flowing tile reads this one clock, so the page runs one loop however many projects have agents working.
// The first tile to flow starts it and the last one to stop ends it.
const flow = makeMutable(0);
let flowing = 0;
const FLOW_MS = 2_400;

export function useFlow(on: boolean) {
  const focused = useIsFocused();
  const reduce = useReducedMotion();
  const run = on && focused && !reduce;
  useEffect(() => {
    if (!run) return;
    flowing += 1;
    if (flowing === 1) spin(flow, FLOW_MS);
    return () => {
      flowing = Math.max(0, flowing - 1);
      if (flowing === 0) cancelAnimation(flow);
    };
  }, [run]);
  return flow;
}
