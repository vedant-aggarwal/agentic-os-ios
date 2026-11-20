import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BulbIcon, CalIcon, DocIcon, GridIcon } from '@/components/Icons';
import { Press } from '@/components/Press';
import { C, F } from '@/theme';

const ITEMS: Record<string, { label: string; Icon: typeof GridIcon }> = {
  index: { label: 'Channels', Icon: GridIcon },
  ideas: { label: 'Ideas', Icon: BulbIcon },
  scripts: { label: 'Scripts', Icon: DocIcon },
  calendar: { label: 'Calendar', Icon: CalIcon },
};

function Dock({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 12, 8) }]}>
      <BlurView intensity={60} tint="light" style={styles.dock}>
        {state.routes.map((r, i) => {
          const item = ITEMS[r.name];
          if (!item) return null;
          const on = state.index === i;
          const color = on ? C.ink : C.muted;
          return (
            <Press
              key={r.key}
              scale={0.92}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => !on && navigateToTab(r.key)}
            >
              <item.Icon color={color} />
              <Text style={[styles.label, { color, fontFamily: on ? F.s : F.m }]}>{item.label}</Text>
            </Press>
          );
        })}
      </BlurView>
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
  wrap: { position: 'absolute', left: 16, right: 16 },
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
});
