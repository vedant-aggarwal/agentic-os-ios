import { BlurView } from 'expo-blur';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { haptic, t, tint } from '@/aspects/kit/tokens';
import type { FrameState } from '@/capture/data';
import type { FrameId } from '@/capture/moments';
import { ASPECT_COLOR, C, F } from '@/theme';
import type { MEALS } from './day';
import { Camera, Chevron } from './parts';
import RECIPES from './recipes.json';

// Today's overlays: the wake dial (drag the hand to when he got up), the meal popup over a blurred Today with the
// day's plan and high-protein options, the one-line sheet for a journal line or a book page, the same line for a meal
// typed instead of photographed, and the sheet a held row opens (Cancel for today).

const BODY = ASPECT_COLOR.body;
const SURFACE = '#1B1D25';
const IST = 5.5 * 3600_000;

type Recipe = { id: string; slot: string; name: string; protein_g: number; kcal: number; protein_estimated: boolean; time_min: number; ingredients: { item: string; qty: string }[]; steps: string[]; tags: string[]; source_url: string };
const ALL = RECIPES as Recipe[];

// ── wake dial ────────────────────────────────────────────────────────────────────────────────────────────────────
const D = 264, CX = D / 2, TR = 112;
const toMin = (hmv: string) => { const [h, m] = hmv.split(':').map(Number); return h * 60 + m; };
const toHm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

type DialProps = { now: number; wakeHm: string | null; onClose: () => void; onSave: (hm: string) => void };
export function WakeDial({ open, ...p }: DialProps & { open: boolean }) {
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={p.onClose} statusBarTranslucent>
      {open ? <DialBody {...p} /> : null}
    </Modal>
  );
}

function DialBody({ now, wakeHm, onClose, onSave }: DialProps) {
  const insets = useSafeAreaInsets();
  const n = new Date(now + IST);
  const nowMin = n.getUTCHours() * 60 + n.getUTCMinutes();
  const [min, setMin] = useState(() => (wakeHm ? toMin(wakeHm) : Math.floor(nowMin / 5) * 5));
  const lo = nowMin - 12 * 60 + 1;

  // one turn of the hand is 12 hours, always the 12 hours up to now; the handler lives as long as the sheet
  const [pan] = useState(() => { let last = -1; return PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      let a = Math.atan2(x - CX, -(y - CX)) * 180 / Math.PI; if (a < 0) a += 360;
      const clock12 = (a / 360) * 720; // minutes on a 12 h face
      // the time on today's line that shows at this angle and isn't in the future
      let m = Math.floor(nowMin / 720) * 720 + clock12;
      while (m > nowMin) m -= 720;
      if (m < lo) m += 720;
      if (m > nowMin) m = nowMin;
      const snapped = Math.round(m / 5) * 5;
      if (snapped !== last) { last = snapped; haptic.tick(); }
      setMin(Math.min(nowMin, snapped));
    },
  }); });

  const ang = ((min % 720) / 720) * 360, angNow = ((nowMin % 720) / 720) * 360;
  const pt = (deg: number, r: number) => ({ x: CX + r * Math.sin((deg * Math.PI) / 180), y: CX - r * Math.cos((deg * Math.PI) / 180) });
  const knob = pt(ang, TR), dot = pt(angNow, TR);
  const sweep = ((angNow - ang) + 360) % 360;
  const arcA = pt(ang, TR), arcB = pt(angNow, TR);
  const ago = nowMin - min;
  const agoText = ago <= 0 ? 'now' : ago < 60 ? `${ago} min ago` : `${Math.floor(ago / 60)} h ${ago % 60} min ago`;

  return (
    <>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, st.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().duration(420).dampingRatio(1)} exiting={SlideOutDown.duration(220)} style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={st.grab} />
        <View style={st.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={t.title2}>When did you wake up?</Text>
            <Text style={t.small}>Drag the hand. It starts at now.</Text>
          </View>
          <CloseBtn onPress={onClose} />
        </View>
        <View style={st.dialWrap} {...pan.panHandlers}>
          <Svg width={D} height={D} pointerEvents="none">
            <Circle cx={CX} cy={CX} r={TR} stroke="rgba(255,255,255,0.06)" strokeWidth={14} fill="none" />
            {sweep > 0.5 ? <Path d={`M ${arcA.x} ${arcA.y} A ${TR} ${TR} 0 ${sweep > 180 ? 1 : 0} 1 ${arcB.x} ${arcB.y}`} stroke={tint(BODY, 0.55)} strokeWidth={14} fill="none" strokeLinecap="round" /> : null}
            {Array.from({ length: 60 }, (_, i) => {
              const a = i * 6, major = i % 5 === 0;
              const p1 = pt(a, TR + 12), p2 = pt(a, TR + (major ? 19 : 16));
              return <Line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'} strokeWidth={major ? 2 : 1.2} />;
            })}
            {[12, 3, 6, 9].map((h) => { const p = pt(h * 30, TR - 26); return <SvgText key={h} x={p.x} y={p.y + 5} fontSize={14} fontFamily={F.medium} fill={C.faint} textAnchor="middle">{String(h)}</SvgText>; })}
            <Circle cx={dot.x} cy={dot.y} r={3} fill="#FFFFFF" />
            <Line x1={CX} y1={CX} x2={knob.x} y2={knob.y} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
            <Circle cx={knob.x} cy={knob.y} r={15} fill="#FFFFFF" />
            <Circle cx={knob.x} cy={knob.y} r={4} fill={BODY} />
          </Svg>
          <View pointerEvents="none" style={st.readout}>
            <Text style={[t.display, t.num]}>{toHm(min)}</Text>
            <Text style={t.small}>{agoText}</Text>
          </View>
        </View>
        <View style={st.chips}>
          <Chip text={`Now, ${toHm(nowMin)}`} on={min === nowMin} onPress={() => setMin(nowMin)} />
          {wakeHm ? <Chip text={`Logged, ${wakeHm}`} on={toHm(min) === wakeHm} onPress={() => setMin(toMin(wakeHm))} /> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => { haptic.medium(); onSave(toHm(min)); }} style={({ pressed }) => [st.primary, pressed && { opacity: 0.85 }]}>
          <Text style={st.primaryText}>{`Woke at ${toHm(min)}`}</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { haptic.tick(); onPress(); }}
      style={[st.chip, on && { backgroundColor: tint(BODY, 0.2), borderColor: tint(BODY, 0.5) }]}>
      <Text style={[st.chipText, on && { color: BODY }]}>{text}</Text>
    </Pressable>
  );
}
function CloseBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onPress} hitSlop={8} style={st.close}>
      <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={C.text} strokeWidth={2.2} strokeLinecap="round" /></Svg>
    </Pressable>
  );
}

