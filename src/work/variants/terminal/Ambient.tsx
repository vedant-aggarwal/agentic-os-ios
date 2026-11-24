import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { P } from './palette';

// Behind the list, static: the scene pulled down to console black at the top (the warm glow still rises from the
// bottom edge), a faint phosphor bloom behind the head, a dot grid, CRT scanlines and a vignette. One SVG, drawn once.

const SHADE = '#020504';

export function Ambient() {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Svg pointerEvents="none" width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="termShade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SHADE} stopOpacity={0.8} />
          <Stop offset="0.55" stopColor={SHADE} stopOpacity={0.66} />
          <Stop offset="0.85" stopColor={SHADE} stopOpacity={0.3} />
          <Stop offset="1" stopColor={SHADE} stopOpacity={0.08} />
        </LinearGradient>
        <RadialGradient id="termBloom" gradientUnits="userSpaceOnUse" cx={W / 2} cy={250} r={Math.max(W * 0.85, 300)}>
          <Stop offset="0" stopColor={P.green} stopOpacity={0.075} />
          <Stop offset="0.5" stopColor={P.green} stopOpacity={0.03} />
          <Stop offset="1" stopColor={P.green} stopOpacity={0} />
        </RadialGradient>
        <Pattern id="termGrid" patternUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
          <Rect x={0} y={0} width={1.2} height={1.2} fill={P.green} fillOpacity={0.16} />
        </Pattern>
        <Pattern id="termScan" patternUnits="userSpaceOnUse" x={0} y={0} width={8} height={3}>
          <Rect x={0} y={0} width={8} height={1} fill="#000" fillOpacity={0.32} />
        </Pattern>
        <RadialGradient id="termVignette" cx="0.5" cy="0.45" r="0.72">
          <Stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.6} />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#termShade)" />
      <Rect width={W} height={H} fill="url(#termBloom)" />
      <Rect width={W} height={H} fill="url(#termGrid)" />
      <Rect width={W} height={H} fill="url(#termScan)" />
      <Rect width={W} height={H} fill="url(#termVignette)" />
    </Svg>
  );
}
