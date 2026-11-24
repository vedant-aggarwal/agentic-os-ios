import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { C, F } from '@/theme';
import { haptic, R } from './tokens';

// One Undo for every one-tap action that changes or removes something (a log, a delete, a move, End outing):
// do the action at once, then `undoable('Logged chai', () => remove(id))`. The toast sits above the dock for a
// few seconds; Undo runs the function. A newer toast replaces the old one (the old action stays done).

type Pending = { id: number; text: string; undo: () => void | Promise<void>; ms: number };
let current: Pending | null = null;
let seq = 0;
const subs = new Set<(p: Pending | null) => void>();
const emit = () => subs.forEach((f) => f(current));

/** Show "<text> · Undo" for `ms` (default 5 s). Tapping Undo runs `undo` once. */
export function undoable(text: string, undo: () => void | Promise<void>, ms = 5000) {
  current = { id: ++seq, text, undo, ms };
  emit();
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

/** Drawn once by the aspect host, `bottom` points above the screen's bottom edge (clear of the dock). */
export function UndoToast({ bottom }: { bottom: number }) {
  const [p, setP] = useState<Pending | null>(current);
  useEffect(() => { subs.add(setP); return () => { subs.delete(setP); }; }, []);
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => dismiss(p.id), p.ms);
    return () => clearTimeout(t);
  }, [p]);
  if (!p) return null;
  return (
    <Animated.View key={p.id} pointerEvents="box-none" style={[s.wrap, { bottom }]}
      entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)} exiting={FadeOutDown.duration(140).reduceMotion(ReduceMotion.System)}>
      <View style={s.toast} accessibilityLiveRegion="polite">
        <Text numberOfLines={1} style={s.text}>{p.text}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo: ${p.text}`} hitSlop={10}
          onPress={() => { haptic.tick(); dismiss(p.id); void Promise.resolve().then(p.undo).catch(() => {}); }}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}>
          <Text style={s.btnText}>Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 420, minHeight: 48,
    paddingLeft: 16, paddingRight: 8, borderRadius: R.row, backgroundColor: 'rgba(28,30,38,0.97)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  text: { flexShrink: 1, fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  btn: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text },
});
