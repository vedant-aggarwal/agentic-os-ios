import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from './Icons';
import { PostRow } from './PostRow';
import { Press } from './Press';
import { slotsFor, type Channel } from '@/lib/api';
import { C, F } from '@/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const native = Platform.OS !== 'web';

function dayTitle(iso: string, today: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${iso === today ? 'Today' : DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

type Props = { ch: Channel; date: string | null; today: string; onClose: () => void };

/**
 * Bottom sheet listing every post for one day. It opens at the height its content needs (at most ~60% of
 * the screen), drags up to full height when the list is longer, and drags down or taps outside to close.
 * Mount it with `key={date}` so each day starts fresh.
 */
export function DaySheet({ ch, date, today, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const SHEET = Math.round(H * 0.92);
  const MAX_FIT = Math.round(H * 0.62);

  const y = useRef(new Animated.Value(SHEET)).current; // 0 = fully open, SHEET = off screen
  const pos = useRef(SHEET);
  const [headH, setHeadH] = useState(0);
  const [listH, setListH] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    const id = y.addListener(({ value }) => (pos.current = value));
    return () => y.removeListener(id);
  }, [y]);

  const fit = headH && listH ? Math.min(headH + listH + insets.bottom + 16, MAX_FIT) : 0;
  const rest = SHEET - fit; // the resting position
  const canExpand = headH + listH + insets.bottom + 16 > MAX_FIT;

  const springTo = (to: number, velocity = 0) => {
    setExpanded(to === 0);
    Animated.spring(y, { toValue: to, velocity, damping: 30, stiffness: 300, mass: 1, useNativeDriver: native }).start();
  };
  const close = () =>
    Animated.timing(y, { toValue: SHEET, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => onClose());

  // Open once the content has been measured, so the sheet lands at the right height.
  useEffect(() => {
    if (fit && !opened.current) {
      opened.current = true;
      springTo(rest);
    }
  }, [fit]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        y.stopAnimation();
        start = pos.current;
      },
      onPanResponderMove: (_, g) => {
        const top = canExpand ? 0 : rest;
        let next = start + g.dy;
        if (next < top) next = top - (top - next) * 0.25; // rubber band past the top
        y.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const projected = pos.current + g.vy * 160;
        if (projected > rest + 90 || (g.vy > 1.1 && pos.current >= rest - 8)) return close();
        const snaps = canExpand ? [0, rest] : [rest];
        const to = snaps.reduce((a, b) => (Math.abs(b - projected) < Math.abs(a - projected) ? b : a));
        springTo(to, g.vy);
      },
      onPanResponderTerminate: () => springTo(rest),
    });
  }, [canExpand, rest]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!date) return null;
  // Older servers send no post list; treat that as "no posts known".
  const posts = (ch.posts || []).filter((p) => p.date === date).sort((a, b) => a.at.localeCompare(b.at));
  const states = slotsFor(ch, date, today).states;
  const open = states.filter((s) => s === 'open').length;
  // A failed post already has its own row, so it doesn't also count as a missed slot.
  const missed = Math.max(0, states.filter((s) => s === 'missed').length - posts.filter((p) => p.status === 'failed').length);
  const live = posts.filter((p) => p.status === 'published').length;
  const target = Math.max(ch.perDay, 1);

  const shade = y.interpolate({ inputRange: [rest || SHEET - 1, SHEET], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: shade }]}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { height: SHEET, transform: [{ translateY: y }] }]}>
        <View {...pan.panHandlers} onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>
          <View style={styles.gripZone}>
            <View style={styles.grip} />
          </View>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{dayTitle(date, today)}</Text>
              <Text style={styles.sub}>
                {live >= target ? `${live} posted${live > target ? `, target ${target}` : ''}` : `${live} of ${target} posted`}
              </Text>
            </View>
            <Press style={styles.close} scale={0.9} onPress={close} accessibilityLabel="Close">
              <View style={{ transform: [{ rotate: '45deg' }] }}>
                <Plus size={20} />
              </View>
            </Press>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          scrollEnabled={expanded || canExpand}
          onContentSizeChange={(_, h) => setListH(h - (expanded ? 0 : extraPad(rest, fit)))}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 + (expanded ? 0 : extraPad(rest, fit)) }}
        >
          {posts.map((p, i) => (
            <PostRow key={p.at + i} post={p} platform={ch.platform} />
          ))}
          {Array.from({ length: open }, (_, i) => (
            <View key={'open' + i} style={styles.slotRow}>
              <Text style={styles.slotText}>{date === today ? 'Still due today' : 'Open slot'}</Text>
            </View>
          ))}
          {Array.from({ length: missed }, (_, i) => (
            <View key={'missed' + i} style={[styles.slotRow, styles.missedRow]}>
              <Text style={styles.slotText}>Missed slot</Text>
            </View>
          ))}
          {!posts.length && !open && !missed ? (
            <View style={styles.empty}>
              <Text style={styles.slotText}>{date < today ? 'Nothing went out this day' : 'Nothing scheduled'}</Text>
            </View>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// While resting, the bottom of the sheet sits below the screen edge; padding lets the last rows scroll into view.
const extraPad = (rest: number, fit: number) => (fit ? rest : 0);

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,20,20,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  gripZone: { height: 24, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#C9CBD0' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontFamily: F.b, fontSize: 20, lineHeight: 26, color: C.ink },
  sub: { fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.muted },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  slotRow: { height: 52, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dash, alignItems: 'center', justifyContent: 'center' },
  missedRow: { borderWidth: 0, backgroundColor: C.missed },
  slotText: { fontFamily: F.m, fontSize: 14, color: C.muted },
  empty: { height: 84, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
});
