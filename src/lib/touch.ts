import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, type NativeTouchEvent, Platform } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

// Multi-touch for the PC screen. React Native's responder system lets one view own the touches at a time, so a
// held button would freeze the trackpad and Alt could not be held while Tab is tapped. These hooks use the raw
// touch events instead: every control counts only the fingers that landed on it, and any number work at once.

export type Finger = { id: number; x: number; y: number };
type Handlers = {
  start?: (f: Finger, mine: Finger[]) => void;
  move?: (mine: Finger[]) => void;
  end?: (f: Finger, mine: Finger[], cancelled: boolean) => void;
};

const toFinger = (t: NativeTouchEvent): Finger => ({ id: Number(t.identifier), x: t.pageX, y: t.pageY });

/** Raw touch props for a View, reporting only the fingers that started on it. */
export function useOwnTouches(h: Handlers) {
  const hr = useRef(h);
  useLayoutEffect(() => { hr.current = h; });
  const mine = useRef(new Map<number, Finger>());
  const [props] = useState(() => {
    const list = () => [...mine.current.values()];
    const finish = (ids: number[], cancelled: boolean) => {
      for (const id of ids) {
        const f = mine.current.get(id);
        if (!f) continue;
        mine.current.delete(id);
        hr.current.end?.(f, list(), cancelled);
      }
    };
    return {
      onTouchStart: (e: GestureResponderEvent) => {
        const ne = e.nativeEvent as NativeTouchEvent & { targetTouches?: NativeTouchEvent[] };
        const changed = ne.changedTouches?.length ? ne.changedTouches : [ne];
        // the fingers this event is for: those on this view (targetTouches), else the one it names
        const here = ne.targetTouches?.length ? new Set(ne.targetTouches.map((t) => Number(t.identifier))) : new Set([Number(ne.identifier)]);
        for (const t of changed) {
          const f = toFinger(t);
          if (!here.has(f.id) || mine.current.has(f.id)) continue;
          mine.current.set(f.id, f);
          hr.current.start?.(f, list());
        }
      },
      onTouchMove: (e: GestureResponderEvent) => {
        const all = e.nativeEvent.touches ?? [];
        const live = new Set<number>();
        let moved = false;
        for (const t of all) {
          const id = Number(t.identifier);
          live.add(id);
          const f = mine.current.get(id);
          if (f && (f.x !== t.pageX || f.y !== t.pageY)) { f.x = t.pageX; f.y = t.pageY; moved = true; }
        }
        // a finger whose end never reached us (its view went away): let it go
        finish([...mine.current.keys()].filter((id) => !live.has(id)), true);
        if (moved && mine.current.size) hr.current.move?.(list());
      },
      onTouchEnd: (e: GestureResponderEvent) => {
        const changed = e.nativeEvent.changedTouches?.length ? e.nativeEvent.changedTouches : [e.nativeEvent];
        finish(changed.map((t) => Number(t.identifier)), false);
      },
      onTouchCancel: (e: GestureResponderEvent) => {
        const changed = e.nativeEvent.changedTouches?.length ? e.nativeEvent.changedTouches : [e.nativeEvent];
        finish(changed.map((t) => Number(t.identifier)), true);
      },
    };
  });
  return props;
}

/** A key or button that is down while any finger is on it. `up` also runs if it unmounts while held. */
export function usePress(down: () => void, up?: () => void) {
  const cb = useRef({ down, up });
  useLayoutEffect(() => { cb.current = { down, up }; });
  const [pressed, setPressed] = useState(false);
  const held = useRef(false);
  const props = useOwnTouches({
    start: (_f, mine) => { if (mine.length === 1) { held.current = true; setPressed(true); cb.current.down(); } },
    end: (_f, mine) => { if (!mine.length && held.current) { held.current = false; setPressed(false); cb.current.up?.(); } },
  });
  useEffect(() => () => { if (held.current) { held.current = false; cb.current.up?.(); } }, []);
  return { props, pressed };
}

const HOLD_MS = 220; // held this long it is a hold; shorter is a tap
export const LOCK_PT = 64; // slide up this far while holding to lock it on
const SLIDE_START = 14; // sliding up this far before HOLD_MS also counts as a hold

/** Hold to talk, slide up to lock, tap for the other action. `lift` runs 0..1 toward the lock while holding. */
export function useHoldLock(h: {
  holdIn: () => void; holdOut: () => void; tap: () => void; lock: () => void; press?: (down: boolean) => void;
}) {
  const hr = useRef(h);
  useLayoutEffect(() => { hr.current = h; });
  const lift = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const st = useRef({ id: -1, y0: 0, timer: null as ReturnType<typeof setTimeout> | null, held: false, locked: false });
  const beginHold = () => {
    const s = st.current;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    s.held = true; setHolding(true); hr.current.holdIn();
  };
  const props = useOwnTouches({
    start: (f) => {
      const s = st.current;
      if (s.id !== -1) return; // one finger drives it
      s.id = f.id; s.y0 = f.y; s.held = false; s.locked = false;
      s.timer = setTimeout(beginHold, HOLD_MS);
      hr.current.press?.(true);
    },
    move: (mine) => {
      const s = st.current;
      const f = mine.find((m) => m.id === s.id);
      if (!f || s.locked) return;
      const up = s.y0 - f.y;
      if (!s.held && up > SLIDE_START) beginHold();
      if (!s.held) return;
      lift.set(Math.min(Math.max(up / LOCK_PT, 0), 1));
      if (up >= LOCK_PT) {
        s.locked = true;
        setHolding(false);
        lift.set(withTiming(0, { duration: 180 }));
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        hr.current.lock();
      }
    },
    end: (f, _mine, cancelled) => {
      const s = st.current;
      if (f.id !== s.id) return;
      s.id = -1;
      hr.current.press?.(false);
      if (s.timer) { clearTimeout(s.timer); s.timer = null; if (!cancelled) hr.current.tap(); }
      else if (s.held && !s.locked) hr.current.holdOut();
      s.held = false;
      setHolding(false);
      lift.set(withTiming(0, { duration: 150 }));
    },
  });
  useEffect(() => () => {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    if (s.held && !s.locked) hr.current.holdOut();
  }, []);
  return { props, lift, holding };
}
