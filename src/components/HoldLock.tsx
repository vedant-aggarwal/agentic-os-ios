import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, interpolateColor, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Sym } from '@/components/Sym';

/** Where a held mic button locks: a ring above it that the button slides up into. It fills as the button nears
 *  and pops when it gets there; then listening stays on after you let go. `top` places it (the button rises
 *  LOCK_PT to reach it). */
export function LockHint({ lift, holding, top, left, color = '#3DDC97' }: {
  lift: SharedValue<number>; holding: boolean; top: number; left?: number; color?: string;
}) {
  const ring = useAnimatedStyle(() => ({
    opacity: holding ? withTiming(1, { duration: 160 }) : withTiming(0, { duration: 180 }),
    transform: [{ scale: 0.85 + 0.3 * lift.value }],
    borderColor: interpolateColor(lift.value, [0, 1], ['rgba(255,255,255,0.35)', color]),
    backgroundColor: interpolateColor(lift.value, [0, 1], ['rgba(255,255,255,0.06)', `${color}55`]),
  }));
  const chev = useAnimatedStyle(() => ({ opacity: holding ? 1 - lift.value : 0, transform: [{ translateY: 6 - lift.value * 6 }] }));
  return (
    <View pointerEvents="none" style={[s.box, { top }, left != null && { left, alignSelf: 'auto' }]}>
      <Animated.View style={[s.ring, ring]}>
        <Sym name="lock.fill" size={14} color="#fff" fallback={<Text style={s.txt}>Lock</Text>} />
      </Animated.View>
      <Animated.View style={chev}>
        <Sym name="chevron.compact.up" size={16} color="rgba(255,255,255,0.7)" fallback={<Text style={s.txt}>^</Text>} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 4 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  txt: { fontSize: 10, color: '#fff' },
});
