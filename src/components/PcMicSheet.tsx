import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, ReduceMotion, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatView, CommandBar, LIVE } from '@/components/CommandPanel';
import { lightTap, useScale } from '@/components/Glass';
import { LockHint } from '@/components/HoldLock';
import { PcMic } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import { PcKeysPad, PcTypePad, usePcKeys } from '@/components/PcKeyboard';
import { Trackpad } from '@/components/Trackpad';
import type { useAgent } from '@/lib/agent';
import { usePointer } from '@/lib/pointer';
import { useHoldLock } from '@/lib/touch';
import type { MicSource, Phase } from '@/lib/wispr';
import { ASPECT_COLOR, C, F } from '@/theme';

// PC mic: the phone as Wispr Flow's trigger. The screen grows out of the mic button in the top bar whenever a
// volume press starts Wispr (or the button is tapped), shows what Wispr is doing, and shrinks back into it.
// Under the orb, a trackpad drives the PC's mouse. Beside the orb, where Wispr hears from: the PC's mic or this
// phone's (so he can walk away). In command mode the trackpad gives way to the PC agent's live transcript.
const OPEN = { duration: 560, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
const CLOSE = { duration: 440, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;
const ICON = 44; // the button it grows from

const TONE: Record<Phase, string> = {
  idle: C.muted, listening: ASPECT_COLOR.body, handsfree: ASPECT_COLOR.mission, sent: ASPECT_COLOR.friends, command: ASPECT_COLOR.growth,
};
const TITLE: Record<Phase, string> = { idle: 'Ready', listening: 'Listening', handsfree: 'Hands-free', sent: 'Sent to PC', command: 'Command' };
const SEG = { duration: 380, dampingRatio: 0.86, reduceMotion: ReduceMotion.System } as const;
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
  return <Text style={[s.elapsed, !live && { opacity: 0 }]} numberOfLines={1}>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</Text>;
}

/** The voice orb is the control: hold it to talk, slide up while holding to lock it on (hands-free), tap it to
 *  toggle hands-free. Multi-touch, so the trackpad and keys keep working while it is held. */
function Orb({ phase, since, onTalkIn, onTalkOut, onHandsFree }: {
  phase: Phase; since: number; onTalkIn: () => void; onTalkOut: () => void; onHandsFree: () => void;
}) {
  const p = useScale(0.94);
  const live = phase === 'listening' || phase === 'handsfree' || phase === 'command';
  const tone = TONE[phase];
  const hold = useHoldLock({
    holdIn: onTalkIn, holdOut: onTalkOut, lock: onHandsFree, // locking turns the hold into hands-free
    tap: () => { lightTap(); onHandsFree(); },
    press: (down) => p.set(down ? p.to : 1),
  });
  return (
    <View {...hold.props} accessible accessibilityRole="button" accessibilityLabel="Wispr"
      accessibilityHint="Hold to talk, slide up to lock, tap for hands-free" onAccessibilityTap={onHandsFree}>
      <Animated.View style={[s.orbBox, p.style]}>
        <Ring live={live} delay={0} color={tone} />
        <Ring live={live} delay={600} color={tone} />
        <Ring live={live} delay={1200} color={tone} />
        <View pointerEvents="none" style={[s.orb, { borderColor: tone, backgroundColor: live ? `${tone}26` : 'rgba(255,255,255,0.05)' }]}>
          <Sym name={phase === 'handsfree' ? 'lock.fill' : 'mic.fill'} size={live ? 22 : 26} color={live ? tone : C.text}
            fallback={<PcMic size={26} color={live ? tone : C.text} />} />
          {live ? <Elapsed since={since} live /> : null}
        </View>
        <LockHint lift={hold.lift} holding={hold.holding} top={-28} />
      </Animated.View>
    </View>
  );
}

/** Where Wispr hears from: a two-way switch with a sliding thumb. */
function SourceSwitch({ value, onChange, note }: { value: MicSource; onChange: (v: MicSource) => void; note: string | null }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(value === 'phone' ? 1 : 0);
  useEffect(() => { x.set(withSpring(value === 'phone' ? 1 : 0, SEG)); }, [value, x]);
  const thumb = useAnimatedStyle(() => ({ width: w / 2 - 2, transform: [{ translateX: x.value * (w / 2 - 2) }] }));
  const opt = (v: MicSource, label: string, icon: 'desktopcomputer' | 'iphone') => (
    <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: value === v }} accessibilityLabel={label} style={s.segOpt}
      onPress={() => { if (value !== v) { lightTap(); onChange(v); } }}>
      <Sym name={icon} size={14} color={value === v ? C.text : C.faint} fallback={null} />
      <Text style={[s.segText, value === v && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <View style={s.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? <Animated.View style={[s.segThumb, thumb]} /> : null}
        {opt('pc', 'PC mic', 'desktopcomputer')}
        {opt('phone', 'Phone mic', 'iphone')}
      </View>
      {note ? <Text style={s.segNote}>{note}</Text> : null}
    </View>
  );
}

type View4 = 'chat' | 'pad' | 'type' | 'keys';
type ToggleIcon = 'cursorarrow.rays' | 'keyboard' | 'command';
const TOGGLE_FALLBACK: Record<ToggleIcon, string> = { 'cursorarrow.rays': '↖', keyboard: '⌨', command: '⌘' };

/** A square toggle in the mic row: trackpad, phone keyboard, or PC keys. */
function Toggle({ on, label, icon, onPress }: { on: boolean; label: string; icon: ToggleIcon; onPress: () => void }) {
  const p = useScale(0.92);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} onPress={() => { lightTap(); onPress(); }}>
      <Animated.View style={[s.toggle, on && s.toggleOn, p.style]}>
        <Sym name={icon} size={20} color={on ? '#0B0C10' : C.text} fallback={<Text style={s.toggleTxt}>{TOGGLE_FALLBACK[icon]}</Text>} />
      </Animated.View>
    </Pressable>
  );
}

