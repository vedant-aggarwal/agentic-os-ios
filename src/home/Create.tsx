import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { haptic, t } from '@/aspects/kit/tokens';
import { Chip } from '@/capture/parts';
import type { Area, LifePayload } from '@/lib/today';
import { ASPECT_COLOR, C, F } from '@/theme';
import { NORA, NORA_TEXT } from '@/today2/parts';
import { AreaWheel, type WheelItem } from './AreaWheel';
import { addDays, istDay, type Draft } from './data';
import { MonthGrid } from './MonthGrid';
import { parseDue, shortDay } from './parseDue';

// The create sheet, on the keyboard: a title, then when (quick chips, a month, or a date read from the title), the
// area on a wheel beside it (which decides where it lands on Today) and Tag Nora. Return saves and keeps the sheet
// open for the next one. With `initial` it edits a task instead.

const SURFACE = '#1B1D25';
const ASPECT_NAME: Record<string, string> = { body: 'Body', mind: 'Mind', soul: 'Soul', growth: 'Growth', mission: 'Mission', money: 'Money', family: 'Family', friends: 'Friends', romance: 'Romance' };

export function areaColor(life: LifePayload | null, area: string | null) {
  const a = area ? life?.areaAspects[area]?.[0] : undefined;
  return a ? ASPECT_COLOR[a] : C.muted;
}

export function CreateSheet({ open, initial, areas, life, onClose, onSave, onDelete }: {
  open: boolean; initial?: Draft & { id: string } | null; areas: Area[]; life: LifePayload | null;
  onClose: () => void; onSave: (d: Draft) => Promise<void>; onDelete?: () => void;
}) {
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* a Modal is its own native tree: the area wheel's drag needs a gesture root inside it */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {open ? <Body key={initial?.id ?? 'new'} initial={initial ?? null} areas={areas} life={life} onClose={onClose} onSave={onSave} onDelete={onDelete} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function useKeyboardUp() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const a = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const b = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return up;
}

