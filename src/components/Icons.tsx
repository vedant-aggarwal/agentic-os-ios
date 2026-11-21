import Svg, { Circle, Defs, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

type P = { size?: number; color?: string };

/** YouTube's play-button mark (official proportions, 10:7). */
export const YouTubeMark = ({ size = 22 }: P) => (
  <Svg width={size} height={(size * 20) / 28.57} viewBox="0 0 28.57 20">
    <Path
      d="M27.97 3.12A3.58 3.58 0 0 0 25.45.6C23.22 0 14.29 0 14.29 0S5.35 0 3.12.6A3.58 3.58 0 0 0 .6 3.12C0 5.35 0 10 0 10s0 4.65.6 6.88a3.58 3.58 0 0 0 2.52 2.52C5.35 20 14.29 20 14.29 20s8.93 0 11.16-.6a3.58 3.58 0 0 0 2.52-2.52c.6-2.23.6-6.88.6-6.88s0-4.65-.6-6.88Z"
      fill="#FF0033"
    />
    <Path d="M11.43 14.29 18.85 10l-7.42-4.29v8.58Z" fill="#fff" />
  </Svg>
);

/** Instagram's app glyph: the radial gradient tile with the white camera outline. */
export const InstagramMark = ({ size = 18 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <RadialGradient id="igRad" cx="6.4" cy="25.8" r="25.6" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#FFDD55" />
        <Stop offset="0.1" stopColor="#FFDD55" />
        <Stop offset="0.5" stopColor="#FF543E" />
        <Stop offset="1" stopColor="#C837AB" />
      </RadialGradient>
      <RadialGradient id="igBlue" cx="-4" cy="1.7" r="11.5" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#3771C8" />
        <Stop offset="0.13" stopColor="#3771C8" />
        <Stop offset="1" stopColor="#6600FF" stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Rect width={24} height={24} rx={6.6} fill="url(#igRad)" />
    <Rect width={24} height={24} rx={6.6} fill="url(#igBlue)" />
    <Rect x={5} y={5} width={14} height={14} rx={4.2} fill="none" stroke="#fff" strokeWidth={1.8} />
    <Circle cx={12} cy={12} r={3.3} fill="none" stroke="#fff" strokeWidth={1.8} />
    <Circle cx={16.1} cy={7.9} r={1.05} fill="#fff" />
  </Svg>
);

/** The app mark: a "C" ring around a play button (same as design/logo/logo.svg). */
export const AppMark = ({ size = 28 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024">
    <Defs>
      <LinearGradient id="appG" x1="250" y1="250" x2="800" y2="800" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor="#FF0033" />
        <Stop offset="0.55" stopColor="#D62976" />
        <Stop offset="1" stopColor="#962FBF" />
      </LinearGradient>
    </Defs>
    <Rect width={1024} height={1024} rx={230} fill="#141414" />
    <Path d="M757.7 339.9 A300 300 0 1 0 757.7 684.1" fill="none" stroke="url(#appG)" strokeWidth={112} strokeLinecap="round" />
    <Polygon points="462,418 462,606 622,512" fill="#fff" stroke="#fff" strokeWidth={44} strokeLinejoin="round" />
  </Svg>
);

export const Person = ({ size = 13, color = '#3A3D44' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={8} r={4.5} fill={color} />
    <Path d="M3.5 21c0-4.4 3.8-7.5 8.5-7.5s8.5 3.1 8.5 7.5z" fill={color} />
  </Svg>
);

export const Eye = ({ size = 14, color = '#3A3D44' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4}>
    <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

export const Heart = ({ size = 13, color = '#3A3D44' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 8.5 2.9C20.5 15.7 12 21 12 21z" fill={color} />
  </Svg>
);

export const Plus = ({ size = 20, color = '#141414', weight = 2 }: P & { weight?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round">
    <Path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Chevron = ({ size = 20, color = '#141414', dir = 'left' }: P & { dir?: 'left' | 'right' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </Svg>
);

export const GridIcon = ({ size = 22, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Rect x={3} y={3} width={8} height={8} rx={2.5} />
    <Rect x={13} y={3} width={8} height={8} rx={2.5} />
    <Rect x={3} y={13} width={8} height={8} rx={2.5} />
    <Rect x={13} y={13} width={8} height={8} rx={2.5} />
  </Svg>
);

export const BulbIcon = ({ size = 22, color = '#5E6169' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
    <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </Svg>
);

export const DocIcon = ({ size = 22, color = '#5E6169' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M7 3h7l4 4v14H7z" />
    <Path d="M14 3v4h4M10 12h5M10 16h5" />
  </Svg>
);

export const CalIcon = ({ size = 22, color = '#5E6169' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
    <Rect x={3.5} y={5} width={17} height={15.5} rx={3} />
    <Path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const MicIcon = ({ size = 20, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} />
    <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
);

export const AccountIcon = ({ size = 22, color = '#5E6169' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
    <Circle cx={12} cy={12} r={9} />
    <Circle cx={12} cy={10} r={3.2} />
    <Path d="M6.2 18.4c1.3-2 3.4-3.1 5.8-3.1s4.5 1.1 5.8 3.1" />
  </Svg>
);

export const SparkIcon = ({ size = 18, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 2.5c.4 3.9 1.9 6.6 6.2 7.3-4.3.8-5.8 3.4-6.2 7.3-.4-3.9-1.9-6.5-6.2-7.3 4.3-.7 5.8-3.4 6.2-7.3z" />
    <Path d="M18.5 14.5c.2 1.9.9 3 2.9 3.4-2 .4-2.7 1.5-2.9 3.4-.2-1.9-.9-3-2.9-3.4 2-.4 2.7-1.5 2.9-3.4z" />
  </Svg>
);

export const Check = ({ size = 14, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

/** Kai in the dock: a sparkle drawn at the same size and stroke as the other tab icons. */
export const KaiIcon = ({ size = 22, color = '#5E6169' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round">
    <Path d="M10.5 3c.5 4.4 2.2 6.6 7 7.4-4.8.8-6.5 3-7 7.4-.5-4.4-2.2-6.6-7-7.4 4.8-.8 6.5-3 7-7.4z" />
    <Path d="M18.5 14.6c.25 2 1 3 3 3.4-2 .4-2.75 1.4-3 3.4-.25-2-1-3-3-3.4 2-.4 2.75-1.4 3-3.4z" />
  </Svg>
);

export const LockIcon = ({ size = 18, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M6 11h12v9H6z" />
    <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);

export const XIcon = ({ size = 18, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
    <Path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const SendArrow = ({ size = 26, color = '#fff' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