// The PC screen: command mode by default (the agent's bar and transcript), the trackpad or the PC keyboard on a tap,
// and the mic row at the bottom (Wispr's orb, its state, the trackpad and keyboard toggles, PC mic | Phone mic).
export function PcMicSheet({
  open, origin, phase, since, error, source, sourceNote, onSource, onClose, onTalkIn, onTalkOut, onHandsFree, onSayIn, onSayOut,
  onSayLock, onSayToggle, sayLocked, agent, onStop,
}: {
  open: boolean; origin: { x: number; y: number }; phase: Phase; since: number; error: string | null;
  source: MicSource; sourceNote: string | null; onSource: (v: MicSource) => void;
  onClose: () => void; onTalkIn: () => void; onTalkOut: () => void; onHandsFree: () => void;
  onSayIn: () => void; onSayOut: () => void; onSayLock: () => void; onSayToggle: () => void; sayLocked: boolean;
  agent: ReturnType<typeof useAgent>; onStop: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(open);
  const [view, setView] = useState<View4>('chat');
  const pc = usePointer(open); // one PC connection for the trackpad and the keyboard, ready as soon as this opens
  const kb = usePcKeys(pc); // held and latched modifiers, shared by both keyboard views
  if (open && !mounted) setMounted(true); // mount at once on open; unmount after the close animation
  useEffect(() => {
    if (open) { p.set(withSpring(1, OPEN)); return; }
    p.set(withSpring(0, CLOSE));
    const id = setTimeout(() => { setMounted(false); setView('chat'); }, 460);
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

  const tone = TONE[phase];
  const agentListening = phase === 'command' || agent.heard === 'listening';
  const flip = (v: View4) => setView((cur) => (cur === v ? 'chat' : v));
  return (
    <Animated.View style={[s.shell, shell]} pointerEvents={open ? 'auto' : 'none'}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.tint]} />
      <Content style={content} insets={insets} width={width} height={height}>
        <View style={s.header}>
          <Text style={s.kicker}>Your PC</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.close}>
            <Sym name="xmark" size={16} fallback={<Text style={s.closeX}>×</Text>} />
          </Pressable>
        </View>

        <CommandBar state={agent.state} heard={agent.heard} connected={agent.connected} listening={agentListening}
          hasItems={agent.items.length > 0} onStop={onStop} onFresh={agent.fresh} />

        <View style={s.main}>
          {view === 'pad' ? (
            <Animated.View key="pad" entering={FadeIn.duration(200)} style={{ flex: 1 }}><Trackpad pc={pc} /></Animated.View>
          ) : view === 'keys' ? (
            <PcKeysPad key="keys" kb={kb} />
          ) : view === 'type' ? (
            <PcTypePad key="type" kb={kb} />
          ) : (
            <ChatView key="chat" items={agent.items} error={agent.error} listening={agentListening} locked={sayLocked}
              onTalkIn={onSayIn} onTalkOut={onSayOut} onLock={onSayLock} onToggle={onSayToggle} onType={(t) => agent.say(t)} />
          )}
        </View>

        <View style={s.micRow}>
          <Orb phase={phase} since={since} onTalkIn={onTalkIn} onTalkOut={onTalkOut} onHandsFree={onHandsFree} />
          <View style={s.side}>
            <View style={s.titleRow}>
              <Text style={[s.title, { color: phase === 'idle' ? C.text : tone }]} numberOfLines={1}>{TITLE[phase]}</Text>
              <View style={{ flex: 1 }} />
              <Toggle on={view === 'pad'} label="Trackpad" icon="cursorarrow.rays" onPress={() => flip('pad')} />
              <Toggle on={view === 'type'} label="Type on the PC" icon="keyboard" onPress={() => flip('type')} />
              <Toggle on={view === 'keys'} label="PC keys" icon="command" onPress={() => flip('keys')} />
            </View>
            <SourceSwitch value={source} onChange={onSource} note={sourceNote} />
          </View>
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </Content>
    </Animated.View>
  );
}

