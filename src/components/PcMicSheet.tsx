import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap, useScale } from '@/components/Glass';
import { PcMic } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import type { Phase } from '@/lib/wispr';
import { ASPECT_COLOR, C, F } from '@/theme';

// PC mic: the phone as Wispr Flow's trigger. The screen grows out of the mic button in the top bar whenever a
// volume press starts Wispr (or the button is tapped), shows what Wispr is doing, and shrinks back into it.
const OPEN = { duration: 560, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 440, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const ICON = 44; // the button it grows from

const TONE: Record<Phase, string> = {
  idle: C.muted, listening: ASPECT_COLOR.body, handsfree: ASPECT_COLOR.mission, sent: ASPECT_COLOR.friends,
};
const TITLE: Record<Phase, string> = { idle: 'Ready', listening: 'Listening', handsfree: 'Hands-free', sent: 'Sent to PC' };
const HINT: Record<Phase, string> = {
  idle: 'Hold volume up and talk. Wispr types it on your PC when you let go.',
  listening: 'Let go of volume up to send. Tap volume down to keep it listening.',
  handsfree: 'Wispr keeps listening. Press either volume button to stop and send.',
  sent: 'Wispr is typing it where your cursor is on the PC.',
};

const clamp01 = (v: number) => { 'worklet'; return Math.min(Math.max(v, 0), 1); };
const lerp = (a: number, b: number, t: number) => { 'worklet'; return a + (b - a) * t; };

/** One ring of the voice orb, swelling out and fading, staggered by `delay`. */
function Ring({ live, delay, color }: { live: boolean; delay: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!live) { cancelAnimation(t); t.set(withTiming(0, { duration: 300 })); return; }
    t.set(0);
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false)));
  }, [live, delay, t]);
  const st = useAnimatedStyle(() => ({ opacity: live ? 0.5 * (1 - t.value) : 0, transform: [{ scale: 1 + 0.7 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[s.ring, { borderColor: color }, st]} />;
}

function Elapsed({ since, live }: { since: number; live: boolean }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [live]);
  const sec = live ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  return <Text style={[s.elapsed, !live && { opacity: 0 }]}>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</Text>;
}

function Control({ label, active, tone, onPressIn, onPressOut, onPress }: {
  label: string; active?: boolean; tone: string; onPressIn?: () => void; onPressOut?: () => void; onPress?: () => void;
}) {
  const p = useScale(0.95);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} style={{ flex: 1 }}
      onPressIn={() => { p.set(p.to); onPressIn?.(); }} onPressOut={() => { p.set(1); onPressOut?.(); }} onPress={onPress}>
      {({ pressed }) => (
        <Animated.View style={[s.control, p.style, (active || pressed) && { backgroundColor: tone, borderColor: tone }]}>
          <Text style={[s.controlText, (active || pressed) && { color: '#0A0B0D' }]}>{label}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

export function PcMicSheet({ open, origin, phase, since, error, volumeReady, onClose, onTalkIn, onTalkOut, onHandsFree }: {
  open: boolean; origin: { x: number; y: number }; phase: Phase; since: number; error: string | null; volumeReady: boolean;
  onClose: () => void; onTalkIn: () => void; onTalkOut: () => void; onHandsFree: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true); // mount at once on open; unmount after the close animation
  useEffect(() => {
    if (open) { p.set(withSpring(1, OPEN)); return; }
    p.set(withSpring(0, CLOSE));
    const id = setTimeout(() => setMounted(false), 460);
    return () => clearTimeout(id);
  }, [open, p]);

  const shell = useAnimatedStyle(() => {
    const t = p.value;
    return {
      left: lerp(origin.x - ICON / 2, 0, t), top: lerp(origin.y - ICON / 2, 0, t),
      width: lerp(ICON, width, t), height: lerp(ICON, height, t),
      borderRadius: lerp(ICON / 2, 44, t), opacity: clamp01(t * 4),
    };
  });
  const content = useAnimatedStyle(() => ({
    opacity: clamp01((p.value - 0.45) / 0.55), transform: [{ translateY: (1 - p.value) * 24 }],
  }));
  if (!mounted) return null;

  const live = phase === 'listening' || phase === 'handsfree';
  const tone = TONE[phase];
  return (
    <Animated.View style={[s.shell, shell]} pointerEvents={open ? 'auto' : 'none'}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.tint]} />
      <Content style={content} insets={insets} width={width} height={height}>
        <View style={s.header}>
          <Text style={s.kicker}>PC mic · Wispr Flow</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.close}>
            <Sym name="xmark" size={16} fallback={<Text style={s.closeX}>×</Text>} />
          </Pressable>
        </View>

        <View style={s.center}>
          <View style={s.orbBox}>
            <Ring live={live} delay={0} color={tone} />
            <Ring live={live} delay={600} color={tone} />
            <Ring live={live} delay={1200} color={tone} />
            <View style={[s.orb, { borderColor: tone, backgroundColor: live ? `${tone}26` : 'rgba(255,255,255,0.05)' }]}>
              <Sym name="mic.fill" size={44} color={live ? tone : C.text} fallback={<PcMic size={44} color={live ? tone : C.text} />} />
            </View>
          </View>
          <Text style={[s.title, { color: phase === 'idle' ? C.text : tone }]}>{TITLE[phase]}</Text>
          <Elapsed since={since} live={live} />
          <Text style={s.hint}>{HINT[phase]}</Text>
          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>

        <View style={s.footer}>
          <View style={s.controls}>
            <Control label="Hold to talk" tone={ASPECT_COLOR.body} active={phase === 'listening'} onPressIn={onTalkIn} onPressOut={onTalkOut} />
            <Control label="Hands-free" tone={ASPECT_COLOR.mission} active={phase === 'handsfree'} onPress={onHandsFree} />
          </View>
          <Text style={s.guide}>
            {volumeReady
              ? 'Volume up: hold to talk. Up then down, or both together: hands-free.'
              : 'Volume buttons start working with the next app build. The buttons above work now.'}
          </Text>
        </View>
      </Content>
    </Animated.View>
  );
}

/** The screen's content, laid out at full size from the start so it never reflows while the shell grows. */
function Content({ style, insets, width, height, children }: {
  style: object; insets: { top: number; bottom: number }; width: number; height: number; children: React.ReactNode;
}) {
  return (
    <Animated.View style={[s.content, { width, height, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }, style]}>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'absolute', overflow: 'hidden', borderCurve: 'circular' },
  tint: { backgroundColor: 'rgba(9,10,14,0.86)' },
  content: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 20 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  closeX: { fontFamily: F.medium, fontSize: 22, lineHeight: 24, color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  orbBox: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2 },
  orb: { width: 150, height: 150, borderRadius: 75, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  elapsed: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.muted, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.textSoft, textAlign: 'center', maxWidth: 300, marginTop: 4 },
  error: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.danger, textAlign: 'center', maxWidth: 300, marginTop: 8 },
  footer: { gap: 14 },
  controls: { flexDirection: 'row', gap: 10 },
  control: {
    height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  controlText: { fontFamily: F.semibold, fontSize: 16, color: C.text },
  guide: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, textAlign: 'center' },
});
