import { StyleSheet, Text, View } from 'react-native';
import { MIN_BUILD } from '@/lib/native';
import { C, F } from '@/theme';

/** Shown instead of the app when the installed dev client is older than the JS it loaded. */
export function OutOfDate({ missing }: { missing: string[] }) {
  return (
    <View style={s.screen}>
      <Text style={s.title}>Update the app in TestFlight</Text>
      <Text style={s.body}>
        This copy of Agentic OS is older than the code it loaded. Open TestFlight, update Agentic OS to build {MIN_BUILD} or
        later, then open it again.
      </Text>
      <View style={s.list}>
        <Text style={s.label}>Missing in this build</Text>
        {missing.map((m) => <Text key={m} style={s.item}>{m}</Text>)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text },
  body: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  list: { gap: 4, marginTop: 8 },
  label: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.faint },
  item: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.textSoft },
});
