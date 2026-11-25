import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { DayPicker, Sheet } from '@/aspects/kit';
import { Icon, IconButton, Press } from '@/aspects/kit/controls';
import { addDays, daysBetween } from '@/aspects/kit/time';
import { SURF, t } from '@/aspects/kit/tokens';
import { C, F } from '@/theme';
import { dayWord, longDay } from './when';

// Which day Today is on. The head sits at the top of the sheet: the day's name, its date, Today to come back, and the
// calendar for any other day. While Today is on another day and the head has scrolled away, a small pill under the
// top bar says which day it is and brings Today back in one tap.

/** The head's height: Today places the page by it. */
export const HEAD_H = 52;

/** "Wednesday 25 Nov" under a relative name; "3 days ago" or "In 4 days" under a date. */
function subLine(day: string, live: string) {
  const n = daysBetween(live, day);
  if (Math.abs(n) <= 1) return longDay(day);
  return n < 0 ? `${-n} days ago` : `In ${n} days`;
}

export function DayHead({ day, live, onDay, onToday, onPick, onWeek }: {
  day: string; live: string;
  /** VoiceOver's swipe up or down on the name: the day after or before */ onDay: (day: string) => void;
  onToday: () => void; onPick: () => void;
  /** VoiceOver's action for the pinch: the week */ onWeek: () => void;
}) {
  const word = dayWord(day, live);
  return (
    <View style={st.head}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={`${word}, ${longDay(day)}`}
        accessibilityHint="Swipe up or down to change the day"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'week', label: 'Show the week' }]}
        onAccessibilityAction={(e) => {
          const a = e.nativeEvent.actionName;
          if (a === 'increment') onDay(addDays(day, 1));
          else if (a === 'decrement') onDay(addDays(day, -1));
          else if (a === 'week') onWeek();
        }}
        style={st.name}>
        <Text style={t.title3} numberOfLines={1}>{word}</Text>
        <Text style={[t.small, t.num]} numberOfLines={1}>{subLine(day, live)}</Text>
      </View>
      {day !== live ? (
        <Press label="Back to today" onPress={onToday} feel="tick" scale={0.95} style={st.today}>
          <Text style={st.todayText}>Today</Text>
        </Press>
      ) : null}
      <IconButton label="Go to a day" onPress={onPick}><Icon name="calendar" size={20} color={C.textSoft} /></IconButton>
    </View>
  );
}

/** The day picker (the life pages' own), in a sheet: two weeks back and a week ahead as chips, any day in the month grid. */
export function PickDay({ open, day, onClose, onPick }: { open: boolean; day: string; onClose: () => void; onPick: (day: string) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Go to a day">
      <DayPicker value={day} onChange={onPick} past={14} days={8} color={C.text} />
    </Sheet>
  );
}

/** Under the top bar while Today is on another day and its head is out of view: that day, and Today. */
export function DayPill({ top, day, live, onToday, onPick }: { top: number; day: string; live: string; onToday: () => void; onPick: () => void }) {
  const word = dayWord(day, live);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} pointerEvents="box-none" style={[st.pillWrap, { top }]}>
      <View style={st.pill}>
        <Pressable accessibilityRole="button" accessibilityLabel={`On ${word}, ${longDay(day)}. Go to a day`} onPress={onPick} hitSlop={6}
          style={({ pressed }) => [st.pillDay, pressed && { opacity: 0.6 }]}>
          <Icon name="calendar" size={15} color={C.textSoft} />
          <Text style={st.pillText} numberOfLines={1}>{word}</Text>
        </Pressable>
        <View style={st.pillRule} />
        <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={onToday} hitSlop={6}
          style={({ pressed }) => [st.pillToday, pressed && { opacity: 0.6 }]}>
          <Text style={st.pillTodayText}>Today</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4, height: HEAD_H },
  name: { flex: 1, minWidth: 0 },
  today: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: SURF.raised, justifyContent: 'center' },
  todayText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
  pillWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 18, backgroundColor: 'rgba(30,31,35,0.94)',
    boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
  },
  pillDay: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingLeft: 12, paddingRight: 10, maxWidth: 220 },
  pillText: { flexShrink: 1, fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  pillRule: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' },
  pillToday: { height: 36, paddingLeft: 10, paddingRight: 14, justifyContent: 'center' },
  pillTodayText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, color: C.text },
});
