import { useEffect, useState } from 'react';
import { Keyboard, useWindowDimensions } from 'react-native';
import { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// A page that opens as a circle growing out of a top-bar button until it covers the screen (the page stays put; only
// the circle showing it widens) and closes back into it. Once opened it stays mounted, hidden, so it comes back as
// it was. Same motion as the PC mic page (PcMicSheet).
const OPEN = { duration: 560, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 440, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const ICON = 44; // the button it grows from

const lerp = (a: number, b: number, t: number) => { 'worklet'; return a + (b - a) * t; };
const clamp01 = (v: number) => { 'worklet'; return Math.min(Math.max(v, 0), 1); };

export function useReveal(open: boolean, origin: { x: number; y: number }) {
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0);
  const [ever, setEver] = useState(open);
  const [mounted, setMounted] = useState(open); // shown, or still animating closed
  if (open && !ever) setEver(true);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) { p.set(withSpring(1, OPEN)); return; }
    p.set(withSpring(0, CLOSE));
    Keyboard.dismiss();
    const id = setTimeout(() => setMounted(false), 460);
    return () => clearTimeout(id);
  }, [open, p]);
  const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)) + 4;
  const shell = useAnimatedStyle(() => {
    const r = lerp(ICON / 2, reach, p.value);
    return { position: 'absolute', overflow: 'hidden', left: origin.x - r, top: origin.y - r, width: r * 2, height: r * 2, borderRadius: r, opacity: clamp01(p.value * 8) };
  });
  const stage = useAnimatedStyle(() => {
    const r = lerp(ICON / 2, reach, p.value);
    return { position: 'absolute', width, height, left: r - origin.x, top: r - origin.y };
  });
  const content = useAnimatedStyle(() => ({ opacity: clamp01(p.value * 2.5) }));
  return { ever, mounted, shell, stage, content, width, height };
}
