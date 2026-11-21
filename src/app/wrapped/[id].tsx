import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Avatar } from '@/components/Avatar';
import { Plus } from '@/components/Icons';
import { Press } from '@/components/Press';
import { addDays, compact, streak, useHome, weekOf, type Channel, type Post } from '@/lib/api';
import { slotFor, type Slot } from '@/lib/lineup';
import { F } from '@/theme';

const DURATION = 5000;

type Card = { kicker: string; big: string; line: string; bg: [string, string]; avatar?: boolean; post?: Post; last?: boolean };

const PALETTES: Record<Slot['platform'], [string, string][]> = {
  youtube: [
    ['#FF0033', '#6E0016'],
    ['#2A0A10', '#FF2D55'],
    ['#FF5A36', '#A8001C'],
    ['#14141A', '#B3001E'],
  ],
  instagram: [
    ['#962FBF', '#D62976'],
    ['#FA7E1E', '#D62976'],
    ['#4F5BD5', '#962FBF'],
    ['#D62976', '#4F5BD5'],
  ],
};

/** The week told as praise. Every number comes from the channel's real data; a card is skipped when its number is missing. */
function cards(slot: Slot, ch: Channel, today: string): Card[] {
  const pal = PALETTES[slot.platform];
  const bg = (i: number) => pal[i % pal.length];
  const week = weekOf(ch, today);
  const s = ch.stats;
  const run = streak(ch, today);
  const since = addDays(today, -6);
  const recent = (ch.posts || []).filter((p) => p.status === 'published' && p.date >= since);
  const best = recent.filter((p) => (p.views || 0) > 0).sort((a, b) => (b.views || 0) - (a.views || 0))[0];
  const reach = s.weekViews != null ? { n: s.weekViews, kind: 'views' } : s.weekLikes != null ? { n: s.weekLikes, kind: 'likes' } : null;
  const out: Card[] = [];

  out.push({ kicker: `Your week on ${slot.platform === 'youtube' ? 'YouTube' : 'Instagram'}`, big: slot.name, line: 'Here’s what you pulled off.', bg: bg(0), avatar: true });

  if (week.posted > 0) {
    out.push({
      kicker: 'This week you posted',
      big: String(week.posted),
      line:
        week.posted >= week.target
          ? `Your target was ${week.target}. You hit it.`
          : week.posted === 1
            ? 'A new video out in the world. Every one is another shot at a hit.'
            : `${week.posted} new videos out in the world. Every one is another shot at a hit.`,
      bg: bg(1),
    });
  }

  if (run >= 2) {
    out.push({ kicker: 'You’re on a streak', big: `${run} days`, line: 'In a row with something new. Showing up every day is how channels grow.', bg: bg(2) });
  }

  if (s.followersDelta && s.followersDelta > 0) {
    out.push({
      kicker: 'New followers',
      big: `+${compact(s.followersDelta)}`,
      line: `People keep choosing you. ${compact(s.followers)} follow ${slot.name} now.`,
      bg: bg(3),
    });
  } else if (s.followers) {
    out.push({ kicker: 'Your audience', big: compact(s.followers), line: `people chose to follow ${slot.name}.`, bg: bg(3) });
  }

  if (reach && reach.n > 0) {
    out.push({
      kicker: 'In the last 7 days',
      big: compact(reach.n),
      line: reach.kind === 'views' ? 'times someone stopped scrolling to watch you.' : 'likes from people who loved what you made.',
      bg: bg(0),
    });
  }

  if (best) {
    out.push({ kicker: 'Your top video, last 7 days', big: `${compact(best.views)} views`, line: best.title, bg: bg(1), post: best });
  }

  const sum = [
    week.posted ? `${week.posted} ${week.posted === 1 ? 'post' : 'posts'}` : null,
    reach && reach.n ? `${compact(reach.n)} ${reach.kind}` : null,
    s.followersDelta && s.followersDelta > 0 ? `+${compact(s.followersDelta)} followers` : null,
  ].filter(Boolean);
  out.push({ kicker: 'That’s your week', big: 'Keep going.', line: sum.length ? sum.join(' · ') : 'Every post you make moves this channel forward.', bg: bg(2), last: true });

  return out;
}

