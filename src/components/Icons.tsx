import Svg, { Circle, Path } from 'react-native-svg';
import { ASPECT_COLOR, C } from '@/theme';

// The canvas icon set (UI2-Icons): duotone on the 256 Phosphor grid, a soft fill under a rounded
// 16-unit line. Colour follows the aspect; app controls that belong to no aspect stay neutral.
type P = { size?: number; color?: string };

const rr = (x: number, y: number, w: number, h: number) =>
  `M${x + 8} ${y}h${w - 16}a8 8 0 0 1 8 8v${h - 16}a8 8 0 0 1-8 8h-${w - 16}a8 8 0 0 1-8-8v-${h - 16}a8 8 0 0 1 8-8z`;
const CIRCLE = 'M128 32a96 96 0 1 1-0.01 0z';
const SCREEN = rr(24, 40, 208, 144);
const MIC = 'M128 24a40 40 0 0 1 40 40v64a40 40 0 0 1-80 0V64a40 40 0 0 1 40-40z';

function Duo({ size, color, line, fill, tint, soft, stroke = 16, children }: {
  size: number; color: string; line: string; fill?: string; tint?: string; soft?: number; stroke?: number; children?: React.ReactNode;
}) {
  // neutral icons take a lighter fill, as on the board's Type key
  const opacity = soft ?? (color === C.text ? 0.16 : 0.24);
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      {fill ? <Path d={fill} fill={tint ?? color} opacity={opacity} /> : null}
      <Path d={line} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {children}
    </Svg>
  );
}

export const ToPc = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} fill={SCREEN} line={`${SCREEN} M96 224h64 M128 184v40 M128 148V84 M100 112l28-28 28 28`} />
);
export const PcMic = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} fill={MIC} line={`${MIC} M200 128a72 72 0 0 1-144 0 M128 200v32`} />
);
export const Remote = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} fill={SCREEN} line={`${SCREEN} M96 224h64 M128 184v40`}>
    <Path d="M104 72l72 48-32 8 18 32-14 8-18-32-26 20z" fill={color} stroke={color} strokeWidth={8} strokeLinejoin="round" />
  </Duo>
);
export const Voices = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} line="M48 112v32 M88 80v96 M128 48v160 M168 84v88 M208 112v32" />
);
export const Mood = ({ size = 22, color = ASPECT_COLOR.mind }: P) => (
  <Duo size={size} color={color} fill={CIRCLE} line={`${CIRCLE} M88 152c20 24 60 24 80 0 M96 100v8 M160 100v8`} />
);
/** Your reason, sealed: white lock, warm body and keyhole, as on the Today board. */
export const Lock = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} tint="#FF8A4C" soft={0.24} fill={rr(40, 88, 176, 128)} line={`${rr(40, 88, 176, 128)} M92 88V56a36 36 0 0 1 72 0v32`}>
    <Circle cx={128} cy={152} r={14} fill="#FF8A4C" />
  </Duo>
);
export const Plus = ({ size = 24, color = C.text }: P) => (
  <Duo size={size} color={color} stroke={20} line="M40 128h176 M128 40v176" />
);
export const Keyboard = ({ size = 24, color = C.text }: P) => (
  <Duo size={size} color={color} fill={rr(24, 56, 208, 144)} line={`${rr(24, 56, 208, 144)} M64 96h8 M104 96h8 M144 96h8 M184 96h8 M80 152h96`} />
);
/** Home: the proactive panel, what Nora has ready for you. One plain house. */
export const Home = ({ size = 24, color = C.text }: P) => (
  <Duo size={size} color={color} fill="M48 208V112l80-68 80 68v96z" line="M48 208V112l80-68 80 68v96z" />
);
/** Work: the briefcase from the canvas set, neutral here. */
export const Work = ({ size = 24, color = C.text }: P) => (
  <Duo size={size} color={color} fill={rr(32, 80, 192, 128)} line={`${rr(32, 80, 192, 128)} M88 80V64a16 16 0 0 1 16-16h48a16 16 0 0 1 16 16v16 M32 136h192`} />
);
/** Scan: viewfinder corners and a scan line, from the canvas set's Scan food. */
export const Scan = ({ size = 24, color = C.text }: P) => (
  <Duo size={size} color={color}
    line="M48 92V64a16 16 0 0 1 16-16h28 M164 48h28a16 16 0 0 1 16 16v28 M208 164v28a16 16 0 0 1-16 16h-28 M92 208H64a16 16 0 0 1-16-16v-28 M84 128h88" />
);
/** Nora: her spark, a four-point star, for opening her chat. */
export const Nora = ({ size = 24, color = C.text }: P) => {
  const star = 'M128 32c8 56 40 88 96 96-56 8-88 40-96 96-8-56-40-88-96-96 56-8 88-40 96-96z';
  return <Duo size={size} color={color} fill={star} line={star} />;
};
/** The tick inside a filled checkbox. */
export const Check = ({ size = 14, color = '#0A0B0D' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M56 136l48 48 96-104" />
  </Svg>
);
