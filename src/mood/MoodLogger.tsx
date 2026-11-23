import { Geist_300Light, useFonts } from '@expo-google-fonts/geist';
import { BlurView } from 'expo-blur';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, type GestureResponderEvent, Keyboard, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, useAnimatedKeyboard, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { haptic } from '@/aspects/kit';
import { Smiley } from '@/components/Smiley';
import { DEMO } from '@/lib/demo';
import { gaze } from '@/lib/gaze';
import { heartBurst, pet, petDrive, petReact, useSadness } from '@/lib/pet';
import { noraUi } from '@/nora/state';
import { F } from '@/theme';
import {
  CloseButton, feel, FloatWords, GlassButton, INK_FAINT, INK_SOFT, LANTERN, MoonButton, NoraButton, NoraOrb, NoteField, type Pt, type Rect, RoundGo, SayBlock,
  type SayMode, Summary, useClock,
} from './parts';
import { POOL_OK, type PoolHandle, type PoolMsg, PoolSurface } from './Pool';
import { type Ask, askNext, type MoodDraft, newMoodId, type Round, saveMood } from './talk';
import { behindQuestion, cornerOf, faceFor, greeting, moodInk, moodWord, noteTone, quip, reactTo, reasonsFor, reasonTone } from './words';

// The mood logger. The pet flies out of the top bar's smiley, dives, and taps a dark pool of water in a cave: the
// drop lights the whole basin. He touches the water where he is (across: bad to good; up: drained to wired) and the
// pool turns into that weather while the pet's face follows his finger. Then what is behind it floats up as words on
// the water, the AI asks two or three short rounds the same way, and the check-in is written on the water at the end.
// Leaving, the pet flies back into the button. The water itself is mood-scene/scene.js, in a WebView (./Pool).

type Stage = 'field' | 'context' | 'talk' | 'done';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);
const WEB = Platform.OS === 'web';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BUTTON = 30; // the top bar's smiley, which the pet flies out of and back into

function useLayout() {
  const { width: W, height: H } = useWindowDimensions();
  const real = useSafeAreaInsets();
  return useMemo(() => {
    // dev, web sample mode only: `&inset=47,34` lays it out as on a phone with a notch
    const dev = DEMO ? new URLSearchParams(location.search).get('inset')?.split(',').map(Number) : null;
    const top = dev?.[0] ?? real.top, bottom = Math.max(12, dev?.[1] ?? real.bottom);
    const side = W >= 410 ? 16 : 14;
    const petSize = Math.round(Math.min(100, Math.max(80, W * 0.235)));
    const rowTop = top + 6;
    const petCX = W / 2, petCY = rowTop + petSize / 2 + 2;
    const textTop = petCY + petSize / 2 + 8;
    const barH = 52, barTop = H - bottom - 12 - barH;
    const poolTop = Math.round(textTop + 106);
    const pool: Rect = { x: side, y: poolTop, w: W - side * 2, h: Math.max(220, barTop - 14 - poolTop), r: 30 };
    return { W, H, top, bottom, side, petSize, rowTop, petCX, petCY, textTop, barTop, barH, pool, cx: pool.x + pool.w / 2, cy: pool.y + pool.h / 2 };
  }, [W, H, real.top, real.bottom]);
}

/** The one-line summary when the AI isn't there to write it: his word, what is behind it, and what he picked. */
function localLine(d: MoodDraft, rounds: Round[]) {
  const picks = rounds.flatMap((r) => [...r.picked, r.text].filter(Boolean)).map((x) => x.toLowerCase());
  return `${d.word}${d.tags.length ? `, mostly ${d.tags.slice(0, 2).join(' and ').toLowerCase()}` : ''}${picks.length ? `; ${picks.slice(0, 3).join(', ')}` : ''}.`;
}

