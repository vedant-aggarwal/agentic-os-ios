import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron, InstagramMark, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { Empty, ErrorBox, Loading } from '@/components/States';
import { isLive } from '@/components/Tile';
import { addDays, compact, slotsFor, useHome, weekStart, type Channel } from '@/lib/api';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const [offset, setOffset] = useState(0);
  const slot = slotFor(String(id));
  const ch = data?.channels.find((c) => c.id === id);
  const today = data?.today || new Date().toISOString().slice(0, 10);

  if (!slot) return null;
  const live = isLive(slot, ch);
  const color = slot.platform === 'youtube' ? C.yt : C.ig;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.header}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back to channels" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Chevron />
        </Press>
        <View style={styles.titleRow}>
          {slot.platform === 'youtube' ? <YouTubeMark /> : <InstagramMark size={20} />}
          <Text numberOfLines={1} style={styles.title}>{slot.name}</Text>
        </View>
        <Avatar slot={slot} size={44} live={live} ringBg={C.bg} />
      </View>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !data || !ch ? (
        <Loading />
      ) : !live ? (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Empty title={slot.setupNote || 'Not started'} body="This channel has no posting schedule yet. Set its slots in Content OS and its calendar will show here." />
          <Pipeline ch={ch} />
        </View>
      ) : (
        <>
          <Stats ch={ch} platform={slot.platform} />
          <Calendar ch={ch} today={today} color={color} offset={offset} setOffset={setOffset} />
          <Pipeline ch={ch} />
          <Press
            style={styles.cta}
            onPress={() => Alert.alert(ctaText(ch, slot.name), 'This action gets wired up next.')}
          >
            <Text style={styles.ctaText}>{ctaText(ch, slot.name)}</Text>
          </Press>
        </>
      )}
    </ScrollView>
  );
}

function ctaText(ch: Channel, name: string) {
  if (ch.pipeline.edit) return `Review ${ch.pipeline.edit} edits`;
  if (ch.pipeline.scripts) return `Review ${ch.pipeline.scripts} scripts`;
  return `Find ideas for ${name}`;
}

