import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '@/components/Glass';
import { Plus } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { Glyph, Icon } from '@/aspects/kit/controls';
import { haptic, tint } from '@/aspects/kit/tokens';
import { pickPhoto } from '@/aspects/body/pick';
import { noraUi } from '@/nora/state';
import { ASPECT_COLOR, C, F } from '@/theme';
import { useCapture } from './data';
import {
  COLUMNS, dayMinute, focusFrame, FRAMES, frameOf, nowItems, tickOf, waterBehind, type FrameId, type NowItem, type TickId,
} from './moments';
import { BODY, BOOK, Chip, DROP, Field, FRAME_H, FRAME_W, Label, NowCard, QUICK, RollFrame, s as p, SPARK, Tap, TickRow, Toast, WaterRow, type Mode } from './parts';

// Quick capture: the dock's + opens one panel that logs anything the day asks for, in a tap or two. It grows out of
// the + (which turns into its close button, still under the thumb), and holds, top to bottom:
//   Photos   the day's roll: wake-up drink, body, face, then the five meals, scrolled to this hour's frame. A photo
//            flies from the middle of the screen into its frame, so it is clear where it went.
//   Water    one mark per 250 ml of the target; +250 adds a glass.
//   Self     Body, Mind and Soul side by side, each a short list of ticks.
//   Now      up to three actions for this hour, nearest the thumb.
//   A line   add a task (area, today, tag Nora), or a journal line or a book page when one of those asked for it;
//            the mic beside it talks to Nora (tap: chat with the mic on; hold: a voice note, sent on release).
// It stays open after each capture, so several can go in one visit. Where each write lands: ./data.ts.

