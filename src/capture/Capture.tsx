import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
import { useDictate } from '@/nora/useDictate';
import { ASPECT_COLOR, C, F, type AspectKey } from '@/theme';
import { openTask } from '@/work/bus';
import { DESCRIBE_KINDS, SEALED, useCapture, type Described, type DescribeKind, type SmartItem } from './data';
import {
  COLUMNS, dayMinute, focusFrame, FRAMES, frameOf, nowItems, tickOf, waterBehind, type FrameId, type NowItem, type TickId,
} from './moments';
import {
  BODY, BOOK, Chip, DROP, Field, Label, NowCard, PhotoTile, s as p, SlipRow, SmartButton, SPARK, STOP, Tap, TickRow, TILE_GAP, Toast, WaterRow, type Mode,
} from './parts';
import { takePhoto } from './shoot';

// Quick capture: the dock's + opens one panel that logs anything the day asks for, in a tap or two. It grows out of
// the + (which turns into its close button, still under the thumb), and holds, top to bottom:
//   Photos   the day's slots, all eight in two rows: wake-up drink, body, face, then the five meals. A photo flies
//            from the middle of the screen into its slot, so it is clear where it went. "Smart photo" takes any
//            photo, the PC works out what it is and files it, and the picture flies from the button to that slot.
//   Water    one mark per 250 ml of the target; +250 adds a glass.
//   Self     Body, Mind and Soul side by side, each a short list of ticks; Clean's slip sits under it (held).
//   Now      up to three actions for this hour, nearest the thumb.
//   A line   "Describe anything": a meal, a spend, a task, an idea, a journal line or a weight, typed or said; the PC
//            works out which and files it on its page, and a card says what it did, with Undo and "Not right?" to
//            re-file it as another kind. The line's Task chip turns it into a plain task (aspect, today, tag Nora). A
//            journal line or a book page takes the line over when one of those asked for it. The mic beside it
//            dictates into the line (the app's GPT dictation; nothing goes to Nora or the PC's typing). Tap to start,
//            tap again to stop and edit; the arrow stops and saves in one tap.
// It stays open after each capture, so several can go in one visit. Where each write lands: ./data.ts.

