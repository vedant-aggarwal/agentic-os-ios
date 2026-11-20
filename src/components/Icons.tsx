import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '@/theme';

type P = { size?: number; color?: string; width?: number };
const base = (size: number, color: string, width: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
  strokeWidth: width, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

export const ToPc = ({ size = 22, color = C.textSoft, width = 1.7 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={3} y={4} width={18} height={12} rx={2} /><Path d="M9 20h6M12 16v4M12 13V7.5M9.5 10L12 7.5l2.5 2.5" /></Svg>
);
export const PcMic = ({ size = 22, color = C.textSoft, width = 1.7 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={9} y={3} width={6} height={11} rx={3} /><Path d="M18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21" /></Svg>
);
export const Remote = ({ size = 22, color = C.textSoft, width = 1.7 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={3} y={4} width={18} height={12} rx={2} /><Path d="M9 20h6M12 16v4" />
    <Path d="M10 7.5l5 3.5-2.2.5 1.3 2.4-1 .6-1.3-2.4-1.8 1.5z" fill={color} /></Svg>
);
export const Voices = ({ size = 22, color = C.textSoft, width = 1.7 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M4 10v4M8 7v10M12 4v16M16 7.5v9M20 10v4" /></Svg>
);
export const Mood = ({ size = 22, color = C.textSoft, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}><Circle cx={12} cy={12} r={9} /><Path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5v.5M15 9.5v.5" /></Svg>
);
export const Lock = ({ size = 22, color = C.textSoft, width = 1.8 }: P) => (
  <Svg {...base(size, color, width)}><Rect x={5} y={10.5} width={14} height={10} rx={2.5} /><Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Svg>
);
export const Check = ({ size = 14, color = '#0A0B0D', width = 3.2 }: P) => (
  <Svg {...base(size, color, width)}><Path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
);
