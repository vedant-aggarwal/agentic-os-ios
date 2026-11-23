import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureStateManager, useCompetingGestures, usePanGesture } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Crystals } from '@/components/Crystals';
import type { TodayView } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey, C, F, FAMILY_ASPECTS, type FamilyKey } from '@/theme';
import { Surface, SURFACE_OK } from './Surface';
import type { SceneMsg, SurfaceHandle } from './types';

// Today's hero: nine crystals in a cave (hero-scene/main.js), one per aspect, on one stone. Each fills with a
// coloured liquid up to its share done of everything open in that aspect (today's plan plus carried tasks). A sideways drag turns the stone; it settles with one
// crystal facing you, named under the scene. Flick it hard and often and it spins up until the fog is thrown out of
// the cave, with haptic ticks as it goes. Ivy hangs from the roof: a touch on it grabs and swings it, and it snaps
// if swung too hard, then grows back.

/** expo-haptics for each `haptic` message from the scene. */
const BUZZ: Record<string, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
};
/** How near (in points) a touch must land to a hanging strand to grab it rather than turn the stone. */
const PLANT_HIT = 26;

/** Distance in points from (x, y) to the nearest strand, each a polyline in 0..1 scene coordinates. */
function nearStrand(strands: number[][], x: number, y: number, w: number, h: number) {
  let best = Infinity;
  for (const s of strands) {
    for (let i = 0; i + 3 < s.length; i += 2) {
      const ax = s[i] * w, ay = s[i + 1] * h, bx = s[i + 2] * w, by = s[i + 3] * h;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
  }
  return best;
}

/** The hero's height below the safe area. The scene runs up behind the status bar and the top bar. */
export const HERO_H = 420;

const ORDER: AspectKey[] = (['self', 'work', 'people'] as FamilyKey[]).flatMap((f) => FAMILY_ASPECTS[f]);
const aspectName = (a: AspectKey) => a[0].toUpperCase() + a.slice(1);

function mixHex(a: string, b: string, k: number) {
  const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** The app background (Backdrop) at a height on screen: bgTop to bgMid over the top 48%. */
const backdropAt = (y: number, screenH: number) => mixHex(C.bgTop, C.bgMid, Math.min(1, y / (0.48 * screenH)));

export function Hero({ view, top, topBar, active }: { view: TodayView; top: number; topBar: number; active: boolean }) {
  const { width, height: screenH } = useWindowDimensions();
  const h = top + HERO_H;
  const reduce = useReducedMotion();
  const surface = useRef<SurfaceHandle>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [facing, setFacing] = useState<AspectKey | null>(null);
  const strands = useRef<number[][]>([]);
  const lastBuzz = useRef(0);
  const holding = useRef(false);
  const shown = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));

  const data = useMemo<SceneMsg>(() => ({
    t: 'data',
    aspects: ORDER.map((a) => ({ key: a, color: ASPECT_COLOR[a], done: view.reach[a]?.done ?? 0, total: view.reach[a]?.total ?? 0 })),
    bg: backdropAt(h, screenH),
    bgTop: C.bgTop,
    bgStop: (0.48 * screenH) / h,
    topFrac: (top + topBar) / h,
    reduce,
  }), [view.reach, h, screenH, top, topBar, reduce]);

  useEffect(() => { if (ready) surface.current?.send(data); }, [ready, data]);
  useEffect(() => { if (ready) surface.current?.send({ t: active ? 'resume' : 'pause' }); }, [ready, active]);

  const onMessage = useCallback((m: SceneMsg) => {
    const haptics = Platform.OS !== 'web';
    if (m.t === 'ready') {
      setReady(true);
      shown.set(withTiming(1, { duration: 500, reduceMotion: ReduceMotion.System }));
    } else if (m.t === 'error') setFailed(true);
    else if (m.t === 'grab') {
      if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else if (m.t === 'facing') {
      // null while it spins too fast to name a crystal
      setFacing((m.key as AspectKey | null) ?? null);
      // a light tick each time a new crystal turns to face you
      if (m.tick && haptics) Haptics.selectionAsync().catch(() => {});
    } else if (m.t === 'plants') {
      if (Array.isArray(m.s)) strands.current = m.s as number[][];
    } else if (m.t === 'haptic' && haptics) {
      // the scene paces its own ticks; this only keeps a burst from piling up (a heavy one always goes through)
      const now = Date.now();
      if (m.k !== 'heavy' && now - lastBuzz.current < 45) return;
      lastBuzz.current = now;
      if (m.k === 'tick') Haptics.selectionAsync().catch(() => {});
      else Haptics.impactAsync(BUZZ[m.k as string] ?? Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [shown]);

  // Who gets a touch: one that lands on a hanging strand grabs the plant at once (any direction, the page stays
  // put); anywhere else a sideways drag turns the stone and holds the page still, and an up/down drag fails it so
  // the page scrolls.
  const send = (m: SceneMsg) => surface.current?.send(m);
  const plant = usePanGesture({
    manualActivation: true,
    runOnJS: true,
    onTouchesDown: (e) => {
      const t = e.changedTouches[0];
      if (t && e.numberOfTouches === 1 && nearStrand(strands.current, t.x, t.y, width, h) < PLANT_HIT) {
        GestureStateManager.activate(e.handlerTag);
        holding.current = true;
        send({ t: 'pgrab', x: t.x / width, y: t.y / h });
      } else GestureStateManager.fail(e.handlerTag);
    },
    onUpdate: (e) => send({ t: 'pmove', x: e.x / width, y: e.y / h }),
    onDeactivate: (e) => {
      holding.current = false;
      send({ t: 'prel', vx: e.canceled ? 0 : e.velocityX / width, vy: e.canceled ? 0 : e.velocityY / h });
    },
    onFinalize: () => { if (holding.current) { holding.current = false; send({ t: 'prel', vx: 0, vy: 0 }); } },
  });
  const turn = usePanGesture({
    activeOffsetX: [-8, 8],
    failOffsetY: [-12, 12],
    runOnJS: true,
    onActivate: (e) => { send({ t: 'down' }); send({ t: 'move', dx: e.translationX / width }); },
    onUpdate: (e) => { if (e.changeX) send({ t: 'move', dx: e.changeX / width }); },
    onDeactivate: (e) => send({ t: 'up', vx: e.canceled ? 0 : e.velocityX / width }),
  });
  const gesture = useCompetingGestures(plant, turn);

  const p = facing ? view.reach[facing] : undefined;
  const label = facing
    ? { text: `${aspectName(facing)} ${p?.total ? `${p.done} of ${p.total}` : 'nothing open'}`, color: p?.total ? ASPECT_COLOR[facing] : C.muted }
    : null;
  const a11y = ORDER.filter((a) => view.reach[a]?.total)
    .map((a) => `${aspectName(a)} ${view.reach[a]!.done} of ${view.reach[a]!.total}`).join(', ');
  const scene = SURFACE_OK && !failed;

  return (
    <View style={{ height: h }}>
      {scene ? (
        <Animated.View style={[StyleSheet.absoluteFill, fade]}>
          <Surface ref={surface} onMessage={onMessage} />
        </Animated.View>
      ) : (
        <Fallback view={view} top={top + topBar} width={width} />
      )}
      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Today as nine crystals.${a11y ? ` ${a11y}.` : ' Nothing planned.'}`}
        />
      </GestureDetector>
      {scene && ready && label ? (
        <View pointerEvents="none" style={s.label}>
          <Text numberOfLines={1} style={[s.labelText, { color: label.color }]}>{label.text}</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={s.total}>
        {view.total > 0 ? (
          <>
            <Text style={s.totalNum}>{view.done}</Text>
            <Text style={s.totalOf}>of {view.total} done today</Text>
          </>
        ) : (
          <Text style={s.totalOf}>Nothing due today</Text>
        )}
      </View>
    </View>
  );
}

/** Builds without the WebView: the drawn crystals under a beam of light, as before. */
function Fallback({ view, top, width }: { view: TodayView; top: number; width: number }) {
  const bh = 640, cx = width / 2;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg pointerEvents="none" width={width} height={bh} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#D6E2FF" stopOpacity={0.12} /><Stop offset="0.6" stopColor="#D6E2FF" stopOpacity={0.04} />
            <Stop offset="1" stopColor="#D6E2FF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Polygon points={`${cx - 30},0 ${cx + 30},0 ${cx + 150},${bh - 80} ${cx - 150},${bh - 80}`} fill="url(#beam)" />
        <Polygon points={`${cx - 18},0 ${cx + 18},0 ${cx + 110},${bh - 120} ${cx - 110},${bh - 120}`} fill="url(#beam)" />
      </Svg>
      <View style={{ alignItems: 'center', paddingTop: top + 40 }}>
        <Crystals families={view.families} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { position: 'absolute', left: 0, right: 0, bottom: 54, alignItems: 'center' },
  labelText: {
    fontFamily: F.medium, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  total: { position: 'absolute', left: 0, right: 0, bottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  totalNum: { fontFamily: F.semibold, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: C.text, fontVariant: ['tabular-nums'] },
  totalOf: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
});
