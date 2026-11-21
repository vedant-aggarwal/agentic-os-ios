import * as Haptics from 'expo-haptics';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue,
  withRepeat, withTiming,
} from 'react-native-reanimated';
import { lightTap, useScale } from '@/components/Glass';
import { LockHint } from '@/components/HoldLock';
import { PcMic } from '@/components/Icons';
import { Sym } from '@/components/Sym';
import type { AgentItem, AgentState } from '@/lib/agent';
import { useHoldLock } from '@/lib/touch';
import { ASPECT_COLOR, C, F } from '@/theme';

// Command mode: the bar across the top ("Command mode", what the agent is doing, Stop or start over) and the
// agent's live transcript with Talk (hold to say more, through Wispr) and Type (a written reply).
export const LIVE = ASPECT_COLOR.mission;

const STATUS: Record<AgentState | 'listening' | 'nothing', string> = {
  idle: 'Ready', listening: 'Listening', nothing: "Didn't catch that", starting: 'Starting', thinking: 'Thinking',
  working: 'Working', done: 'Done', stopped: 'Stopped', error: 'Failed',
};

function Pulse({ on, color }: { on: boolean; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!on) { cancelAnimation(t); t.set(withTiming(0, { duration: 200 })); return; }
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }), -1, true));
  }, [on, t]);
  const st = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * (1 - t.value), transform: [{ scale: 1 + 0.35 * t.value }] }));
  return <Animated.View style={[s.dot, { backgroundColor: color }, st]} />;
}

export function CommandBar({ state, heard, connected, listening, hasItems, onStop, onFresh }: {
  state: AgentState; heard: 'listening' | 'nothing' | null; connected: boolean; listening: boolean; hasItems: boolean;
  onStop: () => void; onFresh: () => void;
}) {
  const busy = state === 'starting' || state === 'thinking' || state === 'working';
  const key = listening ? 'listening' : heard === 'nothing' && !busy ? 'nothing' : state;
  const tone = key === 'error' || key === 'nothing' ? C.danger : busy || listening ? LIVE : C.muted;
  return (
    <View style={s.bar}>
      <Pulse on={busy || listening} color={tone} />
      <Text style={s.barTitle}>Command mode</Text>
      <Text style={[s.barState, { color: tone }]} numberOfLines={1}>{connected ? STATUS[key] : 'Connecting'}</Text>
      <View style={{ flex: 1 }} />
      {busy || listening ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop" hitSlop={6} style={s.stop}
          onPress={() => { if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); onStop(); }}>
          <Sym name="stop.fill" size={14} color="#fff" fallback={<View style={s.stopSq} />} />
          <Text style={s.stopText}>Stop</Text>
        </Pressable>
      ) : hasItems ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Start over" hitSlop={8} style={s.iconBtn} onPress={() => { lightTap(); onFresh(); }}>
          <Sym name="square.and.pencil" size={15} fallback={<Text style={s.iconTxt}>+</Text>} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Row({ it }: { it: AgentItem }) {
  if (it.kind === 'user') {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={s.userRow}>
        <Text style={s.userText}>{it.text}</Text>
      </Animated.View>
    );
  }
  if (it.kind === 'text') return <Animated.Text entering={FadeIn.duration(180)} style={s.agentText}>{it.text}</Animated.Text>;
  const done = it.status === 'completed', failed = it.status === 'failed';
  return (
    <Animated.View entering={FadeIn.duration(180)} style={s.toolRow}>
      <View style={[s.toolDot, { backgroundColor: failed ? C.danger : done ? C.faint : LIVE }]} />
      <Text style={s.toolText} numberOfLines={2}>{it.title}</Text>
    </Animated.View>
  );
}

function PadButton({ label, icon, onPress, active }: { label: string; icon: React.ReactNode; onPress: () => void; active?: boolean }) {
  const p = useScale(0.96);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}
      onPressIn={() => p.set(p.to)} onPressOut={() => p.set(1)} onPress={onPress}>
      {({ pressed }) => (
        <Animated.View style={[s.btn, p.style, (pressed || active) && s.btnOn]}>{icon}</Animated.View>
      )}
    </Pressable>
  );
}

/** Talk: hold to speak to the agent, slide up while holding to lock it on, then tap to send. A tap on its own starts
 *  a locked one. Multi-touch, so other controls keep working while it is held. */
