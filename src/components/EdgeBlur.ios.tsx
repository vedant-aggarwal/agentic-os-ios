import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { BlurStack, type EdgeBlurProps } from './BlurStack';

// Best first: the local VariableBlur module (modules/variable-blur), a true progressive gaussian blur from
// the system's variable blur filter, clear at one end and `radius` pt at the edge with no tint. A dev client
// built before that module (or, for the top edge, before its `edge` prop) falls back to a SwiftUI material
// under a gradient mask, then to the expo-blur layer stack.
type VariableProps = ViewProps & { radius: number; curve: number; edge?: 'top' | 'bottom' };
let Variable: ComponentType<VariableProps> | null = null;
let variableHasEdge = false;
try {
  const mod = requireOptionalNativeModule<{ supportsEdge?: boolean }>('VariableBlur');
  if (mod) {
    Variable = requireNativeView<VariableProps>('VariableBlur');
    variableHasEdge = !!mod.supportsEdge;
  }
} catch {
  Variable = null;
}

type UI = typeof import('@expo/ui/swift-ui');
type Mods = typeof import('@expo/ui/swift-ui/modifiers');
let ui: { UI: UI; M: Mods } | null | undefined;
function swiftUI() {
  if (ui !== undefined) return ui;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    ui = requireOptionalNativeModule('ExpoUI') ? { UI: require('@expo/ui/swift-ui'), M: require('@expo/ui/swift-ui/modifiers') } : null;
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    ui = null;
  }
  return ui;
}

// alpha = t^2 at t = 0, .2, .4, .6, .8, 1 (SwiftUI spaces the colours evenly)
const FADE = ['#00000000', '#0000000A', '#00000029', '#0000005C', '#000000A3', '#000000FF'];

export function EdgeBlur({ height, strength = 40, curve = 1.8, edge = 'bottom' }: EdgeBlurProps) {
  const at = edge === 'top' ? s.top : s.bottom;
  if (Variable && (edge === 'bottom' || variableHasEdge)) {
    return <Variable pointerEvents="none" radius={strength * 0.4} curve={curve} edge={edge} style={[at, { height }]} />;
  }
  const lib = swiftUI();
  if (!lib) return <BlurStack height={height} strength={strength} edge={edge} />;
  const { Host, Mask, Rectangle } = lib.UI;
  const { foregroundStyle } = lib.M;
  const colors = edge === 'top' ? [...FADE].reverse() : FADE;
  return (
    <Host colorScheme="dark" ignoreSafeArea="all" pointerEvents="none" style={[at, { height }]}>
      <Mask>
        <Rectangle modifiers={[foregroundStyle({ type: 'material', material: 'ultraThin' })]} />
        <Mask.Content>
          <Rectangle modifiers={[foregroundStyle({ type: 'linearGradient', colors, startPoint: { x: 0.5, y: 0 }, endPoint: { x: 0.5, y: 1 } })]} />
        </Mask.Content>
      </Mask>
    </Host>
  );
}

const s = StyleSheet.create({
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
});
