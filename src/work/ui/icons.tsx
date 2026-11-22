import Svg, { Circle, Path } from 'react-native-svg';
import { PcMic, Plus } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { C } from '@/theme';

// The hub's glyphs: SF Symbols on iOS, and drawn fallbacks (web preview, Android) on the canvas set's grid:
// 256 units, a soft fill under a rounded 16 unit line, neutral unless a state colours them.
type P = { size?: number; color?: string };

function Duo({ size, color, line, fill, stroke = 16, children }: {
  size: number; color: string; line: string; fill?: string; stroke?: number; children?: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      {fill ? <Path d={fill} fill={color} opacity={color === C.text ? 0.16 : 0.24} /> : null}
      <Path d={line} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      {children}
    </Svg>
  );
}

const CIRCLE = 'M128 32a96 96 0 1 1-0.01 0z';
const BULB = 'M96 180v-14c0-12-7-22-17-32a64 64 0 1 1 98 0c-10 10-17 20-17 32v14z';
const FOLDER = 'M32 80a8 8 0 0 1 8-8h56l24 24h96a8 8 0 0 1 8 8v104a8 8 0 0 1-8 8H40a8 8 0 0 1-8-8z';

const BackSvg = ({ size = 22, color = C.text }: P) => <Duo size={size} color={color} stroke={22} line="M160 40L72 128l88 88" />;
const BulbSvg = ({ size = 18, color = C.muted }: P) => <Duo size={size} color={color} fill={BULB} line={`${BULB} M104 220h48`} />;
const TaskSvg = ({ size = 18, color = C.text }: P) => <Duo size={size} color={color} fill={CIRCLE} line={`${CIRCLE} M88 132l28 28 52-56`} />;
const CodeSvg = ({ size = 18, color = C.text }: P) => <Duo size={size} color={color} line="M88 72l-56 56 56 56 M168 72l56 56-56 56 M148 48l-40 160" />;
const FolderSvg = ({ size = 16, color = C.muted }: P) => <Duo size={size} color={color} fill={FOLDER} line={FOLDER} />;
const FolderPlusSvg = ({ size = 18, color = C.text }: P) => <Duo size={size} color={color} fill={FOLDER} line={`${FOLDER} M128 128v48 M104 152h48`} />;
const SlidersSvg = ({ size = 22, color = C.text }: P) => (
  <Duo size={size} color={color} line="M40 88h176 M40 168h176">
    <Circle cx={96} cy={88} r={24} fill={color} />
    <Circle cx={168} cy={168} r={24} fill={color} />
  </Duo>
);
const BranchSvg = ({ size = 16, color = C.muted }: P) => (
  <Duo size={size} color={color} line="M80 88v80 M184 112a40 40 0 0 1-40 40h-24a40 40 0 0 0-40 40">
    <Circle cx={80} cy={64} r={24} fill="none" stroke={color} strokeWidth={16} />
    <Circle cx={80} cy={192} r={24} fill="none" stroke={color} strokeWidth={16} />
    <Circle cx={184} cy={88} r={24} fill="none" stroke={color} strokeWidth={16} />
  </Duo>
);
const PinSvg = ({ size = 14, color = C.faint }: P) => (
  <Duo size={size} color={color} fill="M104 32h48v56l32 40v24H72v-24l32-40z" line="M88 32h80 M104 32v56l-32 40v24h112v-24l-32-40V32 M128 152v72" />
);

// Each wrapper picks the SF Symbol and its drawn twin, so screens never pair them by hand.
export const BackIcon = ({ color = C.text }: P) => <Sym name="chevron.left" size={20} color={color} fallback={<BackSvg color={color} />} />;
export const PlusIcon = ({ size = 18, color = C.text }: P) => <Sym name="plus" size={size} color={color} fallback={<Plus size={size} color={color} />} />;
export const IdeaIcon = ({ size = 18, color = C.text }: P) => <Sym name="lightbulb" size={size} color={color} fallback={<BulbSvg size={size} color={color} />} />;
export const TaskIcon = ({ size = 18, color = C.text }: P) => <Sym name="checkmark.circle" size={size} color={color} fallback={<TaskSvg size={size} color={color} />} />;
export const JobIcon = ({ size = 18, color = C.text }: P) => (
  <Sym name="chevron.left.forwardslash.chevron.right" size={size} color={color} fallback={<CodeSvg size={size} color={color} />} />
);
export const MicIcon = ({ size = 20, color = C.text }: P) => <Sym name="mic.fill" size={size} color={color} fallback={<PcMic size={size} color={color} />} />;
export const FolderIcon = ({ size = 16, color = C.muted }: P) => <Sym name="folder" size={size} color={color} fallback={<FolderSvg size={size} color={color} />} />;
export const LinkFolderIcon = ({ size = 18, color = C.text }: P) => (
  <Sym name="folder.badge.plus" size={size} color={color} fallback={<FolderPlusSvg size={size} color={color} />} />
);
export const SettingsIcon = ({ color = C.text }: P) => <Sym name="slider.horizontal.3" size={20} color={color} fallback={<SlidersSvg color={color} />} />;
export const BranchIcon = ({ size = 14, color = C.muted }: P) => (
  <Sym name="arrow.triangle.branch" size={size} color={color} fallback={<BranchSvg size={size} color={color} />} />
);
export const PinIcon = ({ size = 12, color = C.faint }: P) => <Sym name="pin.fill" size={size} color={color} fallback={<PinSvg size={size} color={color} />} />;
