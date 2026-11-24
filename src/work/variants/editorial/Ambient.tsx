import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useDesktop } from '@/desk/store';
import { GUTTER } from '../../ui/tokens';

// Almost nothing: the Swiss grid the cover is set on, as hairlines at the page margins and the column gap, with the
// quarter lines fainter still. Static, and it fades out before the warm glow at the bottom edge.

const MAX_COLUMN = 880; // the hub's readable column on a desktop window (Shell)

export function Ambient() {
  const { width: W, height: H } = useWindowDimensions();
  const desktop = useDesktop();
  const col = desktop ? Math.min(W, MAX_COLUMN) : W;
  const left = (W - col) / 2 + GUTTER;
  const inner = col - 2 * GUTTER;
  const lines = [
    { x: left, strong: true }, { x: left + inner / 4, strong: false }, { x: left + inner / 2, strong: true },
    { x: left + (3 * inner) / 4, strong: false }, { x: left + inner, strong: true },
  ];
  return (
    <Svg pointerEvents="none" width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="edGrid" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#F5F3EE" stopOpacity={0.065} />
          <Stop offset="0.4" stopColor="#F5F3EE" stopOpacity={0.035} />
          <Stop offset="0.8" stopColor="#F5F3EE" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {lines.map((l) => (
        <Rect key={l.x} x={Math.round(l.x) - 0.25} y={0} width={0.5} height={H} fill="url(#edGrid)" opacity={l.strong ? 1 : 0.45} />
      ))}
    </Svg>
  );
}
