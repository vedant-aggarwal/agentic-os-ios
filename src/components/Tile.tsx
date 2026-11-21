import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Avatar } from './Avatar';
import { Eye, Heart, Person } from './Icons';
import { Press } from './Press';
import { compact, weekOf, type Channel } from '@/lib/api';
import { onLand, registerTile } from '@/lib/flight';
import type { Slot } from '@/lib/lineup';
import { C, F } from '@/theme';

type Props = { slot: Slot; ch?: Channel; today: string };

export function isLive(slot: Slot, ch?: Channel) {
  return !slot.setupNote && ch?.status === 'live';
}

/** A home grid tile. It registers where it sits so a finished Concept Generator page can fly into it, and bounces when one lands. */
export function Tile(props: Props) {
  const ref = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const bump = useSharedValue(1);
  useEffect(() => {
    registerTile(props.slot.channelId, ref.current);
    const off = onLand(props.slot.channelId, () => {
      bump.value = withSequence(withTiming(1.07, { duration: 140 }), withSpring(1, { damping: 9, stiffness: 220 }));
    });
    return () => {
      off();
      registerTile(props.slot.channelId, null);
    };
  }, [props.slot.channelId, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  return (
    <Animated.View ref={ref} collapsable={false} style={[{ flex: 1 }, style]}>
      <TileBody {...props} />
    </Animated.View>
  );
}

function TileBody({ slot, ch, today }: Props) {
  const live = isLive(slot, ch);

  if (!live) {
    return (
      <Press style={[styles.tile, { backgroundColor: C.card }]} onPress={() => router.push(`/channel/${slot.channelId}`)} accessibilityLabel={`${slot.name}, not started`}>
        <Avatar slot={slot} size={60} live={false} />
        <Text numberOfLines={1} style={styles.name}>{slot.name}</Text>
        <Text style={styles.note}>{slot.setupNote || 'Not started'}</Text>
      </Press>
    );
  }

  const s = ch!.stats;
  const views = s.weekViews ?? s.totalViews ?? null;
  const second = views != null ? { Icon: Eye, value: views } : s.weekLikes != null ? { Icon: Heart, value: s.weekLikes } : null;
  const { days: week, posted, target, due } = weekOf(ch!, today);

  return (
    <Press
      style={[styles.tile, { backgroundColor: C.card }]}
      onPress={() => router.push(`/channel/${slot.channelId}`)}
      accessibilityLabel={`${slot.name}: ${compact(s.followers)} ${slot.platform === 'youtube' ? 'subscribers' : 'followers'}, ${posted} of ${target} posts this week${due ? ', post due today' : ''}`}
    >
      <View style={styles.top}>
        <Avatar slot={slot} size={60} live week={week} glow={due > 0} />
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
      <Text style={styles.weekLine}>
        <Text style={styles.weekNum}>{posted}</Text>/{target} this week
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minHeight: 136, borderRadius: 24, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  side: { flex: 1, alignItems: 'flex-end', gap: 3 },
  chip: { height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.growBg, justifyContent: 'center' },
  chipText: { fontFamily: F.b, fontSize: 11.5, color: C.growInk },
  name: { marginTop: 8, fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  note: { marginTop: 2, fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  big: { fontFamily: F.b, fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: C.ink },
  weekLine: { marginTop: 2, fontFamily: F.m, fontSize: 13, lineHeight: 18, color: C.muted },
  weekNum: { fontFamily: F.b, color: C.ink },
});
