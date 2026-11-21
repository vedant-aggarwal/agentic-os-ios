import { StyleSheet, Text } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Sym } from '@/components/Sym';

/** The lock that rises above a held mic button: slide up to it and the listening stays on after you let go. */
export function LockHint({ lift, holding, top = -40 }: { lift: SharedValue<number>; holding: boolean; top?: number }) {
  const st = useAnimatedStyle(() => ({
    opacity: holding ? 0.45 + 0.55 * lift.value : withTiming(0, { duration: 150 }),
    transform: [{ translateY: -lift.value * 24 }, { scale: 0.9 + 0.25 * lift.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[s.hint, { top }, st]}>
      <Sym name="chevron.up" size={10} color="#fff" fallback={null} />
      <Sym name="lock.fill" size={13} color="#fff" fallback={<Text style={s.txt}>Lock</Text>} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  hint: {
    position: 'absolute', alignSelf: 'center', width: 30, height: 40, borderRadius: 15, gap: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)',
  },
  txt: { fontSize: 10, color: '#fff' },
});
