import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { Press } from './Press';

/** Nothing cached and the PC didn't answer: what went wrong and a retry. Sits where the list would be. */
export function ErrorState({ title, message, onRetry }: { title: string; message: string | null; onRetry: () => void }) {
  return (
    <View style={s.wrap} accessibilityLiveRegion="polite">
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.body}>{message}</Text> : null}
      <Press onPress={onRetry} haptic style={s.retry}>
        <Text style={s.retryText}>Try again</Text>
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 32, gap: 12, alignItems: 'flex-start' },
  title: { fontFamily: F.semibold, fontSize: 20, lineHeight: 28, color: C.text },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  retryText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
