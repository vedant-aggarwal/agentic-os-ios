import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from './Press';
import { C, F } from '@/theme';

/** A sheet for editing one long text (e.g. the ElevenLabs voice script). */
export function TextEditor({ title, value, hint, max = 4800, onSave, onClose }: { title: string; value: string; hint?: string; max?: number; onSave: (t: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [t, setT] = useState(value);
  const ok = t.trim().length > 0;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.head}>
            <Press onPress={onClose} style={styles.btn} accessibilityLabel="Cancel">
              <Text style={styles.btnText}>Cancel</Text>
            </Press>
            <Text style={styles.title}>{title}</Text>
            <Press onPress={() => ok && onSave(t.trim())} style={[styles.btn, styles.save, !ok && { opacity: 0.4 }]} disabled={!ok} accessibilityLabel="Save">
              <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>
            </Press>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 8 }}>
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
            <TextInput style={styles.input} value={t} onChangeText={setT} multiline maxLength={max} textAlignVertical="top" autoFocus />
            <Text style={styles.count}>
              {t.length} / {max}
            </Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: { maxHeight: '92%', backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  title: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 17, color: C.ink },
  btn: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, justifyContent: 'center' },
  save: { backgroundColor: C.ink },
  btnText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  hint: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  input: { minHeight: 320, borderRadius: 14, backgroundColor: C.card, padding: 12, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.ink },
  count: { alignSelf: 'flex-end', fontFamily: F.m, fontSize: 12, color: C.faint },
});
