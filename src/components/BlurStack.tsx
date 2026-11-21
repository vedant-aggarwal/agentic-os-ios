import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

/**
 * strength: blur at the dense edge (iOS: strength x 0.4 pt). curve: the blur grows as t^curve away from the
 * clear end. edge: which screen edge the blur sits against and thickens toward.
 */
export type EdgeBlurProps = { height: number; strength?: number; curve?: number; edge?: 'top' | 'bottom' };

/** Thin expo-blur layers, each starting further from the clear end, whose strengths sum to a quadratic ramp. */
export function BlurStack({ height, strength = 40, steps = 12, edge = 'bottom' }: EdgeBlurProps & { steps?: number }) {
  const at = edge === 'top' ? s.top : s.bottom;
  return (
    <View pointerEvents="none" style={[at, { height }]}>
      {Array.from({ length: steps }, (_, i) => (
        <BlurView key={i} intensity={(strength * (2 * i + 1)) / (steps * steps)} tint="dark"
          style={[at, { height: height * (1 - i / steps) }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
});
