import { useCallback } from 'react';
import { type GestureResponderEvent, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { EASE } from './tokens';

// The style goes on the Pressable itself, so flex, width and height lay out the tappable box (an inner view with
// flex: 1 collapsed to its text height inside the Pressable).
const APressable = Animated.createAnimatedComponent(Pressable);
const PRESS = { duration: 120, easing: EASE, reduceMotion: ReduceMotion.Never } as const;

/**
 * Everything tappable in the hub: shrinks to 0.97 in 120 ms on touch down and comes back on release.
 * Under Reduce Motion it dims instead of scaling. `haptic` adds the app's light tap on commit.
 */
export function Press({ onPress, onLongPress, style, children, haptic = false, disabled, ...rest }: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((pressed: boolean) => React.ReactNode);
  haptic?: boolean;
}) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  const anim = useAnimatedStyle(() => (reduce
    ? { opacity: 1 - 0.3 * v.value }
    : { transform: [{ scale: 1 - 0.03 * v.value }] }));
  const down = useCallback(() => v.set(withTiming(1, PRESS)), [v]);
  const up = useCallback(() => v.set(withTiming(0, PRESS)), [v]);
  const press = useCallback((e: GestureResponderEvent) => { if (haptic) lightTap(); onPress?.(e); }, [haptic, onPress]);
  return (
    <APressable accessibilityRole="button" {...rest} disabled={disabled} onPressIn={down} onPressOut={up}
      onPress={press} onLongPress={onLongPress} delayLongPress={400} style={[style, anim]}>
      {({ pressed }) => (typeof children === 'function' ? children(pressed) : children)}
    </APressable>
  );
}