const clock12 = (d: Date) => {
  const h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export function MoodLogger({ from, onClose }: { from: { x: number; y: number }; onClose: () => void }) {
  const L = useLayout();
  const reduce = useReducedMotion();
  const sad = useSadness();
  const [fontOk] = useFonts({ Geist_300Light });
  const display = fontOk ? 'Geist_300Light' : F.regular;
  const kb = useAnimatedKeyboard();

  // ── the water ───────────────────────────────────────────────────────────────────────────────────────────
  const surface = useRef<PoolHandle>(null);
  const ready = useRef(false); // the page is up and has its layout
  const drawing = useRef(false); // and has drawn it
  const queue = useRef<PoolMsg[]>([]);
  const send = useCallback((m: PoolMsg) => { if (ready.current) surface.current?.send(m); else queue.current.push(m); }, []);
  const [scene, setScene] = useState(false); // the water is drawing
  const [failed, setFailed] = useState(!POOL_OK); // no WebGL: a plain field instead
  // On the web the water runs in this page's own thread, and its first frame (a new GL context, its shaders) holds
  // the page for a few hundred ms, which would eat the pop out of the button: there the opening waits for that
  // frame. A phone's WebView is its own process, so on the phone it starts at once.
  const [begun, setBegun] = useState(!WEB);

  // ── the check-in ───────────────────────────────────────────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('field');
  const [busy, setBusy] = useState(false);
  const [sinking, setSinking] = useState(false);
  const [wave, setWave] = useState(0); // a new set of words on the water
  const [opened, setOpened] = useState(false); // the opening dive has landed
  const [hint, setHint] = useState(false);
  const [touching, setTouching] = useState(false);
  const [touched, setTouched] = useState(false);
  const [word, setWord] = useState('');
  const [voice, setVoice] = useState('');
  const [reasons, setReasons] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [final, setFinal] = useState<{ say: string; line: string; at: Date } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const id = useState(newMoodId)[0];
  const pe = useRef({ p: 0, e: 0 }); // under his finger now
  const [mood, setMood] = useState({ p: 0, e: 0 }); // where he let go
  const pv = useSharedValue(0), ev = useSharedValue(0);
  const live = useRef({ stage, word, tags, note, rounds, ask, picked, text, final, touched });
  useLayoutEffect(() => { live.current = { stage, word, tags, note, rounds, ask, picked, text, final, touched }; });
  const draft = useCallback((): MoodDraft => ({ energy: pe.current.e, pleasant: pe.current.p, word: live.current.word, tags: live.current.tags, note: live.current.note }), []);

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
  }, []);
  const alive = useRef(true), closingRef = useRef(false);
  useEffect(() => () => { alive.current = false; for (const t of timers.current) clearTimeout(t); }, []);

  // ── the pet: where it flies, how it squashes, the hover once it is home ──────────────────────────────────
  const s0 = BUTTON / L.petSize;
  const ox = useSharedValue(reduce ? 0 : from.x - L.petCX), oy = useSharedValue(reduce ? 0 : from.y - L.petCY);
  const sc = useSharedValue(reduce ? 0.94 : s0), sq = useSharedValue(0), po = useSharedValue(reduce ? 0 : 1), hov = useSharedValue(0);
  const hc = useClock(3400, !reduce);
  const petStyle = useAnimatedStyle(() => {
    const k = sq.value;
    return {
      opacity: po.value,
      transform: [{ translateX: ox.value }, { translateY: oy.value }, { scaleX: sc.value * (1 - k * 0.7) }, { scaleY: sc.value * (1 + k) }],
    };
  });
  const hoverStyle = useAnimatedStyle(() => {
    const a = hc.value * Math.PI * 2, b = hov.value;
    return { transform: [{ translateY: Math.sin(a) * 3.4 * b }, { rotate: `${Math.sin(a + 1.1) * 2.2 * b}deg` }] };
  });

  // ── the backdrop over Today, and the water's own fade ────────────────────────────────────────────────────
  const scrim = useSharedValue(0), wo = useSharedValue(0.01), ui = useSharedValue(0);
  const t0 = useRef(0);
  useEffect(() => {
    if (!begun) return;
    t0.current = Date.now();
    petDrive(true);
    pet.val.set(withTiming(sad >= 0.6 ? -0.35 : 0, { duration: 500 }));
    pet.nrg.set(withTiming(0, { duration: 500 }));
    scrim.set(withTiming(1, { duration: reduce ? 200 : 320 }));
    ui.set(withDelay(reduce ? 0 : 260, withTiming(1, { duration: 360 })));
    if (reduce) { po.set(withTiming(1, { duration: 220 })); sc.set(withTiming(1, { duration: 260 })); }
    else {
      // out of the button: a pop and a little drop below the bar, then it waits for the water
      sc.set(withSequence(withTiming(s0 * 1.5, { duration: 170, easing: Easing.out(Easing.quad) }), withSpring(s0 * 1.75, { duration: 500, dampingRatio: 0.5 })));
      oy.set(withTiming(from.y - L.petCY + 26, { duration: 300, easing: Easing.out(Easing.cubic) }));
      ox.set(withTiming(from.x - L.petCX - 10, { duration: 300, easing: Easing.out(Easing.cubic) }));
    }
    return () => {
      petDrive(false);
      pet.think.set(0);
      gaze.set({ ...gaze.get(), active: false, at: Date.now() });
    };
  }, [begun]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (begun) return;
    if (scene || failed) later(90, () => setBegun(true));
    else later(1400, () => setBegun(true));
  }, [begun, scene, failed, later]);

  // the dive: down into the middle of the pool, a tap on the water that lights it, and back up to its perch
  const dove = useRef(false);
  const dive = useCallback(() => {
    if (dove.current) return;
    dove.current = true;
    const land = () => {
      setOpened(true);
      later(reduce ? 200 : 900, () => setHint(true));
    };
    if (reduce) {
      send({ t: 'ignite', x: L.cx, y: L.cy });
      haptic.medium();
      land();
      return;
    }
    const T = 560, dx = L.cx - L.petCX, dy = L.cy - L.petCY;
    // the splash comes when it reaches the water: the fall's own end, not a timer a slow first frame can outrun
    let hit = false;
    const splash = () => {
      if (hit || !alive.current || closingRef.current) return;
      hit = true;
      send({ t: 'ignite', x: L.cx, y: L.cy });
      haptic.medium();
      later(140, feel.soft);
      // it squashes on the surface for a beat before it springs back up
      sq.set(withSequence(withTiming(-0.26, { duration: 70 }), withSpring(0, { duration: 950, dampingRatio: 0.34 })));
      ox.set(withDelay(60, withSpring(0, { duration: 1050, dampingRatio: 0.82 })));
      oy.set(withDelay(60, withSpring(0, { duration: 1050, dampingRatio: 0.6 })));
      sc.set(withDelay(60, withSpring(1, { duration: 900, dampingRatio: 0.66 })));
      hov.set(withDelay(800, withTiming(1, { duration: 900 })));
      later(350, land);
      later(1200, () => gaze.set({ ...gaze.get(), active: false, at: Date.now() }));
    };
    gaze.set({ x: L.cx, y: L.cy + 40, active: true, at: Date.now() });
    ox.set(withTiming(dx, { duration: T, easing: Easing.inOut(Easing.cubic) }));
    oy.set(withTiming(dy, { duration: T, easing: Easing.in(Easing.quad) }, (ok) => { 'worklet'; if (ok) scheduleOnRN(splash); }));
    sc.set(withTiming(0.8, { duration: T, easing: Easing.out(Easing.quad) }));
    sq.set(withTiming(0.16, { duration: T, easing: Easing.in(Easing.cubic) }));
    later(T + 600, splash); // if the fall never reports its end
  }, [L, reduce, send, later, ox, oy, sc, sq, hov]);

  // it dives once the water is drawing (at least a beat after it pops out); a slow WebView doesn't hold it for long
  useEffect(() => {
    if (!begun) return;
    const since = Date.now() - t0.current;
    if (scene || failed) { later(Math.max(0, (reduce ? 0 : 340) - since), dive); return; }
    later(1700, dive);
    later(4500, () => { if (!drawing.current) setFailed(true); });
  }, [begun, scene, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── his finger in the water ──────────────────────────────────────────────────────────────────────────────
  const lastWord = useRef('');
  const pulse = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPulse = useCallback(() => { if (pulse.current) clearTimeout(pulse.current); pulse.current = null; }, []);
  // while his finger is in the water, a soft pulse under it: slow when he is drained, quick when wired
  const startPulse = useCallback(() => {
    stopPulse();
    const beat = () => {
      const e = pe.current.e;
      if (e > 0.35) feel.rigid(); else feel.soft();
      pulse.current = setTimeout(beat, 900 - 470 * e);
    };
    pulse.current = setTimeout(beat, 520);
  }, [stopPulse]);
  useEffect(() => stopPulse, [stopPulse]);

  const touch = useCallback((ph: string, x: number, y: number, p: number, e: number) => {
    pe.current = { p, e };
    pv.set(p); ev.set(e);
    pet.val.set(withTiming(p, { duration: 140 }));
    pet.nrg.set(withTiming(e, { duration: 140 }));
    gaze.set({ x, y, active: ph !== 'up', at: Date.now() });
    const w = moodWord(p, e);
    if (ph === 'down') {
      haptic.light();
      lastWord.current = w;
      setWord(w); setTouching(true); setVoice('');
      startPulse();
    } else if (ph === 'move') {
      if (w !== lastWord.current) { lastWord.current = w; setWord(w); haptic.tick(); }
    } else {
      stopPulse();
      lastWord.current = w;
      setWord(w); setTouching(false); setTouched(true); setMood({ p, e });
      setVoice(quip(w));
      petReact(faceFor(p, e));
    }
  }, [pv, ev, startPulse, stopPulse]);

  // ── messages from the water ──────────────────────────────────────────────────────────────────────────────
  const L0 = useRef(L);
  useLayoutEffect(() => { L0.current = L; });
  const onMsg = useCallback((m: PoolMsg) => {
    if (m.t === 'hello') {
      // (again after the WebView's page was reloaded: it gets its layout and stage back, and its light)
      const again = ready.current;
      ready.current = true;
      surface.current?.send({ t: 'layout', pool: L0.current.pool, reduce });
      surface.current?.send({ t: 'stage', s: live.current.stage });
      if (again) { if (dove.current) surface.current?.send({ t: 'lit' }); return; }
      for (const q of queue.current) surface.current?.send(q);
      queue.current = [];
    } else if (m.t === 'ready') {
      if (drawing.current) return;
      drawing.current = true;
      wo.set(withTiming(1, { duration: 380 }));
      setScene(true);
    } else if (m.t === 'touch') {
      touch(String(m.ph), Number(m.x), Number(m.y), Number(m.p), Number(m.e));
    } else if (m.t === 'splash') {
      feel.soft();
      gaze.set({ x: Number(m.x), y: Number(m.y), active: true, at: Date.now() });
      later(600, () => gaze.set({ ...gaze.get(), active: false, at: Date.now() }));
    } else if (m.t === 'haptic') {
      if (m.k === 'heavy') feel.heavy(); else if (m.k === 'soft') feel.soft(); else haptic.tick();
    } else if (m.t === 'error') {
      if (!drawing.current) setFailed(true);
    }
  }, [reduce, touch, later, wo]);

  useEffect(() => { if (ready.current) surface.current?.send({ t: 'layout', pool: L.pool, reduce }); }, [L, reduce]);
  useEffect(() => { send({ t: 'stage', s: stage }); }, [stage, send]);

  // ── saving ───────────────────────────────────────────────────────────────────────────────────────────────
  const savedKey = useRef('');
  const save = useCallback(async (rs: Round[], line: string) => {
    const d = draft();
    const key = JSON.stringify([d, rs, line]);
    if (key === savedKey.current) return true;
    try { await saveMood(id, d, rs, line); savedKey.current = key; return true; } catch { return false; }
  }, [draft, id]);

  // ── the words on the water ───────────────────────────────────────────────────────────────────────────────
  const centers = useRef<Record<string, Pt>>({});
  const sel = stage === 'context' ? tags : picked;
  const pushLights = useCallback((list: string[]) => {
    send({ t: 'lights', l: list.map((w) => centers.current[w]).filter(Boolean) });
  }, [send]);
  useEffect(() => { if (!busy) pushLights(sel); }, [sel, busy, pushLights]);
  const onCenter = useCallback((w: string, at: Pt) => {
    centers.current[w] = at;
    const cur = live.current, list = cur.stage === 'context' ? cur.tags : cur.picked;
    if (list.includes(w)) pushLights(list);
  }, [pushLights]);
  const plink = useCallback((at: Pt) => send({ t: 'drop', x: at.x, y: at.y, r: 7, s: 0.55 }), [send]);
  const under = useCallback((at: Pt) => send({ t: 'drop', x: at.x, y: at.y, r: 9, s: 0.4 }), [send]);

  const look = useCallback((at: Pt, ms = 800) => {
    gaze.set({ x: at.x, y: at.y, active: true, at: Date.now() });
    later(ms, () => gaze.set({ ...gaze.get(), active: false, at: Date.now() }));
  }, [later]);

  const toggle = useCallback((w: string, at: Pt | null) => {
    const cur = live.current;
    const list = cur.stage === 'context' ? cur.tags : cur.picked;
    const on = !list.includes(w);
    const next = on ? [...list, w] : list.filter((x) => x !== w);
    if (cur.stage === 'context') setTags(next); else setPicked(next);
    haptic.tick();
    if (at) { send({ t: 'drop', x: at.x, y: at.y, r: on ? 11 : 7, s: on ? 0.95 : 0.45 }); look(at); }
    if (on) {
      setVoice(reactTo(w));
      const tone = reasonTone(w);
      if (tone === 'good') petReact('happy'); else if (tone === 'hard') petReact('concerned');
    }
  }, [send, look]);

  // what he types: the pet watches the field, and reads the mood of it after a pause
  const typed = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onType = useCallback((v: string) => {
    if (live.current.stage === 'context') setNote(v); else setText(v);
    if (typed.current) clearTimeout(typed.current);
    typed.current = setTimeout(() => {
      const tone = noteTone(v);
      if (tone === 'good') { petReact('happy'); setVoice('Ooh. Tell me more.'); }
      else if (tone === 'hard') { petReact('concerned'); setVoice('Oof. I hear you.'); }
    }, 900);
  }, []);
  useEffect(() => () => { if (typed.current) clearTimeout(typed.current); }, []);

  // ── moving through it ────────────────────────────────────────────────────────────────────────────────────
  const toContext = useCallback(() => {
    if (!live.current.touched) return;
    haptic.medium();
    const { p, e } = pe.current;
    centers.current = {};
    setReasons(reasonsFor(cornerOf(p, e)));
    setWave((n) => n + 1);
    setStage('context');
    setVoice('');
    void save([], '').then((ok) => { if (!ok && alive.current) setSaveFailed(true); });
  }, [save]);

  const finish = useCallback((a: Ask, rs: Round[], d: MoodDraft) => {
    const line = (a.line || localLine(d, rs)).trim();
    setAsk(null); setPicked([]); setText('');
    setFinal({ say: a.say, line, at: new Date() });
    setStage('done');
    setVoice('');
    send({ t: 'lights', l: [] });
    send({ t: 'drop', x: L.cx, y: L.cy, r: 26, s: 0.9 });
    haptic.success();
    petReact(a.face);
    pet.joy.set(withSequence(withTiming(1, { duration: 260 }), withDelay(2600, withTiming(0.6, { duration: 1400 }))));
    later(300, () => heartBurst(4));
    void save(rs, line).then((ok) => { if (alive.current) setSaveFailed(!ok); });
  }, [send, save, later, L.cx, L.cy]);

  const go = useCallback(async () => {
    const cur = live.current;
    if (busy) return;
    Keyboard.dismiss();
    let rs = cur.rounds;
    if (cur.stage === 'talk' && cur.ask) rs = [...rs, { q: cur.ask.q, options: cur.ask.options, picked: cur.picked, text: cur.text.trim() }];
    setRounds(rs);
    setBusy(true); setSinking(true); setVoice('');
    send({ t: 'lights', l: [] });
    send({ t: 'think', on: true });
    pet.think.set(withTiming(1, { duration: 500 }));
    haptic.light();
    const d = draft();
    let a: Ask;
    try {
      a = (await Promise.all([askNext(d, rs), wait(1300)]))[0];
    } catch {
      a = { q: '', options: [], say: "I couldn't reach the PC, so I kept it short.", face: 'calm', done: true, line: localLine(d, rs) };
    }
    if (!alive.current || closingRef.current) return;
    // two rounds at least is the AI's call; three at most is ours
    if (!a.done && rs.length >= 3) a = { ...a, done: true, q: '', options: [], say: a.say || 'Got it.', line: a.line || localLine(d, rs) };
    if (!a.done && (!a.q || !a.options.length)) a = { ...a, done: true, line: a.line || localLine(d, rs) };
    pet.think.set(withTiming(0, { duration: 400 }));
    send({ t: 'think', on: false });
    setBusy(false); setSinking(false);
    if (a.done) { finish(a, rs, d); return; }
    centers.current = {};
    setAsk(a); setPicked([]); setText('');
    setWave((n) => n + 1);
    setStage('talk');
    setVoice(a.say);
    petReact(a.face);
  }, [busy, send, draft, finish]);

  // ── leaving ──────────────────────────────────────────────────────────────────────────────────────────────
  const close = useCallback((then?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    stopPulse();
    const cur = live.current;
    // past the field, whatever he added since the last save is kept
    if (cur.stage === 'context' || cur.stage === 'talk') {
      const rs = cur.stage === 'talk' && cur.ask && (cur.picked.length || cur.text.trim())
        ? [...cur.rounds, { q: cur.ask.q, options: cur.ask.options, picked: cur.picked, text: cur.text.trim() }] : cur.rounds;
      void save(rs, '');
    }
    send({ t: 'close' });
    send({ t: 'think', on: false });
    pet.think.set(withTiming(0, { duration: 200 }));
    gaze.set({ ...gaze.get(), active: false, at: Date.now() });
    const T = reduce ? 220 : 480;
    ui.set(withTiming(0, { duration: 200 }));
    wo.set(withTiming(0, { duration: T }));
    scrim.set(withDelay(reduce ? 0 : 120, withTiming(0, { duration: T })));
    hov.set(withTiming(0, { duration: 160 }));
    if (reduce) po.set(withTiming(0, { duration: 200 }));
    else {
      const e = Easing.inOut(Easing.cubic);
      ox.set(withTiming(from.x - L.petCX, { duration: T, easing: e }));
      oy.set(withTiming(from.y - L.petCY, { duration: T, easing: Easing.bezier(0.5, 0, 0.3, 1) }));
      sc.set(withTiming(s0, { duration: T, easing: e }));
      sq.set(withSequence(withTiming(0.1, { duration: T * 0.6 }), withSpring(0, { duration: 300 })));
    }
    later(T + 60, () => {
      petDrive(false);
      if (cur.stage !== 'field') {
        heartBurst(2);
        // checked in: it stays pleased for a while on the top bar too
        pet.joy.set(withSequence(withTiming(Math.max(0.7, pet.joy.get()), { duration: 200 }), withDelay(8000, withTiming(0, { duration: 30000 }))));
      }
      then?.();
      onClose();
    });
  }, [reduce, stopPulse, save, send, ui, wo, scrim, hov, po, ox, oy, sc, sq, from.x, from.y, L.petCX, L.petCY, s0, later, onClose]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [close]);

  const callNora = useCallback(() => {
    const cur = live.current, d = draft();
    let reason = 'Opened the mood check-in and asked for a call.';
    if (cur.touched) {
      const bits = [`Mood check-in: ${d.word}, ${d.pleasant >= 0 ? 'pleasant' : 'unpleasant'}, ${d.energy >= 0 ? 'high' : 'low'} energy`];
      if (d.tags.length) bits.push(`behind it: ${d.tags.join(', ')}`);
      if (d.note.trim()) bits.push(`he wrote "${d.note.trim().slice(0, 90)}"`);
      if (cur.final?.line) bits.push(cur.final.line);
      reason = bits.join('. ').slice(0, 300);
    }
    haptic.light();
    close(() => noraUi.call({ reason }));
  }, [draft, close]);

  // ── what shows ───────────────────────────────────────────────────────────────────────────────────────────
  const { p: P, e: E } = mood;
  const sayMode: SayMode = busy ? 'think' : stage === 'field' ? (touching || touched ? 'word' : opened ? 'text' : 'none') : 'text';
  const main = stage === 'field' ? greeting(sad) : stage === 'context' ? behindQuestion(P) : stage === 'talk' ? ask?.q ?? '' : final?.say ?? '';
  const words = stage === 'context' ? reasons : stage === 'talk' ? ask?.options ?? [] : [];
  const fieldAt = { x: L.W / 2 - 30, y: L.barTop + L.barH / 2 };

  const uiStyle = useAnimatedStyle(() => ({ opacity: ui.value }));
  const waterStyle = useAnimatedStyle(() => ({ opacity: wo.value }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const blurProps = useAnimatedProps(() => ({ intensity: 34 * scrim.value }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(0, L.bottom + 2 - kb.height.value) }] }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Today goes dark and soft behind the cave */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrimStyle]}>
        {/* (on the web a blur whose radius moves is a new filter every frame: there it stays put and fades) */}
        <AnimatedBlur {...(WEB ? { intensity: 34 } : { animatedProps: blurProps })} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: failed ? 'rgba(7,8,11,0.94)' : 'rgba(5,6,9,0.6)' }]} />
      </Animated.View>

      {/* the water: full screen, so the cave floor and the light spill around the basin too */}
      {!failed ? (
        <Animated.View style={[StyleSheet.absoluteFill, waterStyle]} accessibilityLabel="Mood water. Left is bad, right is good, up is wired, down is drained.">
          <PoolSurface ref={surface} onMessage={onMsg} />
        </Animated.View>
      ) : (
        <PlainField rect={L.pool} stage={stage} onTouch={touch} />
      )}

      {/* the pet */}
      <Animated.View pointerEvents="none" style={[s.pet, { left: L.petCX - L.petSize / 2, top: L.petCY - L.petSize / 2, width: L.petSize, height: L.petSize }, petStyle]}>
        <Animated.View style={hoverStyle}>
          <Smiley size={L.petSize} settleMs={3600} />
        </Animated.View>
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, uiStyle]}>
        <SayBlock top={L.textTop} voice={voice} mode={sayMode} main={main} word={word} p={pv} e={ev} font={display} light={moodInk(P, E, 0.7)} reduce={reduce} />

        {stage === 'context' || stage === 'talk' ? (
          <FloatWords key={`w${wave}`} words={words} picked={sel} rect={L.pool} sinking={sinking} reduce={reduce} font={F.regular} lit={LANTERN}
            onToggle={toggle} onSurface={plink} onSink={under} onCenter={onCenter} />
        ) : null}
        {stage === 'done' && final ? (
          <Summary rect={L.pool} line={final.line} label={`${word} · ${clock12(final.at)}${saveFailed ? ' · not saved yet' : ''}`} font={display} reduce={reduce} />
        ) : null}

        {/* the bar under the pool */}
        <Animated.View pointerEvents="box-none" style={[s.bar, { top: L.barTop, height: L.barH, left: L.side + 2, right: L.side + 2 }, barStyle]}>
          {stage === 'field' && !touched && !touching && hint ? (
            <Animated.View key="hint" entering={FadeIn.duration(600)} exiting={FadeOut.duration(160)} pointerEvents="none" style={s.center}>
              <Text style={s.hint}>Touch the water where you are</Text>
            </Animated.View>
          ) : null}
          {stage === 'field' && touched ? (
            <Animated.View key="next" entering={FadeInDown.duration(380)} exiting={FadeOut.duration(140)} style={s.center}>
              <MoonButton label="Next" arrow onPress={toContext} />
            </Animated.View>
          ) : null}
          {(stage === 'context' || stage === 'talk') && !busy ? (
            <Animated.View key={`say${wave}`} entering={FadeInDown.duration(380).delay(250)} exiting={FadeOut.duration(140)} style={s.row}>
              <NoteField value={stage === 'context' ? note : text} onChangeText={onType}
                placeholder={stage === 'context' ? 'Add a few words, if you like' : 'Or say it your way'}
                onFocus={() => gaze.set({ x: fieldAt.x, y: fieldAt.y, active: true, at: Date.now() })}
                onBlur={() => gaze.set({ ...gaze.get(), active: false, at: Date.now() })} />
              <RoundGo label="Next" onPress={() => { void go(); }} />
            </Animated.View>
          ) : null}
          {stage === 'done' ? (
            <Animated.View key="done" entering={FadeInDown.duration(420).delay(900)} style={s.row}>
              <GlassButton label="Call Nora" grow onPress={callNora}><NoraOrb /></GlassButton>
              <MoonButton label="Done" grow onPress={() => close()} />
            </Animated.View>
          ) : null}
        </Animated.View>

        {/* always within reach: close, and Nora */}
        <View pointerEvents="box-none" style={[s.top, { top: L.rowTop + 4, left: 16, right: 16 }]}>
          <CloseButton onPress={() => close()} />
          <NoraButton onPress={callNora} />
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Without WebGL (it failed to start): a plain dark basin that still reads his finger the same way, so the check-in
 * works; just without the water.
 */
