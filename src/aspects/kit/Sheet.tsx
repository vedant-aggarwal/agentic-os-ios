import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MOTION, R, SURF, t } from './tokens';

/**
 * A sheet that rises from the bottom over everything, the dock included, for one quick job: log a set, add a
 * meal, pick a value. It moves up with the keyboard. Tap outside or the grabber to close. Keep it to one job;
 * anything with its own navigation belongs in a `Screen`.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const p = useSharedValue(0);
  const [mounted, setMounted] = useState(open); // shown, or still sliding away
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) { p.set(withSpring(1, MOTION.spring)); return; }
    p.set(withTiming(0, { duration: 220, reduceMotion: MOTION.fade.reduceMotion }));
    const id = setTimeout(() => setMounted(false), 240);
    return () => clearTimeout(id);
  }, [open, p]);
  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const rise = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * height }] }));
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, s.scrim, scrim]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[s.sheet, { maxHeight: height - insets.top - 24, paddingBottom: Math.max(insets.bottom, 12) + 12 }, rise]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={s.grabHit}>
            <View style={s.grab} />
          </Pressable>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            {title ? <Text accessibilityRole="header" style={t.heading}>{title}</Text> : null}
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(6,7,10,0.6)' },
  sheet: {
    backgroundColor: '#1B1D25', borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet, borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: SURF.line, boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
  },
  grabHit: { alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)' },
  body: { paddingHorizontal: 16, paddingBottom: 4, gap: 16 },
});
