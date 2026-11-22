import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { createElement, useEffect, useRef, useState, type ReactElement } from 'react';
import { type GestureResponderEvent, useWindowDimensions, type ViewProps, type ViewStyle } from 'react-native';
import {
  type AnimatedStyle, Easing, type FrameInfo, ReduceMotion, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { lightTap, tap } from '@/components/Glass';
import { emitMic, openSheet } from './bus';
import {
  BTN, createFanStore, dockWorkOrb, fanLayout, GAP, hitTest, LOCK, NONE, PAD, Part, PLUS_HIT, ProjectFan, ROW_H, rowBox, scrollSpeed,
  type FanLayout, type Rec,
} from './ProjectFan';
import { useFanProjects } from './store';
import type { ProjectCard } from './types';

// The Work orb's gesture (PROJECTS-HUB-SPEC section 3), built like the Nora orb's dial in Dock.tsx: the orb takes
// the touch with the responder system and keeps it to the end, the fan starts opening on touch, a quick release
// is a tap. Spread `handlers` on the orb's wrapping view and render `overlay` at screen level above everything.

const TAP = 280; // let go sooner than this without sliding and it was a tap: the hub
const SWIPE = 8; // pt of travel that turns a press into a slide
const REST = 250; // ms on a mic before push to talk starts
const CORRIDOR = 40; // pt either side of the mic where sliding up heads for the lock
const PRESS = { duration: 120, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.Never } as const;

export type WorkOrbHandlers = Pick<ViewProps,
  | 'accessible' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityHint' | 'onAccessibilityTap'
  | 'onStartShouldSetResponder' | 'onStartShouldSetResponderCapture' | 'onResponderTerminationRequest'
  | 'onResponderGrant' | 'onResponderMove' | 'onResponderRelease' | 'onResponderTerminate'>;

type Center = { cx: number; cy: number };

/** The orb's centre on screen, from the view that holds the touch (web and Fabric both give its box). */
function measureCenter(target: unknown): Center | null {
  try {
    const r = (target as { getBoundingClientRect?: () => { x: number; y: number; width: number; height: number } } | null)
      ?.getBoundingClientRect?.();
    if (r && r.width > 0 && r.height > 0) return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  } catch {}
  return null;
}

function act(code: number, projects: ProjectCard[] | null) {
  if (code === PLUS_HIT) { lightTap(); openSheet({ kind: 'project' }); return; }
  const p = code >= 0 ? projects?.[Math.floor(code / 8)] : undefined;
  if (!p) return;
  lightTap();
  switch (code % 8) {
    case Part.name: router.push(`/work/${p.slug}` as Href); break;
    // let go on the mic before push to talk started: record hands free, the recorder shows its own controls
    case Part.mic: emitMic({ type: 'start', project: p.slug }); emitMic({ type: 'lock' }); break;
    case Part.idea: openSheet({ kind: 'idea', project: p.slug }); break;
    case Part.task: openSheet({ kind: 'task', project: p.slug }); break;
    case Part.job: openSheet({ kind: 'job', project: p.slug }); break;
  }
}

export function useWorkOrb({ onTap }: { onTap: () => void }): {
  handlers: WorkOrbHandlers; overlay: ReactElement; orbStyle: AnimatedStyle<ViewStyle>;
} {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const projects = useFanProjects();
  // Where the dock draws the orb until a touch measures it; a different spot (the lab, a new dock) re-lays the fan once.
  const [measured, setMeasured] = useState<Center | null>(null);
  const orb = measured ?? dockWorkOrb(width, height, insets.bottom);
  const L = fanLayout(orb, width, insets.top, projects ? projects.length : -1);
  const [store] = useState(createFanStore);

  const phase = useSharedValue(0); // the fan: 0 closed, 1 open
  const hover = useSharedValue(NONE); // the target under the finger
  const offset = useSharedValue(0); // edge scroll
  const lift = useSharedValue(0); // recording: 0 at the mic, 1 at the lock
  const fx = useSharedValue(0), fy = useSharedValue(0); // the finger, on screen
  const frozen = useSharedValue(0); // 1 while recording: the row holds still and hover stops
  const geo = useSharedValue<FanLayout>(L);
  const press = useSharedValue(1);
  const orbStyle = useAnimatedStyle<ViewStyle>(() => ({ transform: [{ scale: press.value }] }));

  // the latest render's values, for the touch handlers and timers
  const live = useRef({ L, projects, onTap, width, top: insets.top });
  useEffect(() => {
    live.current = { L, projects, onTap, width, top: insets.top };
    geo.set(L);
  }, [L, projects, onTap, width, insets.top, geo]);

  // gesture bookkeeping, read and written only in the touch handlers and the timers they start
  const g = useRef({
    active: false, locked: false, moved: false, t0: 0, x0: 0, y0: 0, hover: NONE,
    rec: null as Rec, timer: null as ReturnType<typeof setTimeout> | null,
  });

  const clearTimer = () => {
    const st = g.current;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  };

  const startRec = (code: number) => {
    const st = g.current, { L: lay, projects: list } = live.current;
    st.timer = null;
    const i = Math.floor(code / 8), p = list?.[i];
    if (!st.active || st.locked || st.rec || st.hover !== code || !p) return;
    frozen.set(1);
    const box = rowBox(lay, i, offset.get());
    const r: Rec = { slug: p.slug, i, cx: box.left + PAD + BTN / 2, cy: box.bottom - ROW_H / 2 };
    st.rec = r;
    lift.set(0);
    store.set({ rec: r });
    emitMic({ type: 'start', project: p.slug });
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
    setTimeout(() => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)), 90);
  };

  const stopRec = () => {
    const st = g.current;
    st.rec = null;
    lift.set(0); frozen.set(0); // hover picks up again from where the finger is
    store.set({ rec: null });
  };

  // From the UI thread, once per hover change.
  const onHover = (code: number) => {
    const st = g.current;
    if (!st.active || st.locked || st.rec) return;
    st.hover = code;
    clearTimer();
    if (code === NONE) return;
    tap(() => Haptics.selectionAsync());
    if (code >= 0 && code % 8 === Part.mic) st.timer = setTimeout(() => startRec(code), REST);
  };

  // onHover is new every render; the frame callback holds one stable trampoline, so it registers once
  const hoverRef = useRef(onHover);
  useEffect(() => { hoverRef.current = onHover; });
  const [hoverJS] = useState(() => (code: number) => hoverRef.current(code));

  // Every frame while the fan is open: edge scroll, then hit test the finger against the (scrolled) rows.
  // built once: every value it reads is a shared value or the trampoline, all stable for the hook's life
  const [tick] = useState(() => (f: FrameInfo) => {
    'worklet';
    if (frozen.get()) return;
    const lay = geo.get();
    const v = scrollSpeed(fy.get(), lay);
    if (v !== 0) {
      const dt = Math.min(f.timeSincePreviousFrame ?? 16, 48) / 1000;
      offset.set(Math.min(Math.max(offset.get() + v * dt, 0), lay.max));
    }
    const h = hitTest(fx.get(), fy.get(), offset.get(), lay);
    if (h !== hover.get()) {
      hover.set(h);
      scheduleOnRN(hoverJS, h);
    }
  });
  const frame = useFrameCallback(tick, false);

  // Close the fan. The gesture may go on (a locked recording waits for the finger to lift).
  const closeFan = () => {
    const st = g.current;
    clearTimer();
    frame.setActive(false);
    st.hover = NONE; st.rec = null;
    phase.set(0); hover.set(NONE); frozen.set(0); lift.set(0);
    press.set(withTiming(1, PRESS));
    store.set({ shown: false, rec: null });
  };
  const finish = () => { closeFan(); g.current.active = false; };

  const onGrant = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current, cur = live.current;
    const m = measureCenter(e.currentTarget);
    if (m && (!measured || Math.abs(m.cx - measured.cx) > 0.5 || Math.abs(m.cy - measured.cy) > 0.5)) {
      // lay the fan out from the measured orb now, so this very gesture already hit tests right
      const lay = fanLayout(m, cur.width, cur.top, cur.projects ? cur.projects.length : -1);
      cur.L = lay;
      geo.set(lay);
      setMeasured(m);
    }
    clearTimer();
    Object.assign(st, { active: true, locked: false, moved: false, t0: n.timestamp, x0: n.pageX, y0: n.pageY, hover: NONE, rec: null });
    fx.set(n.pageX); fy.set(n.pageY);
    offset.set(0); hover.set(NONE); frozen.set(0); lift.set(0);
    phase.set(1);
    press.set(withTiming(0.97, PRESS));
    frame.setActive(true);
    store.set({ shown: true, rec: null });
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  };

  const onMove = (e: GestureResponderEvent) => {
    const n = e.nativeEvent, st = g.current;
    if (!st.active) return;
    if (!st.moved && Math.hypot(n.pageX - st.x0, n.pageY - st.y0) >= SWIPE) st.moved = true;
    fx.set(n.pageX); fy.set(n.pageY);
    if (st.locked || !st.rec) return;
    // Recording: up the corridor above the mic heads for the lock; anywhere else off the row throws the take away.
    const r = st.rec, up = r.cy - n.pageY;
    if (Math.abs(n.pageX - r.cx) <= CORRIDOR && up > 0) {
      lift.set(Math.min(up / LOCK, 1));
      if (up >= LOCK) {
        emitMic({ type: 'lock' });
        tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
        st.locked = true;
        closeFan();
      }
      return;
    }
    lift.set(0);
    const box = rowBox(live.current.L, r.i, offset.get());
    const inRow = n.pageY >= box.top - GAP / 2 && n.pageY <= box.bottom + GAP / 2 && n.pageX >= box.left - 16;
    if (!inRow) {
      emitMic({ type: 'cancel' });
      lightTap();
      stopRec();
    }
  };

  const onRelease = (e: GestureResponderEvent) => {
    const st = g.current;
    if (!st.active) return;
    if (st.locked) { finish(); return; } // recording carries on hands free
    if (st.rec) { emitMic({ type: 'release' }); lightTap(); finish(); return; }
    const n = e.nativeEvent, cur = live.current;
    const quick = !st.moved && n.timestamp - st.t0 < TAP;
    // hit test the release point itself, in case the finger landed there within the last frame
    const code = quick ? NONE : hitTest(n.pageX, n.pageY, offset.get(), cur.L);
    finish();
    if (quick) cur.onTap();
    else act(code, cur.projects);
  };

  // The system took the touch (a call, Control Center): keep a take in progress rather than lose it.
  const onTerminate = () => {
    const st = g.current;
    if (st.rec) emitMic({ type: 'release' });
    finish();
  };

  useEffect(() => () => {
    const st = g.current;
    if (st.timer) clearTimeout(st.timer);
    if (st.rec) emitMic({ type: 'cancel' });
  }, []);

  const handlers: WorkOrbHandlers = {
    accessible: true,
    accessibilityRole: 'button',
    accessibilityLabel: 'Work',
    accessibilityHint: 'Opens your projects',
    onAccessibilityTap: () => live.current.onTap(),
    onStartShouldSetResponderCapture: () => true,
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: onGrant,
    onResponderMove: onMove,
    onResponderRelease: onRelease,
    onResponderTerminate: onTerminate,
  };

  const overlay = createElement(ProjectFan, { projects, L, orb, store, phase, hover, offset, lift, orbStyle });
  return { handlers, overlay, orbStyle };
}
