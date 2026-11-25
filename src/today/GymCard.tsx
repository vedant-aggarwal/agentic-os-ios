import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { dayAhead, liftTarget, streakWords, trainedWords, type BodyToday, type Lift } from '@/lib/body';
import { ASPECT_COLOR, C, F } from '@/theme';
import { Lifter, moveOf } from './Lifter';

const BODY = ASPECT_COLOR.body;
const EVERY = 8400; // three reps of one exercise, then the next

/** About how long a session takes: two and a half minutes a set (the Body page's own estimate). */
const minutesFor = (items: Lift[]) => Math.max(10, Math.round((items.reduce((n, it) => n + (it.sets ?? 3), 0) * 2.6) / 5) * 5);

/**
 * Today's training, as Body shows it (the same read, so the state, sets, week and next session agree): a session in
 * progress, today's plan with the figure acting out each exercise in turn (tap it for the next), what he did today,
 * or a rest day with the next session. The words open Body's Train.
 */
export function GymCard({ body, onOpen }: { body: BodyToday; onOpen: () => void }) {
  const { state, live, next, upcoming, trained, week } = body;
  // the moves the figure acts out: the session in progress, or today's waiting plan
  const items = state === 'live' ? live?.items ?? (next && live && next.id === live.id ? next.items : [])
    : state === 'planned' ? next?.items ?? [] : [];
  const [i, setI] = useState(0);
  const n = items.length;
  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), EVERY);
    return () => clearInterval(id);
  }, [n]);
  const at = n ? i % n : 0;
  const lift = items[at];

  const first = trained[0];
  const after = upcoming ? `Next: ${upcoming.name}, ${dayAhead(upcoming.date, body.today)}` : null;
  const card = state === 'live' && live ? {
    label: 'Gym, in progress', title: live.name, sub: `${live.sets} ${live.sets === 1 ? 'set' : 'sets'} done so far`, action: 'Resume',
  } : state === 'planned' && next ? {
    label: next.at ? `Gym at ${next.at}` : 'Gym today', title: next.name,
    sub: `${next.items.length} ${next.items.length === 1 ? 'exercise' : 'exercises'}, about ${minutesFor(next.items)} min`, action: 'Start',
  } : state === 'done' && first ? {
    label: 'Gym, done today', title: trained.length > 1 ? `${first.name} and ${trained.length - 1} more` : first.name,
    sub: trained.length > 1 ? trained.map((x) => `${x.name} ${trainedWords(x)}`).join(', ') : trainedWords(first), action: 'Open',
  } : {
    label: 'Gym', title: 'Rest day', sub: after ? null : 'Plan a session on the Body page', action: after ? 'Open' : 'Plan',
  };
  const streak = streakWords(week.streak);
  const weekLine = week.target ? `${week.days} of ${week.target} days this week${streak ? `, ${streak}` : ''}` : null;
  const words = [card.label, card.title, card.sub, state === 'done' || state === 'rest' ? after : null, weekLine].filter(Boolean).join('. ');

  return (
    <View style={s.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${words}. ${card.action}`} onPress={onOpen}
        style={({ pressed }) => [s.text, pressed && { opacity: 0.7 }]}>
        <Text style={s.label}>{card.label}</Text>
        <Text style={s.title} numberOfLines={1}>{card.title}</Text>
        {card.sub ? <Text style={s.sub} numberOfLines={2}>{card.sub}</Text> : null}
        {weekLine ? <Text style={s.week}>{weekLine}</Text> : null}
        {lift ? (
          <Animated.View key={at} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={s.now}>
            <Text style={s.lift} numberOfLines={2}>{lift.name}</Text>
            <Text style={s.target}>{liftTarget(lift)}</Text>
          </Animated.View>
        ) : (state === 'done' || state === 'rest') && after ? (
          <View style={s.now}><Text style={s.next} numberOfLines={2}>{after}</Text></View>
        ) : <View style={s.now} />}
        {n > 1 ? (
          <View style={s.dots}>
            {items.map((x, k) => <View key={`${x.ex}${k}`} style={[s.dot, k === at && s.dotOn]} />)}
          </View>
        ) : null}
        <View style={s.foot}>
          <View style={s.btn}><Text style={s.btnText}>{card.action}</Text></View>
        </View>
      </Pressable>
      {/* tap the figure for the next exercise */}
      <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" disabled={n < 2} style={s.fig}
        onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setI((x) => (x + 1) % Math.max(1, n)); }}>
        <Animated.View key={lift?.ex ?? 'rest'} entering={FadeIn.duration(300)} exiting={FadeOut.duration(180)} style={StyleSheet.absoluteFill}>
          <Lifter move={lift ? moveOf(lift.ex, lift.name) : 'curl'} size={156} color={BODY} playing={!!lift} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 24, backgroundColor: C.glass, padding: 16, paddingRight: 4, minHeight: 212, overflow: 'hidden' },
  text: { flex: 1, minWidth: 0 },
  label: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: BODY },
  title: { fontFamily: F.semibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.text, marginTop: 2 },
  sub: { fontFamily: F.regular, fontSize: 15, lineHeight: 20, color: C.muted },
  now: { marginTop: 14, minHeight: 42 },
  lift: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  target: { fontFamily: F.regular, fontSize: 14, lineHeight: 19, color: C.muted, fontVariant: ['tabular-nums'] },
  next: { fontFamily: F.medium, fontSize: 15, lineHeight: 20, color: C.text },
  dots: { flexDirection: 'row', gap: 4, marginTop: 10 },
  dot: { width: 14, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.16)' },
  dotOn: { backgroundColor: BODY },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  btn: { height: 36, paddingHorizontal: 18, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  week: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, fontVariant: ['tabular-nums'] },
  fig: { width: 156, height: 156, alignSelf: 'center', marginLeft: -8 },
});
