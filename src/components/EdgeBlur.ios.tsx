import { requireOptionalNativeModule } from 'expo';
import { StyleSheet } from 'react-native';
import { BlurStack, type EdgeBlurProps } from './BlurStack';

// One SwiftUI material under a vertical gradient mask: a single blur whose opacity eases in (t squared),
// so there is no layer edge anywhere. Expo UI ships in the dev client; if a build ever lacks it, fall back
// to the stacked expo-blur layers rather than crash.
type UI = typeof import('@expo/ui/swift-ui');
type Mods = typeof import('@expo/ui/swift-ui/modifiers');
let ui: { UI: UI; M: Mods } | null = null;
try {
  if (requireOptionalNativeModule('ExpoUI')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    ui = { UI: require('@expo/ui/swift-ui'), M: require('@expo/ui/swift-ui/modifiers') };
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
} catch {
  ui = null;
}

// alpha = t^2 at t = 0, .2, .4, .6, .8, 1 (SwiftUI spaces the colours evenly)
const FADE = ['#00000000', '#0000000A', '#00000029', '#0000005C', '#000000A3', '#000000FF'];

export function EdgeBlur({ height, strength }: EdgeBlurProps) {
  if (!ui) return <BlurStack height={height} strength={strength} />;
  const { Host, Mask, Rectangle } = ui.UI;
  const { foregroundStyle } = ui.M;
  return (
    <Host colorScheme="dark" ignoreSafeArea="all" pointerEvents="none" style={[s.edge, { height }]}>
      <Mask>
        <Rectangle modifiers={[foregroundStyle({ type: 'material', material: 'ultraThin' })]} />
        <Mask.Content>
          <Rectangle modifiers={[foregroundStyle({ type: 'linearGradient', colors: FADE, startPoint: { x: 0.5, y: 0 }, endPoint: { x: 0.5, y: 1 } })]} />
        </Mask.Content>
      </Mask>
    </Host>
  );
}

const s = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