function Stats({ ch, platform }: { ch: Channel; platform: 'youtube' | 'instagram' }) {
  const s = ch.stats;
  const cells: [string, string][] = [
    [compact(s.followers), platform === 'youtube' ? 'Subscribers' : 'Followers'],
    s.weekViews != null
      ? [compact(s.weekViews), 'Views, 7 days']
      : s.weekLikes != null
        ? [compact(s.weekLikes), 'Likes, 7 days']
        : [compact(s.totalViews), 'Views'],
    [s.weekPosts != null ? `${s.weekPosts}/${s.weekTarget ?? ch.perDay * 7}` : '–', 'Posts, 7 days'],
  ];
  return (
    <View style={styles.stats}>
      {cells.map(([n, l], i) => (
        <View key={l} style={[styles.statCell, i === 1 && styles.statMid]}>
          <Text style={styles.statNum}>{n}</Text>
          <Text style={styles.statLabel}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function Calendar({ ch, today, color, offset, setOffset }: { ch: Channel; today: string; color: string; offset: number; setOffset: (n: number) => void }) {
  // One week of history, this week, then two ahead.
  const start = addDays(weekStart(today), -7 + offset * 28);
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  return (
    <View>
      <View style={styles.calHead}>
        <Text style={[styles.h2, { flex: 1 }]}>Schedule</Text>
        <Press style={styles.arrow} scale={0.9} accessibilityLabel="Earlier weeks" onPress={() => setOffset(offset - 1)}>
          <Chevron size={16} />
        </Press>
        <Text style={styles.range}>{label(days[0])} – {label(days[27])}</Text>
        <Press style={styles.arrow} scale={0.9} accessibilityLabel="Later weeks" onPress={() => setOffset(offset + 1)}>
          <Chevron size={16} dir="right" />
        </Press>
      </View>
      <View style={[styles.grid, { marginTop: 8 }]}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.weekday}>{d}</Text>
        ))}
      </View>
      <View style={[styles.grid, { marginTop: 6, rowGap: 6 }]}>
        {days.map((d) => {
          const { states, extra } = slotsFor(ch, d, today);
          const past = d < today;
          return (
            <View
              key={d}
              accessibilityLabel={`${label(d)}: ${states.filter((s) => s === 'posted').length} of ${states.length} posted`}
              style={[styles.cell, d === today && styles.cellToday]}
            >
              <View style={styles.cellTop}>
                <Text style={[styles.cellNum, past && { color: C.faint }]}>{Number(d.slice(8))}</Text>
                {extra ? <Text style={styles.extra}>+{extra}</Text> : null}
              </View>
              <View style={styles.pips}>
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
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Legend swatch={{ backgroundColor: color }} text="Posted" />
        <Legend swatch={{ backgroundColor: color, opacity: 0.35 }} text="Queued" />
        <Legend swatch={{ backgroundColor: C.missed }} text="Missed" />
        <Legend swatch={styles.pipOpen} text="Open" />
      </View>
    </View>
  );
}

function Legend({ swatch, text }: { swatch: object; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 14, height: 8, borderRadius: 3 }, swatch]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function Pipeline({ ch }: { ch: Channel }) {
  const stages: [string, number][] = [
    ['Ideas', ch.pipeline.ideas],
    ['Scripts', ch.pipeline.scripts],
    ['Shoot', ch.pipeline.shoot],
    ['Edit', ch.pipeline.edit],
    ['Ready', ch.pipeline.ready],
  ];
  return (
    <View>
      <Text style={[styles.h2, { marginTop: 24, marginBottom: 8 }]}>Pipeline</Text>
      <View style={styles.pipeline}>
        {stages.map(([name, n]) => (
          <View key={name} style={[styles.stage, n > 0 && { backgroundColor: C.ink }]}>
            <Text style={[styles.stageNum, { color: n > 0 ? '#fff' : '#B9BCC3' }]}>{compact(n)}</Text>
            <Text style={[styles.stageLabel, { color: n > 0 ? '#fff' : '#6B6E76' }]}>{name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  title: { fontFamily: F.b, fontSize: 18, lineHeight: 28, color: C.ink },
  stats: { marginTop: 16, height: 72, borderRadius: 20, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center' },
  statCell: { flex: 1, alignItems: 'center' },
  statMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.line },
  statNum: { fontFamily: F.b, fontSize: 20, lineHeight: 28, color: C.ink },
  statLabel: { fontFamily: F.r, fontSize: 12, lineHeight: 16, color: '#6B6E76' },
  h2: { fontFamily: F.s, fontSize: 18, lineHeight: 28, color: C.ink },
  calHead: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  range: { minWidth: 112, textAlign: 'center', fontFamily: F.s, fontSize: 14, color: C.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 6 },
  weekday: { width: '12.4%', textAlign: 'center', fontFamily: F.s, fontSize: 12, color: C.faint },
  cell: { width: '12.4%', height: 60, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 7, paddingVertical: 8, justifyContent: 'space-between' },
  cellToday: { borderWidth: 2, borderColor: C.ink, paddingHorizontal: 5, paddingVertical: 6 },
  cellTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cellNum: { fontFamily: F.s, fontSize: 14, lineHeight: 20, color: C.ink },
  extra: { fontFamily: F.b, fontSize: 11, color: C.ink2 },
  pips: { flexDirection: 'row', gap: 3 },
  pip: { flex: 1, height: 8, borderRadius: 3 },
  pipOpen: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dash },
  legend: { marginTop: 12, flexDirection: 'row', gap: 14 },
  legendText: { fontFamily: F.r, fontSize: 12, color: C.muted },
  pipeline: { flexDirection: 'row', gap: 4, padding: 6, borderRadius: 20, backgroundColor: C.card },
  stage: { flex: 1, height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stageNum: { fontFamily: F.b, fontSize: 20, lineHeight: 28 },
  stageLabel: { fontFamily: F.m, fontSize: 12, lineHeight: 16 },
  cta: { marginTop: 12, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: F.s, fontSize: 16, color: '#fff' },
});
