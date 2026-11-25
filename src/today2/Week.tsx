import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, IconButton, Press } from '@/aspects/kit/controls';
import { addDays, daysBetween, shortDay, weekday } from '@/aspects/kit/time';
import { SURF, t, tint } from '@/aspects/kit/tokens';
import type { Task } from '@/lib/today';
import { C, F } from '@/theme';
import { Ring } from './Ring';
import { useWeekTally } from './tally';
import { dayWord, weekOf } from './when';

// Today pinched in: the week the day sits in, a row a day with its ring (ticks and tasks done against planned, the
// same count as that day's own page). A tap opens the day; pinching out goes back to the day it came from.

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekName(first: string, live: string) {
  const n = Math.round(daysBetween(weekOf(live)[0], first) / 7);
  if (n === 0) return 'This week';
  if (n === -1) return 'Last week';
  if (n === 1) return 'Next week';
  return `Week of ${shortDay(first)}`;
}

export function WeekView({ day, live, liveCount, tasks, waterTarget, todayHasBody, onOpen, onShift }: {
  /** the day on screen: its week is shown, its row marked */ day: string; live: string;
  /** today's count as the hero shows it, for today's row */ liveCount?: { done: number; total: number } | null;
  tasks: Task[]; waterTarget: number; todayHasBody: boolean;
  onOpen: (day: string) => void;
  /** the week before (-1) or after (1) */ onShift: (n: -1 | 1) => void;
}) {
  const days = useMemo(() => weekOf(day), [day]);
  const counted = useWeekTally(days, { tasks, waterTarget, todayHasBody });
  const tally = liveCount ? counted.map((d) => (d.day === live ? { ...d, ...liveCount } : d)) : counted;
  const first = days[0];
  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={t.title3}>{weekName(first, live)}</Text>
          <Text style={[t.small, t.num]}>{`${shortDay(first)} to ${shortDay(addDays(first, 6))}`}</Text>
        </View>
        <IconButton label="Week before" onPress={() => onShift(-1)}><Icon name="left" size={20} color={C.textSoft} /></IconButton>
        <IconButton label="Week after" onPress={() => onShift(1)}><Icon name="right" size={20} color={C.textSoft} /></IconButton>
      </View>
      <View style={st.rows}>
        {tally.map((d) => {
          const ahead = d.day > live, isToday = d.day === live, on = d.day === day;
          const word = dayWord(d.day, live);
          const relative = word === 'Today' || word === 'Yesterday' || word === 'Tomorrow';
          const count = !d.total ? 'Nothing planned' : ahead ? `${d.total} planned` : `${d.done} of ${d.total}`;
          return (
            <Press key={d.day} label={`${WD[weekday(d.day)]} ${shortDay(d.day)}${relative ? `, ${word}` : ''}. ${ahead ? count : `${d.done} of ${d.total} done`}`}
              onPress={() => onOpen(d.day)} feel="tick" scale={0.98}
              style={[st.row, on && st.rowOn, isToday && st.rowToday]}>
              <View style={ahead ? st.later : undefined}><Ring parts={[{ color: C.text, done: ahead ? 0 : d.done, total: d.total }]} /></View>
              <View style={st.text}>
                <Text style={[st.day, ahead && { color: C.muted }]} numberOfLines={1}>{WD[weekday(d.day)]}</Text>
                <Text style={[t.small, t.num]} numberOfLines={1}>{relative ? `${shortDay(d.day)} · ${word}` : shortDay(d.day)}</Text>
              </View>
              <Text style={[st.count, t.num, ahead && { color: C.faint }]}>{count}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4, minHeight: 52 },
  rows: { gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, backgroundColor: C.glass, borderWidth: 1, borderColor: 'transparent',
  },
  rowOn: { backgroundColor: SURF.raised },
  rowToday: { borderColor: tint(C.text, 0.28) },
  later: { opacity: 0.5 },
  text: { flex: 1, minWidth: 0 },
  day: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  count: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
});
