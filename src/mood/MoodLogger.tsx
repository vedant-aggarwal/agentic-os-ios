import { BlurView } from 'expo-blur';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { Button, haptic, Icon } from '@/aspects/kit';
import { Smiley } from '@/components/Smiley';
import { heartBurst, pet, petDrive, petReact, useSadness } from '@/lib/pet';
import { noraUi } from '@/nora/state';
import { C, F } from '@/theme';
import { MoodGrid, type GridPoint } from './Grid';
import { MoodLight } from './Light';
import { type Ask, askNext, type MoodDraft, newMoodId, type Round, saveMood } from './talk';
import { cornerOf, moodColor, noteTone, reasonsFor, reasonTone } from './words';

// The mood logger. Tapping the smiley in the top bar flies it down into a dark room; as it lands a warm light comes
// on above it and it settles into a soft pool of light, the size of a real pet. Under it, the grid: the finger is the
// only colour, and that colour spills up into the pet's light as well, while its face follows the finger. Then a
// couple of reasons, then two or three short rounds where the pet (Claude, on the PC) asks one question with answers
// to tap and reacts to each. It ends with the line for his log, saved to Soul's moods, and a way to call Nora.

const PET = 124;
type Stage = 'grid' | 'reasons' | 'talk' | 'done';
const STEPS: Stage[] = ['grid', 'reasons', 'talk', 'done'];
const MIN_ROUNDS = 2;
const SHORT = 12; // reasons shown before "More"
const AEllipse = Animated.createAnimatedComponent(Ellipse);

