import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { DaySheet } from '@/components/DaySheet';
import { Chevron, Eye, Heart, InstagramMark, Person, YouTubeMark } from '@/components/Icons';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { isLive } from '@/components/Tile';
import { addDays, compact, slotsFor, useHome, useReels, weekOf, weekStart, type Channel, type SlotState } from '@/lib/api';
import { slotFor, type Slot } from '@/lib/lineup';
import { nextStage, STAGE_INFO } from '@/lib/reels';
import { C, F } from '@/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState<string | null>(null);
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
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back to channels" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Chevron />
        </Press>
        <View style={styles.platform}>
          {slot.platform === 'youtube' ? <YouTubeMark size={26} /> : <InstagramMark size={21} />}
          <Text style={styles.platformName}>{slot.platform === 'youtube' ? 'YouTube' : 'Instagram'}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !data ? (
        <Loading />
      ) : !live || !ch ? (
        <>
          <Hero slot={slot} />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No posting schedule yet</Text>
            <Text style={styles.body}>Once this channel has daily posting slots, its week and calendar show up here.</Text>
          </View>
        </>
      ) : (
        <>
          <Hero slot={slot} ch={ch} today={today} />
          <Today ch={ch} today={today} color={color} onOpen={() => setDay(today)} />
          <InProduction channelId={slot.channelId} />
          <Calendar
            ch={ch}
            today={today}
            color={color}
            offset={offset}
            setOffset={setOffset}
            onDay={(d) => router.push({ pathname: '/day/[id]', params: { id: slot.channelId, date: d } })}
          />
          <DaySheet key={day || 'closed'} ch={ch} date={day} today={today} onClose={() => setDay(null)} />
        </>
      )}
    </ScrollView>
  );
}