// ── meal popup ───────────────────────────────────────────────────────────────────────────────────────────────────
type Meal = (typeof MEALS)[number];
type MealProps = { st: FrameState | undefined; onClose: () => void; onPhoto: () => void; /** log it in words instead */ onType?: () => void };
export function MealPopup({ meal, ...p }: MealProps & { meal: Meal | null }) {
  return (
    <Modal transparent visible={!!meal} animationType="none" onRequestClose={p.onClose} statusBarTranslucent>
      {meal ? <MealBody key={meal.id} meal={meal} {...p} /> : null}
    </Modal>
  );
}

function MealBody({ meal, st: fs, onClose, onPhoto, onType }: MealProps & { meal: Meal }) {
  const insets = useSafeAreaInsets();
  const [openId, setOpenId] = useState<string | null>(null);
  const options = useMemo(() => ALL.filter((r) => r.slot === meal.slot).sort((a, b) => b.protein_g - a.protein_g), [meal]);
  const plan = meal.id === 'breakfast' ? ALL.find((r) => r.tags.includes('default-breakfast')) ?? null : null;
  return (
        <>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,10,14,0.42)' }]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View entering={ZoomIn.springify().duration(420).dampingRatio(1)} exiting={FadeOut.duration(140)}
            style={[st.card, { top: insets.top + 24, bottom: insets.bottom + 24 }]}>
            <View style={st.cardHead}>
              <Text style={[t.title2, { flex: 1 }]}>{meal.title}</Text>
              <CloseBtn onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
              <Text style={t.section}>Today&apos;s plan</Text>
              <View style={st.plan}>
                <Text style={t.strong}>{plan ? plan.name : meal.plan}</Text>
                {plan ? <Text style={t.small}>Your default</Text> : null}
                {fs?.note && fs.status !== 'empty' ? <Text style={[t.small, { color: BODY }]}>{fs.note}</Text> : null}
                {plan ? (
                  <>
                    <View style={st.stats}>
                      <Stat v={`${plan.protein_g} g`} c="protein" /><Stat v={String(plan.kcal)} c="kcal" /><Stat v={`${plan.time_min} min`} c="prep" />
                    </View>
                    <Text style={t.small} numberOfLines={2}>{plan.ingredients.map((i) => i.item).join(', ')}</Text>
                  </>
                ) : null}
              </View>
              <Text style={[t.section, { marginTop: 8 }]}>High protein options</Text>
              <View style={st.opts}>
                {options.map((r, i) => (
                  <View key={r.id} style={[i > 0 && st.rule]}>
                    <Pressable accessibilityRole="button" onPress={() => setOpenId(openId === r.id ? null : r.id)} style={st.opt}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.optName}>{r.name}</Text>
                        <Text style={[t.caption, t.num]}>{`${r.protein_estimated ? 'About ' : ''}${r.protein_g} g protein, ${r.time_min} min`}</Text>
                      </View>
                      <View style={{ transform: [{ rotate: openId === r.id ? '90deg' : '0deg' }] }}><Chevron /></View>
                    </Pressable>
                    {openId === r.id ? (
                      <Animated.View entering={FadeIn.duration(160)} style={st.steps}>
                        <Text style={t.small}>{r.ingredients.map((x) => `${x.item} ${x.qty}`).join(' · ')}</Text>
                        {r.steps.map((s2, k) => <Text key={k} style={t.small}>{`${k + 1}. ${s2}`}</Text>)}
                      </Animated.View>
                    ) : null}
                  </View>
                ))}
              </View>
            </ScrollView>
            <View style={st.foot}>
              <Pressable accessibilityRole="button" onPress={onPhoto} style={({ pressed }) => [st.quiet, pressed && { opacity: 0.8 }]}>
                <Camera size={18} color={C.text} /><Text style={st.quietText}>Photo</Text>
              </Pressable>
              {onType ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Type what you had for ${meal.title.toLowerCase()}`} onPress={onType}
                  style={({ pressed }) => [st.quiet, pressed && { opacity: 0.8 }]}>
                  <Pencil /><Text style={st.quietText}>Type it</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        </>
  );
}
function Stat({ v, c }: { v: string; c: string }) {
  return <View style={{ flex: 1 }}><Text style={[st.statV, t.num]}>{v}</Text><Text style={t.caption}>{c}</Text></View>;
}

// ── one line: a journal line, a book page ────────────────────────────────────────────────────────────────────────
type LineProps = { book: string | null; onClose: () => void; onSubmit: (text: string) => void };
export function LineSheet({ kind, ...p }: LineProps & { kind: 'journal' | 'page' | null }) {
  return (
    <Modal transparent visible={!!kind} animationType="none" onRequestClose={p.onClose} statusBarTranslucent>
      {kind ? <LineBody key={kind} kind={kind} {...p} /> : null}
    </Modal>
  );
}

function LineBody({ kind, book, onClose, onSubmit }: LineProps & { kind: 'journal' | 'page' }) {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable style={[StyleSheet.absoluteFill, st.scrim]} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.lineWrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.springify().duration(380).dampingRatio(1)} style={[st.line, { marginBottom: insets.bottom ? 8 : 16 }]}>
          <Text style={[st.tag, { color: ASPECT_COLOR[kind === 'page' ? 'mind' : 'soul'] }]}>{kind === 'page' ? 'Book' : 'Journal'}</Text>
          <TextInput autoFocus value={text} onChangeText={setText} placeholder={kind === 'page' ? `Page in ${book ?? 'your book'}` : 'A line for today'}
            placeholderTextColor={C.faint} keyboardType={kind === 'page' ? 'number-pad' : 'default'} returnKeyType="send" style={st.input}
            onSubmitEditing={() => { if (text.trim()) onSubmit(text.trim()); }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Save" disabled={!text.trim()} onPress={() => onSubmit(text.trim())}
            style={[st.send, !text.trim() && { opacity: 0.35 }]}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 19V5M5 12l7-7 7 7" stroke={C.scene} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

// ── a meal in words: the line, with the meal it goes under ───────────────────────────────────────────────────────
const MEAL_CHIPS: { id: FrameId; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' }, { id: 'salad', label: 'Salad' }, { id: 'lunch', label: 'Lunch' }, { id: 'snack', label: 'Snack' }, { id: 'dinner', label: 'Dinner' },
];
/** The meal a meal eaten now goes under: the PC's own slots by the clock (body.ts slotAt). */
export function mealNow(ms = Date.now()): FrameId {
  const n = new Date(ms + IST), m = n.getUTCHours() * 60 + n.getUTCMinutes();
  return m < 11 * 60 ? 'breakfast' : m < 16 * 60 ? 'lunch' : m < 19 * 60 ? 'snack' : 'dinner';
}
type TypeProps = { onClose: () => void; onSubmit: (meal: FrameId, text: string) => void };
export function MealText({ meal, ...p }: TypeProps & { meal: FrameId | null }) {
  return (
    <Modal transparent visible={!!meal} animationType="none" onRequestClose={p.onClose} statusBarTranslucent>
      {meal ? <MealTextBody key={meal} first={meal} {...p} /> : null}
    </Modal>
  );
}

function MealTextBody({ first, onClose, onSubmit }: TypeProps & { first: FrameId }) {
  const [meal, setMeal] = useState(first);
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  const label = MEAL_CHIPS.find((c) => c.id === meal)?.label ?? 'Meal';
  const send = () => { const v = text.trim(); if (v) { haptic.medium(); onSubmit(meal, v); } };
  return (
    <>
      <Pressable style={[StyleSheet.absoluteFill, st.scrim]} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.lineWrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.springify().duration(380).dampingRatio(1)} style={[st.typeWrap, { marginBottom: insets.bottom ? 8 : 16 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={st.typeChips}>
            {MEAL_CHIPS.map((c) => <Chip key={c.id} text={c.label} on={meal === c.id} onPress={() => setMeal(c.id)} />)}
          </ScrollView>
          <View style={st.line}>
            <TextInput autoFocus value={text} onChangeText={setText} placeholder="What did you eat? 2 roti, dal, curd" maxLength={200}
              placeholderTextColor={C.faint} returnKeyType="send" style={st.input} onSubmitEditing={send} accessibilityLabel={`What you had for ${label.toLowerCase()}`} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Log ${label.toLowerCase()}`} disabled={!text.trim()} onPress={send}
              style={[st.send, !text.trim() && { opacity: 0.35 }]}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 19V5M5 12l7-7 7 7" stroke={C.scene} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

