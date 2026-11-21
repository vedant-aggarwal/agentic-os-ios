import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/Avatar';
import { Chevron } from '@/components/Icons';
import { PostRow } from '@/components/PostRow';
import { Press } from '@/components/Press';
import { ErrorBox, Loading } from '@/components/States';
import { isLive } from '@/components/Tile';
import { clock, useHome, type Channel, type Post } from '@/lib/api';
import { slotFor } from '@/lib/lineup';
import { C, F } from '@/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "19:30" in the channel's own zone -> "7:30 pm" (India) or "6:00 pm ET" (US channels). */
function slotLabel(time: string, tz?: string) {
  const [h, m] = time.split(':').map(Number);
  const zone = !tz || tz === 'Asia/Kolkata' ? '' : tz === 'America/New_York' ? ' ET' : ` ${tz.split('/').pop()}`;
  return clock(h, m) + zone;
}

type Slot = { label: string; post?: Post };

/** Pair the day's posts with the channel's posting slots, earliest first. Leftover posts come back as extras. */
function plan(ch: Channel, date: string) {
  const posts = (ch.posts || []).filter((p) => p.date === date).sort((a, b) => a.at.localeCompare(b.at));
  const filled = posts.filter((p) => p.status !== 'failed');
  const times = [...(ch.slots?.times || [])].sort();
  const count = Math.max(times.length, ch.perDay, 1);
  const slots: Slot[] = Array.from({ length: count }, (_, i) => ({
    label: times[i] ? slotLabel(times[i], ch.slots?.timezone) : `Slot ${i + 1}`,
    post: filled[i],
  }));
  return { slots, extra: filled.slice(count), failed: posts.filter((p) => p.status === 'failed') };
}

/** One day of one channel: every posting slot with what went out in it, plus extras and failures. */
export default function DayScreen() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useHome();
  const slot = slotFor(String(id));
  const ch = data?.channels.find((c) => c.id === id);
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateParam)) ? String(dateParam) : today;
  if (!slot) return null;

  const d = new Date(date + 'T00:00:00Z');
  const when = date === today ? 'today' : date < today ? 'past' : 'future';
  const p = ch ? plan(ch, date) : null;
  const done = p ? p.slots.filter((s) => s.post?.status === 'published').length : 0;
  const empty = p ? p.slots.filter((s) => !s.post).length : 0;
  const heading =
    when === 'past'
      ? empty
        ? `${empty} ${empty === 1 ? 'slot' : 'slots'} missed`
        : 'Every slot was filled'
      : empty
        ? `${empty} ${empty === 1 ? 'slot' : 'slots'} to fill`
        : 'Every slot is filled';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={C.ink} />}
    >
      <View style={styles.bar}>
        <Press style={styles.round} scale={0.92} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/channel/${slot.channelId}`))}>
          <Chevron />
        </Press>
        <Text style={styles.barTitle}>{when === 'today' ? 'Today' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`}</Text>
        <View style={{ width: 44 }} />
      </View>

      {error && !data ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={error} onRetry={reload} />
        </View>
      ) : !ch || !p ? (
        <Loading />
      ) : (
        <>
          <View style={styles.head}>
            <Avatar slot={slot} size={56} live={isLive(slot, ch)} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{slot.name}</Text>
              <Text style={styles.date}>
                {DAYS[d.getUTCDay()]}, {d.getUTCDate()} {MONTHS[d.getUTCMonth()]}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.big}>
                {done}
                <Text style={{ color: C.faint }}>/{p.slots.length}</Text>
              </Text>
              <Text style={styles.date}>posted</Text>
            </View>
          </View>

          <Text style={styles.h2}>{heading}</Text>
          <View style={{ gap: 10 }}>
            {p.slots.map((s, i) => (
              <View key={i} style={styles.slotLine}>
                <Text style={[styles.time, !s.post && when !== 'past' && { color: C.ink }]}>{s.label}</Text>
                <View style={{ flex: 1 }}>
                  {s.post ? (
                    <PostRow post={s.post} platform={ch.platform} />
                  ) : when === 'past' ? (
                    <View style={[styles.empty, styles.missed]}>
                      <Text style={styles.emptyTitle}>Missed</Text>
                      <Text style={styles.emptyBody}>Nothing went out in this slot</Text>
                    </View>
                  ) : (
                    <View style={styles.empty}>
                      <Text style={styles.emptyTitle}>{when === 'today' ? 'Due' : 'Open'}</Text>
                      <Text style={styles.emptyBody}>Nothing made for this slot yet</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>

          {p.extra.length ? (
            <>
              <Text style={styles.h2}>Extra posts</Text>
              <View style={{ gap: 10 }}>
                {p.extra.map((x, i) => (
                  <PostRow key={x.at + i} post={x} platform={ch.platform} />
                ))}
              </View>
            </>
          ) : null}

          {p.failed.length ? (
            <>
              <Text style={styles.h2}>Failed</Text>
              <View style={{ gap: 10 }}>
                {p.failed.map((x, i) => (
                  <PostRow key={x.at + i} post={x} platform={ch.platform} />
                ))}
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
  barTitle: { flex: 1, textAlign: 'center', fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  head: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, backgroundColor: C.card },
  name: { fontFamily: F.b, fontSize: 18, lineHeight: 24, color: C.ink },
  date: { fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  big: { fontFamily: F.b, fontSize: 24, lineHeight: 28, color: C.ink },
  h2: { marginTop: 24, marginBottom: 10, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  slotLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 64, fontFamily: F.s, fontSize: 13, lineHeight: 18, color: C.muted },
  empty: { height: 84, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dash, justifyContent: 'center', paddingHorizontal: 16, gap: 2 },
  missed: { borderWidth: 0, backgroundColor: C.missed },
  emptyTitle: { fontFamily: F.b, fontSize: 15, lineHeight: 20, color: C.ink },
  emptyBody: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
});
