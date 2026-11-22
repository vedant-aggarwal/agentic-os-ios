import { useEffect } from 'react';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Circle } from 'react-native-svg';
import { Duo, rr } from '@/components/Icons';
import type { AspectKey } from '@/theme';

// One picture per kind of task, read from its title, in the app's duotone icon style (256 grid, 16 line).
type Glyph =
  | 'dumbbell' | 'shoe' | 'book' | 'pen' | 'lotus' | 'glass' | 'drop' | 'moon' | 'phone' | 'chat' | 'home' | 'heart'
  | 'people' | 'mic' | 'cap' | 'play' | 'coin' | 'bag' | 'laptop' | 'bowl' | 'pulse' | 'sprout' | 'target' | 'check';

const RULES: [RegExp, Glyph][] = [
  [/\b(gym|workout|lift\w*|exercise|push day|pull day|leg day|stretch\w*)\b/, 'dumbbell'],
  [/\b(run|jog\w*|walk\w*|steps|cycl\w*|swim\w*|cardio)\b/, 'shoe'],
  [/\b(read\w*|book\w*|pages?|chapter|gita)\b/, 'book'],
  [/\b(journal\w*|diary|writ\w*|notes?)\b/, 'pen'],
  [/\b(meditat\w*|breath\w*|pray\w*|yoga|gratitude)\b/, 'lotus'],
  [/\b(water|drink|hydrat\w*)\b/, 'glass'],
  [/\b(skin\w*|face|shower|groom\w*|hair|teeth|serum)\b/, 'drop'],
  [/\b(sleep|nap|bed\w*|wake)\b/, 'moon'],
  [/\b(call|phone|ring)\b/, 'phone'],
  [/\b(message|text|whatsapp|reply|dm|chat|e?mail\w*)\b/, 'chat'],
  [/\b(family|home|house|mom|dad|papa|mummy|maa|parents?|brother|sister)\b/, 'home'],
  [/\b(date|gift|anniversary|love|girlfriend|boyfriend|partner)\b/, 'heart'],
  [/\b(friends?|hang ?out|party|catch up)\b/, 'people'],
  [/\b(voice|speak\w*|speech|talk|podcast|record\w*)\b/, 'mic'],
  [/\b(learn\w*|course|lesson|study|class|lecture|exam|college|chess|assignment|practi[cs]e)\b/, 'cap'],
  [/\b(reels?|video|shoot|edit\w*|post|content|youtube|instagram|thumbnail|script)\b/, 'play'],
  [/\b(pay\w*|paid|invoice|bills?|bank|budget|tax|gst|money|expense|salary|rent|fees?|refund)\b/, 'coin'],
  [/\b(buy|shop\w*|order|grocer\w*)\b/, 'bag'],
  [/\b(client|lead|proposal|pitch|meeting|deploy|code|build|app|website|server|fix|bug|ship|launch)\b/, 'laptop'],
  [/\b(meal|eat|food|cook\w*|protein|diet|breakfast|lunch|dinner)\b/, 'bowl'],
];
const BY_ASPECT: Record<AspectKey, Glyph> = {
  body: 'pulse', mind: 'cap', soul: 'lotus', mission: 'target', money: 'coin', growth: 'sprout',
  family: 'home', romance: 'heart', friends: 'people',
};
export function glyphOf(title: string, aspect: AspectKey | null): Glyph {
  const t = title.toLowerCase();
  return RULES.find(([re]) => re.test(t))?.[1] ?? (aspect ? BY_ASPECT[aspect] : 'check');
}

