import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from './Press';
import { Empty, ErrorBox, Loading } from './States';
import { api } from '@/lib/api';
import { C, F } from '@/theme';

export type Row = { id: string; title: string; status: string; meta?: string };

type Props = {
  title: string;
  path: string;
  pick: (body: any) => Row[];
  order: string[];
  initial: string;
  emptyText: string;
};

export function ListScreen({ title, path, pick, order, initial, emptyText }: Props) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(initial);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(pick(await api(path)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [path, pick]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const chips = order.filter((s) => counts[s]);
  const shown = (rows || []).filter((r) => r.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <Text style={styles.title}>{title}</Text>
      {rows && chips.length > 0 && (
        <View style={{ height: 60 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((s) => {
            const on = s === filter;
            return (
              <Press key={s} scale={0.95} onPress={() => setFilter(s)} style={[styles.chip, on && { backgroundColor: C.ink }]} accessibilityState={{ selected: on }}>
                <Text style={[styles.chipText, on && { color: '#fff' }]}>
                  {s[0].toUpperCase() + s.slice(1)} {counts[s]}
                </Text>
              </Press>
            );
          })}
        </ScrollView>
        </View>
      )}
      {error && !rows ? (
        <View style={{ padding: 16 }}>
          <ErrorBox message={error} onRetry={load} />
        </View>
      ) : !rows ? (
        <Loading />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={shown}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 8 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.ink} />}
          ListEmptyComponent={<Empty title="Nothing here" body={emptyText} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              {item.meta ? <Text style={styles.meta}>{item.meta}</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: 16, fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: 'center' },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, justifyContent: 'center' },
  chipText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  row: { backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, fontFamily: F.m, fontSize: 16, lineHeight: 22, color: C.ink },
  meta: { fontFamily: F.s, fontSize: 12, color: C.muted },
});
