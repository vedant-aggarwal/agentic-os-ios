import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '@/aspects/kit/tokens';
import { C, F } from '@/theme';
import type { RoutineItem } from './day';
import { Group, SubLabel } from './parts';

// A routine in edit mode (hold the section head): rename any step and its details in place, take steps out, move
// one up, add new ones. Nothing saves until Done on the section head, so several changes go in as one.

export function RoutineEditor({ label, items, prefix, onChange }: {
  label: string; items: RoutineItem[]; prefix: 'am' | 'night'; onChange: (items: RoutineItem[]) => void;
}) {
  const set = (i: number, p: Partial<RoutineItem>) => onChange(items.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const up = (i: number) => { haptic.tick(); const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); };
  const drop = (i: number) => { haptic.light(); onChange(items.filter((_, k) => k !== i)); };
  const add = () => { haptic.tick(); onChange([...items, { id: `${prefix}-${Date.now().toString(36)}` as RoutineItem['id'], title: '' }]); };
  return (
    <View>
      <SubLabel>{label}</SubLabel>
      <View style={{ height: 12 }} />
      <Group>
        {items.map((x, i) => (
          <Animated.View key={x.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} layout={LinearTransition.duration(200)}
            style={[st.row, i > 0 && st.rule]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${x.title || 'step'}`} onPress={() => drop(i)} hitSlop={8} style={st.minus}>
              <View style={st.minusBar} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TextInput value={x.title} onChangeText={(v) => set(i, { title: v })} placeholder="Step" placeholderTextColor={C.faint}
                style={st.title} autoFocus={!x.title} returnKeyType="next" />
              <TextInput value={x.sub ?? ''} onChangeText={(v) => set(i, { sub: v || undefined })} placeholder="Details" placeholderTextColor={C.faint}
                style={st.sub} />
            </View>
            {i > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${x.title || 'step'} up`} onPress={() => up(i)} hitSlop={8} style={st.up}>
                <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M6 15l6-6 6 6" stroke={C.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
              </Pressable>
            ) : <View style={st.up} />}
          </Animated.View>
        ))}
        <Pressable accessibilityRole="button" onPress={add} style={({ pressed }) => [st.add, items.length > 0 && st.rule, pressed && { opacity: 0.6 }]}>
          <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={C.muted} strokeWidth={2} strokeLinecap="round" /></Svg>
          <Text style={st.addText}>Add a step</Text>
        </Pressable>
      </Group>
    </View>
  );
}

/** The section head's right side while editing. */
export function EditActions({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  return (
    <View style={st.acts}>
      <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={8}><Text style={st.cancel}>Cancel</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={onDone} hitSlop={8} style={st.done}><Text style={st.doneText}>Done</Text></Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 8, minHeight: 60 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  minus: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center' },
  minusBar: { width: 10, height: 2, borderRadius: 1, backgroundColor: '#FFFFFF' },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text, paddingVertical: 2 },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.textSoft, paddingVertical: 1 },
  up: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  addText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted },
  acts: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  cancel: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.muted },
  done: { height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: C.text, justifyContent: 'center' },
  doneText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: '#0B0C10' },
});
