import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';

const native = Platform.OS !== 'web';
export const STRENGTH_LABELS = ['Loose', 'Inspired', 'Balanced', 'Close', 'Exact'];
const HINTS = [
  'Just a mood. Concepts can go far from your idea.',
  'Borrows from your idea, free to change it.',
  'Every concept is built around your idea.',
  'Keeps your situation and characters, new hooks and endings.',
  'Your idea as it is, with only a small twist each.',
];
const KNOB = 28;

/** How closely concepts follow the raw idea, in five stops. Drag the knob or tap a stop. */
export function StrengthSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const step = (w - KNOB) / 4;
  const live = useRef({ value, step, onChange });
  live.current = { value, step, onChange };

  useEffect(() => {
    if (w) Animated.spring(x, { toValue: value * step, damping: 24, stiffness: 300, useNativeDriver: native }).start();
  }, [value, step, w, x]);

  const pan = useMemo(() => {
    let startX = 0;
    const pick = (px: number) => Math.max(0, Math.min(4, Math.round(px / live.current.step)));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // the sheet's scroll view must not steal a horizontal drag
      onPanResponderGrant: (e) => {
        x.stopAnimation();
        startX = e.nativeEvent.locationX - KNOB / 2;
        x.setValue(Math.max(0, Math.min(4 * live.current.step, startX)));
      },
      onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(4 * live.current.step, startX + g.dx))),
      onPanResponderRelease: (_, g) => {
        const v = pick(startX + g.dx);
        live.current.onChange(v);
        Animated.spring(x, { toValue: v * live.current.step, damping: 24, stiffness: 300, useNativeDriver: native }).start();
      },
    });
  }, [x]);

  return (
    <View style={[styles.wrap, disabled && { opacity: 0.45 }]} pointerEvents={disabled ? 'none' : 'auto'}>
      <View style={styles.head}>
        <Text style={styles.title}>Follow my idea</Text>
        <Text style={styles.value}>{STRENGTH_LABELS[value]}</Text>
      </View>
      <View style={styles.track} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityValue={{ text: STRENGTH_LABELS[value] }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(4, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
        <View pointerEvents="none" style={styles.line} />
        {w ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.dot, { left: KNOB / 2 + i * step - 4 }, i <= value && { backgroundColor: C.ink }]} />
            ))}
            <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} />
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>{disabled ? 'Write or say a raw idea to use this.' : HINTS[value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: C.card },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F.s, fontSize: 15, color: C.ink },
  value: { fontFamily: F.b, fontSize: 14, color: C.ink },
  track: { marginTop: 10, height: 36, justifyContent: 'center' },
  line: { position: 'absolute', left: KNOB / 2, right: KNOB / 2, height: 4, borderRadius: 2, backgroundColor: C.empty },
  dot: { position: 'absolute', top: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: '#C9CBD0' },
  knob: { position: 'absolute', top: 4, left: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: C.card, borderWidth: 2, borderColor: C.ink, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  hint: { marginTop: 6, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
});
