import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Press } from './Press';
import { C, F } from '@/theme';

export function Loading() {
  return (
    <View style={styles.box}>
      <ActivityIndicator color={C.ink} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Can’t reach Content OS</Text>
      <Text style={styles.body}>{message}. Check that the Content OS server is running on the PC, then try again.</Text>
      <Press style={styles.btn} onPress={onRetry}>
        <Text style={styles.btnText}>Try again</Text>
      </Press>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 48, alignItems: 'center' },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 8 },
  title: { fontFamily: F.s, fontSize: 16, lineHeight: 20, color: C.ink },
  body: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: C.muted },
  btn: { marginTop: 4, height: 44, borderRadius: 22, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.s, fontSize: 16, color: '#fff' },
});
