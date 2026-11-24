import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C, F } from '@/theme';
import { PlusIcon } from '../../ui/icons';
import { Press } from '../../ui/Press';
import type { SectionHeaderProps } from '../types';
import { CHIP_BG, CHIP_LINE } from './kit';

// A section's label as an orbit chip (a small ring with its planet, the title, the count), then a thin line out to
// a node, and the add button docked at its end. `extra` (Active | Ideas) sits after the chip and replaces the count.

export function OrbitMark({ color = 'rgba(200,214,255,0.55)' }: { color?: string }) {
  return (
    <Svg width={11} height={11}>
      <Circle cx={5.5} cy={5.5} r={4.4} stroke={color} strokeOpacity={0.6} strokeWidth={1} fill="none" />
      <Circle cx={8.6} cy={2.4} r={1.6} fill={color} />
    </Svg>
  );
}

export function OrbitSectionHeader({ title, count, add, extra }: SectionHeaderProps) {
  return (
    <View style={s.head} accessibilityRole="header">
      <View style={s.chip}>
        <OrbitMark />
        <Text numberOfLines={1} style={s.title}>{title}</Text>
        {count && !extra ? <Text style={s.count}>{count}</Text> : null}
      </View>
      {extra}
      <View style={s.rule}>
        <View style={s.line} />
        <View style={s.node} />
      </View>
      {add ? (
        <Press accessibilityLabel={add.label} onPress={add.onPress} haptic hitSlop={8}>
          {(pressed) => (
            <View style={[s.add, pressed && s.addPressed]}><PlusIcon size={15} color={C.textSoft} /></View>
          )}
        </Press>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34, paddingBottom: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, height: 26, paddingLeft: 9, paddingRight: 11, borderRadius: 13, flexShrink: 1,
    backgroundColor: CHIP_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: CHIP_LINE,
  },
  title: { flexShrink: 1, fontFamily: F.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.3, color: C.muted, textTransform: 'uppercase' },
  count: { fontFamily: F.semibold, fontSize: 11.5, lineHeight: 14, color: C.textSoft, fontVariant: ['tabular-nums'] },
  rule: { flex: 1, minWidth: 16, flexDirection: 'row', alignItems: 'center' },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: CHIP_LINE },
  node: { width: 4, height: 4, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(200,214,255,0.32)' },
  add: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CHIP_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: CHIP_LINE,
  },
  addPressed: { backgroundColor: 'rgba(200,214,255,0.14)' },
});
