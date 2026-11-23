import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic, t } from '@/aspects/kit/tokens';
import { Chip } from '@/capture/parts';
import type { Area, LifePayload } from '@/lib/today';
import { ASPECT_COLOR, C, F } from '@/theme';
import { NORA } from '@/today2/parts';
import { addDays, istDay, type Draft } from './data';

// The create sheet, on the keyboard: a title, then when, the area (which decides where it lands on Today) and Tag
// Nora. Return saves and keeps the sheet open for the next one. With `initial` it edits a task instead.

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
      {open ? <Body key={initial?.id ?? 'new'} initial={initial ?? null} areas={areas} life={life} onClose={onClose} onSave={onSave} onDelete={onDelete} /> : null}
    </Modal>
  );
}

function Body({ initial, areas, life, onClose, onSave, onDelete }: {
  initial: (Draft & { id: string }) | null; areas: Area[]; life: LifePayload | null;
  onClose: () => void; onSave: (d: Draft) => Promise<void>; onDelete?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const today = istDay();
  const blank: Draft = { title: '', notes: '', area: null, due: null, nora: false };
  const [d, setD] = useState<Draft>(initial ?? blank);
  const [details, setDetails] = useState(!!initial?.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const editing = !!initial;

  const save = async () => {
    if (!d.title.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      await onSave(d);
      haptic.success();
      if (editing) onClose();
      else { setD({ ...blank, area: d.area, due: d.due }); setDetails(false); input.current?.focus(); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'That didn’t save.'); } finally { setBusy(false); }
  };

  const whens: { key: string | null; label: string }[] = [
    { key: today, label: 'Today' }, { key: addDays(today, 1), label: 'Tomorrow' }, { key: null, label: 'No date' },
  ];
  if (d.due && !whens.some((w) => w.key === d.due)) whens.splice(2, 0, { key: d.due, label: d.due.slice(5).split('-').reverse().join('/') });
  const aspect = d.area ? life?.areaAspects[d.area]?.[0] : undefined;

  return (
    <>
      <Animated.View entering={FadeIn.duration(160)} style={[StyleSheet.absoluteFill, st.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.wrap} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.springify().duration(380).dampingRatio(1)} style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TextInput ref={input} autoFocus value={d.title} onChangeText={(v) => set({ title: v })} placeholder={editing ? 'Task' : 'Add a task'}
            placeholderTextColor={C.faint} selectionColor={NORA} style={st.input} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={() => { void save(); }} multiline={editing} />
          {details ? (
            <TextInput value={d.notes} onChangeText={(v) => set({ notes: v })} placeholder="Details" placeholderTextColor={C.faint} multiline style={st.notes} />
          ) : null}
          <View style={st.row}>
            {!details ? <Chip text="Details" on={false} color={C.text} onPress={() => setDetails(true)} /> : null}
            {whens.map((w) => <Chip key={w.label} text={w.label} on={d.due === w.key} color={C.text} onPress={() => set({ due: w.key })} />)}
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="button" disabled={!d.title.trim() || busy} onPress={() => { void save(); }} hitSlop={8} style={[st.save, (!d.title.trim() || busy) && { opacity: 0.35 }]}>
              <Text style={st.saveText}>{editing ? 'Done' : 'Save'}</Text>
            </Pressable>
          </View>
          {err ? <Text style={[t.caption, { color: C.danger }]}>{err}</Text> : null}

          <View style={st.rule} />
          <Text style={t.section}>Area</Text>
          <View style={st.chips}>
            <Chip text="No area" on={!d.area} color={C.text} onPress={() => set({ area: null })} />
            {areas.map((a) => <Chip key={a.slug} text={a.name} on={d.area === a.slug} color={areaColor(life, a.slug)} onPress={() => set({ area: a.slug })} />)}
          </View>
          <Text style={t.caption}>{aspect ? `Lands on Today under ${ASPECT_NAME[aspect] ?? aspect} on its due day.` : 'Lands on Today on its due day.'}</Text>

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
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}

const st = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(6,7,10,0.6)' },
  wrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: SURFACE, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  input: { fontFamily: F.medium, fontSize: 18, lineHeight: 24, color: C.text, paddingVertical: 4, maxHeight: 120 },
  notes: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.textSoft, minHeight: 44, maxHeight: 120, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  save: { height: 34, justifyContent: 'center', paddingHorizontal: 4 },
  saveText: { fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.text },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  noraRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  noraDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NORA },
  noraTitle: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  delete: { minHeight: 44, justifyContent: 'center' },
});