export default function Wrapped() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data } = useHome();
  const slot = slotFor(String(id));
  const ch = data?.channels.find((c) => c.id === id);
  const list = useMemo(() => (slot && ch && data ? cards(slot, ch, data.today) : []), [slot, ch, data]);

  const [index, setIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const held = useRef(false);
  const paused = useRef(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/channel/${id}`));
  const go = useCallback((d: number) => setIndex((i) => Math.min(Math.max(i + d, 0), Math.max(list.length - 1, 0))), [list.length]);

  const run = useCallback(
    (from: number) => {
      Animated.timing(progress, { toValue: 1, duration: DURATION * (1 - from), easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
        if (finished) go(1);
      });
    },
    [progress, go],
  );

  useEffect(() => {
    if (!list.length) return;
    progress.setValue(0);
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, damping: 18, stiffness: 140, overshootClamping: true, useNativeDriver: false }).start();
    if (index < list.length - 1) run(0);
    else progress.setValue(1);
    return () => progress.stopAnimation();
  }, [index, list.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!slot || !ch || !list.length) {
    return <View style={{ flex: 1, backgroundColor: '#141414' }} />;
  }

  const card = list[index];
  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="wbg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={card.bg[0]} />
            <Stop offset="1" stopColor={card.bg[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wbg)" />
        <Circle cx="85%" cy="18%" r={width * 0.55} fill="#fff" opacity={0.07} />
        <Circle cx="5%" cy="88%" r={width * 0.45} fill="#000" opacity={0.12} />
      </Svg>

      <Pressable
        style={StyleSheet.absoluteFill}
        // Hold to pause, tap the left third to go back, tap anywhere else to go forward.
        delayLongPress={250}
        onPressIn={() => progress.stopAnimation((v) => (paused.current = v))}
        onLongPress={() => (held.current = true)}
        onPressOut={() => {
          if (!held.current) return;
          held.current = false;
          if (index < list.length - 1) run(paused.current);
        }}
        onPress={(e) => {
          const back = e.nativeEvent.pageX < width / 3;
          if (back && index > 0) go(-1);
          else if (!back && index < list.length - 1) go(1);
          else if (index < list.length - 1) run(paused.current);
        }}
        accessibilityLabel="Next highlight"
      />

      <View pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.bars}>
          {list.map((_, i) => (
            <View key={i} style={styles.track}>
              <Animated.View
                style={[
                  styles.fill,
                  {
                    width: i < index ? '100%' : i > index ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.topRow}>
          <Avatar slot={slot} size={32} live ringBg="transparent" />
          <Text style={styles.topName}>{slot.name}</Text>
          <Press style={styles.close} scale={0.9} onPress={close} accessibilityLabel="Close">
            <View style={{ transform: [{ rotate: '45deg' }] }}>
              <Plus size={22} color="#fff" />
            </View>
          </Press>
        </View>
      </View>

      <Animated.View pointerEvents="none" style={[styles.body, { opacity: enter, transform: [{ translateY: rise }] }]}>
        {card.avatar ? (
          <View style={{ marginBottom: 28 }}>
            <Avatar slot={slot} size={128} live ringBg="transparent" />
          </View>
        ) : null}
        {card.post?.thumb ? <Image source={{ uri: card.post.thumb }} style={styles.thumb} contentFit="cover" /> : null}
        <Text style={styles.kicker}>{card.kicker}</Text>
        <Text style={[styles.big, card.big.length > 9 && { fontSize: 56, lineHeight: 62 }]} adjustsFontSizeToFit numberOfLines={2}>
          {card.big}
        </Text>
        <Text style={styles.line} numberOfLines={4}>{card.line}</Text>
      </Animated.View>

      {card.last ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <Press style={styles.done} onPress={close}>
            <Text style={styles.doneText}>Done</Text>
          </Press>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12 },
  bars: { flexDirection: 'row', gap: 4 },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 3, backgroundColor: '#fff' },
  topRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  topName: { flex: 1, fontFamily: F.s, fontSize: 15, color: '#fff' },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  thumb: { width: 120, height: 160, borderRadius: 16, marginBottom: 24 },
  kicker: { fontFamily: F.s, fontSize: 18, lineHeight: 24, color: 'rgba(255,255,255,0.85)' },
  big: { marginTop: 6, fontFamily: F.b, fontSize: 88, lineHeight: 94, letterSpacing: -2, color: '#fff' },
  line: { marginTop: 12, fontFamily: F.m, fontSize: 20, lineHeight: 28, color: '#fff', maxWidth: 360 },
  footer: { position: 'absolute', left: 24, right: 24, bottom: 0 },
  done: { height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: F.b, fontSize: 16, color: '#141414' },
});