// Mirrors the home tile, laid out sideways: ringed picture on the left, name and numbers on the right.
// Tapping the picture opens the week's highlights.
function Hero({ slot, ch, today }: { slot: Slot; ch?: Channel; today?: string }) {
  const week = ch && today ? weekOf(ch, today) : null;
  const handle = ch?.handle ? (ch.handle.startsWith('@') ? ch.handle : '@' + ch.handle) : null;

  if (!ch || !week) {
    return (
      <View style={styles.hero}>
        <Avatar slot={slot} size={88} live={false} />
        <View style={styles.side}>
          <Text numberOfLines={1} style={[styles.name, { color: C.muted }]}>{slot.name}</Text>
          <Text style={styles.handle}>{slot.setupNote || 'Not started'}</Text>
        </View>
      </View>
    );
  }

  const s = ch.stats;
  const reach =
    s.weekViews != null
      ? { Icon: Eye, value: s.weekViews, text: 'views, 7 days' }
      : s.weekLikes != null
        ? { Icon: Heart, value: s.weekLikes, text: 'likes, 7 days' }
        : s.totalViews != null
          ? { Icon: Eye, value: s.totalViews, text: 'views' }
          : null;

  return (
    <View style={styles.hero}>
      <Press scale={0.94} onPress={() => router.push(`/wrapped/${slot.channelId}`)} accessibilityLabel={`${slot.name}: see this week's highlights`}>
        <Avatar slot={slot} size={104} live week={week.days} glow />
      </Press>
      <View style={styles.side}>
        <Text numberOfLines={1} style={styles.name}>{slot.name}</Text>
        {handle ? <Text numberOfLines={1} style={styles.handle}>{handle}</Text> : null}
        <View style={styles.statList}>
          <View style={styles.statRow}>
            <Person size={13} />
            <Text style={styles.statNum}>{compact(s.followers)}</Text>
            {s.followersDelta ? (
              <View style={styles.chip}>
                <Text style={styles.chipText}>+{compact(s.followersDelta)}</Text>
              </View>
            ) : (
              <Text style={styles.statLabel}>{slot.platform === 'youtube' ? 'subscribers' : 'followers'}</Text>
            )}
          </View>
          {reach ? (
            <View style={styles.statRow}>
              <reach.Icon size={13} />
              <Text style={styles.statNum}>{compact(reach.value)}</Text>
              <Text style={styles.statLabel}>{reach.text}</Text>
            </View>
          ) : null}
          <View style={styles.statRow}>
            <Text style={styles.statNum}>
              {week.posted}
              <Text style={{ color: C.faint }}>/{week.target}</Text>
            </Text>
            <Text style={styles.statLabel}>this week</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Reels started for this channel that aren't ready yet, newest first. Hidden when there are none.
function InProduction({ channelId }: { channelId: string }) {
  const { reels } = useReels();
  const mine = (reels || []).filter((r) => r.channelId === channelId && r.stage !== 'ready');
  if (!mine.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>In production</Text>
      {mine.map((r) => {
        const next = nextStage(r.stage);
        return (
          <Press key={r.id} style={styles.reelRow} onPress={() => router.push(`/reel/${r.id}`)} accessibilityLabel={`${r.title}, next: ${next ? STAGE_INFO[next].name : 'done'}`}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.reelTitle}>{r.title}</Text>
              <Text style={styles.body}>
                {r.working ? `Building ${r.working}…` : r.error ? 'Needs a retry' : next ? `Next: ${STAGE_INFO[next].name}` : 'Done'}
              </Text>
            </View>
            <Chevron size={16} dir="right" color={C.muted} />
          </Press>
        );
      })}
    </View>
  );
}

const SLOT_TEXT: Record<SlotState, string> = { posted: 'Posted', queued: 'Queued', missed: 'Missed', open: 'Due' };

function Today({ ch, today, color, onOpen }: { ch: Channel; today: string; color: string; onOpen: () => void }) {
  const { states, extra } = slotsFor(ch, today, today);
  const open = states.filter((s) => s === 'open').length;
  const posted = states.filter((s) => s === 'posted').length;
  const line = open
    ? `${open} ${open === 1 ? 'post' : 'posts'} still due`
    : posted === states.length
      ? 'All done for today'
      : 'Everything for today is queued';

  return (
    <Press style={styles.card} onPress={onOpen} accessibilityLabel={`Today: ${line}. Show today's posts`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={styles.cardTitle}>Today</Text>
        <Text style={[styles.body, open ? { color: C.ink, fontFamily: F.s } : null]}>{line}</Text>
      </View>
      <View style={styles.slots}>
        {states.map((st, i) => (
          <View
            key={i}
            style={[
              styles.slot,
              st === 'posted' && { backgroundColor: color },
              st === 'queued' && { backgroundColor: color + '24' },
              st === 'open' && styles.slotOpen,
            ]}
          >
            <Text style={[styles.slotText, st === 'posted' && { color: '#fff' }, st === 'queued' && { color }]}>{SLOT_TEXT[st]}</Text>
          </View>
        ))}
        {extra ? (
          <View style={[styles.slot, { flex: 0, paddingHorizontal: 12, backgroundColor: C.growBg }]}>
            <Text style={[styles.slotText, { color: C.growInk }]}>+{extra}</Text>
          </View>
        ) : null}
      </View>
    </Press>
  );
}

function Calendar({ ch, today, color, offset, setOffset, onDay }: { ch: Channel; today: string; color: string; offset: number; setOffset: (n: number) => void; onDay: (d: string) => void }) {
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
            <Press
              key={d}
              scale={0.92}
              onPress={() => onDay(d)}
              accessibilityLabel={`${label(d)}: ${states.filter((s) => s === 'posted').length} of ${states.length} posted. Open day`}
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
            </Press>
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

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  platform: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  platformName: { fontFamily: F.b, fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: C.ink },
  hero: { marginTop: 12, borderRadius: 24, backgroundColor: C.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 },
  side: { flex: 1, minWidth: 0 },
  name: { fontFamily: F.b, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: C.ink },
  handle: { fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.muted },
  statList: { marginTop: 8, gap: 4 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statNum: { fontFamily: F.b, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: C.ink },
  statLabel: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  chip: { height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: C.growBg, justifyContent: 'center' },
  chipText: { fontFamily: F.b, fontSize: 11.5, color: C.growInk },
  reelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  reelTitle: { fontFamily: F.s, fontSize: 15, lineHeight: 20, color: C.ink },
  card: { marginTop: 12, backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 12 },
  cardTitle: { fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  body: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, height: 40, borderRadius: 12, backgroundColor: C.missed, alignItems: 'center', justifyContent: 'center' },
  slotOpen: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dash },
  slotText: { fontFamily: F.s, fontSize: 14, color: C.ink2 },
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
});
