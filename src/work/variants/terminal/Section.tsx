import { StyleSheet, Text, View } from 'react-native';
import { Press } from '../../ui/Press';
import type { SectionHeaderProps } from '../types';
import { MONO, P } from './palette';

// `── NEEDS YOU ──────────── [2]`: a rule with the section's name cut into it, the count in brackets, and the add
// button as a bracketed [+]. `extra` (the Active | Ideas switch) sits after the name and replaces the count.

export function SectionHeader({ title, count, add, extra }: SectionHeaderProps) {
  return (
    <View style={s.head}>
      <View style={s.lead} />
      <Text accessibilityRole="header" numberOfLines={1} style={s.title}>{title}</Text>
      {extra}
      <View style={s.rule} />
      {count && !extra ? (
        <Text style={s.count} accessibilityLabel={`${count}`}>[<Text style={s.countN}>{count}</Text>]</Text>
      ) : null}
      {add ? (
        <Press accessibilityLabel={add.label} onPress={add.onPress} haptic hitSlop={8}>
          {(pressed) => (
            <View style={[s.add, pressed && s.addPressed]}>
              <Text style={s.addText}>[+]</Text>
            </View>
          )}
        </Press>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingBottom: 6 },
  lead: { width: 14, height: 1, backgroundColor: P.ruleStrong },
  title: {
    flexShrink: 1, fontFamily: MONO, fontWeight: '700', fontSize: 12, lineHeight: 16, letterSpacing: 1.8,
    textTransform: 'uppercase', color: P.text,
  },
  rule: { flex: 1, minWidth: 12, height: 1, backgroundColor: P.rule },
  count: { fontFamily: MONO, fontSize: 12, lineHeight: 16, color: P.faint, fontVariant: ['tabular-nums'] },
  countN: { color: P.soft, fontWeight: '700' },
  add: { minWidth: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 3 },
  addPressed: { backgroundColor: 'rgba(61,220,151,0.16)' },
  addText: { fontFamily: MONO, fontWeight: '700', fontSize: 14, lineHeight: 18, color: P.green },
});
