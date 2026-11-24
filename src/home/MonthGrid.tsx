import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '@/aspects/kit/tokens';
import { C, F } from '@/theme';
import { NORA, NORA_TEXT } from '@/today2/parts';
import { shortDay } from './parseDue';

// The create sheet's inline month: arrows for the month, today ringed, past days dimmed but still pickable,
// the picked day filled. Weeks start on Sunday, as the phone's Indian calendar does.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');

export function MonthGrid({ value, today, onPick, ink }: { value: string | null; today: string; onPick: (day: string) => void; ink: string }) {
  const start = value ?? today;
  const [ym, setYm] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) }));
  const lead = new Date(Date.UTC(ym.y, ym.m - 1, 1, 12)).getUTCDay();
  const count = new Date(Date.UTC(ym.y, ym.m, 0, 12)).getUTCDate();
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${ym.y}-${pad(ym.m)}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const step = (n: number) => {
    haptic.tick();
    setYm(({ y, m }) => { const k = y * 12 + (m - 1) + n; return { y: Math.floor(k / 12), m: (k % 12) + 1 }; });
  };
  const away = `${ym.y}-${pad(ym.m)}` !== today.slice(0, 7);

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Text accessibilityRole="header" style={st.month}>{`${MONTHS[ym.m - 1]} ${ym.y}`}</Text>
        {away ? (
          <Pressable accessibilityRole="button" onPress={() => { haptic.tick(); setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }); }} hitSlop={8} style={st.jump}>
            <Text style={st.jumpText}>This month</Text>
          </Pressable>
        ) : null}
        <Arrow dir={-1} onPress={() => step(-1)} />
        <Arrow dir={1} onPress={() => step(1)} />
      </View>
      <View style={st.row}>{WEEK.map((w, i) => <Text key={i} style={st.wd}>{w}</Text>)}</View>
      {weeks.map((w, i) => (
        <View key={i} style={st.row}>
          {w.map((day, j) => {
            if (!day) return <View key={j} style={st.cell} />;
            const on = day === value, isToday = day === today, past = day < today;
            return (
              <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${shortDay(day)}${isToday ? ', today' : ''}`} accessibilityState={{ selected: on }}
                onPress={() => { haptic.tick(); onPick(day); }} style={st.cell}>
                <View style={[st.dot, isToday && !on && { borderColor: NORA, borderWidth: 1.5 }, on && { backgroundColor: C.text }, past && !on && { opacity: 0.38 }]}>
                  <Text style={[st.num, isToday && !on && { color: NORA_TEXT, fontFamily: F.semibold }, on && { color: ink, fontFamily: F.semibold }]}>{Number(day.slice(8))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Arrow({ dir, onPress }: { dir: 1 | -1; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={dir < 0 ? 'Previous month' : 'Next month'} onPress={onPress} hitSlop={4} style={st.arrow}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d={dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} stroke={C.text} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  month: { flex: 1, fontFamily: F.semibold, fontSize: 15, lineHeight: 20, color: C.text },
  jump: { height: 32, justifyContent: 'center', paddingHorizontal: 6 },
  jumpText: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.muted },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontFamily: F.medium, fontSize: 11, lineHeight: 16, color: C.faint },
  cell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: F.regular, fontSize: 14, lineHeight: 18, color: C.textSoft, fontVariant: ['tabular-nums'] },
});
