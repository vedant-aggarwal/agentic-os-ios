import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C } from '@/theme';

// The glow is an ellipse 110% of the screen wide and 45% of its height tall, centred on the bottom edge.
function Glow({ id, W, H, h }: { id: string; W: number; H: number; h: number }) {
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={C.bgGlow} stopOpacity={0.38} />
          <Stop offset="0.62" stopColor={C.bgGlow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={W / 2 - 1.1 * W} y={h - 0.45 * H} width={2.2 * W} height={0.9 * H} fill={`url(#${id})`} />
    </>
  );
}

/** The app background behind every screen. */
export function Backdrop() {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Svg pointerEvents="none" width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bgBase" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} /><Stop offset="0.48" stopColor={C.bgMid} /><Stop offset="1" stopColor={C.bgBottom} />
        </LinearGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#bgBase)" />
      <Glow id="bgGlowBase" W={W} H={H} h={H} />
    </Svg>
  );
}

/** Over scrolling content: darkens toward the bottom edge, then lays the same glow back on top, under the dock. */
export function EdgeGlow({ height }: { height: number }) {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Svg pointerEvents="none" width={W} height={height} style={s.edge}>
      <Defs>
        <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgBottom} stopOpacity={0} /><Stop offset="0.7" stopColor={C.bgBottom} stopOpacity={0.92} />
        </LinearGradient>
      </Defs>
      <Rect width={W} height={height} fill="url(#edgeFade)" />
      <Glow id="bgGlowEdge" W={W} H={H} h={height} />
    </Svg>
  );
}

const s = StyleSheet.create({ edge: { position: 'absolute', left: 0, bottom: 0 } });
