import { useMemo } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppMark, InstagramMark, Plus, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { Tile, isLive } from '@/components/Tile';
import { slotsFor, useHome } from '@/lib/api';
import { INSTAGRAM, YOUTUBE } from '@/lib/lineup';
import { C, F } from '@/theme';

export default function Channels() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const byId = useMemo(() => Object.fromEntries((data?.channels || []).map((c) => [c.id, c])), [data]);
  const today = data?.today || new Date().toISOString().slice(0, 10);

  const todayLine = useMemo(() => {
    if (!data) return ' ';
    let total = 0;
    let filled = 0;
    for (const slot of [...YOUTUBE, ...INSTAGRAM]) {
      const ch = byId[slot.channelId];
      if (!isLive(slot, ch)) continue;
      const st = slotsFor(ch, today, today).states;
      total += st.length;
      filled += st.filter((s) => s === 'posted' || s === 'queued').length;
    }
    return `Today: ${filled} of ${total} slots filled`;
  }, [data, byId, today]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.header}>
        <View style={styles.brand}>
          <AppMark size={32} />
          <Text style={styles.title}>Content OS</Text>
        </View>
        <Press
          style={styles.round}
          scale={0.92}
          accessibilityLabel="Capture a note"
          onPress={() => Alert.alert('Capture', 'Quick notes come in the next build.')}
        >
          <Plus />
        </Press>
      </View>
      <Text style={styles.sub}>{todayLine}</Text>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={styles.colHead}>
              <YouTubeMark />
              <Text style={styles.colText}>YouTube</Text>
            </View>
            <View style={styles.colHead}>
              <InstagramMark />
              <Text style={styles.colText}>Instagram</Text>
            </View>
          </View>
          {YOUTUBE.map((yt, i) => {
            const ig = INSTAGRAM[i];
            return (
              <View key={yt.channelId} style={[styles.row, { marginTop: i ? 10 : 8 }]}>
                <Tile slot={yt} ch={byId[yt.channelId]} today={today} />
                <Tile slot={ig} ch={byId[ig.channelId]} today={today} />
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  sub: { marginTop: 2, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  colHead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 24, paddingLeft: 4 },
  colText: { fontFamily: F.b, fontSize: 14, color: C.ink },
});
