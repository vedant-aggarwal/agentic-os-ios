import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron, SparkIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { act, api } from '@/lib/api';
import { attachToKai, setKaiDraft } from '@/lib/kai';
import { slotFor, type Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

type Full = { id: string; name: string; summary: string; skill: string | null; channels: string[]; guide: string; defaultFor: string[]; source: string };

/** One direction in full: the whole guide the AI follows, who uses it, and ways to change it (by hand or through Kai). */
export default function DirectionPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Full | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ direction: Full }>('/api/direction?id=' + encodeURIComponent(String(id)));
      setD(r.direction);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const slots = (d?.channels || []).map(slotFor).filter((s): s is Slot => !!s);

  const save = async () => {
    setSaving(true);
    try {
      await act('directions.save', { id, guide: text });
      setEditing(false);
      setNote('Saved. The old version is kept as a backup on the PC.');
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const askKai = () => {
    if (!d) return;
    attachToKai({ kind: 'direction', id: d.id, label: d.name });
    setKaiDraft(`Edit the ${d.name} direction: `);
    router.navigate('/kai');
  };
  const addToKai = () => {
    if (!d) return;
    attachToKai({ kind: 'direction', id: d.id, label: d.name });
    setNote(`${d.name} is attached to your next message to Kai.`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <View style={styles.bar}>
          <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/directions'))}>
            <Chevron />
          </Press>
          <View style={{ flex: 1 }} />
          {d && !editing ? (
            <Press style={styles.pill} scale={0.95} onPress={() => { setText(d.guide); setEditing(true); setNote(null); }} accessibilityLabel="Edit the guide">
              <Text style={styles.pillText}>Edit</Text>
            </Press>
          ) : null}
        </View>

        {error && !d ? (
          <View style={{ marginTop: 16 }}>
            <ErrorBox message={error} onRetry={load} />
          </View>
        ) : !d ? (
          <Loading />
        ) : (
          <>
            <Text style={styles.title}>{d.name}</Text>
            <Text style={styles.sum}>{d.summary}</Text>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{d.skill ? `Skill: ${d.skill}` : 'Built-in guide'}</Text>
            </View>

            <View style={styles.actions}>
              <Press style={[styles.action, styles.primary]} scale={0.97} onPress={askKai} accessibilityLabel="Ask Kai to edit this direction">
                <SparkIcon size={16} color="#fff" />
                <Text style={[styles.actionText, { color: '#fff' }]}>Ask Kai to edit</Text>
              </Press>
              <Press style={styles.action} scale={0.97} onPress={addToKai} accessibilityLabel="Add this direction as context for Kai">
                <Text style={styles.actionText}>Add to Kai</Text>
              </Press>
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}

            <Text style={styles.h2}>Channels</Text>
            <View style={styles.card}>
              {slots.length ? (
                slots.map((s) => (
                  <View key={s.channelId} style={styles.row}>
                    <Avatar slot={s} size={32} live />
                    <Text style={styles.rowName}>{s.name}</Text>
                    {d.defaultFor.includes(s.channelId) ? <Text style={styles.def}>Default</Text> : null}
                  </View>
                ))
              ) : (
                <Text style={styles.sum}>No channel uses it yet. Pick it in the Concept Generator for any channel.</Text>
              )}
            </View>

            <Text style={styles.h2}>How it is made</Text>
            {editing ? (
              <>
                <TextInput style={styles.editor} value={text} onChangeText={setText} multiline textAlignVertical="top" autoCorrect={false} autoCapitalize="none" />
                <View style={styles.actions}>
                  <Press style={styles.action} scale={0.97} onPress={() => setEditing(false)} accessibilityLabel="Cancel editing">
                    <Text style={styles.actionText}>Cancel</Text>
                  </Press>
                  <Press style={[styles.action, styles.primary, (saving || !text.trim()) && { opacity: 0.5 }]} disabled={saving || !text.trim()} scale={0.97} onPress={save} accessibilityLabel="Save the guide">
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionText, { color: '#fff' }]}>Save</Text>}
                  </Press>
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Guide text={d.guide} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The guide as readable text: headings bold, bullets indented, markdown marks removed. */
function Guide({ text }: { text: string }) {
  if (!text.trim()) return <Text style={styles.sum}>This direction has no guide yet.</Text>;
  return (
    <View style={{ gap: 6 }}>
      {text.split('\n').map((line, i) => {
        const t = line.replace(/\*\*/g, '').replace(/`/g, '');
        if (!t.trim()) return <View key={i} style={{ height: 4 }} />;
        const h = t.match(/^#{1,6}\s+(.*)/);
        if (h) return <Text key={i} style={styles.gh}>{h[1]}</Text>;
        const b = t.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
        if (b) return (
          <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
            <Text style={styles.gt}>•</Text>
            <Text style={[styles.gt, { flex: 1 }]}>{b[1]}</Text>
          </View>
        );
        return <Text key={i} style={styles.gt}>{t.replace(/^>\s?/, '')}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pill: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: C.card, justifyContent: 'center' },
  pillText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  title: { marginTop: 12, fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  sum: { marginTop: 6, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.muted },
  chip: { marginTop: 12, alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.card, justifyContent: 'center' },
  chipText: { fontFamily: F.s, fontSize: 13, color: C.ink2 },
  actions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  action: { flex: 1, height: 46, borderRadius: 23, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primary: { backgroundColor: C.ink },
  actionText: { fontFamily: F.b, fontSize: 14, color: C.ink },
  note: { marginTop: 8, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.growInk },
  h2: { marginTop: 24, marginBottom: 8, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  card: { padding: 14, borderRadius: 20, backgroundColor: C.card, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, fontFamily: F.s, fontSize: 15, color: C.ink },
  def: { fontFamily: F.s, fontSize: 12, color: C.growInk },
  gh: { marginTop: 8, fontFamily: F.b, fontSize: 15, lineHeight: 21, color: C.ink },
  gt: { fontFamily: F.r, fontSize: 14, lineHeight: 21, color: C.ink2 },
  editor: { minHeight: 420, borderRadius: 18, backgroundColor: C.card, padding: 14, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.ink },
});
