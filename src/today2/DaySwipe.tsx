import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '@/aspects/kit/tokens';

// Today's sheet moves between days and zooms out to the week.
//   Swipe sideways: the day goes with the finger and the next one comes in behind it. Vedant asked for "swiping left
//   ... will go to the previous day, and if I swipe right, it will go to the next day": a finger moving left goes back
//   a day. LEFT_IS is the one place that says so; set it to 1 to swap the two.
//   Pinch in (fingers together): the week. Pinch out (apart) on the week: back to the day.
// Vertical scrolling wins over a slow diagonal (the swipe fails after 12 pt up or down), and the rows that scroll
// sideways inside the sheet (the Now strip's cards, task cards) keep their own drags: they block the swipe (useSwipeBlock).

/** The day a finger moving left goes to: -1 the day before, 1 the day after. */
export const LEFT_IS: -1 | 1 = -1;

const OUT = { duration: 150, reduceMotion: ReduceMotion.System } as const;
const IN = { duration: 360, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
const BACK = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const FADE = { duration: 200, reduceMotion: ReduceMotion.Never } as const;

type Pan = ReturnType<typeof usePanGesture>;
const SwipeContext = createContext<Pan | null>(null);
/** For a sideways scroller inside Today's sheet: pass as its gesture handler `block`, so its drags never turn the day. */
export function useSwipeBlock() {
  return use(SwipeContext) ?? undefined;
}

export function DaySwipe({ day, zoom, onDay, onZoom, children }: {
  /** the day on screen: when it changes, the new one comes in from the side it was swiped from */
  day: string; zoom: 'day' | 'week';
  /** a swipe went through: the day before (-1) or after (1); on the week, the week before or after */
  onDay: (delta: -1 | 1) => void;
  onZoom: (to: 'day' | 'week') => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const fade = useSharedValue(1);
  const scale = useSharedValue(1);
  // the finger's direction of the swipe that changed the day (-1 left, 1 right), for the way the next day comes in
  const came = useRef<-1 | 1 | null>(null);
  // the gesture's callbacks reach the latest props through these, so a gesture built once never acts on old ones
  const props = useRef({ onDay, onZoom });
  useEffect(() => { props.current = { onDay, onZoom }; }, [onDay, onZoom]);
  const zoomed = useSharedValue(zoom === 'week' ? 1 : 0);
  useEffect(() => { zoomed.set(zoom === 'week' ? 1 : 0); }, [zoom, zoomed]);

  const [commit] = useState(() => (dir: -1 | 1) => {
    came.current = dir;
    haptic.tick();
    props.current.onDay(dir === -1 ? LEFT_IS : (-LEFT_IS as -1 | 1));
  });
  const [zoomTo] = useState(() => (to: 'day' | 'week') => { haptic.light(); props.current.onZoom(to); });

  const pan = usePanGesture({
    activeOffsetX: [-18, 18],
    failOffsetY: [-12, 12],
    maxPointers: 1,
    onUpdate: (e) => {
      'worklet';
      x.set(e.translationX);
      fade.set(1 - Math.min(Math.abs(e.translationX) / width, 0.5));
    },
    onDeactivate: (e) => {
      'worklet';
      const dx = e.translationX, vx = e.canceled ? 0 : e.velocityX;
      const far = Math.abs(dx) > width * 0.22;
      const flick = Math.abs(vx) > 500 && Math.sign(vx) === Math.sign(dx) && Math.abs(dx) > 24;
      if (!e.canceled && (far || flick)) {
        const dir = dx < 0 ? -1 : 1;
        x.set(withTiming(dir * width * 0.35, OUT));
        fade.set(withTiming(0, OUT, (done) => { 'worklet'; if (done) scheduleOnRN(commit, dir as -1 | 1); }));
      } else {
        x.set(withSpring(0, BACK));
        fade.set(withTiming(1, FADE));
      }
    },
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.min(1.08, Math.max(0.88, e.scale)));
    },
    onDeactivate: (e) => {
      'worklet';
      const week = zoomed.get() === 1;
      if (!e.canceled && !week && e.scale < 0.84) scheduleOnRN(zoomTo, 'week');
      else if (!e.canceled && week && e.scale > 1.16) scheduleOnRN(zoomTo, 'day');
      scale.set(withSpring(1, BACK));
    },
  });
  const gesture = useCompetingGestures(pinch, pan);

  // a new day (swiped, picked, or Today tapped) comes in from the side opposite the way the old one left
  const last = useRef(day);
  useEffect(() => {
    if (last.current === day) return;
    const dir = came.current ?? (day < last.current ? (LEFT_IS === -1 ? -1 : 1) : (LEFT_IS === -1 ? 1 : -1));
    last.current = day;
    came.current = null;
    if (reduce) { x.set(0); fade.set(0); fade.set(withTiming(1, FADE)); return; }
    x.set(-dir * width * 0.25);
    fade.set(0);
    x.set(withSpring(0, IN));
    fade.set(withTiming(1, FADE));
  }, [day, reduce, width, x, fade]);

  // the week opening or closing: a short settle from the pinch's size
  const lastZoom = useRef(zoom);
  useEffect(() => {
    if (lastZoom.current === zoom) return;
    lastZoom.current = zoom;
    x.set(0);
    fade.set(0);
    scale.set(zoom === 'week' ? 1.04 : 0.96);
    fade.set(withTiming(1, FADE));
    scale.set(withSpring(1, IN));
  }, [zoom, x, fade, scale]);

  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateX: x.value }, { scale: scale.value }] }));
  return (
    <SwipeContext value={pan}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ flexGrow: 1 }, style]}>{children}</Animated.View>
      </GestureDetector>
    </SwipeContext>
  );
}
