import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

export type EdgeBlurProps = { height: number; strength?: number };

/** Thin expo-blur layers, each starting lower, whose strengths sum to a quadratic ramp toward the bottom. */
export function BlurStack({ height, strength = 40, steps = 12 }: EdgeBlurProps & { steps?: number }) {
  return (
    <View pointerEvents="none" style={[s.edge, { height }]}>
      {Array.from({ length: steps }, (_, i) => (
        <BlurView key={i} intensity={(strength * (2 * i + 1)) / (steps * steps)} tint="dark"
          style={[s.edge, { height: height * (1 - i / steps) }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
