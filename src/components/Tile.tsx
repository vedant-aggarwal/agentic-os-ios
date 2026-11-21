import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { Eye, Heart, Person } from './Icons';
import { Press } from './Press';
import { addDays, compact, slotsFor, weekStart, type Channel } from '@/lib/api';
import type { Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

type Props = { slot: Slot; ch?: Channel; today: string };

export function isLive(slot: Slot, ch?: Channel) {
  return !slot.setupNote && ch?.status === 'live';
}

export function Tile({ slot, ch, today }: Props) {
  const live = isLive(slot, ch);
  const color = slot.platform === 'youtube' ? C.yt : C.ig;

  if (!live) {
    return (
      <Press style={[styles.tile, styles.idle]} onPress={() => router.push(`/channel/${slot.channelId}`)} accessibilityLabel={`${slot.name}, not started`}>
        <Avatar slot={slot} size={60} live={false} ringBg="#F8F8F9" />
        <Text numberOfLines={1} style={[styles.name, { color: C.muted }]}>{slot.name}</Text>
        <Text style={styles.note}>{slot.setupNote || 'Not started'}</Text>
      </Press>
    );
  }

  const s = ch!.stats;
  const views = s.weekViews ?? s.totalViews ?? null;
  const second = views != null ? { Icon: Eye, value: views } : s.weekLikes != null ? { Icon: Heart, value: s.weekLikes } : null;
  const start = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    if (d === today) return 'today';
    if (d > today) return 'future';
    const st = slotsFor(ch!, d, today).states;
    const done = st.filter((x) => x === 'posted').length;
    return done === 0 ? 'none' : done >= st.length ? 'full' : 'part';
  });

  return (
    <Press
      style={[styles.tile, { backgroundColor: C.card }]}
      onPress={() => router.push(`/channel/${slot.channelId}`)}
      accessibilityLabel={`${slot.name}: ${compact(s.followers)} ${slot.platform === 'youtube' ? 'subscribers' : 'followers'}`}
    >
      <View style={styles.top}>
        <Avatar slot={slot} size={60} live />
        {/* The numbers sit beside the picture so the tile has no dead corner. */}
        <View style={styles.side}>
          <View style={styles.stat}>
            <Person size={14} />
            <Text style={styles.big}>{compact(s.followers)}</Text>
          </View>
          {s.followersDelta ? (
            <View style={styles.chip}>
              <Text style={styles.chipText}>+{compact(s.followersDelta)}</Text>
            </View>
          ) : null}
          {second ? (
            <View style={styles.stat}>
              <second.Icon size={14} />
              <Text style={styles.big}>{compact(second.value)}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text numberOfLines={1} style={styles.name}>{slot.name}</Text>
      <View style={styles.week}>
        {week.map((w, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              w === 'full' && { backgroundColor: color },
              w === 'part' && { backgroundColor: color, opacity: 0.35 },
              (w === 'none' || w === 'future') && { backgroundColor: C.empty },
              w === 'today' && { borderWidth: 1.5, borderColor: C.ink },
            ]}
          />
        ))}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: 136, borderRadius: 24, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  idle: { backgroundColor: 'rgba(255,255,255,0.5)' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flex: 1, alignItems: 'flex-end', gap: 3 },
  chip: { height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.growBg, justifyContent: 'center' },
  chipText: { fontFamily: F.b, fontSize: 11.5, color: C.growInk },
  name: { marginTop: 8, fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  note: { marginTop: 2, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: '#6B6E76' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  big: { fontFamily: F.b, fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: C.ink },
  week: { marginTop: 'auto', paddingTop: 10, flexDirection: 'row', gap: 3 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
});