const titleCase = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Body({ initial, areas, life, onClose, onSave, onDelete }: {
  initial: (Draft & { id: string }) | null; areas: Area[]; life: LifePayload | null;
  onClose: () => void; onSave: (d: Draft) => Promise<void>; onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardUp();
  const today = istDay(), tomorrow = addDays(today, 1);
  const blank: Draft = { title: '', notes: '', area: null, due: null, nora: false };
  const [d, setD] = useState<Draft>(initial ?? blank);
  const [details, setDetails] = useState(!!initial?.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cal, setCal] = useState(false);
  // A date he picks by hand wins over one read from the title (an existing task's date counts as picked).
  // `auto` is the date read from the title and the one it replaced; `ignored` is a read date he undid.
  const [manual, setManual] = useState(!!initial?.due);
  const [auto, setAuto] = useState<{ day: string; prev: string | null } | null>(null);
  const [ignored, setIgnored] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const editing = !!initial;

  const typed = (title: string) => {
    if (manual) { set({ title }); return; }
    const p = parseDue(title, today);
    if (!p) setIgnored(null);
    if (p && p !== ignored) {
      if (p !== auto?.day) setAuto({ day: p, prev: auto ? auto.prev : d.due });
      set({ title, due: p });
    } else if (auto) { set({ title, due: auto.prev }); setAuto(null); }
    else set({ title });
  };
  const pickDue = (due: string | null) => { setManual(true); setAuto(null); setCal(false); set({ due }); };
  const undoAuto = () => {
    if (!auto) return;
    haptic.tick();
    set({ due: auto.prev }); setIgnored(auto.day); setAuto(null);
  };
  const toggleCal = () => {
    if (cal) { setCal(false); input.current?.focus(); return; }
    Keyboard.dismiss(); // the month needs the room the keyboard takes
    setCal(true);
  };

  const save = async () => {
    if (!d.title.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      await onSave(d);
      haptic.success();
      if (editing) onClose();
      else {
        // the next task keeps the area and a hand-picked date, not a date this title named
        setD({ ...blank, area: d.area, due: auto ? auto.prev : d.due });
        setAuto(null); setIgnored(null); setManual(false); setCal(false); setDetails(false);
        input.current?.focus();
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'That didn’t save.'); } finally { setBusy(false); }
  };

  // every area GET /areas knows (the server only files a task under one of those), "No area" first
  const wheel = useMemo(() => {
    const list: WheelItem[] = [{ key: null, name: 'No area', color: C.muted }];
    for (const a of areas) if (!list.some((x) => x.key === a.slug)) list.push({ key: a.slug, name: a.name, color: areaColor(life, a.slug) });
    if (d.area && !list.some((x) => x.key === d.area)) list.push({ key: d.area, name: titleCase(d.area), color: areaColor(life, d.area) });
    return list;
  }, [areas, life, d.area]);

  const custom = !!d.due && d.due !== today && d.due !== tomorrow;
  const aspect = d.area ? life?.areaAspects[d.area]?.[0] : undefined;
  const when = (
    <View style={st.chips}>
      <Chip text="Today" on={d.due === today} color={C.text} onPress={() => pickDue(today)} />
      <Chip text="Tomorrow" on={d.due === tomorrow} color={C.text} onPress={() => pickDue(tomorrow)} />
      <Chip text={custom ? shortDay(d.due!) : 'Date'} on={custom || cal} color={C.text} onPress={toggleCal}
        glyph={<Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" stroke={custom || cal ? C.text : C.muted} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>} />
      <Chip text="No date" on={!d.due} color={C.text} onPress={() => pickDue(null)} />
    </View>
  );

  return (
    <>
      <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, st.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[st.wrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.springify().duration(380).dampingRatio(1)} style={[st.sheet, { paddingBottom: kb ? 10 : Math.max(insets.bottom, 12) + 4 }]}>
          {/* never taller than the room above the keyboard: what doesn't fit scrolls instead of going off screen */}
          <ScrollView bounces={false} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} style={st.scroll} contentContainerStyle={st.body}>
            <TextInput ref={input} autoFocus value={d.title} onChangeText={typed} onFocus={() => setCal(false)} placeholder={editing ? 'Task' : 'Add a task'}
              placeholderTextColor={C.faint} selectionColor={NORA} style={st.input} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={() => { void save(); }} multiline={editing} />
            {auto && d.due === auto.day ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Date from text: ${shortDay(auto.day)}. Undo`} onPress={undoAuto} hitSlop={8} style={st.hint}>
                <Text style={st.hintText}>{`Date from text: ${shortDay(auto.day)}`}</Text>
                <Text style={st.hintUndo}>Undo</Text>
              </Pressable>
            ) : null}
            {details ? (
              <TextInput value={d.notes} onChangeText={(v) => set({ notes: v })} placeholder="Details" placeholderTextColor={C.faint} multiline style={st.notes} />
            ) : null}

            {cal ? (
              <>
                {when}
                <MonthGrid value={d.due} today={today} ink={SURFACE} onPick={(day) => { pickDue(day); input.current?.focus(); }} />
              </>
            ) : (
              <View style={st.controls}>
                <View style={st.left}>
                  {when}
                  <Text style={t.caption} numberOfLines={3}>{aspect ? `Lands on Today under ${ASPECT_NAME[aspect] ?? aspect} on its due day.` : 'Lands on Today on its due day.'}</Text>
                </View>
                <AreaWheel items={wheel} value={d.area} onChange={(area) => set({ area })} />
              </View>
            )}

            <View style={st.row}>
              {!details ? <Chip text="Details" on={false} color={C.text} onPress={() => setDetails(true)} /> : null}
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" disabled={!d.title.trim() || busy} onPress={() => { void save(); }} hitSlop={8} style={[st.save, (!d.title.trim() || busy) && { opacity: 0.35 }]}>
                <Text style={st.saveText}>{editing ? 'Done' : 'Save'}</Text>
              </Pressable>
            </View>
            {err ? <Text style={[t.caption, { color: C.danger }]}>{err}</Text> : null}

            {!editing ? (
              <>
                <View style={st.rule} />
                <Pressable accessibilityRole="switch" accessibilityState={{ checked: d.nora }} onPress={() => { haptic.tick(); set({ nora: !d.nora }); }} style={st.noraRow}>
                  <View style={st.noraDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.noraTitle}>Tag Nora</Text>
                    <Text style={t.caption}>She works on it and adds what she finds under the task.</Text>
                  </View>
                  <Switch value={d.nora} onValueChange={(v) => set({ nora: v })} trackColor={{ true: NORA, false: 'rgba(255,255,255,0.16)' }} thumbColor="#FFFFFF" ios_backgroundColor="rgba(255,255,255,0.16)" />
                </Pressable>
              </>
            ) : onDelete ? (
              <>
                <View style={st.rule} />
                <Pressable accessibilityRole="button" onPress={onDelete} style={st.delete}><Text style={[st.saveText, { color: C.danger }]}>Delete task</Text></Pressable>
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

const st = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(6,7,10,0.6)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { flexShrink: 1, backgroundColor: SURFACE, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 20, gap: 12 },
  input: { fontFamily: F.medium, fontSize: 18, lineHeight: 24, color: C.text, paddingVertical: 4, maxHeight: 120 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -6, alignSelf: 'flex-start' },
  hintText: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: NORA_TEXT },
  hintUndo: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text },
  notes: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.textSoft, minHeight: 44, maxHeight: 120, paddingVertical: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  left: { flex: 1, minWidth: 0, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  save: { height: 34, justifyContent: 'center', paddingHorizontal: 4 },
  saveText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  noraRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  noraDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NORA },
  noraTitle: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  delete: { minHeight: 44, justifyContent: 'center' },
});
