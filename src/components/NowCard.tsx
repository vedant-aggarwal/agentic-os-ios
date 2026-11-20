import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Moment } from '@/lib/today';
import { C, F } from '@/theme';

/** What's happening now (or next), from the calendar and scheduled tasks. */
export function NowCard({ moment, onDone }: { moment: Moment | null; onDone: (taskId: string) => void }) {
  if (!moment) {
    return (
      <View style={s.wrap}>
        <Text style={[s.when, { color: C.faint }]}>Nothing else on the calendar today</Text>
      </View>
    );
  }
  const tint = moment.color ?? C.muted;
  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <View style={s.whenRow}>
          {moment.state === 'now' ? <View style={[s.dot, { backgroundColor: tint }]} /> : null}
          <Text style={[s.when, { color: moment.state === 'now' ? tint : C.muted }]}>{moment.when}</Text>
        </View>
        {moment.then ? <Text numberOfLines={1} style={s.then}>{moment.then}</Text> : null}
      </View>
      <Text style={s.title}>{moment.title}</Text>
      {moment.sub ? <Text style={s.sub}>{moment.sub}</Text> : null}
      {moment.taskId ? (
        <Pressable accessibilityRole="button" onPress={() => onDone(moment.taskId!)}
          style={({ pressed }) => [s.primary, pressed && { transform: [{ scale: 0.98 }] }]}>
          <Text style={s.primaryText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  when: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  then: { flexShrink: 1, fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint, fontVariant: ['tabular-nums'] },
  title: { fontFamily: F.semibold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 16, lineHeight: 24, color: C.muted },
  primary: { height: 48, borderRadius: 24, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { fontFamily: F.semibold, fontSize: 16, color: C.scene },
});