const O = (cx: number, cy: number, r: number) => `M${cx} ${cy - r}a${r} ${r} 0 1 1-0.01 0z`;
const ART: Record<Glyph, { line: string; fill?: string }> = {
  dumbbell: { fill: `${rr(52, 72, 40, 112)}${rr(164, 72, 40, 112)}`, line: `${rr(52, 72, 40, 112)}${rr(164, 72, 40, 112)}M92 128h72M24 104v48M232 104v48` },
  shoe: { fill: 'M32 184h192v-12c0-18-12-30-30-34l-54-12-26-46H74l-8 28H46c-8 0-14 6-14 14z', line: 'M32 184h192v-12c0-18-12-30-30-34l-54-12-26-46H74l-8 28H46c-8 0-14 6-14 14zM32 152h80M118 106l-18 22M144 116l-16 22' },
  book: { fill: 'M128 72c-20-16-52-24-88-24v144c36 0 68 8 88 24z', line: 'M128 72c-20-16-52-24-88-24v144c36 0 68 8 88 24 20-16 52-24 88-24V48c-36 0-68 8-88 24zM128 72v144' },
  pen: { fill: 'M168 40l48 48-120 120H48v-48z', line: 'M168 40l48 48-120 120H48v-48zM144 64l48 48' },
  lotus: { fill: 'M128 200c-28-28-36-80 0-128 36 48 28 100 0 128z', line: 'M128 200c-40 0-80-24-96-56 32-8 64 4 96 56 32-52 64-64 96-56-16 32-56 56-96 56zM128 200c-28-28-36-80 0-128 36 48 28 100 0 128z' },
  glass: { fill: 'M74 112h108l-9 104H83z', line: 'M64 40h128l-16 176H80zM74 112h108' },
  drop: { fill: 'M128 32c40 52 72 92 72 128a72 72 0 0 1-144 0c0-36 32-76 72-128z', line: 'M128 32c40 52 72 92 72 128a72 72 0 0 1-144 0c0-36 32-76 72-128zM100 168c4 14 14 22 28 24' },
  moon: { fill: 'M208 152A84 84 0 1 1 104 48a68 68 0 0 0 104 104z', line: 'M208 152A84 84 0 1 1 104 48a68 68 0 0 0 104 104z' },
  phone: { fill: 'M92 40l26 58-26 18c12 28 32 48 60 60l18-26 58 26-6 36c-2 14-14 24-28 24C102 232 24 154 20 62c0-14 10-26 24-28z', line: 'M92 40l26 58-26 18c12 28 32 48 60 60l18-26 58 26-6 36c-2 14-14 24-28 24C102 232 24 154 20 62c0-14 10-26 24-28z' },
  chat: { fill: 'M48 56h160a16 16 0 0 1 16 16v96a16 16 0 0 1-16 16H112l-48 36v-36H48a16 16 0 0 1-16-16V72a16 16 0 0 1 16-16z', line: 'M48 56h160a16 16 0 0 1 16 16v96a16 16 0 0 1-16 16H112l-48 36v-36H48a16 16 0 0 1-16-16V72a16 16 0 0 1 16-16zM80 108h96M80 140h56' },
  home: { fill: 'M48 208V112l80-68 80 68v96z', line: 'M48 208V112l80-68 80 68v96zM104 208v-56h48v56' },
  heart: { fill: 'M128 216s-96-52-96-116c0-32 24-56 52-56 20 0 36 10 44 26 8-16 24-26 44-26 28 0 52 24 52 56 0 64-96 116-96 116z', line: 'M128 216s-96-52-96-116c0-32 24-56 52-56 20 0 36 10 44 26 8-16 24-26 44-26 28 0 52 24 52 56 0 64-96 116-96 116z' },
  people: { fill: O(96, 88, 36), line: `${O(96, 88, 36)}M28 208c6-36 34-60 68-60s62 24 68 60${O(180, 92, 28)}M180 148c26 2 44 24 48 56` },
  mic: { fill: 'M128 24a40 40 0 0 1 40 40v64a40 40 0 0 1-80 0V64a40 40 0 0 1 40-40z', line: 'M128 24a40 40 0 0 1 40 40v64a40 40 0 0 1-80 0V64a40 40 0 0 1 40-40zM200 128a72 72 0 0 1-144 0M128 200v32' },
  cap: { fill: 'M16 104l112-56 112 56-112 56z', line: 'M16 104l112-56 112 56-112 56zM64 128v52c0 16 28 32 64 32s64-16 64-32v-52M240 104v64' },
  play: { fill: 'M112 96v64l52-32z', line: `${rr(28, 52, 200, 152)}M112 96v64l52-32z` },
  coin: { fill: O(128, 128, 96), line: `${O(128, 128, 96)}M96 84h64M96 112h64M120 84c36 0 36 52 0 52h-20l52 44` },
  bag: { fill: 'M48 80h160l-12 136H60z', line: 'M48 80h160l-12 136H60zM96 80V64a32 32 0 0 1 64 0v16' },
  laptop: { fill: 'M60 60h136a12 12 0 0 1 12 12v100H48V72a12 12 0 0 1 12-12z', line: 'M60 60h136a12 12 0 0 1 12 12v100H48V72a12 12 0 0 1 12-12zM20 172h216v12a20 20 0 0 1-20 20H40a20 20 0 0 1-20-20z' },
  bowl: { fill: 'M32 124h192c0 52-40 88-96 88s-96-36-96-88z', line: 'M32 124h192c0 52-40 88-96 88s-96-36-96-88zM96 92c0-16 16-16 16-32M144 92c0-16 16-16 16-32' },
  pulse: { line: 'M24 136h44l24-60 40 120 26-60h74' },
  sprout: { fill: 'M128 128c0-40-32-64-80-64 0 48 32 64 80 64z', line: 'M128 216v-96M128 128c0-40-32-64-80-64 0 48 32 64 80 64zM128 112c0-32 24-56 64-56 0 40-24 56-64 56z' },
  target: { fill: O(128, 128, 96), line: `${O(128, 128, 96)}${O(128, 128, 52)}` },
  check: { fill: O(128, 128, 96), line: `${O(128, 128, 96)}M84 132l30 30 58-62` },
};

/** The task's picture. It gives a small hop when the task is ticked. */
export function Pictogram({ title, aspect, color, done, size = 28 }: { title: string; aspect: AspectKey | null; color: string; done: boolean; size?: number }) {
  const g = ART[glyphOf(title, aspect)];
  const k = useSharedValue(1);
  useEffect(() => {
    if (!done) return;
    k.value = withSequence(withTiming(1.18, { duration: 130, reduceMotion: ReduceMotion.System }),
      withSpring(1, { duration: 420, dampingRatio: 0.55, reduceMotion: ReduceMotion.System }));
  }, [done, k]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size, opacity: done ? 0.45 : 1 }, st]}>
      <Duo size={size} color={color} line={g.line} fill={g.fill}>
        {glyphOf(title, aspect) === 'target' ? <Circle cx={128} cy={128} r={14} fill={color} /> : null}
      </Duo>
    </Animated.View>
  );
}