export function MoodLogger({ from, onClose }: { from: { x: number; y: number }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const sadNow = useSadness();
  const id = useMemo(newMoodId, []);
  const [stage, setStage] = useState<Stage>('grid');
  const [point, setPoint] = useState<GridPoint | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState('');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [say, setSay] = useState(sadNow > 0.5 ? 'Missed you. How are you, really?' : 'Hey. How are you feeling?');
  const leaving = useRef(false);
  const lastWord = useRef('');

  // the room: dark comes down, the pet flies in, the light above it flares on as it lands
  const room = useSharedValue(0), fly = useSharedValue(0), key = useSharedValue(0), ring = useSharedValue(0);
  const pv = useSharedValue(0), pe = useSharedValue(0), lit = useSharedValue(0);
  const targetX = width / 2, targetY = insets.top + 64 + PET / 2;
  useEffect(() => {
    petDrive(true);
    pet.val.set(0); pet.nrg.set(0);
    room.set(withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) }));
    fly.set(reduce ? 1 : withDelay(80, withSpring(1, { duration: 950, dampingRatio: 0.66 })));
    key.set(reduce ? 1 : withDelay(520, withSequence(withTiming(1.5, { duration: 160 }), withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }))));
    if (!reduce) ring.set(withDelay(520, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) })));
    const t = setTimeout(() => { haptic.medium(); heartBurst(2, 260); }, 560);
    return () => { clearTimeout(t); petDrive(false); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = (): MoodDraft => ({ energy: point?.energy ?? 0, pleasant: point?.pleasant ?? 0, word: point?.word ?? '', tags, note });
  const persist = async (rs: Round[], ln: string) => {
    if (!point) return;
    try { await saveMood(id, draft(), rs, ln); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };

  const close = (after?: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    if (stage !== 'grid' && point) void persist(rounds, line); // past the grid it counts as logged, even half done
    room.set(withTiming(0, { duration: 320 }));
    key.set(withTiming(0, { duration: 200 }));
    fly.set(withTiming(0, { duration: 380, easing: Easing.in(Easing.cubic) }));
    setTimeout(() => { onClose(); after?.(); }, 360);
  };
  const callNora = () => {
    const w = point?.word ?? 'a mood check-in';
    const reason = `My mood check-in: feeling ${w.toLowerCase()}${tags.length ? ` (${tags.slice(0, 3).join(', ').toLowerCase()})` : ''}${line ? `. ${line}` : ''}`;
    close(() => noraUi.call({ reason }));
  };

  // ---- the grid drives the face and the room's light live ----
  const onGrid = (p: GridPoint) => {
    pet.val.set(withTiming(p.pleasant, { duration: 140 })); pet.nrg.set(withTiming(p.energy, { duration: 140 }));
    pv.set(withTiming(p.pleasant, { duration: 220 })); pe.set(withTiming(p.energy, { duration: 220 }));
    if (lit.get() < 1) lit.set(withTiming(1, { duration: 500 }));
    if (p.word !== lastWord.current) { lastWord.current = p.word; setSay(`${p.word}?`); }
    setPoint(p);
  };
  const onPlace = (p: GridPoint) => {
    setPoint(p);
    const c = cornerOf(p.pleasant, p.energy);
    setSay({ tr: 'Ooh. Tell me everything.', br: 'Nice and easy. I like it.', tl: "Uh oh. What's going on?", bl: 'Aw. Come here.' }[c]);
    if (p.pleasant > 0.35) petReact(p.energy > 0.3 ? 'excited' : 'happy');
    else if (p.pleasant < -0.35) petReact(p.energy > 0.3 ? 'angry' : 'concerned');
  };

  // ---- reasons and the typed line: small reactions ----
  const nudge = (tone: 'good' | 'hard' | 'neutral') => {
    if (tone === 'good') { pet.joy.set(withSequence(withTiming(0.8, { duration: 160 }), withDelay(700, withTiming(0, { duration: 700 })))); heartBurst(1); haptic.light(); }
    else if (tone === 'hard') { pet.worry.set(withSequence(withTiming(0.8, { duration: 200 }), withDelay(1200, withTiming(0, { duration: 800 })))); haptic.tick(); }
    else haptic.tick();
  };
  const toggleTag = (r: string) => {
    const on = !tags.includes(r);
    setTags(on ? [...tags, r] : tags.filter((x) => x !== r));
    if (on) nudge(reasonTone(r));
  };
  useEffect(() => {
    if (!note.trim()) return;
    const t = setTimeout(() => {
      const tone = noteTone(note);
      nudge(tone);
      setSay(tone === 'good' ? 'Love that.' : tone === 'hard' ? 'Oof. I hear you.' : 'Mm-hm. Go on.');
    }, 900);
    return () => clearTimeout(t);
  }, [note]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the talk, one round at a time ----
  const next = async (rs: Round[]) => {
    setBusy(true); setErr(null);
    pet.think.set(withTiming(1, { duration: 300 }));
    setSay('…');
    try {
      const a = await askNext(draft(), rs);
      setSay(a.say || 'Mm.');
      petReact(a.face);
      if (a.done && rs.length >= MIN_ROUNDS) {
        setLine(a.line);
        setStage('done');
        await persist(rs, a.line);
        haptic.success();
      } else {
        setAsk(a); setPicked([]); setTyped('');
        setStage('talk');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSay('Hmm, I lost my words. Try again?');
      petReact('concerned');
    } finally {
      setBusy(false);
      pet.think.set(withTiming(0, { duration: 300 }));
    }
  };
  const toReasons = () => { haptic.medium(); setStage('reasons'); setSay(`What's behind ${point!.word.toLowerCase()}?`); };
  const toTalk = () => { void persist([], ''); void next([]); };
  const answer = () => {
    if (!ask) return;
    const rs = [...rounds, { q: ask.q, options: ask.options, picked, text: typed.trim() }];
    setRounds(rs);
    void next(rs);
  };
  const skipTalk = async () => {
    setLine(''); setStage('done'); setSay('Logged. Thanks for telling me.'); petReact('proud');
    await persist(rounds, '');
  };

  // ---- motion ----
  const scrim = useAnimatedStyle(() => ({ opacity: room.value }));
  const petFly = useAnimatedStyle(() => {
    const k = fly.value, s0 = 30 / PET;
    return {
      transform: [
        { translateX: (from.x - targetX) * (1 - k) }, { translateY: (from.y - targetY) * (1 - k) },
        { scale: s0 + (1 - s0) * k }, { rotate: `${(1 - k) * -40}deg` },
      ],
    };
  });
  const keyLight = useAnimatedProps(() => ({ opacity: key.value * 0.9 }));
  const shadow = useAnimatedProps(() => ({ opacity: Math.max(0, fly.value) * 0.9, rx: PET * (0.36 + 0.06 * Math.min(1, fly.value)) }));
  const ringSt = useAnimatedStyle(() => ({ opacity: ring.value > 0 && ring.value < 1 ? (1 - ring.value) * 0.35 : 0, transform: [{ scale: 0.8 + 1.4 * ring.value }] }));
  const content = useAnimatedStyle(() => ({ opacity: room.value }));
  const petLit = useSharedValue(0);
  useEffect(() => { petLit.set(withTiming(point ? 1 : 0, { duration: 600 })); }, [point, petLit]);
  const gridSize = Math.min(width - 40, 340);
  const tone = point ? moodColor(point.pleasant, point.energy) : '#FFFFFF';
  const reasons = point ? reasonsFor(cornerOf(point.pleasant, point.energy)) : [];
  const shown = more ? reasons : reasons.slice(0, SHORT);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* the room: dark, one warm light from above the pet, and the colour of his mood pooling under it */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrim]}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,7,11,0.9)' }]} />
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="ml-key" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#FFE9C9" stopOpacity={0.16} />
              <Stop offset="0.5" stopColor="#FFE9C9" stopOpacity={0.05} />
              <Stop offset="1" stopColor="#FFE9C9" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AEllipse animatedProps={keyLight} cx={targetX} cy={targetY - PET * 0.2} rx={width * 0.75} ry={PET * 2.6} fill="url(#ml-key)" />
        </Svg>
        <MoodLight id="ml-pet" w={width} h={height} x={targetX} y={targetY + PET * 0.15} r={PET * 1.9} pv={pv} pe={pe} on={petLit} strength={0.28} />
      </Animated.View>

      {/* the pet: a soft contact shadow under it, a faint ring as it lands */}
      <View pointerEvents="none" style={[s.petBox, { top: targetY - PET / 2, left: targetX - PET / 2 }]}>
        <Svg width={PET * 1.6} height={PET * 0.5} style={s.shadow}>
          <Defs>
            <RadialGradient id="ml-shadow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.7} /><Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <AEllipse animatedProps={shadow} cx={PET * 0.8} cy={PET * 0.25} ry={PET * 0.08} fill="url(#ml-shadow)" />
        </Svg>
        <Animated.View style={[s.ring, ringSt]} />
        <Animated.View style={petFly}><Smiley size={PET} settleMs={1100} /></Animated.View>
      </View>

      <Animated.View style={[StyleSheet.absoluteFill, content]} pointerEvents="box-none">
        <View style={[s.top, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => close()} hitSlop={10} style={s.iconBtn}>
            <Icon name="close" size={18} color={C.textSoft} />
          </Pressable>
          <View style={s.steps} accessibilityLabel={`Step ${STEPS.indexOf(stage) + 1} of ${STEPS.length}`}>
            {STEPS.map((st, i) => <View key={st} style={[s.step, i <= STEPS.indexOf(stage) ? s.stepOn : null]} />)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Request a Nora call" onPress={callNora} hitSlop={6} style={({ pressed }) => [s.callPill, pressed ? s.pressed : null]}>
            <PhoneGlyph />
            <Text style={s.callText}>Call Nora</Text>
          </Pressable>
        </View>

        {/* what the pet says: plain words under it */}
        <View pointerEvents="none" style={[s.sayRow, { marginTop: targetY + PET / 2 + 22 - (insets.top + 60) }]}>
          {say === '…' ? <Thinking /> : (
            <Animated.Text key={say} entering={reduce ? undefined : FadeIn.duration(260)} style={s.say} numberOfLines={2}>{say}</Animated.Text>
          )}
        </View>

        <ScrollView style={s.flex} contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets scrollEnabled={stage !== 'grid'} showsVerticalScrollIndicator={false}>
          {stage === 'grid' ? (
            <Animated.View key="grid" entering={reduce ? undefined : FadeInDown.duration(500).delay(420)} exiting={FadeOut.duration(160)} style={s.center}>
              <MoodGrid size={gridSize} onChange={onGrid} onPlace={onPlace} />
              <View style={[s.actions, { opacity: point ? 1 : 0 }]} pointerEvents={point ? 'auto' : 'none'}>
                <Button label={point ? `That's me: ${point.word}` : "That's me"} onPress={toReasons} />
              </View>
            </Animated.View>
          ) : null}

          {stage === 'reasons' && point ? (
            <Animated.View key="reasons" entering={FadeInDown.duration(420)} exiting={FadeOut.duration(160)}>
              <View style={s.chips}>
                {shown.map((r) => <MoodChip key={r} label={r} on={tags.includes(r)} onPress={() => toggleTag(r)} />)}
                {!more && reasons.length > SHORT ? (
                  <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={s.moreBtn}><Text style={s.moreText}>More</Text></Pressable>
                ) : null}
              </View>
              <TextInput value={note} onChangeText={setNote} placeholder="Anything else on your mind?" placeholderTextColor="rgba(255,255,255,0.32)"
                multiline style={s.input} maxLength={1200} />
              <View style={s.actions}>
                <Button label={tags.length || note.trim() ? 'Continue' : 'Skip'} onPress={toTalk} busy={busy} />
              </View>
            </Animated.View>
          ) : null}

          {stage === 'talk' && ask ? (
            <Animated.View key={`talk-${rounds.length}`} entering={FadeInDown.duration(420)} exiting={FadeOut.duration(160)}>
              <Text style={s.question}>{ask.q}</Text>
              <View style={s.chips}>
                {ask.options.map((o) => (
                  <MoodChip key={o} label={o} on={picked.includes(o)} onPress={() => setPicked(picked.includes(o) ? picked.filter((x) => x !== o) : [...picked, o])} />
                ))}
              </View>
              <TextInput value={typed} onChangeText={setTyped} placeholder="Or in your own words" placeholderTextColor="rgba(255,255,255,0.32)"
                multiline style={s.input} maxLength={600} />
              <View style={s.actions}>
                <Button label="Next" onPress={answer} busy={busy} disabled={!picked.length && !typed.trim()} />
                {rounds.length >= MIN_ROUNDS ? <Button label="That's enough" kind="quiet" onPress={() => void skipTalk()} /> : null}
              </View>
            </Animated.View>
          ) : null}

          {stage === 'done' && point ? (
            <Animated.View key="done" entering={FadeInDown.duration(460)}>
              <View style={s.doneHead}>
                <View style={[s.bead, { backgroundColor: tone, boxShadow: `0 0 14px ${tone}` }]} />
                <Text style={s.doneWord}>{point.word}</Text>
              </View>
              {line ? <Text style={s.doneLine}>{line}</Text> : null}
              {tags.length ? <Text style={s.doneTags}>{tags.join('  ·  ')}</Text> : null}
              <View style={s.actions}>
                <Button label="Done" onPress={() => close()} />
                <Pressable accessibilityRole="button" accessibilityLabel="Talk it through with Nora" onPress={callNora} style={({ pressed }) => [s.talkBtn, pressed ? s.pressed : null]}>
                  <PhoneGlyph />
                  <Text style={s.talkText}>Talk it through with Nora</Text>
                </Pressable>
              </View>
            </Animated.View>
          ) : null}

          {err ? (
            <Animated.View entering={FadeIn.duration(200)} style={s.err}>
              <Text style={s.errText}>{err}</Text>
              {stage === 'reasons' || stage === 'talk' ? (
                <View style={s.errBtns}>
                  <Button small label="Try again" kind="quiet" onPress={() => void next(rounds)} />
                  <Button small label="Save without questions" kind="quiet" onPress={() => void skipTalk()} />
                </View>
              ) : null}
            </Animated.View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// a reason or an answer: quiet until chosen, then solid white, the one strong mark on the page
function MoodChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const p = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      onPress={() => { p.set(withSequence(withTiming(0.94, { duration: 70 }), withSpring(1, { duration: 360, dampingRatio: 0.7 }))); onPress(); }}>
      <Animated.View style={[s.chip, on ? s.chipOn : null, st]}>
        <Text style={[s.chipText, on ? s.chipTextOn : null]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Thinking() {
  return <View style={s.dots}>{[0, 1, 2].map((i) => <ThinkDot key={i} i={i} />)}</View>;
}
function ThinkDot({ i }: { i: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.set(withDelay(i * 150, withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 420 })), -1, false))); }, [i, t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.25 + 0.6 * t.value }));
  return <Animated.View style={[s.thinkDot, st]} />;
}

function PhoneGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" fill={C.textSoft} />
    </Svg>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 52 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  steps: { flexDirection: 'row', gap: 4 },
  step: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  stepOn: { backgroundColor: 'rgba(255,255,255,0.8)' },
  callPill: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)' },
  callText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  petBox: { position: 'absolute', width: PET, height: PET, alignItems: 'center', justifyContent: 'center' },
  shadow: { position: 'absolute', top: PET * 0.86, left: -PET * 0.3 },
  ring: { position: 'absolute', width: PET * 1.1, height: PET * 1.1, borderRadius: PET * 0.55, borderWidth: 1, borderColor: '#FFF1D6' },
  sayRow: { paddingHorizontal: 32, alignItems: 'center', minHeight: 54, marginBottom: 14 },
  say: { fontFamily: F.medium, fontSize: 19, lineHeight: 26, letterSpacing: -0.3, color: C.text, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, height: 26, alignItems: 'center' },
  thinkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.text },
  body: { paddingHorizontal: 20 },
  center: { alignItems: 'center' },
  actions: { gap: 10, marginTop: 24, alignSelf: 'stretch' },
  question: { fontFamily: F.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: C.text, marginBottom: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: '#F3F4F6' },
  chipText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: 'rgba(255,255,255,0.78)' },
  chipTextOn: { color: '#0E1016' },
  moreBtn: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  moreText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted, textDecorationLine: 'underline' },
  input: {
    marginTop: 16, minHeight: 52, maxHeight: 140, borderRadius: 16, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 15,
    backgroundColor: 'rgba(255,255,255,0.05)', fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.text,
  },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bead: { width: 12, height: 12, borderRadius: 6 },
  doneWord: { fontFamily: F.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.9, color: C.text },
  doneLine: { marginTop: 12, fontFamily: F.regular, fontSize: 17, lineHeight: 26, color: C.textSoft },
  doneTags: { marginTop: 12, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  talkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 24 },
  talkText: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.textSoft },
  err: { marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(248,113,113,0.10)', gap: 10 },
  errText: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: '#FCA5A5' },
  errBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