const NORA = '#F0457A';
const OPEN = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const FLY = { duration: 520, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const GAP = 10; // between frames
const hmNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const roundHm = (hm: string) => { const [h, m] = hm.split(':').map(Number); const t = h * 60 + Math.floor(m / 5) * 5; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const shiftHm = (hm: string, d: number) => { const [h, m] = hm.split(':').map(Number); const t = (h * 60 + m + d + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function Capture({ open, from, floor, onClose }: {
  open: boolean;
  /** the + button's centre on screen: the panel grows from it and its close button sits on it */
  from: { x: number; y: number };
  /** the screen y the panel's bottom edge stays above (clear of the dock's orb and its ring) */
  floor: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const pv = useSharedValue(0);
  useEffect(() => {
    if (open) { pv.set(withSpring(1, OPEN)); return; }
    pv.set(withTiming(0, { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.System }));
    const id = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(id);
  }, [open, pv]);
  if (!mounted) return null;
  return <Surface p={pv} open={open} from={from} floor={floor} onClose={onClose} />;
}

type Rect = { x: number; y: number; w: number; h: number };
type Flight = { key: number; uri: string; frame: FrameId; to: Rect };

function Surface({ p: pv, open, from, floor, onClose }: {
  p: SharedValue<number>; open: boolean; from: { x: number; y: number }; floor: number; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const d = useCapture();
  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((t: string | null) => setToast(t), []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id); }, [toast]);
  const fail = useCallback((e: unknown) => { haptic.warn(); setToast((e as Error).message); }, []);

  // ── the moment ──
  const [minute, setMinute] = useState(dayMinute);
  useEffect(() => { const id = setInterval(() => setMinute(dayMinute()), 30_000); return () => clearInterval(id); }, []);
  const doneFrames = useMemo(() => new Set(FRAMES.filter((f) => d.frames[f.id].status !== 'empty').map((f) => f.id)), [d.frames]);
  const now = useMemo(() => nowItems({ now: minute, doneFrames, doneTicks: d.doneTicks, waterBehind: waterBehind(d.water, d.waterTarget, minute) }), [minute, doneFrames, d.doneTicks, d.water, d.waterTarget]);
  const focus = useMemo(() => focusFrame(minute), [minute]);

  // ── back, escape ──
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (Platform.OS === 'web') globalThis.addEventListener?.('keydown', key);
    return () => { sub.remove(); if (Platform.OS === 'web') globalThis.removeEventListener?.('keydown', key); };
  }, [open, onClose]);

  // ── the keyboard lifts the panel ──
  const lift = useSharedValue(0);
  const base = height - floor;
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      lift.set(withTiming(Math.max(0, e.endCoordinates.height + 8 - base), { duration: e.duration || 250, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      lift.set(withTiming(0, { duration: e?.duration || 250, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    });
    return () => { show.remove(); hide.remove(); };
  }, [base, lift]);

  // ── motion: the scrim, the panel growing out of the +, the + turning into × ──
  const scrim = useAnimatedStyle(() => ({ opacity: pv.value }));
  const grow = useAnimatedStyle(() => ({
    opacity: Math.min(1, pv.value * 1.6),
    transform: [{ translateY: (1 - pv.value) * 14 - lift.value }, { scale: 0.94 + 0.06 * pv.value }],
  }));
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${45 * pv.value}deg` }] }));

  // ── the line at the bottom ──
  const [mode, setMode] = useState<Mode>({ kind: 'task' });
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [due, setDue] = useState(true);
  const [tagNora, setTagNora] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const toTask = useCallback(() => { setMode({ kind: 'task' }); setText(''); }, []);
  const ask = (m: Mode) => { setMode(m); setText(''); setTimeout(() => input.current?.focus(), 60); };

  const submit = async () => {
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      if (mode.kind === 'journal') {
        await d.journalLine(v); haptic.medium(); say("In today's journal"); toTask(); input.current?.blur();
      } else if (mode.kind === 'page') {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n) || n < 0) throw new Error('A page number, like 142.');
        say(await d.page(n)); haptic.medium(); toTask(); input.current?.blur();
      } else {
        say(await d.task({ title: v, area, today: due, tagNora })); haptic.medium(); setText(''); setTagNora(false);
      }
    } catch (e) { fail(e); }
    setBusy(false);
  };

  // ── wake: logged the moment it is tapped, then the time can be moved ──
  const wake = async () => {
    const hm = d.wakeAt ?? roundHm(hmNow());
    setMode({ kind: 'wake', hm });
    if (!d.wakeAt) {
      try { await d.wake(hm); haptic.medium(); say(`Woke at ${hm}`); } catch (e) { fail(e); }
    }
  };
  const moveWake = (delta: number) => { if (mode.kind === 'wake') { haptic.tick(); setMode({ kind: 'wake', hm: shiftHm(mode.hm, delta) }); } };
  const saveWake = async () => {
    if (mode.kind !== 'wake') return;
    const hm = mode.hm;
    toTask();
    if (hm === d.wakeAt) return;
    try { await d.wake(hm); haptic.medium(); say(`Woke at ${hm}`); } catch (e) { fail(e); }
  };

  // ── ticks ──
  const tick = async (id: TickId) => {
    const t = tickOf(id);
    if (t.kind === 'time') return void wake();
    if (t.kind === 'line') return ask({ kind: 'journal' });
    if (t.kind === 'page') { if (!d.book) { fail(new Error('No book open. Pick one in Mind > Read.')); return; } return ask({ kind: 'page' }); }
    const on = !d.doneTicks.has(id);
    if (id === 'clean' && !on) { say('Pledged for today'); return; }
    if (id === 'clean' && !d.cleanReady) { fail(new Error('Start Clean in Soul first.')); return; }
    if (on) haptic.medium(); else haptic.light();
    try { const msg = await d.toggle(id, on); if (msg) say(msg); } catch (e) { fail(e); }
  };

  // ── photos ──
  const rollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const rollW = useRef(0);
  const frameRefs = useRef<Partial<Record<FrameId, ComponentRef<typeof View> | null>>>({});
  const [flight, setFlight] = useState<Flight | null>(null);
  const flights = useRef(0);
  const [landed, setLanded] = useState<{ frame: FrameId | null; n: number }>({ frame: null, n: 0 });
  const scrollTo = useCallback((id: FrameId, animated: boolean) => {
    // the frame sits third from the left, frames lined up with the panel's edge, the earlier ones a swipe back
    const i = FRAMES.findIndex((f) => f.id === id);
    const max = FRAMES.length * (FRAME_W + GAP) - GAP + 36 - rollW.current;
    rollRef.current?.scrollTo({ x: Math.max(0, Math.min(max, (i - 2) * (FRAME_W + GAP))), animated });
  }, []);
  const measure = (id: FrameId) => new Promise<Rect | null>((res) => {
    const v = frameRefs.current[id];
    if (!v) return res(null);
    v.measureInWindow((x, y, w, h) => res(w ? { x, y, w, h } : null));
  });

  const shoot = async (id: FrameId) => {
    const f = frameOf(id);
    let picked;
    try { picked = await pickPhoto(); } catch (e) { fail(e); return; }
    if (!picked) return;
    const uri = typeof picked.uri === 'string' ? picked.uri : URL.createObjectURL(picked.uri);
    if (!reduce) {
      scrollTo(id, false);
      await new Promise((r) => setTimeout(r, 40));
      const to = await measure(id);
      if (to) setFlight({ key: ++flights.current, uri, frame: id, to });
    }
    d.photo(f, picked, uri).then((msg) => { say(msg); if (reduce) haptic.success(); }, fail);
  };
  const onLand = useCallback((id: FrameId) => {
    setFlight(null);
    setLanded((l) => ({ frame: id, n: l.n + 1 }));
    haptic.success();
  }, []);

  const tapFrame = (id: FrameId) => {
    const st = d.frames[id];
    if (st.status === 'sending') return;
    if (st.status === 'failed') d.retry(id);
    void shoot(id);
  };

  // ── now ──
  const runNow = (n: NowItem) => {
    if (n.kind === 'frame') return void tapFrame(n.id);
    if (n.kind === 'water') return void d.addWater(1).catch(fail);
    void tick(n.id);
  };

  const filled = FRAMES.filter((f) => d.frames[f.id].status !== 'empty').length;
  const tag = mode.kind === 'journal' ? { text: 'Journal', color: ASPECT_COLOR.soul } : mode.kind === 'page' ? { text: 'Book', color: ASPECT_COLOR.mind } : null;
  const placeholder = mode.kind === 'journal' ? 'A line for today' : mode.kind === 'page' ? (d.book ? `Page in ${d.book.title}` : 'Page') : 'Add a task';
  // composing: the panel steps back to the line (and its chips) while the field has focus or holds words
  const composing = typing || (mode.kind !== 'wake' && text.length > 0);
  const showAll = !composing;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, scrim]}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, st.dim]} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close capture" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View accessibilityViewIsModal layout={LinearTransition.duration(220)}
        style={[st.panel, { bottom: height - floor, maxHeight: floor - insets.top - 8, transformOrigin: `${from.x - 8}px 100%` }, grow]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.body, composing && mode.kind !== 'task' && st.bodyEmpty]}>
          {showAll ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={st.sections}>
              <View>
                <View style={st.pad}><Label right={`${filled} of ${FRAMES.length}`}>Photos</Label></View>
                <ScrollView ref={rollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.roll}
                  snapToInterval={FRAME_W + GAP} decelerationRate="fast"
                  onLayout={(e) => { rollW.current = e.nativeEvent.layout.width; scrollTo(focus, false); }}>
                  {FRAMES.map((f) => (
                    <RollFrame key={f.id} ref={(r) => { frameRefs.current[f.id] = r; }} frame={f} st={d.frames[f.id]} focus={f.id === focus}
                      hidden={flight?.frame === f.id} landed={landed.frame === f.id ? landed.n : 0} onPress={() => tapFrame(f.id)} />
                  ))}
                </ScrollView>
              </View>

              <View style={st.pad}>
                <WaterRow glasses={d.water} target={d.waterTarget}
                  onAdd={() => { void d.addWater(1).catch(fail); }}
                  onTakeBack={() => { haptic.light(); void d.addWater(-1).then(() => say('One glass taken back'), fail); }} />
              </View>

              <View style={[st.pad, st.columns]}>
                {COLUMNS.map((c) => (
                  <View key={c.aspect} style={st.column}>
                    <Text style={[st.colHead, { color: ASPECT_COLOR[c.aspect] }]}>{c.label}</Text>
                    {c.ticks.map((id) => {
                      const t = tickOf(id);
                      const meta = id === 'wake' ? d.wakeAt : id === 'book' && d.book ? `p. ${d.book.page}` : id === 'clean' && d.cleanDay != null ? `Day ${d.cleanDay}` : null;
                      return <TickRow key={id} label={t.label} meta={meta} hint={id === 'night' ? 'Routine' : undefined} color={ASPECT_COLOR[c.aspect]} done={d.doneTicks.has(id)} onPress={() => { void tick(id); }} />;
                    })}
                  </View>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {showAll && now.length ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={st.pad}>
              <Label right={hmNow()}>Now</Label>
              <View style={st.nowRow}>
                {now.map((n) => <NowFor key={n.kind === 'water' ? 'water' : `${n.kind}-${n.id}`} n={n} water={d.water} target={d.waterTarget} onPress={() => runNow(n)} />)}
              </View>
            </Animated.View>
          ) : null}

          {composing && mode.kind === 'task' ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={st.chips}>
                <Chip text="Today" on={due} color={C.text} onPress={() => setDue(!due)} />
                {d.areas.map((a) => (
                  <Chip key={a.slug} text={a.name} on={area === a.slug} color={a.aspect ? ASPECT_COLOR[a.aspect] : C.text} onPress={() => setArea(area === a.slug ? null : a.slug)} />
                ))}
                <Chip text="Nora" on={tagNora} color={NORA} onPress={() => setTagNora(!tagNora)}
                  glyph={<Glyph sf="sparkle" d={SPARK} size={14} color={tagNora ? NORA : C.muted} filled />} />
              </ScrollView>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={st.line}>
          {mode.kind === 'wake' ? (
            <WakeLine hm={mode.hm} onMove={moveWake} onDone={() => { void saveWake(); }} />
          ) : (
            <Field ref={input} value={text} onChange={setText} onSubmit={() => { void submit(); }} placeholder={placeholder} tag={tag}
              onTag={() => { toTask(); input.current?.blur(); }} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
              keyboard={mode.kind === 'page' ? 'number-pad' : 'default'} busy={busy} />
          )}
          <Mic onClose={onClose} />
        </View>
      </Animated.View>

      {/* the + it opened from, now its close button, on the same spot */}
      <Pressable accessibilityRole="button" accessibilityLabel="Close capture" onPress={onClose} hitSlop={6}
        style={[st.close, { left: from.x - 24, top: from.y - 24 }]}>
        <Animated.View style={[st.closeBody, scrim]}><Glass radius={24} /></Animated.View>
        <Animated.View style={turn}><Sym name="plus" size={22} fallback={<Plus />} /></Animated.View>
      </Pressable>

      {flight ? <FlightLayer key={flight.key} f={flight} width={width} height={height} onLand={onLand} /> : null}
      <View pointerEvents="none" style={[st.toastAt, { top: insets.top + 8 }]}><Toast text={toast} /></View>
    </View>
  );
}

/** A Now card for whatever the moment asks for. */
function NowFor({ n, water, target, onPress }: { n: NowItem; water: number; target: number; onPress: () => void }) {
  if (n.kind === 'water') {
    return <NowCard title="+250 ml" sub={`${(water * 0.25).toFixed(2).replace(/\.?0+$/, '')} of ${(target * 0.25).toFixed(2).replace(/\.?0+$/, '')} L`} color={BODY}
      glyph={<Glyph sf="drop" d={DROP} size={20} color={BODY} />} onPress={onPress} />;
  }
  if (n.kind === 'frame') {
    const f = frameOf(n.id);
    const sub = f.kind === 'meal' ? 'Meal photo' : f.id === 'drink' ? 'On waking' : f.id === 'body' ? 'After shower' : 'After skincare';
    return <NowCard title={f.label} sub={sub} color={BODY}
      glyph={<Icon name="camera" size={20} color={BODY} />} onPress={onPress} />;
  }
  const t = tickOf(n.id);
  const color = ASPECT_COLOR[t.aspect];
  const glyph = t.kind === 'time' ? <Icon name="clock" size={20} color={color} />
    : t.kind === 'line' ? <Icon name="pencil" size={20} color={color} />
      : t.kind === 'page' ? <Glyph sf="book" d={BOOK} size={20} color={color} />
        : <Icon name="check" size={20} color={color} />;
  return <NowCard title={t.label === 'Woke' ? 'Woke up' : t.label} sub={t.verb} color={color} glyph={glyph} onPress={onPress} />;
}

/** Wake time: logged already; nudge it in 5 minute steps. */
function WakeLine({ hm, onMove, onDone }: { hm: string; onMove: (d: number) => void; onDone: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(140)} style={[p.field, st.wake]}>
      <Text numberOfLines={1} style={st.wakeLabel}>Woke</Text>
      <Tap label="5 minutes earlier" onPress={() => onMove(-5)} feel="none" style={st.step}><Icon name="minus" size={16} color={C.text} /></Tap>
      <Text style={[st.wakeTime, p.num]} accessibilityLiveRegion="polite">{hm}</Text>
      <Tap label="5 minutes later" onPress={() => onMove(5)} feel="none" style={st.step}><Icon name="plus" size={16} color={C.text} /></Tap>
      <View style={{ flex: 1 }} />
      <Tap label="Done" onPress={onDone} feel="none" style={st.wakeDone}><Text style={st.wakeDoneText}>Done</Text></Tap>
    </Animated.View>
  );
}

/** Nora's mic: tap opens her chat listening; hold records a voice note that goes when the finger lifts. */
function Mic({ onClose }: { onClose: () => void }) {
  const held = useRef(false);
  const v = useSharedValue(0);
  const ring = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 1 + 0.12 * v.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Talk to Nora" accessibilityHint="Tap to talk in her chat. Hold to send a voice note."
      delayLongPress={280} hitSlop={6}
      onPressIn={() => { v.set(withSpring(0.5, QUICK)); }}
      onLongPress={() => { held.current = true; v.set(withSpring(1, QUICK)); haptic.medium(); noraUi.voiceNote(); }}
      onPressOut={() => {
        v.set(withSpring(0, QUICK));
        if (held.current) { held.current = false; noraUi.voiceNoteSend(); onClose(); }
      }}
      onPress={() => { if (held.current) return; haptic.light(); onClose(); noraUi.openChat({ mic: true }); }}
      style={st.mic}>
      <Animated.View style={[StyleSheet.absoluteFill, st.micRing, ring]} />
      <Icon name="mic" size={20} color={C.text} />
    </Pressable>
  );
}

/** The picked photo: it shows in the middle for a beat, then flies into its frame and the frame takes it. */
function FlightLayer({ f, width, height, onLand }: { f: Flight; width: number; height: number; onLand: (id: FrameId) => void }) {
  const w0 = Math.min(232, width * 0.58), h0 = (w0 * FRAME_H) / FRAME_W;
  const x0 = (width - w0) / 2, y0 = height * 0.4 - h0 / 2;
  const a = useSharedValue(0), k = useSharedValue(0);
  const end = f.to.w / w0;
  const dx = f.to.x + f.to.w / 2 - (x0 + w0 / 2), dy = f.to.y + f.to.h / 2 - (y0 + h0 / 2);
  useEffect(() => {
    a.set(withTiming(1, { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    k.set(withDelay(420, withSpring(1, FLY, (done) => { if (done) runOnJS(onLand)(f.frame); })));
  }, [a, k, f.frame, onLand]);
  const style = useAnimatedStyle(() => {
    const sc = (1 + (end - 1) * k.value) * (0.94 + 0.06 * a.value);
    return {
      opacity: a.value,
      borderRadius: 22 + (14 / end - 22) * k.value,
      transform: [{ translateX: dx * k.value }, { translateY: dy * k.value }, { scale: sc }],
    };
  });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[st.flight, { left: x0, top: y0, width: w0, height: h0 }, style]}>
        <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  dim: { backgroundColor: 'rgba(7,8,11,0.62)' },
  panel: {
    position: 'absolute', left: 8, right: 8, borderRadius: 34, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: '#171920', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
  },
  body: { paddingTop: 20, gap: 22 },
  bodyEmpty: { paddingTop: 0 },
  sections: { gap: 22 },
  pad: { paddingHorizontal: 18 },
  roll: { paddingHorizontal: 18, gap: GAP },
  columns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1, minWidth: 0 },
  colHead: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  nowRow: { flexDirection: 'row', gap: 8 },
  chips: { paddingHorizontal: 18, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  micRing: { borderRadius: 24, backgroundColor: tint(NORA, 0.32), borderWidth: 1, borderColor: tint(NORA, 0.7) },
  wake: { paddingLeft: 16 },
  wakeLabel: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted, marginRight: 4 },
  wakeTime: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text, minWidth: 50, textAlign: 'center' },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  wakeDone: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: tint(BODY, 0.18) },
  wakeDoneText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: BODY },
  close: { position: 'absolute', width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeBody: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 24 },
  flight: { position: 'absolute', overflow: 'hidden', backgroundColor: '#22252D', boxShadow: '0 18px 40px rgba(0,0,0,0.55)' },
  toastAt: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
