import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron } from '@/components/Icons';
import { Press } from '@/components/Press';
import { Loading } from '@/components/States';
import { useDirections } from '@/lib/api';
import { slotFor, type Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

/** Every direction: one way of making content, each backed by a skill (or a short guide) the AI follows. */
export default function Directions() {
  const insets = useSafeAreaInsets();
  const dirs = useDirections();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))}>
          <Chevron />
        </Press>
        <Text style={styles.barTitle}>Directions</Text>
        <View style={{ width: 44 }} />
      </View>
      <Text style={styles.lead}>Each direction is one way of making content. The Concept Generator follows the one you pick.</Text>

      {!dirs ? (
        <Loading />
      ) : (
        <View style={{ gap: 8, marginTop: 12 }}>
          {dirs.directions.map((d) => {
            const slots = d.channels.map(slotFor).filter((s): s is Slot => !!s);
            return (
              <Press key={d.id} style={styles.card} scale={0.98} onPress={() => router.push(`/directions/${d.id}`)} accessibilityLabel={d.name}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{d.name}</Text>
                  <Text numberOfLines={2} style={styles.sum}>{d.summary}</Text>
                  <View style={styles.meta}>
                    {slots.length ? (
                      <View style={styles.faces}>
                        {slots.slice(0, 4).map((s, i) => (
                          <View key={s.channelId} style={{ marginLeft: i ? -8 : 0 }}>
                            <Avatar slot={s} size={24} live />
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>{d.skill ? `Skill: ${d.skill}` : 'Built-in guide'}</Text>
                    </View>
                  </View>
                </View>
                <Chevron size={18} color={C.faint} dir="right" />
              </Press>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  lead: { marginTop: 12, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 20, backgroundColor: C.card },
  name: { fontFamily: F.b, fontSize: 16, lineHeight: 22, color: C.ink },
  sum: { marginTop: 2, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  meta: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  faces: { flexDirection: 'row' },
  chip: { height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.bg, justifyContent: 'center' },
  chipText: { fontFamily: F.s, fontSize: 12, color: C.ink2 },
});
