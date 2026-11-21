import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { router, Tabs } from 'expo-router';
import { Fragment, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountIcon, CalIcon, GridIcon, MicIcon, Plus, SparkIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { useDictation } from '@/lib/dictation';
import { sendToKai } from '@/lib/kai';
import { C, F } from '@/theme';

const ITEMS: Record<string, { label: string; Icon: typeof GridIcon }> = {
  index: { label: 'Channels', Icon: GridIcon },
  kai: { label: 'Kai', Icon: SparkIcon },
  calendar: { label: 'Calendar', Icon: CalIcon },
  account: { label: 'Account', Icon: AccountIcon },
};

const CAPTURE = 70;

const HOLD_MS = 160; // pressed longer than this = talking to Kai; shorter = a tap that opens the Concept Generator

function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [talk, setTalk] = useState<'idle' | 'listening' | 'sending'>('idle');
  const [heard, setHeard] = useState('');
  const said = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const screen = state.routes[state.index]?.name;

  const dict = useDictation((text, final) => {
    if (text) {
      said.current = text;
      setHeard(text);
    }
    if (!final) return;
    const t = said.current.trim();
    setTalk('idle');
    setHeard('');
    if (!t) return;
    const kai = state.routes.find((r) => r.name === 'kai');
    if (kai && screen !== 'kai') navigateToTab(kai.key);
    sendToKai(t, { voice: true, context: { screen } });
  });

  const pressIn = () => {
    holding.current = true;
    said.current = '';
    timer.current = setTimeout(() => {
      if (!holding.current) return;
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setTalk('listening');
      dict.start();
    }, HOLD_MS);
  };
  const pressOut = () => {
    holding.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (talk === 'idle' && dict.state === 'idle') {
      // A tap: open the Concept Generator over the Channels grid so the finished sheet can fly into its tile.
      if (screen !== 'index') navigateToTab(state.routes[0].key);
      router.push('/new');
      return;
    }
    setTalk('sending');
    dict.stop();
  };
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
      </View>
      {talk !== 'idle' ? (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(160)} pointerEvents="none" style={styles.bubble}>
          <View style={styles.bubbleHead}>
            {talk === 'sending' ? <ActivityIndicator size="small" color="#fff" /> : <MicIcon size={16} color="#fff" />}
            <Text style={styles.bubbleTitle}>{talk === 'sending' ? 'Sending to Kai…' : 'Listening. Let go to send to Kai.'}</Text>
          </View>
          <Text style={styles.bubbleText} numberOfLines={6}>{heard || (dict.error ? dict.error : 'Say an idea, a question or what to do.')}</Text>
        </Animated.View>
      ) : null}
      {/* Sits outside the blurred pill so it can rise above it; the pill keeps an empty slot under it. */}
      <View pointerEvents="box-none" style={styles.captureWrap}>
        <Press
          style={styles.capture}
          scale={0.9}
          accessibilityRole="button"
          accessibilityLabel="New concept. Hold to talk to Kai"
          onPressIn={pressIn}
          onPressOut={pressOut}
        >
          {talk === 'listening' ? <MicIcon size={30} color="#FFFFFF" /> : <Plus size={34} weight={2.6} color="#FFFFFF" />}
        </Press>
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
  bubble: { position: 'absolute', left: 0, right: 0, bottom: 64 + 40, padding: 14, borderRadius: 22, backgroundColor: 'rgba(20,20,20,0.92)' },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubbleTitle: { fontFamily: F.s, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  bubbleText: { marginTop: 8, fontFamily: F.m, fontSize: 17, lineHeight: 24, color: '#fff' },
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
