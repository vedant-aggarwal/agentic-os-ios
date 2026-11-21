import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron, XIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { act, api } from '@/lib/api';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

type Learning = { id: string; text: string; kind?: string; at: string; source?: string };
type All = { global: Learning[]; channels: Record<string, Learning[]> };

/** What Kai remembers. Every chat, draft and refine for a channel loads that channel's list plus the global one. */
export default function LearningsPage() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<All | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<All>('/api/learnings'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setRemoving(id);
    try {
      await act('learnings.remove', { id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  const channels = Object.entries(data?.channels || {}).filter(([, l]) => l.length);
  const total = (data?.global.length || 0) + channels.reduce((n, [, l]) => n + l.length, 0);

  const list = (items: Learning[]) => (
    <View style={styles.card}>
      {items.map((l, i) => (
        <View key={l.id} style={[styles.row, i > 0 && styles.divider]}>
          <Text style={styles.text}>{l.text}</Text>
          <Press style={styles.x} scale={0.9} onPress={() => remove(l.id)} disabled={removing === l.id} accessibilityLabel={`Forget: ${l.text}`}>
            {removing === l.id ? <ActivityIndicator size="small" color={C.muted} /> : <XIcon size={14} color={C.muted} />}
          </Press>
        </View>
      ))}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))}>
          <Chevron />
        </Press>
      </View>
      <Text style={styles.title}>Learnings</Text>
      <Text style={styles.sum}>Kai saves what it learns from you and from results. Each channel's list loads whenever Kai works on that channel; the global list loads every time. Tap × to make Kai forget one.</Text>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={load} />
        </View>
      ) : !data ? (
        <Loading />
      ) : total === 0 ? (
        <View style={[styles.card, { marginTop: 20, padding: 16 }]}>
          <Text style={styles.sum}>Nothing yet. Tell Kai things like "this channel is for a US audience" and it will remember.</Text>
        </View>
      ) : (
        <>
          {data.global.length ? (
            <>
              <Text style={styles.h2}>Every channel</Text>
              {list(data.global)}
            </>
          ) : null}
          {channels.map(([id, items]) => {
            const s = slotFor(id);
            return (
              <View key={id}>
                <View style={styles.chHead}>
                  {s ? <Avatar slot={s} size={28} live /> : null}
                  <Text style={styles.h2flat}>{s?.name || id}</Text>
                </View>
                {list(items)}
              </View>
            );
          })}
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
  h2: { marginTop: 24, marginBottom: 8, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  chHead: { marginTop: 24, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  h2flat: { fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  card: { borderRadius: 20, backgroundColor: C.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(20,20,20,0.08)' },
  text: { flex: 1, fontFamily: F.r, fontSize: 15, lineHeight: 21, color: C.ink },
  x: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
});
