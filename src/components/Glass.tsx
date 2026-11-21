import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Platform, StyleSheet, View } from 'react-native';
import { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

// Liquid Glass is iOS 26+. Older iOS, web and Android get a gaussian blur under a light smoke tint.
export const LIQUID = (() => {
  if (Platform.OS !== 'ios') return false;
  try { return isLiquidGlassAvailable() && isGlassEffectAPIAvailable(); } catch { return false; }
})();

export const tap = (fn: () => Promise<void>) => { if (Platform.OS !== 'web') fn().catch(() => {}); };
export const lightTap = () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/**
 * The one glass every bar and floating button wears: see-through, blurred, a hairline rim, no black slab.
 * It is clipped by a plain view with circular corners, because Liquid Glass draws continuous (squircle)
 * corners, which made a 64 pt circle read slightly square.
 */
export function Glass({ radius }: { radius: number }) {
  const r = { borderRadius: radius };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, r, s.clip]}>
      {LIQUID ? (
        <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor="rgba(10,12,18,0.28)" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.smoke]} />
        </>
      )}
      <View style={[StyleSheet.absoluteFill, r, s.rim]} />
    </View>
  );
}

/** Press feedback: a quick, no-bounce scale toward `to` and back. */
export function useScale(to: number) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const spring = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
  return { style, set: (v: number) => { scale.set(withSpring(v, spring)); }, to };
}

const s = StyleSheet.create({
  clip: { overflow: 'hidden', borderCurve: 'circular' },
  smoke: { backgroundColor: 'rgba(14,16,22,0.42)' },
  rim: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
});
