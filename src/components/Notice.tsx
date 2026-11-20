import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { C, F } from '@/theme';

/** Short status line above the bottom bar ("Not built yet", errors). Clears itself. */
export function Notice({ text, bottom, onClear }: { text: string | null; bottom: number; onClear: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onClear, 2200);
    return () => clearTimeout(t);
  }, [text, onClear]);
  if (!text) return null;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} pointerEvents="none"
      accessibilityLiveRegion="polite" style={[s.wrap, { bottom }]}>
      <Text style={s.text}>{text}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16,
    backgroundColor: 'rgba(30,31,35,0.96)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  text: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.text },
});
