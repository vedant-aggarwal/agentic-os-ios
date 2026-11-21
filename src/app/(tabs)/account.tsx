import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppMark, Chevron } from '@/components/Icons';
import { Press } from '@/components/Press';
import { useDirections } from '@/lib/api';
import { ALL } from '@/lib/lineup';
import { C, F } from '@/theme';

/** Account and settings. A placeholder profile until the account system exists. */
export default function Account() {
  const insets = useSafeAreaInsets();
  const dirs = useDirections();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 150 }}>
      <Text style={styles.title}>Account</Text>

      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>V</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>Vedant</Text>
          <Text style={styles.sub}>{ALL.length} channels</Text>
        </View>
      </View>
      <Text style={styles.soon}>Accounts and sign-in come later. Everything here runs from your PC.</Text>

      <Text style={styles.h2}>Settings</Text>
      <View style={styles.group}>
        <Row
          title="Directions"
          sub={dirs ? `${dirs.directions.length} ways of making content` : 'Ways of making content'}
          onPress={() => router.push('/directions')}
        />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(20,20,20,0.08)', marginLeft: 16 }} />
        <Row title="Learnings" sub="What Kai remembers, per channel and for all" onPress={() => router.push('/learnings')} />
      </View>

      <View style={styles.about}>
        <AppMark size={28} />
        <Text style={styles.aboutText}>Content OS</Text>
      </View>
    </ScrollView>
  );
}

function Row({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Press style={styles.row} scale={0.98} onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Chevron size={18} color={C.faint} dir="right" />
    </Press>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.b, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.ink },
  profile: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, backgroundColor: C.card },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: F.b, fontSize: 24, color: '#fff' },
  name: { fontFamily: F.b, fontSize: 20, lineHeight: 26, color: C.ink },
  sub: { fontFamily: F.m, fontSize: 14, lineHeight: 20, color: C.muted },
  soon: { marginTop: 8, marginHorizontal: 4, fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.faint },
  h2: { marginTop: 24, marginBottom: 8, fontFamily: F.s, fontSize: 18, lineHeight: 24, color: C.ink },
  group: { borderRadius: 20, backgroundColor: C.card, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowTitle: { fontFamily: F.s, fontSize: 16, lineHeight: 22, color: C.ink },
  rowSub: { fontFamily: F.r, fontSize: 13, lineHeight: 18, color: C.muted },
  about: { marginTop: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aboutText: { fontFamily: F.s, fontSize: 14, color: C.muted },
});