const NORA = '#F0457A';
const OPEN = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const FLY = { duration: 520, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const hmNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const roundHm = (hm: string) => { const [h, m] = hm.split(':').map(Number); const t = h * 60 + Math.floor(m / 5) * 5; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const shiftHm = (hm: string, d: number) => { const [h, m] = hm.split(':').map(Number); const t = (h * 60 + m + d + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

/** What a hold on the + asked the panel to start with (src/capture/QuickFan.tsx); `n` tells one ask from the next. */
export type CaptureStart = { kind: 'smart' | 'dictate' | 'describe' | 'task'; n: number };

export function Capture({ open, from, floor, onClose, start }: {
  open: boolean;
  /** the + button's centre on screen: the panel grows from it and its close button sits on it */
  from: { x: number; y: number };
  /** the screen y the panel's bottom edge stays above (clear of the dock's orb and its ring) */
  floor: number;
  onClose: () => void;
  /** opened from the +'s quick actions: the smart photo, dictation, or the line for a description or a task */
  start?: CaptureStart | null;
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
  return <Surface p={pv} open={open} from={from} floor={floor} onClose={onClose} start={start ?? null} />;
}

type Rect = { x: number; y: number; w: number; h: number };
type Flight = { key: number; uri: string; frame: FrameId; to: Rect; /** where it starts (the smart button); else the middle */ from?: Rect };

function Surface({ p: pv, open, from, floor, onClose, start }: {
  p: SharedValue<number>; open: boolean; from: { x: number; y: number }; floor: number; onClose: () => void; start: CaptureStart | null;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const d = useCapture();
  type Note = { text: string; action?: { label: string; onPress: () => void } | null; n: number };
  const [toast, setToast] = useState<Note | null>(null);
  const notes = useRef(0);
  const say = useCallback((t: string | null, action?: Note['action']) => setToast(t ? { text: t, action: action ?? null, n: ++notes.current } : null), []);
  // an undo stays long enough to reach for
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), toast.action ? 6000 : 2200); return () => clearTimeout(id); }, [toast]);
  const fail = useCallback((e: unknown) => { haptic.warn(); say((e as Error).message); }, [say]);
  /** A toast with Undo; `after` is what it says once taken back. */
  const undoable = useCallback((text: string, undo: () => Promise<unknown>, after: string) =>
    say(text, { label: 'Undo', onPress: () => { setToast(null); haptic.light(); void undo().then(() => say(after), fail); } }), [say, fail]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

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
  const [mode, setMode] = useState<Mode>({ kind: 'describe' });
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState<AspectKey | null>(null);
  const [due, setDue] = useState(true);
  const [tagNora, setTagNora] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const toLine = useCallback(() => { setMode({ kind: 'describe' }); setText(''); }, []);
  // what the last described line became, until he closes it or describes the next
  const [filed, setFiled] = useState<Described | null>(null);
  const [fixing, setFixing] = useState(false);
  // the mic: GPT dictation into this line, the same streamed path as Nora's composer, and nothing else
  const dict = useDictate();
  const talking = dict.state !== 'idle';
  const join = (a: string, b: string) => (a.trim() ? `${a.trim()} ${b}` : b);
  useEffect(() => { if (dict.error) { say(dict.error); dict.clearError(); } }, [dict, say]);
  const micTap = async () => {
    if (dict.state === 'finishing') return;
    if (dict.state === 'idle') {
      if (mode.kind === 'wake') toLine();
      input.current?.blur();
      void dict.start();
      return;
    }
    const words = await dict.stop();
    if (words) setText((t) => join(t, words));
  };
  const ask = (m: Mode) => { setMode(m); setText(''); setTimeout(() => input.current?.focus(), 60); };

  const submit = async () => {
    let v = text.trim();
    if (dict.state === 'recording') { const words = await dict.stop(); v = words ? join(v, words) : v; }
    if (!v || busy) return;
    setBusy(true);
    try {
      if (mode.kind === 'journal') {
        const undo = await d.journalLine(v); haptic.medium(); undoable("In today's journal", undo, 'Line taken back'); toLine(); input.current?.blur();
      } else if (mode.kind === 'page') {
        const n = Math.round(Number(v.replace(/[^0-9.]/g, '')));
        if (!v.match(/\d/) || !Number.isFinite(n) || n < 0) throw new Error('A page number, like 142.');
        const r = await d.page(n); haptic.medium(); undoable(r.said, r.undo, 'Sitting taken back'); toLine(); input.current?.blur();
      } else if (mode.kind === 'describe') {
        setFiled(null); setFixing(false);
        const it = await d.describe(v);
        if (!alive.current) return;
        haptic.success(); setText(''); input.current?.blur(); setFiled(it);
      } else {
        say(await d.task({ title: v, aspect, today: due, tagNora })); haptic.medium(); setText(''); setTagNora(false);
      }
    } catch (e) { fail(e); }
    setBusy(false);
  };

  // ── wake: logged the moment it is tapped, then the time can be moved; tapped again, it opens at the saved time ──
  const wake = async () => {
    const hm = d.wakeAt ?? roundHm(hmNow());
    setMode({ kind: 'wake', hm });
    if (!d.wakeAt) {
      try { const undo = await d.wake(hm); haptic.medium(); undoable(`Woke at ${hm}`, undo, 'Wake-up taken back'); } catch (e) { fail(e); }
    }
  };
  const moveWake = (delta: number) => { if (mode.kind === 'wake') { haptic.tick(); setMode({ kind: 'wake', hm: shiftHm(mode.hm, delta) }); } };
  const saveWake = async () => {
    if (mode.kind !== 'wake') return;
    const hm = mode.hm;
    toLine();
    if (hm === d.wakeAt) return;
    try { const undo = await d.wake(hm); haptic.medium(); undoable(`Woke at ${hm}`, undo, d.wakeAt ? `Back to ${d.wakeAt}` : 'Wake-up taken back'); } catch (e) { fail(e); }
  };

  // ── ticks ──
  const tick = async (id: TickId) => {
    const t = tickOf(id);
    const on = !d.doneTicks.has(id);
    // Woke opens its time (the saved one once logged, to move it); Journal takes another line and Book the page he is
    // on now. A tap never wipes what they logged: each logging toast has Undo instead.
    if (t.kind === 'time') return void wake();
    if (t.kind === 'line') return ask({ kind: 'journal' });
    if (t.kind === 'page') { if (!d.book) { fail(new Error('No book open. Pick one in Mind > Read.')); return; } return ask({ kind: 'page' }); }
    if (id === 'clean' && !d.cleanReady) { fail(new Error('Start Clean in Soul first.')); return; }
    if (on) haptic.medium(); else haptic.light();
    try {
      const r = await d.toggle(id, on);
      if (typeof r === 'string') say(r);
      else if (r) undoable(r.said, r.undo, 'Put back');
    } catch (e) { fail(e); }
  };

  // ── photos ──
  const frameRefs = useRef<Partial<Record<FrameId, ComponentRef<typeof View> | null>>>({});
  const [flight, setFlight] = useState<Flight | null>(null);
  const flights = useRef(0);
  const [landed, setLanded] = useState<{ frame: FrameId | null; n: number }>({ frame: null, n: 0 });
  const rectOf = (v: ComponentRef<typeof View> | null | undefined) => new Promise<Rect | null>((res) => {
    if (!v) return res(null);
    v.measureInWindow((x, y, w, h) => res(w ? { x, y, w, h } : null));
  });
  const measure = (id: FrameId) => rectOf(frameRefs.current[id]);

  const shoot = async (id: FrameId) => {
    const f = frameOf(id);
    let picked;
    try { picked = await takePhoto(); } catch (e) { fail(e); return; }
    if (!picked) return;
    const uri = typeof picked.uri === 'string' ? picked.uri : URL.createObjectURL(picked.uri);
    // a body or face photo doesn't fly to its slot: its one look is the sealed preview
    if (!reduce && !SEALED.has(id)) {
      const to = await measure(id);
      if (to) setFlight({ key: ++flights.current, uri, frame: id, to });
    }
    d.photo(f, picked, uri).then((msg) => { say(msg); if (reduce || SEALED.has(id)) haptic.success(); }, fail);
  };
  const onLand = useCallback((id: FrameId) => {
    setFlight(null);
    setLanded((l) => ({ frame: id, n: l.n + 1 }));
    haptic.success();
  }, []);

  // the smart photo: picked, read by the PC, filed; the picture waits in the button, then flies to its slot
  const smartRef = useRef<ComponentRef<typeof View>>(null);
  const [reading, setReading] = useState<string | null>(null);
  const smart = async () => {
    if (reading) return;
    let picked;
    try { picked = await takePhoto(); } catch (e) { fail(e); return; }
    if (!picked) return;
    const uri = typeof picked.uri === 'string' ? picked.uri : URL.createObjectURL(picked.uri);
    setReading(uri);
    try {
      const it = await untilRead(await d.smart(picked, focus), d.smartGet, () => alive.current);
      if (!alive.current) return;
      if (it.status === 'reading') { say('Still reading it. It files itself; check back in a minute.'); return; }
      if (it.status !== 'filed') { haptic.warn(); say(it.said ?? "Couldn't place that photo."); return; }
      const frame = it.frame && FRAMES.some((f) => f.id === it.frame) ? (it.frame as FrameId) : null;
      const from = frame && !reduce && !SEALED.has(frame) ? await rectOf(smartRef.current) : null;
      const to = frame && !reduce ? await measure(frame) : null;
      d.smartFiled(it, uri);
      if (frame && from && to) setFlight({ key: ++flights.current, uri, frame, to, from });
      else haptic.success();
      const done = it;
      say(it.said ?? 'Filed', it.canUndo ? { label: 'Undo', onPress: () => { setToast(null); void d.smartUndo(done).then(() => say('Taken back'), fail); } } : null);
    } catch (e) { fail(e); } finally { if (alive.current) setReading(null); }
  };

  // ── Clean: a slip, held to log, with an undo ──
  const slipped = async () => {
    haptic.warn();
    try {
      const id = await d.slip();
      say('Slip logged. The run starts again.', { label: 'Undo', onPress: () => { setToast(null); void d.unslip(id).then(() => say('Slip taken back'), fail); } });
    } catch (e) { fail(e); }
  };

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

  // ── a described line: take it back, or file it as another kind ──
  const [fixBusy, setFixBusy] = useState(false);
  const undoFiled = async () => {
    if (!filed || fixBusy) return;
    setFixBusy(true);
    try { await d.describeUndo(filed); haptic.light(); setFiled(null); say('Taken back'); } catch (e) { fail(e); }
    setFixBusy(false);
  };
  const refile = async (kind: DescribeKind) => {
    if (!filed || fixBusy) return;
    setFixBusy(true);
    try { const it = await d.describeAs(filed, kind); haptic.success(); setFiled(it); setFixing(false); } catch (e) { fail(e); }
    setFixBusy(false);
  };

  // a quick action from holding the +: it runs once, just after the panel starts to grow, so the camera or the
  // keyboard comes up over it (the latest handlers, through a ref)
  const acts = useRef({ smart, micTap, ask });
  useEffect(() => { acts.current = { smart, micTap, ask }; });
  const startN = open ? start?.n : undefined, startKind = start?.kind;
  useEffect(() => {
    if (startN == null || !startKind) return;
    const id = setTimeout(() => {
      const a = acts.current;
      if (startKind === 'smart') void a.smart();
      else if (startKind === 'dictate') void a.micTap();
      else a.ask({ kind: startKind });
    }, 120);
    return () => clearTimeout(id);
  }, [startN, startKind]);

  const tag = mode.kind === 'journal' ? { text: 'Journal', color: ASPECT_COLOR.soul } : mode.kind === 'page' ? { text: 'Book', color: ASPECT_COLOR.mind }
    : mode.kind === 'task' ? { text: 'Task', color: C.text } : null;
  const placeholder = mode.kind === 'journal' ? 'A line for today' : mode.kind === 'page' ? (d.book ? `Page in ${d.book.title}` : 'Page')
    : mode.kind === 'task' ? 'Add a task' : 'Describe anything';
  // composing: the panel steps back to the line (and its chips) while the field has focus or holds words
  const composing = typing || talking || (mode.kind !== 'wake' && text.length > 0);
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
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.body, composing && (mode.kind === 'journal' || mode.kind === 'page') && st.bodyEmpty]}>
          {showAll ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={st.sections}>
              <View style={st.pad}>
                <View style={st.photosHead}>
                  <Text style={p.label}>Photos</Text>
                  <SmartButton ref={smartRef} reading={reading} onPress={() => { void smart(); }} />
                </View>
                <View style={st.grid}>
                  {[FRAMES.slice(0, 4), FRAMES.slice(4)].map((row, r) => (
                    <View key={r} style={st.gridRow}>
                      {row.map((f) => (
                        <PhotoTile key={f.id} ref={(x) => { frameRefs.current[f.id] = x; }} frame={f} st={d.frames[f.id]} focus={f.id === focus}
                          hidden={flight?.frame === f.id} landed={landed.frame === f.id ? landed.n : 0} onPress={() => tapFrame(f.id)} />
                      ))}
                    </View>
                  ))}
                </View>
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
                    {c.aspect === 'soul' && d.cleanDay != null ? (
                      <SlipRow onConfirm={() => { void slipped(); }} onTap={() => say('Hold Slipped to log a slip.')} />
                    ) : null}
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

          {composing && mode.kind === 'describe' ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={st.chips}>
                <Chip text="Just a task" on={false} color={C.text} onPress={() => setMode({ kind: 'task' })} />
              </ScrollView>
            </Animated.View>
          ) : null}

          {composing && mode.kind === 'task' ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(100)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={st.chips}>
                <Chip text="Today" on={due} color={C.text} onPress={() => setDue(!due)} />
                {d.aspects.map((a) => (
                  <Chip key={a.key} text={a.name} on={aspect === a.key} color={ASPECT_COLOR[a.key]} onPress={() => setAspect(aspect === a.key ? null : a.key)} />
                ))}
                <Chip text="Nora" on={tagNora} color={NORA} onPress={() => setTagNora(!tagNora)}
                  glyph={<Glyph sf="sparkle" d={SPARK} size={14} color={tagNora ? NORA : C.muted} filled />} />
              </ScrollView>
            </Animated.View>
          ) : null}
        </ScrollView>

        {filed && !composing ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={st.filedAt}>
            <FiledCard it={filed} fixing={fixing} busy={fixBusy} onUndo={() => { void undoFiled(); }} onFix={() => setFixing(!fixing)}
              onAs={(k) => { void refile(k); }} onClose={() => { setFiled(null); setFixing(false); }}
              onOpen={filed.kind === 'task' && filed.ref && filed.status === 'filed' ? () => { const r = filed.ref!; onClose(); openTask({ id: r, title: filed.text }); } : undefined} />
          </Animated.View>
        ) : null}

        <View style={st.line}>
          {mode.kind === 'wake' ? (
            <WakeLine hm={mode.hm} onMove={moveWake} onDone={() => { void saveWake(); }} />
          ) : (
            <Field ref={input} value={text} onChange={setText} onSubmit={() => { void submit(); }} placeholder={placeholder} tag={tag}
              onTag={() => { toLine(); input.current?.blur(); }} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
              keyboard={mode.kind === 'page' ? 'number-pad' : 'default'} busy={busy || dict.state === 'finishing'}
              live={talking ? (dict.live || '') : null} />
          )}
          <Mic state={dict.state} onPress={() => { void micTap(); }} />
        </View>
      </Animated.View>

      {/* the + it opened from, now its close button, on the same spot */}
      <Pressable accessibilityRole="button" accessibilityLabel="Close capture" onPress={onClose} hitSlop={6}
        style={[st.close, { left: from.x - 24, top: from.y - 24 }]}>
        <Animated.View style={[st.closeBody, scrim]}><Glass radius={24} /></Animated.View>
        <Animated.View style={turn}><Sym name="plus" size={22} fallback={<Plus />} /></Animated.View>
      </Pressable>

      {flight ? <FlightLayer key={flight.key} f={flight} width={width} height={height} onLand={onLand} /> : null}
      <View pointerEvents="box-none" style={[st.toastAt, { top: insets.top + 8 }]}><Toast key={toast?.n} text={toast?.text ?? null} action={toast?.action} /></View>
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

