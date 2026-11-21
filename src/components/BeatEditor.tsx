import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from './Press';
import type { Beat } from '@/lib/api';
import { C, F } from '@/theme';

const FIELDS: { key: keyof Beat; label: string; lines: number; max: number }[] = [
  { key: 'time', label: 'Time', lines: 1, max: 20 },
  { key: 'beat', label: 'What happens', lines: 3, max: 300 },
  { key: 'visual', label: 'On screen', lines: 3, max: 300 },
  { key: 'line', label: 'Spoken line or text (optional)', lines: 3, max: 400 },
];

/** Edit one beat of a reel's structure, or delete it. `isNew` shows Add instead of Save. */
export function BeatEditor({ beat, isNew, onSave, onDelete, onClose }: { beat: Beat; isNew?: boolean; onSave: (b: Beat) => void; onDelete?: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [b, setB] = useState(beat);
  const ok = b.beat.trim().length > 0;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.head}>
            <Press onPress={onClose} style={styles.btn} accessibilityLabel="Cancel">
              <Text style={styles.btnText}>Cancel</Text>
            </Press>
            <Text style={styles.title}>{isNew ? 'New beat' : 'Edit beat'}</Text>
            <Press
              onPress={() => ok && onSave({ time: b.time.trim(), beat: b.beat.trim(), visual: b.visual.trim(), line: b.line.trim() })}
              style={[styles.btn, styles.save, !ok && { opacity: 0.4 }]}
              disabled={!ok}
              accessibilityLabel={isNew ? 'Add beat' : 'Save beat'}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>{isNew ? 'Add' : 'Save'}</Text>
            </Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            {FIELDS.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={[styles.input, { minHeight: 21 * f.lines + 24 }]}
                  value={b[f.key]}
                  onChangeText={(t) => setB((x) => ({ ...x, [f.key]: t }))}
                  multiline={f.lines > 1}
                  maxLength={f.max}
                  textAlignVertical="top"
                  placeholder={f.key === 'time' ? 'e.g. 0-2s' : undefined}
                  placeholderTextColor={C.faint}
                />
              </View>
            ))}
            {onDelete ? (
              <Press style={styles.delete} scale={0.97} onPress={onDelete} accessibilityLabel="Delete this beat">
                <Text style={styles.deleteText}>Delete beat</Text>
              </Press>
            ) : null}
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
  delete: { marginTop: 4, height: 46, borderRadius: 23, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: F.b, fontSize: 15, color: '#B4232F' },
});