function PlainField({ rect, stage, onTouch }: { rect: Rect; stage: Stage; onTouch: (ph: string, x: number, y: number, p: number, e: number) => void }) {
  const dot = useSharedValue({ x: rect.w / 2, y: rect.h / 2, k: 0 });
  const at = (ev: GestureResponderEvent, ph: string) => {
    const x = Math.min(rect.w, Math.max(0, ev.nativeEvent.locationX)), y = Math.min(rect.h, Math.max(0, ev.nativeEvent.locationY));
    const p = Math.max(-1, Math.min(1, (x / rect.w - 0.5) / 0.44)), e = Math.max(-1, Math.min(1, (0.5 - y / rect.h) / 0.44));
    dot.set({ x, y, k: ph === 'up' ? 0.5 : 1 });
    onTouch(ph, rect.x + x, rect.y + y, p, e);
  };
  const field = stage === 'field';
  const dotStyle = useAnimatedStyle(() => {
    const d = dot.value;
    return { opacity: d.k, transform: [{ translateX: d.x - 60 }, { translateY: d.y - 60 }], backgroundColor: moodInk((d.x / rect.w - 0.5) / 0.44, (0.5 - d.y / rect.h) / 0.44, 0, 0.35) };
  });
  return (
    <View
      style={[s.plain, { left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r }]}
      onStartShouldSetResponder={() => field} onMoveShouldSetResponder={() => field}
      onResponderGrant={(e) => at(e, 'down')} onResponderMove={(e) => at(e, 'move')} onResponderRelease={(e) => at(e, 'up')} onResponderTerminate={(e) => at(e, 'up')}>
      <Animated.View pointerEvents="none" style={[s.plainDot, dotStyle]} />
      {field ? (
        <>
          <Text pointerEvents="none" style={[s.axis, { top: 12, alignSelf: 'center' }]}>Wired</Text>
          <Text pointerEvents="none" style={[s.axis, { bottom: 12, alignSelf: 'center' }]}>Drained</Text>
          <Text pointerEvents="none" style={[s.axis, { left: 14, top: rect.h / 2 - 10 }]}>Bad</Text>
          <Text pointerEvents="none" style={[s.axis, { right: 14, top: rect.h / 2 - 10 }]}>Good</Text>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  pet: { position: 'absolute' },
  bar: { position: 'absolute', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { fontFamily: F.regular, fontSize: 15, lineHeight: 20, color: INK_SOFT, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 10 },
  top: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plain: { position: 'absolute', overflow: 'hidden', backgroundColor: '#0B1016', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  plainDot: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  axis: { position: 'absolute', fontFamily: F.medium, fontSize: 13, color: INK_FAINT },
});
