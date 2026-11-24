import { use, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/theme';
import { AspectContext } from '../context';
import { Icon, IconButton } from './controls';
import { addDays, today, weekday } from './time';
import { haptic, R, SURF, t, tint } from './tokens';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const monthOf = (day: string) => day.slice(0, 7); // "2026-11"
function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Pick any day in two taps: a month grid (weeks start Monday) with arrows to the months around it. The picked day
 * takes the aspect colour; today has a ring. `min` / `max` (YYYY-MM-DD) grey out days outside them. Put it in a
 * Sheet, or inline under "Another day" after a row of quick chips (Today, Yesterday, ...).
 */
export function DayPicker({ value, onChange, min, max, color }: {
  value: string; onChange: (day: string) => void; min?: string; max?: string; color?: string;
}) {
  const tone = color ?? use(AspectContext)?.color ?? C.text;
  const [month, setMonth] = useState(() => monthOf(value));
  const now = today();
  const first = `${month}-01`;
  const lead = (weekday(first) + 6) % 7; // blanks before the 1st
  const count = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8));
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7) cells.push(null);
  const [y, m] = month.split('-').map(Number);
  const canBack = !min || monthOf(min) < month;
  const canFwd = !max || monthOf(max) > month;

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <IconButton label="Previous month" plain onPress={() => setMonth(shiftMonth(month, -1))} disabled={!canBack}><Icon name="left" /></IconButton>
        <Text style={[t.strong, s.title]} accessibilityRole="header">{MONTHS[m - 1]} {y}</Text>
        <IconButton label="Next month" plain onPress={() => setMonth(shiftMonth(month, 1))} disabled={!canFwd}><Icon name="right" /></IconButton>
      </View>
      <View style={s.grid}>
        {HEAD.map((h, i) => <Text key={`h${i}`} style={[t.caption, s.cell, s.headCell]}>{h}</Text>)}
        {cells.map((day, i) => {
          if (!day) return <View key={`b${i}`} style={s.cell} />;
          const off = (min && day < min) || (max && day > max);
          const on = day === value;
          const isToday = day === now;
          return (
            <Pressable key={day} disabled={!!off} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !!off }}
              accessibilityLabel={day} onPress={() => { haptic.tick(); onChange(day); }} style={s.cell}>
              {({ pressed }) => (
                <View style={[s.dot, isToday && { borderColor: tint(tone, 0.6) }, on && { backgroundColor: tint(tone, 0.24), borderColor: tone },
                  pressed && !on && { backgroundColor: SURF.pressed }]}>
                  <Text style={[s.num, t.num, off ? s.off : null, on && { color: C.text, fontFamily: F.semibold }]}>{Number(day.slice(8))}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  headCell: { height: 24, textAlign: 'center', lineHeight: 24 },
  dot: { width: 40, height: 40, borderRadius: R.chip + 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  num: { fontFamily: F.medium, fontSize: 16, lineHeight: 20, color: C.textSoft },
  off: { color: C.faint, opacity: 0.5 },
});