/** The screen's content, laid out at full size from the start so it never reflows while the shell grows. It makes
 *  room for the phone's keyboard, so the mic row and what is being typed stay above it. */
function Content({ style, insets, width, height, children }: {
  style: object; insets: { top: number; bottom: number }; width: number; height: number; children: React.ReactNode;
}) {
  const kb = useAnimatedKeyboard();
  const room = useAnimatedStyle(() => ({ paddingBottom: Math.max(insets.bottom + 16, kb.height.value + 8) }));
  return (
    <Animated.View style={[s.content, { width, height, paddingTop: insets.top + 12 }, room, style]}>
      {children}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  shell: { position: 'absolute', overflow: 'hidden', borderCurve: 'circular' },
  tint: { backgroundColor: 'rgba(9,10,14,0.94)' },
  content: { position: 'absolute', left: 0, top: 0, paddingHorizontal: 20, gap: 10 },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  closeX: { fontFamily: F.medium, fontSize: 22, lineHeight: 24, color: C.text },
  main: { flex: 1 },
  micRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  side: { flex: 1, gap: 10 },
  orbBox: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  ring: { position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 2 },
  orb: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  seg: {
    height: 38, borderRadius: 13, borderCurve: 'continuous', flexDirection: 'row', padding: 2,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  segThumb: { position: 'absolute', top: 2, bottom: 2, left: 2, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.14)' },
  segOpt: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint },
  segNote: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: F.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.4, flexShrink: 1 },
  elapsed: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.muted, fontVariant: ['tabular-nums'], marginTop: 1 },
  toggle: {
    width: 40, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  toggleOn: { backgroundColor: LIVE },
  toggleTxt: { fontFamily: F.semibold, fontSize: 16, color: C.text },
  error: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.danger },
});