const KIND_COLOR: Record<DescribeKind, string> = {
  task: C.text, meal: ASPECT_COLOR.body, spend: ASPECT_COLOR.money, idea: ASPECT_COLOR.growth, journal: ASPECT_COLOR.soul, weight: ASPECT_COLOR.body,
};

/** What a described line became: the kind, where it went, what was filed; Undo, and "Not right?" to file it as another kind. */
function FiledCard({ it, fixing, busy, onUndo, onFix, onAs, onClose, onOpen }: {
  it: Described; fixing: boolean; busy: boolean; onUndo: () => void; onFix: () => void; onAs: (k: DescribeKind) => void; onClose: () => void;
  /** a filed task opens in its full view */ onOpen?: () => void;
}) {
  const kind = DESCRIBE_KINDS.find((k) => k.kind === it.kind);
  const color = it.kind ? KIND_COLOR[it.kind] : C.muted;
  const head = [kind?.label ?? 'Filed', it.where && !it.where.toLowerCase().startsWith((kind?.label ?? '-').toLowerCase()) ? it.where : null, it.by === 'rules' ? 'guessed offline' : null].filter(Boolean).join(' · ');
  return (
    <View style={st.filed} accessibilityLiveRegion="polite">
      <View style={st.filedTop}>
        <View style={[st.filedDot, { backgroundColor: color }]} />
        <Text style={[st.filedHead, { color }]} numberOfLines={1}>{head}</Text>
        <View style={{ flex: 1 }} />
        <Tap label="Close" onPress={onClose} feel="none" style={st.filedX}><Icon name="close" size={12} color={C.muted} /></Tap>
      </View>
      <Pressable accessibilityRole={onOpen ? 'button' : 'text'} accessibilityHint={onOpen ? 'Opens the task' : undefined} disabled={!onOpen} onPress={onOpen}>
        <Text style={st.filedSaid}>{it.said ?? 'Filed'}</Text>
      </Pressable>
      {it.status === 'filed' ? (
        <View style={st.filedActs}>
          {it.canUndo ? <Tap label="Undo" onPress={onUndo} feel="light" style={st.filedBtn}><Text style={st.filedBtnText}>Undo</Text></Tap> : null}
          <Tap label="Not right? File it as something else" onPress={onFix} feel="tick" style={[st.filedBtn, fixing && st.filedBtnOn]}>
            <Text style={st.filedBtnText}>Not right?</Text>
          </Tap>
          {onOpen ? <Tap label="Open the task" onPress={onOpen} feel="light" style={st.filedBtn}><Text style={st.filedBtnText}>Open</Text></Tap> : null}
          {busy ? <ActivityIndicator size="small" color={C.muted} /> : null}
        </View>
      ) : null}
      {fixing ? (
        <View style={st.filedKinds}>
          {DESCRIBE_KINDS.filter((k) => k.kind !== it.kind).map((k) => (
            <Chip key={k.kind} text={k.label} on={false} color={KIND_COLOR[k.kind]} onPress={() => onAs(k.kind)} />
          ))}
        </View>
      ) : null}
    </View>
  );
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

/** Asks the PC again every 1.5 s until it has read the photo, `give` ms pass, or the panel has gone. */
export async function untilRead(first: SmartItem, get: (id: string) => Promise<SmartItem>, alive: () => boolean, give = 240_000) {
  let it = first;
  const t0 = Date.now();
  while (it.status === 'reading' && alive() && Date.now() - t0 < give) {
    await new Promise((r) => setTimeout(r, 1500));
    it = await get(it.id);
  }
  return it;
}

/** The line's mic: a tap starts dictating into the line, a tap stops it. It talks to no one. */
function Mic({ state, onPress }: { state: 'idle' | 'recording' | 'finishing'; onPress: () => void }) {
  const on = state !== 'idle';
  return (
    <Tap label={on ? 'Stop dictating' : 'Dictate'} hint={on ? 'The words stay in the line to edit' : 'Talk instead of typing'} onPress={onPress} feel="light"
      style={[st.mic, on && st.micOn]}>
      {state === 'finishing' ? <ActivityIndicator size="small" color="#0B0C10" />
        : on ? <Glyph sf="stop.fill" d={STOP} size={14} color="#0B0C10" filled /> : <Icon name="mic" size={20} color={C.text} />}
    </Tap>
  );
}

/**
 * The picked photo on its way to its slot: from the middle of the screen (shown for a beat first), or from the smart
 * button's thumbnail once the PC has said where it goes. The slot takes it when it lands.
 */
function FlightLayer({ f, width, height, onLand }: { f: Flight; width: number; height: number; onLand: (id: FrameId) => void }) {
  const ratio = f.to.h / f.to.w;
  const w0 = f.from ? f.from.w : Math.min(232, width * 0.58), h0 = w0 * ratio;
  const x0 = f.from ? f.from.x : (width - w0) / 2, y0 = f.from ? f.from.y + f.from.h / 2 - h0 / 2 : height * 0.4 - h0 / 2;
  const r0 = f.from ? 6 : 22;
  const a = useSharedValue(f.from ? 1 : 0), k = useSharedValue(0);
  const end = f.to.w / w0;
  const dx = f.to.x + f.to.w / 2 - (x0 + w0 / 2), dy = f.to.y + f.to.h / 2 - (y0 + h0 / 2);
  useEffect(() => {
    a.set(withTiming(1, { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    k.set(withDelay(f.from ? 0 : 420, withSpring(1, FLY, (done) => { if (done) runOnJS(onLand)(f.frame); })));
  }, [a, k, f.frame, f.from, onLand]);
  const style = useAnimatedStyle(() => {
    const sc = (1 + (end - 1) * k.value) * (f.from ? 1 : 0.94 + 0.06 * a.value);
    return {
      opacity: a.value,
      borderRadius: r0 + (14 / end - r0) * k.value,
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
  photosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  grid: { gap: TILE_GAP },
  gridRow: { flexDirection: 'row', gap: TILE_GAP },
  columns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1, minWidth: 0 },
  colHead: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  nowRow: { flexDirection: 'row', gap: 8 },
  chips: { paddingHorizontal: 18, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  micOn: { backgroundColor: C.text },
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
  filedAt: { paddingHorizontal: 12, paddingTop: 12 },
  filed: { borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', padding: 14, gap: 8 },
  filedTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filedDot: { width: 8, height: 8, borderRadius: 4 },
  filedHead: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  filedX: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', marginRight: -4, marginTop: -4 },
  filedSaid: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  filedActs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  filedBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.09)' },
  filedBtnOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  filedBtnText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  filedKinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
