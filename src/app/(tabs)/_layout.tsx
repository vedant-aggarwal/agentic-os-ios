import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Fragment } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BulbIcon, CalIcon, DocIcon, GridIcon, Plus } from '@/components/Icons';
import { Press } from '@/components/Press';
import { C, F } from '@/theme';

const ITEMS: Record<string, { label: string; Icon: typeof GridIcon }> = {
  index: { label: 'Channels', Icon: GridIcon },
  ideas: { label: 'Ideas', Icon: BulbIcon },
  scripts: { label: 'Scripts', Icon: DocIcon },
  calendar: { label: 'Calendar', Icon: CalIcon },
};

const CAPTURE = 70;

function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
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
      {/* Sits outside the blurred pill so it can rise above it; the pill keeps an empty slot under it. */}
      <View pointerEvents="box-none" style={styles.captureWrap}>
        <Press
          style={styles.capture}
          scale={0.9}
          accessibilityRole="button"
          accessibilityLabel="Capture an idea"
          onPress={() => Alert.alert('Capture', 'Quick notes come in the next build.')}
        >
          <Plus size={34} weight={2.6} color="#FFFFFF" />
        </Press>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <Dock {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="ideas" />
      <Tabs.Screen name="scripts" />
      <Tabs.Screen name="calendar" />
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
