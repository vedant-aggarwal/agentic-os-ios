import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from '../Press';
import type { Concept } from '@/lib/api';
import { C, F } from '@/theme';

const FIELDS: { key: keyof Concept; label: string; lines: number }[] = [
  { key: 'title', label: 'Title', lines: 1 },
  { key: 'hook', label: 'Hook (first two seconds)', lines: 2 },
  { key: 'premise', label: 'What happens', lines: 5 },
  { key: 'why', label: 'Why it fits', lines: 2 },
];

/** Edit every field of one concept. Opened by holding a concept card. */
export function ConceptEditor({ concept, onSave, onClose }: { concept: Concept; onSave: (c: Concept) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [c, setC] = useState(concept);
  const ok = c.title.trim() && c.premise.trim();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.head}>
            <Press onPress={onClose} style={styles.btn} accessibilityLabel="Cancel">
              <Text style={styles.btnText}>Cancel</Text>
            </Press>
            <Text style={styles.title}>Edit concept</Text>
            <Press onPress={() => ok && onSave({ ...c, title: c.title.trim(), hook: c.hook.trim(), premise: c.premise.trim(), why: c.why.trim() })} style={[styles.btn, styles.save, !ok && { opacity: 0.4 }]} disabled={!ok} accessibilityLabel="Save">
              <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>
            </Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            {FIELDS.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 22 * f.lines + 24 }]}
                  value={c[f.key]}
                  onChangeText={(t) => setC((x) => ({ ...x, [f.key]: t }))}
                  multiline={f.lines > 1}
                  maxLength={f.key === 'premise' ? 700 : 240}
                  textAlignVertical="top"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: { maxHeight: '88%', backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  title: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 17, color: C.ink },
  btn: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, justifyContent: 'center' },
  save: { backgroundColor: C.ink },
  btnText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  label: { marginBottom: 6, fontFamily: F.s, fontSize: 13, color: C.ink2 },
  input: { borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 12, fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink },
});
