import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

type P = { size?: number; color?: string };

export const YouTubeMark = ({ size = 22 }: P) => (
  <Svg width={size} height={(size * 17) / 24} viewBox="0 0 24 17">
    <Rect width={24} height={17} rx={5} fill="#FF0033" />
    <Path d="M9.6 4.8v7.4l6.2-3.7z" fill="#fff" />
  </Svg>
);

export const InstagramMark = ({ size = 18 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs>
      <LinearGradient id="ig" x1="0" y1="1" x2="1" y2="0">
        <Stop offset="0" stopColor="#FEDA75" />
        <Stop offset="0.3" stopColor="#FA7E1E" />
        <Stop offset="0.6" stopColor="#D62976" />
        <Stop offset="1" stopColor="#4F5BD5" />
      </LinearGradient>
    </Defs>
    <Rect x={1.5} y={1.5} width={21} height={21} rx={6} fill="url(#ig)" />
    <Circle cx={12} cy={12} r={4.6} fill="none" stroke="#fff" strokeWidth={2} />
    <Circle cx={17.5} cy={6.5} r={1.3} fill="#fff" />
  </Svg>
);

/** The app mark: the 2 x 4 channel grid. */
export const AppMark = ({ size = 28 }: P) => (
  <Svg width={size} height={size} viewBox="0 0 28 28">
    <Rect width={28} height={28} rx={7} fill="#141414" />
    {[0, 1, 2, 3].map((r) => (
      <Rect key={'l' + r} x={6.5} y={5 + r * 4.8} width={6.5} height={3.6} rx={1.4} fill="#FF0033" opacity={r ? 0.45 : 1} />
    ))}
    {[0, 1, 2, 3].map((r) => (
      <Rect key={'r' + r} x={15} y={5 + r * 4.8} width={6.5} height={3.6} rx={1.4} fill="#D62976" opacity={r ? 0.45 : 1} />
    ))}
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

export const Plus = ({ size = 20, color = '#141414' }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
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
