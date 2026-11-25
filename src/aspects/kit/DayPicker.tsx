import { use, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { C, F } from '@/theme';
import { Chip, Press } from './controls';
import { addDays, daysBetween, myDay, weekday } from './time';
import { R, SURF, tint } from './tokens';
import { AspectContext } from '../context';

// One way to pick a day everywhere: a strip of the next two weeks (one tap for almost every case), and "Other" for
// a month grid. `MonthDayPicker` is the same grid for "which day of the month" (a bill's charge day).

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const label = (day: string, from: string) => {
  const d = daysBetween(from, day);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return `${WD[weekday(day)]} ${Number(day.slice(8, 10))}`;
};

/**
 * `value` is a YYYY-MM-DD day. The strip starts `past` days before today (default 0) and runs `days` days.
 * Days outside the strip are one more tap away in the month grid.
 */
export function DayPicker({ value, onChange, days = 14, past = 0, color }: {
  value: string; onChange: (day: string) => void; days?: number; past?: number; color?: string;
}) {
  const from = myDay();
  const strip = Array.from({ length: days + past }, (_, i) => addDays(from, i - past));
  const [grid, setGrid] = useState(!strip.includes(value));
  // A day already chosen further out (next Tuesday) opens scrolled into view, centred, once. Taps after that are on
  // chips the person can already see, so the strip stays where they left it.
  const scroll = useRef<ScrollViewInstance>(null);
  const box = useRef({ view: 0, x: -1, w: 0, done: false });
  const reveal = () => {
    const b = box.current;
    if (b.done || !b.view || b.x < 0) return;
    b.done = true;
    if (b.x + b.w > b.view) scroll.current?.scrollTo({ x: Math.max(0, b.x + b.w / 2 - b.view / 2), animated: false });
  };
  return (
    <View style={{ gap: 12 }}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}
        onLayout={(e) => { box.current.view = e.nativeEvent.layout.width; reveal(); }}>
        {strip.map((d) => (
          <View key={d} onLayout={d === value ? (e) => { box.current.x = e.nativeEvent.layout.x; box.current.w = e.nativeEvent.layout.width; reveal(); } : undefined}>
            <Chip label={label(d, from)} selected={!grid && d === value} color={color} onPress={() => { setGrid(false); onChange(d); }} />
          </View>
        ))}
        <Chip label="Other…" selected={grid} color={color} onPress={() => setGrid((g) => !g)} />
      </ScrollView>
      {grid ? <MonthGrid value={value} onChange={onChange} color={color} /> : null}
    </View>
  );
}

function MonthGrid({ value, onChange, color }: { value: string; onChange: (day: string) => void; color?: string }) {
  const tone = color ?? use(AspectContext)?.color ?? C.text;
  const [month, setMonth] = useState((value || myDay()).slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekday(first) + 6) % 7; // weeks start on Monday
  const shift = (n: number) => setMonth(addDays(`${month}-15`, n * 30).slice(0, 7));
  const cells = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  return (
    <View style={s.grid}>
      <View style={s.head}>
        <Press label="Previous month" onPress={() => shift(-1)} hitSlop={8} style={s.nav}><Text style={s.navText}>‹</Text></Press>
        <Text style={s.month}>{MO[m - 1]} {y}</Text>
        <Press label="Next month" onPress={() => shift(1)} hitSlop={8} style={s.nav}><Text style={s.navText}>›</Text></Press>
      </View>
      <Cells cells={cells} isOn={(c) => c === value} text={(c) => String(Number(c.slice(8, 10)))} onPick={onChange} tone={tone} />
    </View>
  );
}

/** Day of the month, 1 to 31 (31 means the last day in shorter months). */
export function MonthDayPicker({ value, onChange, color }: { value: number | null; onChange: (d: number) => void; color?: string }) {
  const tone = color ?? use(AspectContext)?.color ?? C.text;
  const cells = Array.from({ length: 31 }, (_, i) => String(i + 1));
  return (
    <View style={s.grid}>
      <Cells cells={cells} isOn={(c) => Number(c) === value} text={(c) => c} onPick={(c) => onChange(Number(c))} tone={tone} />
    </View>
  );
}

function Cells({ cells, isOn, text, onPick, tone }: {
  cells: (string | null)[]; isOn: (c: string) => boolean; text: (c: string) => string; onPick: (c: string) => void; tone: string;
}) {
  return (
    <View style={s.cells}>
      {cells.map((c, i) => c === null ? <View key={`x${i}`} style={s.cell} /> : (
        <Press key={c} label={text(c)} onPress={() => onPick(c)} feel="tick" role="radio" state={{ selected: isOn(c) }}
          wrap={s.cell} style={[s.fill, s.on0, isOn(c) && { backgroundColor: tint(tone, 0.2), borderColor: tint(tone, 0.6) }]}>
          <Text style={[s.cellText, isOn(c) && { color: tone }]}>{text(c)}</Text>
        </Press>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { gap: 8, paddingRight: 8 },
  grid: { gap: 8, padding: 12, borderRadius: R.row, backgroundColor: SURF.row },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navText: { fontFamily: F.medium, fontSize: 24, lineHeight: 28, color: C.textSoft },
  month: { fontFamily: F.semibold, fontSize: 16, lineHeight: 24, color: C.text },
  cells: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, alignSelf: 'stretch', margin: 2, alignItems: 'center', justifyContent: 'center' },
  on0: { borderRadius: R.chip, borderWidth: 1, borderColor: 'transparent' },
  cellText: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.textSoft, fontVariant: ['tabular-nums'] },
});
