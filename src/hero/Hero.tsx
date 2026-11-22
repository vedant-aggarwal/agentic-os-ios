import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type GestureResponderEvent, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Crystals } from '@/components/Crystals';
import type { TodayView } from '@/lib/today';
import { ASPECT_COLOR, type AspectKey, C, F, FAMILY_ASPECTS, FAMILY_LABEL, type FamilyKey } from '@/theme';
import { Surface, SURFACE_OK } from './Surface';
import type { SceneMsg, SurfaceHandle } from './types';

// Today's hero: three crystals in a cave at dawn (hero-scene/main.js), one per family. The liquid in each is that
// family's share of today done; each third of it is one aspect, so turning a crystal shows the aspects in turn.

/** The hero's height below the safe area. The scene runs up behind the status bar and the top bar. */
export const HERO_H = 420;

const KEYS: FamilyKey[] = ['work', 'self', 'people'];
const aspectName = (a: AspectKey) => a[0].toUpperCase() + a.slice(1);

function mixHex(a: string, b: string, k: number) {
  const x = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const y = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** The app background (Backdrop) at a height on screen: bgTop to bgMid over the top 48%. */
const backdropAt = (y: number, screenH: number) => mixHex(C.bgTop, C.bgMid, Math.min(1, y / (0.48 * screenH)));

type Label = { key: FamilyKey; x: number; y: number };

export function Hero({ view, top, topBar, active }: { view: TodayView; top: number; topBar: number; active: boolean }) {
  const { width, height: screenH } = useWindowDimensions();
  const h = top + HERO_H;
  const reduce = useReducedMotion();
  const surface = useRef<SurfaceHandle>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [facing, setFacing] = useState<{ key: FamilyKey; i: number } | null>(null);
  const shown = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const data = useMemo<SceneMsg>(() => ({
    t: 'data',
    shares: Object.fromEntries(view.families.map((f) => [f.key, f.total ? f.done / f.total : 0])),
    colors: Object.fromEntries(KEYS.map((k) => [k, FAMILY_ASPECTS[k].map((a) => ASPECT_COLOR[a])])),
    bg: backdropAt(h, screenH),
    topFrac: (top + topBar) / h,
    reduce,
  }), [view.families, h, screenH, top, topBar, reduce]);

  useEffect(() => { if (ready) surface.current?.send(data); }, [ready, data]);
  useEffect(() => { if (ready) surface.current?.send({ t: active ? 'resume' : 'pause' }); }, [ready, active]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const onMessage = useCallback((m: SceneMsg) => {
    if (m.t === 'ready') {
      setReady(true);
      shown.set(withTiming(1, { duration: 500, reduceMotion: ReduceMotion.System }));
    } else if (m.t === 'error') setFailed(true);
    else if (m.t === 'layout') setLabels(m.labels as Label[]);
    else if (m.t === 'facing') {
      if (settle.current) clearTimeout(settle.current);
      const next = { key: m.key as FamilyKey, i: m.i as number };
      setFacing(next);
      if (Platform.OS !== 'web') {
        // a firm tick when you take hold, a light one each time a new aspect turns to face you
        (m.grab ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.selectionAsync()).catch(() => {});
      }
    } else if (m.t === 'settled') {
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => setFacing(null), 1600);
    }
  }, [shown]);

  // A sideways drag turns the crystal under the finger; an up/down drag is left to the page so it scrolls.
  const touch = useRef({ x0: 0, y0: 0, lx: 0, ly: 0, lastX: 0, lastT: 0, vx: 0 });
  const send = (m: SceneMsg) => surface.current?.send(m);
  const drag = {
    // called on every press (touch or mouse); only notes where it started
    onStartShouldSetResponder: (e: GestureResponderEvent) => {
      const n = e.nativeEvent;
      touch.current = { x0: n.pageX, y0: n.pageY, lx: n.locationX, ly: n.locationY, lastX: n.pageX, lastT: n.timestamp, vx: 0 };
      return false;
    },
    onMoveShouldSetResponder: (e: GestureResponderEvent) => {
      const n = e.nativeEvent, dx = n.pageX - touch.current.x0, dy = n.pageY - touch.current.y0;
      return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3;
    },
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const n = e.nativeEvent, t = touch.current;
      send({ t: 'down', x: t.lx / width, y: t.ly / h });
      send({ t: 'move', dx: (n.pageX - t.x0) / width });
      t.lastX = n.pageX; t.lastT = n.timestamp;
      return true; // holds off the page's scroll while turning
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const n = e.nativeEvent, t = touch.current, d = n.pageX - t.lastX, dt = Math.max(1, n.timestamp - t.lastT);
      t.vx = t.vx * 0.4 + ((d / width) * 1000 / dt) * 0.6;
      t.lastX = n.pageX; t.lastT = n.timestamp;
      if (d) send({ t: 'move', dx: d / width });
    },
    onResponderRelease: () => send({ t: 'up', vx: touch.current.vx }),
    onResponderTerminate: () => send({ t: 'up', vx: 0 }),
  };

  const label = (k: FamilyKey) => {
    if (facing?.key === k) {
      const a = FAMILY_ASPECTS[k][facing.i];
      const p = view.aspects[a];
      return { text: `${aspectName(a)} ${p?.total ? `${p.done} of ${p.total}` : 'nothing today'}`, color: ASPECT_COLOR[a] };
    }
    return { text: FAMILY_LABEL[k], color: null };
  };
  const a11y = view.families.map((f) => `${FAMILY_LABEL[f.key]} ${f.done} of ${f.total} done`).join(', ');
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
      <View
        style={StyleSheet.absoluteFill}
        {...drag}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Today as three crystals. ${a11y}.`}
      />
      {scene && ready ? labels.map((l) => {
        const t = label(l.key);
        return (
          <View key={l.key} pointerEvents="none" style={[s.label, { left: l.x * width - 70, top: l.y * h - 10 }]}>
            <Text numberOfLines={1} style={[s.labelText, t.color ? { color: t.color } : null]}>{t.text}</Text>
          </View>
        );
      }) : null}
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
  label: { position: 'absolute', width: 140, alignItems: 'center' },
  labelText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted, fontVariant: ['tabular-nums'] },
  total: { position: 'absolute', left: 0, right: 0, bottom: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  totalNum: { fontFamily: F.semibold, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: C.text, fontVariant: ['tabular-nums'] },
  totalOf: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
});
