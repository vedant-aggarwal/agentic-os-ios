import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { BlurStack, type EdgeBlurProps } from './BlurStack';

// Best first: the local VariableBlur module (modules/variable-blur), a true progressive gaussian blur from
// the system's variable blur filter, clear at the top and `radius` pt at the bottom with no tint. A dev
// client built before that module falls back to a SwiftUI material under a gradient mask, then to the
// expo-blur layer stack.
type VariableProps = ViewProps & { radius: number; curve: number };
let Variable: ComponentType<VariableProps> | null = null;
try {
  if (requireOptionalNativeModule('VariableBlur')) Variable = requireNativeView<VariableProps>('VariableBlur');
} catch {
  Variable = null;
}

type UI = typeof import('@expo/ui/swift-ui');
type Mods = typeof import('@expo/ui/swift-ui/modifiers');
let ui: { UI: UI; M: Mods } | null = null;
try {
  if (!Variable && requireOptionalNativeModule('ExpoUI')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    ui = { UI: require('@expo/ui/swift-ui'), M: require('@expo/ui/swift-ui/modifiers') };
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
} catch {
  ui = null;
}

// alpha = t^2 at t = 0, .2, .4, .6, .8, 1 (SwiftUI spaces the colours evenly)
const FADE = ['#00000000', '#0000000A', '#00000029', '#0000005C', '#000000A3', '#000000FF'];

export function EdgeBlur({ height, strength = 40 }: EdgeBlurProps) {
  if (Variable) {
    // strength 40 -> 16 pt of blur at the bottom edge, ramping as t^2 from nothing at the top
    return <Variable pointerEvents="none" radius={strength * 0.4} curve={2} style={[s.edge, { height }]} />;
  }
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
