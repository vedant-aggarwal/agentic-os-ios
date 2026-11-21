import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron, InstagramMark, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { rebuildStructure, REEL_STAGES, useReels } from '@/lib/api';
import { STAGE_INFO } from '@/lib/reels';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

export default function ReelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { reels, error, reload } = useReels();
  const reel = reels?.find((r) => r.id === id);
  const slot = reel ? slotFor(reel.channelId) : undefined;
  const doneUpTo = reel ? REEL_STAGES.indexOf(reel.stage) : -1;
  const working = !!reel?.working;

  // While the PC is building a step, check back every few seconds.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [working, reload]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Chevron />
        </Press>
        <Text style={styles.barTitle}>Reel</Text>
        <View style={{ width: 44 }} />
      </View>

      {error && !reels ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !reels ? (
        <Loading />
      ) : !reel || !slot ? (
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.title}>Reel not found</Text>
          <Text style={styles.body}>It may have been removed on the PC.</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.channelRow}>
              <Avatar slot={slot} size={40} live />
              <Text style={styles.channelName}>{slot.name}</Text>
              {slot.platform === 'youtube' ? <YouTubeMark size={20} /> : <InstagramMark size={17} />}
            </View>
            <Text style={styles.title}>{reel.title}</Text>
            {reel.hook ? <Text style={styles.hook}>{reel.hook}</Text> : null}
            <Text style={styles.body}>{reel.premise || reel.idea}</Text>
            {reel.direction ? (
              <View style={styles.dateChip}>
                <Text style={styles.dateText}>{reel.direction.name}</Text>
              </View>
            ) : null}
            {reel.notes ? <Text style={styles.notes}>Your note: {reel.notes}</Text> : null}
          </View>

          <Text style={styles.h2}>Structure</Text>
          {reel.working === 'structure' ? (
            <View style={[styles.card, styles.busy]}>
              <ActivityIndicator color={C.ink} />
              <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>Laying out the video beat by beat. This takes about a minute.</Text>
            </View>
          ) : reel.structure ? (
            <View style={styles.card}>
              <Text style={styles.len}>About {reel.structure.lengthSeconds} seconds · {reel.structure.beats.length} beats</Text>
              {reel.structure.beats.map((b, i) => (
                <View key={i} style={[styles.beat, i > 0 && styles.beatLine]}>
                  <Text style={styles.time}>{b.time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.beatText}>{b.beat}</Text>
                    <Text style={styles.visual}>{b.visual}</Text>
                    {b.line ? <Text style={styles.line2}>“{b.line}”</Text> : null}
                  </View>
                </View>
              ))}
              <Press style={styles.redo} scale={0.97} onPress={() => rebuildStructure(reel.id).catch(() => {})} accessibilityLabel="Build the structure again">
                <Text style={styles.redoText}>Build again</Text>
              </Press>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={[styles.body, { marginTop: 0 }]}>{reel.error ? `The structure failed: ${reel.error}` : 'No structure yet.'}</Text>
              <Press style={styles.redo} scale={0.97} onPress={() => rebuildStructure(reel.id).catch(() => {})} accessibilityLabel="Build the structure">
                <Text style={styles.redoText}>{reel.error ? 'Try again' : 'Build structure'}</Text>
              </Press>
            </View>
          )}

          <Text style={styles.h2}>Production</Text>
          <View style={styles.card}>
            {REEL_STAGES.map((st, i) => {
              const done = i <= doneUpTo;
              const next = i === doneUpTo + 1;
              return (
                <View key={st} style={styles.stage}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, done && styles.dotDone, next && styles.dotNext]}>
                      {done ? <Text style={styles.tick}>✓</Text> : null}
                    </View>
                    {i < REEL_STAGES.length - 1 ? <View style={[styles.line, done && { backgroundColor: C.ink }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < REEL_STAGES.length - 1 ? 18 : 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.stageName, !done && !next && { color: C.muted }]}>{STAGE_INFO[st].name}</Text>
                      {next ? (
                        <View style={styles.nextTag}>
                          <Text style={styles.nextText}>Next</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.stageWhat}>{STAGE_INFO[st].what}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  card: { marginTop: 12, padding: 16, borderRadius: 24, backgroundColor: C.card },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  channelName: { flex: 1, fontFamily: F.s, fontSize: 15, color: C.ink },
  title: { marginTop: 14, fontFamily: F.b, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: C.ink },
  body: { marginTop: 6, fontFamily: F.r, fontSize: 15, lineHeight: 22, color: C.ink2 },
  dateChip: { marginTop: 14, alignSelf: 'flex-start', height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.bg, justifyContent: 'center' },
  dateText: { fontFamily: F.s, fontSize: 13, color: C.ink },
  hook: { marginTop: 8, fontFamily: F.s, fontSize: 16, lineHeight: 22, color: C.ink },
  notes: { marginTop: 12, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.faint },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  len: { fontFamily: F.s, fontSize: 13, lineHeight: 18, color: C.muted, marginBottom: 4 },
  beat: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  beatLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  time: { width: 52, fontFamily: F.b, fontSize: 13, lineHeight: 20, color: C.ink },
  beatText: { fontFamily: F.s, fontSize: 15, lineHeight: 21, color: C.ink },
  visual: { marginTop: 3, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  line2: { marginTop: 4, fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.ink2 },
  redo: { marginTop: 12, alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.bg, justifyContent: 'center' },
  redoText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  h2: { marginTop: 24, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  stage: { flexDirection: 'row', gap: 12 },
  rail: { width: 24, alignItems: 'center' },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.empty, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  dotDone: { backgroundColor: C.ink, borderColor: C.ink },
  dotNext: { borderColor: C.ink },
  tick: { color: '#fff', fontFamily: F.b, fontSize: 12, lineHeight: 14 },
  line: { flex: 1, width: 2, marginVertical: 2, backgroundColor: C.empty },
  stageName: { fontFamily: F.s, fontSize: 16, lineHeight: 22, color: C.ink },
  stageWhat: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  nextTag: { height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: C.ink, justifyContent: 'center' },
  nextText: { fontFamily: F.b, fontSize: 11, color: '#fff' },
});
