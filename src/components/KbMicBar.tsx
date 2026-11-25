import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { C, F } from '@/theme';

/** While the app records for the keyboard (lib/kbmic.ts): what's happening, and a Stop that doesn't need the PC. */
export function KbMicBar({ bottom, onStop }: { bottom: number; onStop: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} accessibilityLiveRegion="polite" style={[s.wrap, { bottom }]}>
      <View style={s.dot} />
      <Text style={s.text}>Listening for the keyboard. Swipe back to your app and talk.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop the keyboard's mic" hitSlop={8} onPress={onStop}
        style={({ pressed }) => [s.stop, pressed && { opacity: 0.7 }]}>
        <Text style={s.stopText}>Stop</Text>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, alignSelf: 'center',
    paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(30,31,35,0.96)', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
  text: { flex: 1, fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: C.text },
  stop: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.text },
  stopText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: '#111' },
});
