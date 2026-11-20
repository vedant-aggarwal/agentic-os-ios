import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { isLive } from '@/components/Tile';
import { addDays, slotsFor, useHome } from '@/lib/api';
import { ALL } from '@/lib/lineup';
import { C, F } from '@/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default function Calendar() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const [offset, setOffset] = useState(0);
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const start = addDays(today, -new Date(today + 'T00:00:00Z').getUTCDay() + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const rows = data ? ALL.map((slot) => ({ slot, ch: data.channels.find((c) => c.id === slot.channelId) })).filter((r) => isLive(r.slot, r.ch)) : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.head}>
        <Text style={styles.title}>Calendar</Text>
        <Press style={styles.arrow} scale={0.9} accessibilityLabel="Previous week" onPress={() => setOffset(offset - 1)}>
          <Chevron size={16} />
        </Press>
        <Text style={styles.range}>{label(days[0])} – {label(days[6])}</Text>
        <Press style={styles.arrow} scale={0.9} accessibilityLabel="Next week" onPress={() => setOffset(offset + 1)}>
          <Chevron size={16} dir="right" />
        </Press>
      </View>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !data ? (
        <Loading />
      ) : (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.who} />
            {days.map((d, i) => (
              <View key={d} style={styles.dayHead}>
                <Text style={styles.wd}>{WEEKDAYS[i]}</Text>
                <Text style={[styles.dn, d === today && styles.dnToday]}>{Number(d.slice(8))}</Text>
              </View>
            ))}
          </View>
          {rows.map(({ slot, ch }) => {
            const color = slot.platform === 'youtube' ? C.yt : C.ig;
            return (
              <Press key={slot.channelId} scale={0.98} style={styles.row} onPress={() => router.push(`/channel/${slot.channelId}`)} accessibilityLabel={`Open ${slot.name}`}>
                <View style={styles.who}>
                  <Avatar slot={slot} size={32} live />
                </View>
                {days.map((d) => {
                  const { states } = slotsFor(ch!, d, today);
                  return (
                    <View key={d} style={[styles.cell, d === today && styles.cellToday]}>
                      {states.map((st, i) => (
                        <View
                          key={i}
                          style={[
                            styles.pip,
                            st === 'posted' && { backgroundColor: color },
                            st === 'queued' && { backgroundColor: color, opacity: 0.35 },
                            st === 'missed' && { backgroundColor: C.missed },
                            st === 'open' && styles.pipOpen,
                          ]}
                        />
                      ))}
                    </View>
                  );
                })}
              </Press>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  range: { minWidth: 104, textAlign: 'center', fontFamily: F.s, fontSize: 14, color: C.ink },
  card: { marginTop: 16, backgroundColor: C.card, borderRadius: 20, padding: 8, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  who: { width: 40, alignItems: 'center' },
  dayHead: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  wd: { fontFamily: F.s, fontSize: 12, color: C.faint },
  dn: { marginTop: 2, width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, fontFamily: F.s, fontSize: 14, color: C.ink, overflow: 'hidden' },
  dnToday: { backgroundColor: C.ink, color: '#fff' },
  cell: { flex: 1, height: 40, borderRadius: 10, backgroundColor: C.bg, padding: 5, justifyContent: 'center', gap: 3 },
  cellToday: { borderWidth: 1.5, borderColor: C.ink, padding: 3.5 },
  pip: { height: 5, borderRadius: 2.5 },
  pipOpen: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.dash },
});
