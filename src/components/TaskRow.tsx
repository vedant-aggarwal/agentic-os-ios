import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import type { Group, Row } from '@/lib/today';
import { C, F, SPRING } from '@/theme';
import { Check } from './Icons';

function TaskRow({ row, onToggle }: { row: Row; onToggle: (id: string) => void }) {
  const color = row.color ?? '#9CA3AF';
  const fill = useAnimatedStyle(() => ({
    opacity: withTiming(row.done ? 1 : 0, { duration: 160 }),
    transform: [{ scale: withSpring(row.done ? 1 : 0.6, SPRING) }],
  }), [row.done]);
  return (
    <Pressable
      accessibilityRole="checkbox" accessibilityState={{ checked: row.done }} accessibilityLabel={row.title}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(row.done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
        onToggle(row.id);
      }}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      <View style={[s.ring, { borderColor: row.done ? color : `${color}73` }]}>
        <Animated.View style={[s.fill, { backgroundColor: color }, fill]}><Check /></Animated.View>
      </View>
      <View style={s.mid}>
        <Text numberOfLines={2} style={[s.title, row.done && { color: C.faint }]}>{row.title}</Text>
        {row.sub ? <Text numberOfLines={1} style={s.sub}>{row.sub}</Text> : null}
      </View>
      <Text style={[s.right, row.rightStrong && { color: C.text }]}>{row.right}</Text>
    </Pressable>
  );
}

export function TaskGroup({ group, onToggle, limit }: { group: Group; onToggle: (id: string) => void; limit?: number }) {
  const rows = limit ? group.rows.slice(0, limit) : group.rows;
  return (
    <View>
      <View style={s.head}>
        <Text style={s.headLabel}>{group.label}</Text>
        <Text style={s.headCount}>{group.count}</Text>
      </View>
      {rows.map((r) => <TaskRow key={r.id} row={r} onToggle={onToggle} />)}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 4 },
  headLabel: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.muted },
  headCount: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.faint, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  ring: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint },
  right: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint, fontVariant: ['tabular-nums'] },
});
