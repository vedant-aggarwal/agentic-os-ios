import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C } from '@/theme';

/**
 * The aspect's own light, falling from the top of its page: the only colour the bare page carries. The host draws it
 * behind every page; a bar that sticks to the top draws the same light behind itself (`scene`), so what scrolls
 * under it simply goes, with no band where the bar begins.
 */
export function AspectLight({ color, width, height = 360, scene = false, id = 'aspectLight' }: {
  color: string; width: number; height?: number; scene?: boolean; id?: string;
}) {
  const h = 360;
  return (
    <View pointerEvents="none" style={[s.wrap, { width, height }]}>
      {scene ? <View style={[StyleSheet.absoluteFill, s.scene]} /> : null}
      <Svg width={width} height={h} style={s.light}>
        <Defs>
          <RadialGradient id={id} cx="0.5" cy="0" r="1" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={color} stopOpacity={0.2} />
            <Stop offset="0.35" stopColor={color} stopOpacity={0.08} />
            <Stop offset="0.7" stopColor={color} stopOpacity={0.02} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={h} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  scene: { backgroundColor: C.scene },
  light: { position: 'absolute', left: 0, top: 0 },
});
