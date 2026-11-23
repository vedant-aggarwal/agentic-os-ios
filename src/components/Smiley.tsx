import * as Haptics from 'expo-haptics';
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { gaze } from '@/lib/gaze';
import { onHeart, onPetEvent, pet, useSadness } from '@/lib/pet';
import { PET_OK, PetView } from '@/pet/PetView';
import { useBigPet, useBigPetOut } from '@/pet/presence';
import type { PetCfg, PetHandle, PetMsg } from '@/pet/types';

// The mood pet: a small golden furball with big wet eyes, drawn live in 3D by pet-scene/ (one raymarching shader in a
// WebView, its own little physics and moods in pet-scene/sim.js). This component places it and feeds it: how sad it
// is (hours since the last logged mood), the logger's grid point and reactions, rubs, hearts, and where the finger is
// on Today. Until the scene has drawn its first frame a still of it stands in, so it never pops in empty.

/** The canvas reaches past the pet's square: up for the hearts, out to the sides for the glints. In units of size. */
export const PET_PAD = { l: 0.34, r: 0.34, t: 0.95, b: 0.2 } as const;
/** From this size up it is the logger's pet: full detail and landing thumps, and the top bar's pet steps aside. */
const BIG = 64;

// stills rendered by pet-scene/posters.cjs, framed exactly like the canvas
const POSTERS = [
  { at: 0, src: require('../../assets/pet/pet-sad0.png') },
  { at: 0.3, src: require('../../assets/pet/pet-sad03.png') },
  { at: 0.6, src: require('../../assets/pet/pet-sad06.png') },
  { at: 1, src: require('../../assets/pet/pet-sad1.png') },
];
const posterFor = (sad: number) => POSTERS.reduce((a, b) => (Math.abs(b.at - sad) < Math.abs(a.at - sad) ? b : a)).src;

const petNow = () => ({
  drive: pet.drive.get(), val: pet.val.get(), nrg: pet.nrg.get(), joy: pet.joy.get(),
  worry: pet.worry.get(), anger: pet.anger.get(), think: pet.think.get(),
});

// a landing, felt: the scene says how hard
function thump(k: string) {
  if (Platform.OS === 'web') return;
  const style = k === 'rigid' ? Haptics.ImpactFeedbackStyle.Rigid : k === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft;
  Haptics.impactAsync(style).catch(() => {});
}

type Outbox = {
  state: Record<string, number | boolean> | null;
  gaze: { x: number; y: number; on: boolean } | null;
  rub: { fx: number; fy: number; dx: number } | null;
  timer: ReturnType<typeof setTimeout> | null;
  last: number;
};

/**
 * size: the pet's square in pt (30 in the top bar, about 124 in the logger). settleMs: when the pet arrives by an
 * animation, how long until it sits still (it measures itself again then, to look at the finger from the right
 * place). active: false pauses it (covered by a page). sadness: overrides the live value. always: stays out even
 * while the logger's pet is (the dev page shows both).
 */
