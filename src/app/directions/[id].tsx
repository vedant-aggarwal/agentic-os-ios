import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron } from '@/components/Icons';
import { Press } from '@/components/Press';
import { Loading } from '@/components/States';
import { useDirections } from '@/lib/api';
import { slotFor, type Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

/** One direction: what it is, which channels use it (and where it is the default), and the start of its guide. */
export default function DirectionPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const dirs = useDirections();
  const d = dirs?.directions.find((x) => x.id === id);
  const slots = (d?.channels || []).map(slotFor).filter((s): s is Slot => !!s);
  // Strip markdown marks so the preview reads as plain text.
  const preview = (d?.preview || '').replace(/^#+\s*/gm, '').replace(/\*\*/g, '').replace(/`/g, '').trim();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/directions'))}>
          <Chevron />
        </Press>
      </View>

      {!dirs ? (
        <Loading />
      ) : !d ? (
        <Text style={styles.sum}>Direction not found.</Text>
      ) : (
        <>
          <Text style={styles.title}>{d.name}</Text>
          <Text style={styles.sum}>{d.summary}</Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{d.skill ? `Skill: ${d.skill}` : 'Built-in guide'}</Text>
          </View>

          <Text style={styles.h2}>Channels</Text>
          <View style={styles.card}>
            {slots.length ? (
              slots.map((s) => (
                <View key={s.channelId} style={styles.row}>
                  <Avatar slot={s} size={32} live />
                  <Text style={styles.rowName}>{s.name}</Text>
                  {dirs.defaults[s.channelId] === d.id ? <Text style={styles.def}>Default</Text> : null}
                </View>
              ))
            ) : (
              <Text style={styles.sum}>No channel uses it yet. Pick it in the Concept Generator for any channel.</Text>
            )}
          </View>

          {preview ? (
            <>
              <Text style={styles.h2}>How it is made</Text>
              <View style={styles.card}>
                <Text style={styles.guide}>
                  {preview}
                  {preview.length >= 880 ? '…' : ''}
                </Text>
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 12, fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  sum: { marginTop: 6, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.muted },
  chip: { marginTop: 12, alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.card, justifyContent: 'center' },
  chipText: { fontFamily: F.s, fontSize: 13, color: C.ink2 },
  h2: { marginTop: 24, marginBottom: 8, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  card: { padding: 14, borderRadius: 20, backgroundColor: C.card, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowName: { flex: 1, fontFamily: F.s, fontSize: 15, color: C.ink },
  def: { fontFamily: F.s, fontSize: 12, color: C.growInk },
  guide: { fontFamily: F.r, fontSize: 14, lineHeight: 21, color: C.ink2 },
});
