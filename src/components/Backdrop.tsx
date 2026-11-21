import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C } from '@/theme';

// The light the Nora orb throws onto the scene: brightest at the orb, falling off fast, wider than tall,
// gone about 200 pt above it. Most of the core sits behind the ball and the pill; what shows is the spill.
const GLOW_RX = 0.75; // of the screen width
const GLOW_RY = 200;
const GLOW: [number, number][] = [[0, 0.3], [0.12, 0.22], [0.3, 0.11], [0.55, 0.04], [0.8, 0.01], [1, 0]];

/** Ease-in ramp, so a fade starts with no visible edge and does its work near the bottom. */
const ramp = (max: number, power: number, n = 10) =>
  Array.from({ length: n + 1 }, (_, i) => [i / n, max * (i / n) ** power] as const);
const DARKEN = ramp(0.55, 2);

/** `cy` is the orb's centre in this svg's coordinates. */
function Glow({ id, W, cy }: { id: string; W: number; cy: number }) {
  const rx = GLOW_RX * W;
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          {GLOW.map(([o, a]) => <Stop key={o} offset={o} stopColor={C.bgGlow} stopOpacity={a} />)}
        </RadialGradient>
      </Defs>
      <Rect x={W / 2 - rx} y={cy - GLOW_RY} width={2 * rx} height={2 * GLOW_RY} fill={`url(#${id})`} />
    </>
  );
}

/** The app background behind every screen. `orb`: the orb's centre above the bottom edge (0 with no dock). */
export function Backdrop({ orb = 0 }: { orb?: number }) {
  const { width: W, height: H } = useWindowDimensions();
  return (
    <Svg pointerEvents="none" width={W} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bgBase" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} /><Stop offset="0.48" stopColor={C.bgMid} /><Stop offset="1" stopColor={C.bgBottom} />
        </LinearGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#bgBase)" />
      <Glow id="bgGlowBase" W={W} cy={H - orb} />
    </Svg>
  );
}

/**
 * Over scrolling content: darkens the bottom `height` pt on an ease-in curve, then lays the orb's light
 * back on top, under the dock.
 */
export function EdgeGlow({ height, orb }: { height: number; orb: number }) {
  const { width: W } = useWindowDimensions();
  const h = Math.max(height, orb + GLOW_RY); // tall enough that the glow is never cut off
  return (
    <Svg pointerEvents="none" width={W} height={h} style={s.edge}>
      <Defs>
        <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
          {DARKEN.map(([o, a]) => <Stop key={o} offset={o} stopColor={C.bgBottom} stopOpacity={a} />)}
        </LinearGradient>
      </Defs>
      <Rect y={h - height} width={W} height={height} fill="url(#edgeFade)" />
      <Glow id="bgGlowEdge" W={W} cy={h - orb} />
    </Svg>
  );
}

const s = StyleSheet.create({
  edge: { position: 'absolute', left: 0, bottom: 0 },
});
