import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { type SharedValue, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { tap } from '@/components/Glass';
import { C, F } from '@/theme';
import { LIVE } from './tokens';

// Swipe a job or Orca agent left to resolve it: past the threshold the row commits on release (a medium tap), and
// the list drops it. The green panel under the row says what happens and grows with the drag. A row that is still
// working asks first (the screen shows that confirm), so the panel closes again behind it.

const PANEL = 104;

export function SwipeResolve({ children, onResolve, enabled = true }: { children: React.ReactNode; onResolve: () => void; enabled?: boolean }) {
  const ref = useRef<SwipeableMethods>(null);
  if (!enabled) return <>{children}</>;
  return (
    <Swipeable ref={ref} friction={1.3} rightThreshold={PANEL * 0.7} overshootRight overshootFriction={6} dragOffsetFromRight={-14}
      renderRightActions={(progress) => <Panel progress={progress} />}
      onSwipeableOpen={() => {
        tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
        onResolve();
        setTimeout(() => ref.current?.close(), 260);
      }}>
      {children}
    </Swipeable>
  );
}

// The rows are see-through over the page's backdrop, so the panel stays invisible at rest and only shows (and slides
// in from the edge) as the row is dragged off it.
function Panel({ progress }: { progress: SharedValue<number> }) {
  const show = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value);
    return { opacity: interpolate(p, [0, 0.12, 0.6], [0, 0.5, 1], 'clamp'), transform: [{ translateX: (1 - p) * PANEL * 0.4 }] };
  });
  const grow = useAnimatedStyle(() => {
    const p = Math.min(1, progress.value);
    return { transform: [{ scale: 0.82 + 0.18 * p }] };
  });
  return (
    <Animated.View style={[s.panel, show]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[s.inner, grow]}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={C.text} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <Text style={s.label}>Resolve</Text>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  panel: { width: PANEL, marginVertical: 4, borderRadius: 16, borderCurve: 'continuous', backgroundColor: `${LIVE}33`, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 4 },
  label: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
});