function Pencil() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3zM13.5 8.5l3 3" stroke={C.text} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── hold a row: cancel it for today, or bring it back ────────────────────────────────────────────────────────────
/** routine: a step of today's routine (back tomorrow by itself). repeat: a repeating task (its next one is filed).
 *  once: a one-off task (cancelling drops it). */
export type HoldTarget = { title: string; kind: 'routine' | 'repeat' | 'once'; cancelled: boolean; onCancel: () => void; onRestore: () => void };
export function HoldMenu({ target, onClose }: { target: HoldTarget | null; onClose: () => void }) {
  return (
    <Modal transparent visible={!!target} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {target ? <HoldBody x={target} onClose={onClose} /> : null}
    </Modal>
  );
}

function HoldBody({ x, onClose }: { x: HoldTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const note = x.cancelled ? 'Cancelled for today. Bring it back to tick it.'
    : x.kind === 'once' ? 'A one-off task: cancelling takes it off your list.'
      : x.kind === 'repeat' ? 'Skips today only. The next one still comes.' : 'Skips today only. It is back tomorrow.';
  const act = () => { haptic.medium(); onClose(); if (x.cancelled) x.onRestore(); else x.onCancel(); };
  return (
    <>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, st.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().duration(380).dampingRatio(1)} exiting={SlideOutDown.duration(200)} style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={st.grab} />
        <View style={st.sheetHead}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={t.heading} numberOfLines={2}>{x.title}</Text>
            <Text style={t.small}>{note}</Text>
          </View>
          <CloseBtn onPress={onClose} />
        </View>
        <Pressable accessibilityRole="button" onPress={act} style={({ pressed }) => [x.cancelled ? st.primary : st.cancelBtn, pressed && { opacity: 0.85 }]}>
          {x.cancelled ? null : <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={C.text} strokeWidth={2.2} strokeLinecap="round" /></Svg>}
          <Text style={x.cancelled ? st.primaryText : st.cancelText}>{x.cancelled ? 'Bring it back' : x.kind === 'once' ? 'Cancel task' : 'Cancel for today'}</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const st = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(6,7,10,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SURFACE, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, gap: 16 },
  grab: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  dialWrap: { width: D, height: D, alignSelf: 'center' },
  readout: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center' },
  chipText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft, fontVariant: ['tabular-nums'] },
  primary: { height: 48, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.scene, fontVariant: ['tabular-nums'] },
  card: {
    position: 'absolute', left: 16, right: 16, borderRadius: 28, backgroundColor: SURFACE, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  plan: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', padding: 14, gap: 6 },
  stats: { flexDirection: 'row', marginTop: 6 },
  statV: { fontFamily: F.semibold, fontSize: 20, lineHeight: 26, color: C.text },
  opts: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  opt: { minHeight: 58, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optName: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  steps: { paddingHorizontal: 14, paddingBottom: 12, gap: 4 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  foot: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  quiet: { flex: 1, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quietText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.text },
  lineWrap: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 8 },
  line: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 34, backgroundColor: '#171920', padding: 8, paddingLeft: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)', boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
  },
  tag: { fontFamily: F.semibold, fontSize: 13, lineHeight: 16, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,210,122,0.16)', overflow: 'hidden' },
  input: { flex: 1, fontFamily: F.regular, fontSize: 16, lineHeight: 22, color: C.text, paddingVertical: 10 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  typeWrap: { gap: 10 },
  typeChips: { gap: 8, paddingHorizontal: 4 },
  cancelBtn: { height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cancelText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.text },
});
