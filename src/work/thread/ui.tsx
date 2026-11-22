import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { lightTap } from '@/components/Glass';
import { ASPECT_COLOR, C } from '@/theme';

// Small shared pieces of the job thread: colours with a meaning, the press, the clipboard, line icons for the web
// preview (iOS draws SF Symbols through <Sym>).

/** An agent working (the app's live green). */
export const LIVE = ASPECT_COLOR.mission;
/** Something needs him. */
export const ATTN = ASPECT_COLOR.mind;
export const ADD = '#3DDC97';
export const DEL = C.danger;

/** Code and diffs. Geist Mono isn't loaded, so the platform's monospace. */
export const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/** Press feedback from the build rules: 0.97 in 120 ms, back on release. Reduced Motion keeps it still. */
export function Press({ style, outer, children, scale = 0.97, haptic = true, onPress, ...rest }: PressableProps & {
  /** The scaled surface. `outer` styles the touch target around it (flex in a row, for one). */
  style?: StyleProp<ViewStyle>; outer?: StyleProp<ViewStyle>; children: React.ReactNode; scale?: number; haptic?: boolean;
}) {
  const v = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: v.value }] }));
  const to = (x: number) => { v.set(withTiming(x, { duration: 120, easing: EASE, reduceMotion: ReduceMotion.System })); };
  return (
    <Pressable accessibilityRole="button" {...rest} style={outer}
      onPressIn={(e) => { to(scale); rest.onPressIn?.(e); }}
      onPressOut={(e) => { to(1); rest.onPressOut?.(e); }}
      onPress={(e) => { if (haptic) lightTap(); onPress?.(e); }}>
      <Animated.View style={[style, st]}>{children}</Animated.View>
    </Pressable>
  );
}

type Clip = typeof import('expo-clipboard');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;

/** Copies text; false when this build has no clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') { await globalThis.navigator?.clipboard?.writeText(text); return true; }
    if (!clip) return false;
    await clip.setStringAsync(text);
    return true;
  } catch { return false; }
}

/** "Copy" that reads "Copied" for a moment. */
export function useCopied(): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, async (text: string) => { const ok = await copyText(text); setCopied(ok); return ok; }];
}

/** Re-renders every `ms` while `on`, for running clocks ("4 steps in 2 min"). */
export function useNow(on: boolean, ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return now;
}

// ---- line icons on the 256 grid, a 16 unit rounded stroke like the app's set ----
type I = { size?: number; color?: string };
const Line = ({ d, size = 18, color = C.text, w = 18 }: I & { d: string; w?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 256 256">
    <Path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
export const IcBack = (p: I) => <Line {...p} d="M160 48L80 128l80 80" w={20} />;
export const IcChevron = (p: I) => <Line {...p} d="M96 48l80 80-80 80" w={20} />;
export const IcDown = (p: I) => <Line {...p} d="M48 96l80 80 80-80" w={20} />;
export const IcClose = (p: I) => <Line {...p} d="M64 64l128 128 M192 64L64 192" w={20} />;
export const IcUp = (p: I) => <Line {...p} d="M128 208V48 M64 112l64-64 64 64" w={22} />;
export const IcCheck = (p: I) => <Line {...p} d="M56 136l48 48 96-112" w={24} />;
export const IcCopy = (p: I) => <Line {...p} d="M88 88V48h120v120h-40 M48 88h120v120H48z" />;
export const IcMore = ({ size = 18, color = C.text }: I) => (
  <Svg width={size} height={size} viewBox="0 0 256 256">
    <Circle cx={60} cy={128} r={16} fill={color} /><Circle cx={128} cy={128} r={16} fill={color} /><Circle cx={196} cy={128} r={16} fill={color} />
  </Svg>
);
export const IcStop = ({ size = 12, color = '#fff' }: I) => (
  <Svg width={size} height={size} viewBox="0 0 256 256"><Path d="M48 64a16 16 0 0 1 16-16h128a16 16 0 0 1 16 16v128a16 16 0 0 1-16 16H64a16 16 0 0 1-16-16z" fill={color} /></Svg>
);