export function Smiley({ size = 30, settleMs = 0, active = true, shadow = true, sadness, always = false }: {
  size?: number; settleMs?: number; active?: boolean; shadow?: boolean; sadness?: number; always?: boolean;
}) {
  const big = size >= BIG;
  const reduce = useReducedMotion();
  const sadLive = useSadness();
  const sad = Math.min(1, Math.max(0, sadness ?? sadLive));
  useBigPet(big && !always);
  const away = useBigPetOut() && !big && !always; // the logger's pet is out: this one has flown out of its button
  const running = active && !away;

  const view = useRef<PetHandle>(null);
  const box = useRef<ComponentRef<typeof View>>(null);
  const center = useRef({ x: 0, y: 0, ok: false });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pad = { l: PET_PAD.l * size, r: PET_PAD.r * size, t: PET_PAD.t * size, b: PET_PAD.b * size };

  // read by the page once; it settles into this mood before its first frame
  const cfg = useMemo<PetCfg>(() => ({
    size, small: !big, box: { x: pad.l, y: pad.t, s: size }, dpr: big ? 2 : 3, shadow: shadow ? 1 : 0,
    state: { sad, reduce, ...petNow() },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // what goes to the scene: at most about 30 batches a second
  const out = useRef<Outbox>({ state: null, gaze: null, rub: null, timer: null, last: 0 });
  const flush = useCallback(() => {
    const o = out.current;
    if (o.timer) { clearTimeout(o.timer); o.timer = null; }
    o.last = Date.now();
    const m: PetMsg[] = [];
    if (o.state) m.push({ t: 'state', ...o.state });
    if (o.gaze) m.push({ t: 'gaze', ...o.gaze });
    if (o.rub) m.push({ t: 'rub', on: true, ...o.rub });
    o.state = o.gaze = o.rub = null;
    if (m.length) view.current?.send(m.length === 1 ? m[0] : { t: 'batch', m });
  }, []);
  const soon = useCallback(() => {
    const o = out.current;
    if (!o.timer) o.timer = setTimeout(flush, Math.max(0, 33 - (Date.now() - o.last)));
  }, [flush]);
  const setState = useCallback((s: Record<string, number | boolean>) => {
    const o = out.current;
    o.state = { ...o.state, ...s };
    soon();
  }, [soon]);
  useEffect(() => () => { const o = out.current; if (o.timer) clearTimeout(o.timer); }, []);

  // his mood: the logger's values and the sadness of a mood not logged
  const onPet = useCallback((drive: number, val: number, nrg: number, joy: number, worry: number, anger: number, think: number) => {
    setState({ drive, val, nrg, joy, worry, anger, think });
  }, [setState]);
  useAnimatedReaction(
    () => [pet.drive.value, pet.val.value, pet.nrg.value, pet.joy.value, pet.worry.value, pet.anger.value, pet.think.value],
    (v, p) => {
      if (p && v.every((x, i) => Math.abs(x - p[i]) < 0.003)) return;
      scheduleOnRN(onPet, v[0], v[1], v[2], v[3], v[4], v[5], v[6]);
    },
    [onPet],
  );
  useEffect(() => { setState({ sad, reduce }); }, [sad, reduce, setState]);

  // the finger anywhere on Today: it looks there (relative to its own centre, in pt)
  const measure = useCallback(() => {
    box.current?.measureInWindow((x, y, w, h) => { if (w > 0) center.current = { x: x + w / 2, y: y + h / 2, ok: true }; });
  }, []);
  useEffect(() => {
    const t = setTimeout(measure, Math.max(settleMs, 60));
    return () => clearTimeout(t);
  }, [measure, settleMs]);
  const onGaze = useCallback((x: number, y: number, on: boolean) => {
    const c = center.current;
    if (!c.ok) return;
    out.current.gaze = { x: x - c.x, y: y - c.y, on };
    soon();
  }, [soon]);
  useAnimatedReaction(
    () => gaze.value,
    (g, p) => {
      if (p && g.x === p.x && g.y === p.y && g.active === p.active) return;
      scheduleOnRN(onGaze, g.x, g.y, g.active);
    },
    [onGaze],
  );

  // rubs, reactions and hearts
  useEffect(() => onPetEvent((e) => {
    const o = out.current;
    if (e.t === 'rub' && e.on) {
      o.rub = { fx: e.fx, fy: e.fy, dx: (o.rub?.dx ?? 0) + e.dx };
      soon();
    } else if (e.t === 'rub') {
      flush();
      view.current?.send({ t: 'rub', on: false, strong: e.strong });
    } else {
      flush();
      view.current?.send({ t: 'react', face: e.face });
    }
  }), [flush, soon]);
  useEffect(() => onHeart(() => view.current?.send({ t: 'heart' })), []);

  // paused while covered, or while the logger's pet is out
  useEffect(() => { view.current?.send({ t: running ? 'resume' : 'pause' }); }, [running]);

  const onMessage = useCallback((m: PetMsg) => {
    if (m.t === 'ready') {
      setReady(true);
      setState({ sad, reduce, ...petNow() });
      view.current?.send({ t: running ? 'resume' : 'pause' });
    } else if (m.t === 'haptic') thump(String(m.k));
    else if (m.t === 'error') {
      setFailed(true);
      if (__DEV__) console.warn('pet scene:', m.msg);
    }
  }, [sad, reduce, running, setState]);

  // the still fades out under the live pet once it has drawn
  const live = useSharedValue(0);
  useEffect(() => { live.set(withTiming(ready && !failed ? 1 : 0, { duration: 220 })); }, [ready, failed, live]);
  const still = useAnimatedStyle(() => ({ opacity: 1 - live.value }));

  return (
    <View ref={box} onLayout={measure} pointerEvents="none" style={[{ width: size, height: size }, away && s.away]}>
      <View pointerEvents="none" style={[s.canvas, { left: -pad.l, top: -pad.t, width: size + pad.l + pad.r, height: size + pad.t + pad.b }]}>
        {PET_OK && !failed ? <PetView ref={view} cfg={cfg} onMessage={onMessage} /> : null}
        <Animated.Image source={posterFor(sad)} style={[StyleSheet.absoluteFill, s.poster, still]} resizeMode="contain" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  poster: { width: '100%', height: '100%' }, // without it the still draws at the asset's own 504x645 until the live pet's first frame
  canvas: { position: 'absolute' },
  away: { opacity: 0 },
});
