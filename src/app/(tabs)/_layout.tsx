import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, Tabs } from 'expo-router';
import { Fragment, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountIcon, CalIcon, GridIcon, KaiIcon, LockIcon, MicIcon, Plus, SendArrow, XIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { useDictation } from '@/lib/dictation';
import { sendToKai } from '@/lib/kai';
import { C, F } from '@/theme';

const ITEMS: Record<string, { label: string; Icon: typeof GridIcon }> = {
  index: { label: 'Channels', Icon: GridIcon },
  kai: { label: 'Kai', Icon: KaiIcon },
  calendar: { label: 'Calendar', Icon: CalIcon },
  account: { label: 'Account', Icon: AccountIcon },
};

const CAPTURE = 70;
const HOLD_MS = 160; // pressed longer than this = talking to Kai; shorter = a tap that opens the Concept Generator
const ZONE = 64; // slide this far left to lock, right to cancel
const MAX_SLIDE = 104;

type Talk = 'idle' | 'holding' | 'locked' | 'sending';
type Zone = 'none' | 'lock' | 'cancel';

function buzz(kind: 'start' | 'tick' | 'lock' | 'cancel' | 'send') {
  if (Platform.OS === 'web') return;
  const p =
    kind === 'start' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    : kind === 'tick' ? Haptics.selectionAsync()
    : kind === 'lock' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'cancel' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  p.catch(() => {});
}

function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [talk, setTalk] = useState<Talk>('idle');
  const [zone, setZone] = useState<Zone>('none');
  const [heard, setHeard] = useState('');
  const said = useRef('');
  const screen = state.routes[state.index]?.name;
  const drag = useSharedValue(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const dict = useDictation((text, final) => {
    if (text) {
      said.current = text;
      setHeard(text);
    }
    if (!final) return;
    const t = said.current.trim();
    live.current.talk = 'idle';
    setTalk('idle');
    setHeard('');
    if (!t) return;
    const kai = state.routes.find((r) => r.name === 'kai');
    if (kai && screen !== 'kai') navigateToTab(kai.key);
    sendToKai(t, { voice: true, context: { screen } });
  });

  // The gesture handlers are made once; they read the latest values through this ref.
  const live = useRef({ talk: 'idle' as Talk, zone: 'none' as Zone, armed: false, timer: null as ReturnType<typeof setTimeout> | null, dict, screen, state, navigateToTab });
  live.current.dict = dict;
  live.current.screen = screen;
  live.current.state = state;
  live.current.navigateToTab = navigateToTab;

  const pan = useMemo(() => {
    const L = live;
    const go = (t: Talk) => {
      L.current.talk = t;
      setTalk(t);
    };
    const toZone = (z: Zone) => {
      if (L.current.zone === z) return;
      L.current.zone = z;
      setZone(z);
      if (z !== 'none') buzz('tick');
    };
    const send = () => {
      buzz('send');
      go('sending');
      L.current.dict.stop();
    };
    const settle = () => {
      drag.value = withSpring(0, { damping: 18, stiffness: 260 });
      L.current.zone = 'none';
      setZone('none');
    };
    const release = () => {
      const c = L.current;
      if (c.timer) {
        // A tap: open the Concept Generator over the Channels grid so the finished sheet can fly into its tile.
        clearTimeout(c.timer);
        c.timer = null;
        if (c.screen !== 'index') c.navigateToTab(c.state.routes[0].key);
        router.push('/new');
        return;
      }
      if (c.talk === 'locked') {
        if (c.armed) send(); // the tap that started while locked
        c.armed = false;
        return;
      }
      if (c.talk !== 'holding') return;
      const z = c.zone;
      settle();
      if (z === 'lock') {
        buzz('lock');
        go('locked');
      } else if (z === 'cancel') {
        buzz('cancel');
        c.dict.cancel();
        go('idle');
        setHeard('');
      } else send();
    };
    // Gesture handler, not PanResponder: the native list behind the dock can't steal the touch mid-slide,
    // so sliding to Lock or Cancel always reaches release instead of being cut off (which used to send).
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .shouldCancelWhenOutside(false)
      .onBegin(() => {
        const c = L.current;
        if (c.talk === 'locked') {
          c.armed = true; // locked: this touch is a tap on the send arrow
          return;
        }
        if (c.talk !== 'idle') return;
        said.current = '';
        c.timer = setTimeout(() => {
          c.timer = null;
          buzz('start');
          go('holding');
          c.dict.start();
        }, HOLD_MS);
      })
      .onUpdate((e) => {
        if (L.current.talk !== 'holding') return;
        const dx = Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, e.translationX));
        drag.value = dx;
        toZone(dx < -ZONE ? 'lock' : dx > ZONE ? 'cancel' : 'none');
      })
      .onFinalize(release);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelLocked = () => {
    buzz('cancel');
    dict.cancel();
    live.current.talk = 'idle';
    setTalk('idle');
    setHeard('');
  };

  const follow = useAnimatedStyle(() => ({ transform: [{ translateX: drag.value }] }));
  const holding = talk === 'holding';
  const recording = holding || talk === 'locked';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.float}>
        <BlurView intensity={60} tint="light" style={styles.dock}>
          {state.routes.map((r, i) => {
            const item = ITEMS[r.name];
            if (!item) return null;
            const on = state.index === i;
            const color = on ? C.ink : C.muted;
            return (
              <Fragment key={r.key}>
                {i === 2 && <View style={styles.item} />}
                <Press
                  scale={0.92}
                  style={styles.item}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => !on && navigateToTab(r.key)}
                >
                  <item.Icon color={color} />
                  <Text style={[styles.label, { color, fontFamily: on ? F.s : F.m }]}>{item.label}</Text>
                </Press>
              </Fragment>
            );
          })}
        </BlurView>
        {/* While holding: lock on the left, cancel on the right. They light up as the button slides onto them. */}
        {holding ? (
          <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} pointerEvents="none" style={styles.zones}>
            <View style={[styles.zone, zone === 'lock' && { backgroundColor: C.ink }]}>
              <LockIcon size={18} color={zone === 'lock' ? '#fff' : C.ink} />
              <Text style={[styles.zoneText, zone === 'lock' && { color: '#fff' }]}>Lock</Text>
            </View>
            <View style={{ width: CAPTURE + 8 }} />
            <View style={[styles.zone, zone === 'cancel' && { backgroundColor: C.yt }]}>
              <XIcon size={16} color={zone === 'cancel' ? '#fff' : C.ink} />
              <Text style={[styles.zoneText, zone === 'cancel' && { color: '#fff' }]}>Cancel</Text>
            </View>
          </Animated.View>
        ) : null}
      </View>

      {talk !== 'idle' ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(160)} pointerEvents="box-none" style={styles.bubble}>
          <View style={styles.bubbleHead}>
            {talk === 'sending' ? <ActivityIndicator size="small" color="#fff" /> : <View style={[styles.dot, zone === 'cancel' && { opacity: 0.3 }]} />}
            <Text style={styles.bubbleTitle}>
              {talk === 'sending' ? 'Sending to Kai' : talk === 'locked' ? 'Locked. Tap the arrow to send' : zone === 'cancel' ? 'Release to cancel' : zone === 'lock' ? 'Release to lock' : 'Release to send'}
            </Text>
            {talk === 'locked' ? <LockIcon size={14} color="rgba(255,255,255,0.7)" /> : null}
            <View style={{ flex: 1 }} />
            {talk === 'locked' ? (
              <Press style={styles.bubbleX} scale={0.9} onPress={cancelLocked} accessibilityLabel="Cancel recording">
                <XIcon size={14} color="#fff" />
              </Press>
            ) : null}
          </View>
          {/* Follows the newest words: the box keeps scrolling up as the transcript grows. */}
          <ScrollView
            ref={scroll}
            style={styles.bubbleScroll}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          >
            <Text style={[styles.bubbleText, !heard && { color: 'rgba(255,255,255,0.5)' }]}>
              {heard || (dict.error ? dict.error : 'Say an idea, a question or what to do.')}
            </Text>
          </ScrollView>
        </Animated.View>
      ) : null}

      {/* Sits outside the blurred pill so it can rise above it; the pill keeps an empty slot under it. */}
      <View pointerEvents="box-none" style={styles.captureWrap}>
        <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.capture, recording && { backgroundColor: zone === 'cancel' ? C.yt : C.ink }, follow]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={talk === 'locked' ? 'Send to Kai' : 'New concept. Hold to talk to Kai'}
        >
          {talk === 'locked' ? (
            <SendArrow size={28} />
          ) : holding ? (
            zone === 'lock' ? <LockIcon size={26} color="#fff" /> : zone === 'cancel' ? <XIcon size={26} color="#fff" /> : <MicIcon size={30} color="#FFFFFF" />
          ) : (
            <Plus size={34} weight={2.6} color="#FFFFFF" />
          )}
        </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <Dock {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="kai" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20 },
  // Lifts the pill off the screen edge: a soft, wide shadow under the glass.
  float: {
    borderRadius: 32,
    shadowColor: '#141414',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  dock: {
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,20,20,0.08)',
  },
  item: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 12, lineHeight: 16 },
  zones: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  zone: { height: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(20,20,20,0.12)' },
  zoneText: { fontFamily: F.s, fontSize: 14, color: C.ink },
  bubble: { position: 'absolute', left: 0, right: 0, bottom: 64 + 40, padding: 14, borderRadius: 22, backgroundColor: 'rgba(20,20,20,0.92)' },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  bubbleTitle: { fontFamily: F.s, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.yt },
  bubbleX: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  bubbleScroll: { maxHeight: 168, marginTop: 6 },
  bubbleText: { fontFamily: F.m, fontSize: 17, lineHeight: 24, color: '#fff' },
  captureWrap: { position: 'absolute', left: 0, right: 0, top: -24, alignItems: 'center' },
  capture: {
    width: CAPTURE,
    height: CAPTURE,
    borderRadius: CAPTURE / 2,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: C.bg,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