function TalkButton({ listening, locked, onIn, onOut, onLock, onToggle }: {
  listening: boolean; locked: boolean; onIn: () => void; onOut: () => void; onLock: () => void; onToggle: () => void;
}) {
  const p = useScale(0.96);
  const hold = useHoldLock({
    holdIn: onIn, holdOut: onOut, lock: onLock, tap: () => { lightTap(); onToggle(); },
    press: (down) => {
      p.set(down ? p.to : 1);
      if (down && Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
  });
  const lit = listening || hold.holding;
  return (
    <View {...hold.props} style={{ flex: 1 }} accessible accessibilityRole="button" accessibilityLabel="Talk to the PC agent"
      accessibilityHint="Hold to talk, slide up to lock, tap to send" onAccessibilityTap={onToggle}>
      <Animated.View style={[s.btn, p.style, lit && s.btnOn]}>
        <View pointerEvents="none" style={s.talkInner}>
          <Sym name={locked ? 'lock.fill' : 'mic.fill'} size={22} color={lit ? LIVE : C.text} fallback={<PcMic size={22} color={C.text} />} />
          {locked ? <Text style={s.talkHint}>Tap to send</Text> : null}
        </View>
      </Animated.View>
      <LockHint lift={hold.lift} holding={hold.holding} />
    </View>
  );
}

/** The transcript, with Talk and Type under it. */
export function ChatView({ items, error, listening, locked, onTalkIn, onTalkOut, onLock, onToggle, onType }: {
  items: AgentItem[]; error: string | null; listening: boolean; locked: boolean;
  onTalkIn: () => void; onTalkOut: () => void; onLock: () => void; onToggle: () => void; onType: (t: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onType(t); setDraft(''); setTyping(false); lightTap();
  };
  return (
    <View style={s.wrap}>
      <Animated.View entering={FadeIn.duration(220)} style={s.pad}>
        {typing ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={s.inputRow}>
            <TextInput autoFocus value={draft} onChangeText={setDraft} placeholder="Tell the PC…" placeholderTextColor={C.faint}
              style={s.input} returnKeyType="send" onSubmitEditing={submit} submitBehavior="submit" />
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={submit} style={[s.send, !draft.trim() && { opacity: 0.4 }]}>
              <Sym name="arrow.up" size={15} color="#0B0C10" fallback={<Text style={s.sendTxt}>↑</Text>} />
            </Pressable>
          </Animated.View>
        ) : null}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          {items.length === 0 ? (
            <Text style={s.empty}>
              {listening ? 'Say what the PC should do.' : 'Hold Talk (slide up to lock) or press the Action button, and say what the PC should do.'}
            </Text>
          ) : (
            <Animated.View layout={LinearTransition.duration(180)} style={{ gap: 10 }}>
              {items.map((it) => <Row key={`${it.kind}:${it.id}`} it={it} />)}
            </Animated.View>
          )}
          {error ? <Text style={s.err}>{error}</Text> : null}
        </ScrollView>
      </Animated.View>
      <View style={s.buttons}>
        <TalkButton listening={listening} locked={locked} onIn={onTalkIn} onOut={onTalkOut} onLock={onLock} onToggle={onToggle} />
        <PadButton label="Type to the PC agent" active={typing} onPress={() => setTyping((v) => !v)}
          icon={<Sym name="text.bubble" size={22} color={typing ? LIVE : C.text} fallback={<Text style={s.kb}>Aa</Text>} />} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 8 },
  bar: {
    height: 52, borderRadius: 18, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  barTitle: { fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text },
  barState: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  stop: { height: 36, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E5484D' },
  stopSq: { width: 11, height: 11, borderRadius: 2, backgroundColor: '#fff' },
  stopText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: '#fff' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  iconTxt: { fontFamily: F.medium, fontSize: 20, lineHeight: 22, color: C.text },
  pad: {
    flex: 1, borderRadius: 24, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  list: { padding: 16, paddingBottom: 20, gap: 10 },
  empty: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint },
  userRow: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: 'rgba(61,220,151,0.14)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  userText: { fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.text },
  agentText: { fontFamily: F.regular, fontSize: 15, lineHeight: 22, color: C.textSoft },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolDot: { width: 6, height: 6, borderRadius: 3 },
  toolText: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  err: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.danger, marginTop: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, marginBottom: 0, paddingLeft: 14, paddingRight: 6, height: 46,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  input: { flex: 1, fontFamily: F.medium, fontSize: 15, color: C.text, paddingVertical: 0 },
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: LIVE, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { fontFamily: F.semibold, fontSize: 16, color: '#0B0C10' },
  buttons: { flexDirection: 'row', gap: 8, height: 56 },
  btn: {
    flex: 1, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  talkInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talkHint: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: LIVE },
  kb: { fontFamily: F.semibold, fontSize: 18, color: C.text },
});
