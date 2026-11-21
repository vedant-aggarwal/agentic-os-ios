import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InstagramMark, YouTubeMark } from '@/components/Icons';
import { ErrorBox, Loading } from '@/components/States';
import { Tile } from '@/components/Tile';
import { useHome } from '@/lib/api';
import { INSTAGRAM, YOUTUBE } from '@/lib/lineup';
import { C } from '@/theme';

export default function Channels() {
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const byId = useMemo(() => Object.fromEntries((data?.channels || []).map((c) => [c.id, c])), [data]);
  const today = data?.today || new Date().toISOString().slice(0, 10);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 150 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.header}>
        <View style={styles.colHead} accessibilityRole="header" accessibilityLabel="YouTube">
          <YouTubeMark size={44} />
        </View>
        <View style={styles.colHead} accessibilityRole="header" accessibilityLabel="Instagram">
          <InstagramMark size={34} />
        </View>
      </View>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !data ? (
        <Loading />
      ) : (
        YOUTUBE.map((yt, i) => {
          const ig = INSTAGRAM[i];
          return (
            <View key={yt.channelId} style={[styles.row, { marginTop: i ? 10 : 8 }]}>
              <Tile slot={yt} ch={byId[yt.channelId]} today={today} />
              <Tile slot={ig} ch={byId[ig.channelId]} today={today} />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 10, height: 52 },
  colHead: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
});
