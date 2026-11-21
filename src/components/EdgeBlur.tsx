import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurStack, type EdgeBlurProps } from './BlurStack';

/**
 * Gaussian blur against a screen edge (under the dock, or under the top bar) that thickens toward that edge, so content scrolling beneath it goes
 * soft. iOS has its own file (one SwiftUI material under a gradient mask). The web preview gets one blur
 * under a CSS mask (expo-blur's web layers each add saturate(180%), which stacks badly). Android, which
 * has neither, gets the layer stack.
 */
export function EdgeBlur({ height, strength = 40, edge = 'bottom' }: EdgeBlurProps) {
  if (Platform.OS === 'web') {
    // dense at `edge`, clear at the far end
    const mask = `linear-gradient(to ${edge === 'top' ? 'bottom' : 'top'}, #000 0%, rgba(0,0,0,0.56) 25%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.06) 75%, transparent 100%)`;
    const blur = `blur(${strength * 0.2}px)`;
    const web = { backdropFilter: blur, WebkitBackdropFilter: blur, maskImage: mask, WebkitMaskImage: mask };
    return <View pointerEvents="none" style={[edge === 'top' ? s.top : s.edge, { height }, web as ViewStyle]} />;
  }
  return <BlurStack height={height} strength={strength} edge={edge} />;
}

const s = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
});
