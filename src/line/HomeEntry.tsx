import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Glyph, SURF, t, tint } from '@/aspects/kit';
import { callerOf, downText, PHASE, useLineCounts } from '@/lib/line';
import { C, F } from '@/theme';
import { Chevron } from '@/today2/parts';
import { Dots, NORA, NORA_TEXT, ONCALL, openCalls } from './parts';

// Home's row for Nora's phone line, under her name: the call on now, how many calls wait on him, or that the line is
// down. Opens the call log. Hidden while the PC has no line at all (its routes answer 404).

const PHONE_D = 'M6.5 3.5h3l1.5 4.5-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 5 5a1.5 1.5 0 0 1 1.5-1.5z';

export function LineEntry() {
  const c = useLineCounts();
  if (c.missing) return null;
  const live = c.status?.live ?? null;
  const down = !!c.status && !c.status.up;
  const needs = c.needsYou ?? 0;
  const sub = live ? `${callerOf(live)} · ${live.phase === 'you' ? 'You are on the call' : PHASE[live.phase]}`
    : down ? downText(c.status?.why ?? null)
      : needs ? `${needs === 1 ? '1 call needs' : `${needs} calls need`} you` : 'Nora answers the calls you miss';
  const tone = live ? (live.phase === 'you' ? ONCALL : NORA) : down ? C.danger : needs ? NORA : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Calls. ${sub}`} accessibilityHint="Opens Nora's call log"
      onPress={openCalls} style={({ pressed }) => [s.row, pressed && { backgroundColor: SURF.pressed }]}>
      <View style={[s.mark, tone ? { backgroundColor: tint(tone, 0.16) } : null]}>
        <Glyph sf="phone.fill" d={PHONE_D} size={18} color={tone ?? C.textSoft} filled />
      </View>
      <View style={s.flex}>
        <Text style={s.title}>Calls</Text>
        <View style={s.subRow}>
          {live && live.phase !== 'you' ? <Dots color={NORA} /> : null}
          <Text numberOfLines={1} style={[t.small, s.flexShrink, tone === NORA && { color: NORA_TEXT }, down && !live && { color: C.danger }]}>{sub}</Text>
        </View>
      </View>
      {needs && !live ? <View style={s.badge}><Text style={[s.badgeText, t.num]}>{needs > 99 ? '99+' : needs}</Text></View> : null}
      <Chevron />
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  flexShrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderCurve: 'continuous', backgroundColor: SURF.card },
  mark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: NORA },
  badgeText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 16, color: '#fff' },
});
