import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Sym } from '@/components/Sym';
import { api, ApiError } from '@/lib/api';
import { C, F } from '@/theme';

// Power for the PC: lock, sleep, restart, shut down. Each is a slider: drag the knob to the end to do it, so a
// stray tap never turns the PC off. Restart and shut down wait 10 s on the PC (with Windows' notice) and show a
// Cancel button here until then.
type Action = 'lock' | 'sleep' | 'restart' | 'shutdown';
const ROWS: { action: Action; icon: string; label: string; done: string; color: string }[] = [
  { action: 'lock', icon: 'lock.fill', label: 'Slide to lock', done: 'Locked', color: '#766BE6' },
  { action: 'sleep', icon: 'moon.fill', label: 'Slide to sleep', done: 'Going to sleep', color: '#4F8DF7' },
  { action: 'restart', icon: 'arrow.clockwise', label: 'Slide to restart', done: 'Restarting', color: '#F5A524' },
  { action: 'shutdown', icon: 'power', label: 'Slide to shut down', done: 'Shutting down', color: '#FF5A5F' },
];
const KNOB = 48;
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String((e as Error)?.message ?? "Couldn't reach your PC."));
const buzz = (heavy = false) => {
  if (Platform.OS === 'web') return;
  (heavy ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.selectionAsync()).catch(() => {});
};
const secondsLeft = (at: number) => Math.max(0, Math.ceil((at - Date.now()) / 1000));

export function PowerPanel() {
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, setPending] = useState<{ action: string; at: number } | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let live = true;
    api<{ pending: { action: string; at: number } | null }>('/pc/power').then((s) => { if (live) setPending(s.pending); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!pending) return;
    const tick = () => { const n = secondsLeft(pending.at); setLeft(n); if (!n) setPending(null); };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 250);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [pending]);

  const act = async (r: (typeof ROWS)[number]) => {
    try {
      const out = await api<{ note: string; pending?: { action: string; at: number } }>('/pc/power', { method: 'POST', body: { action: r.action } });
      buzz(true);
      setNote({ text: out.note });
      if (out.pending) setPending(out.pending);
    } catch (e) { setNote({ text: errText(e), bad: true }); }
  };
  const cancel = async () => {
    try { await api('/pc/power', { method: 'POST', body: { action: 'cancel' } }); setPending(null); setNote({ text: 'Cancelled. The PC stays on.' }); buzz(); }
    catch (e) { setNote({ text: errText(e), bad: true }); }
  };

  return (
    <View style={{ gap: 10 }}>
      {pending ? (
        <View style={s.pending}>
          <Text style={s.pendingText}>{pending.action === 'restart' ? 'Restarting' : 'Shutting down'} in {left} s</Text>
          <Pressable accessibilityRole="button" onPress={() => void cancel()} style={s.cancel}><Text style={s.cancelText}>Cancel</Text></Pressable>
        </View>
      ) : null}
      {ROWS.map((r) => <Slider key={r.action} row={r} onDone={() => void act(r)} />)}
      {note ? <Text style={[s.note, note.bad && { color: C.danger }]}>{note.text}</Text> : null}
    </View>
  );
}

function Slider({ row, onDone }: { row: (typeof ROWS)[number]; onDone: () => void }) {
  const [w, setW] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const [start, setStart] = useState(0);
  const [armed, setArmed] = useState(false);
  const max = Math.max(1, w - KNOB - 8);
  const back = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
  type Ev = { nativeEvent: { pageX: number } };
  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: Ev) => { setStart(e.nativeEvent.pageX); setArmed(false); buzz(); },
    onResponderMove: (e: Ev) => {
      const d = Math.min(Math.max(e.nativeEvent.pageX - start, 0), max);
      x.setValue(d);
      const near = d >= max * 0.92;
      if (near !== armed) { setArmed(near); if (near) buzz(); }
    },
    onResponderRelease: () => {
      if (armed) { Animated.timing(x, { toValue: max, duration: 80, useNativeDriver: true }).start(() => { onDone(); setTimeout(back, 700); }); }
      else back();
      setArmed(false);
    },
    onResponderTerminate: () => { back(); setArmed(false); },
  };
  const fill = x.interpolate({ inputRange: [0, max], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View style={s.track} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: row.color, opacity: fill.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.45] }) }]} />
      <Text style={s.trackText} pointerEvents="none">{armed ? 'Let go' : row.label}</Text>
      <Animated.View {...handlers} accessible accessibilityRole="adjustable" accessibilityLabel={row.label}
        accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onDone()}
        style={[s.knob, { backgroundColor: row.color, transform: [{ translateX: x }] }]}>
        <Sym name={row.icon as never} size={20} color="#fff" fallback={<Text style={s.knobText}>›</Text>} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    height: KNOB + 8, borderRadius: (KNOB + 8) / 2, justifyContent: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  trackText: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.muted },
  knob: { position: 'absolute', left: 4, width: KNOB, height: KNOB, borderRadius: KNOB / 2, alignItems: 'center', justifyContent: 'center' },
  knobText: { fontFamily: F.semibold, fontSize: 22, color: '#fff' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,90,95,0.14)' },
  pendingText: { flex: 1, fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text, fontVariant: ['tabular-nums'] },
  cancel: { height: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  cancelText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: '#111' },
  note: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: '#3DDC97', paddingHorizontal: 4 },
});
