import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Crystals } from '@/components/Crystals';
import type { TodayView } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey, C, F, FAMILY_ASPECTS, type FamilyKey } from '@/theme';
import { Surface, SURFACE_OK } from './Surface';
import type { SceneMsg, SurfaceHandle } from './types';

// Today's hero: nine crystals in a cave (hero-scene/main.js), one per aspect, on one stone. Each fills with a
// coloured liquid up to its share done of everything open in that aspect (today's plan plus carried tasks). A sideways drag turns the stone; it settles with one
// crystal facing you, named under the scene.

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
      setFacing(m.key as AspectKey);
      // a light tick each time a new crystal turns to face you
      if (m.tick && haptics) Haptics.selectionAsync().catch(() => {});
    }
  }, [shown]);

  // A sideways drag turns the stone and holds the page still; an up/down drag fails it and the page scrolls.
  const send = (m: SceneMsg) => surface.current?.send(m);
  const pan = usePanGesture({
    activeOffsetX: [-8, 8],
    failOffsetY: [-12, 12],
    runOnJS: true,
    onActivate: (e) => { send({ t: 'down' }); send({ t: 'move', dx: e.translationX / width }); },
    onUpdate: (e) => { if (e.changeX) send({ t: 'move', dx: e.changeX / width }); },
    onDeactivate: (e) => send({ t: 'up', vx: e.canceled ? 0 : e.velocityX / width }),
  });

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
      <GestureDetector gesture={pan}>
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
