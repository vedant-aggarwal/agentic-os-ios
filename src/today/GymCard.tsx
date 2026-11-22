import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { liftTarget, type BodyToday } from '@/lib/body';
import { ASPECT_COLOR, C, F } from '@/theme';
import { Lifter, moveOf } from './Lifter';

const BODY = ASPECT_COLOR.body;
const EVERY = 8400; // three reps of one exercise, then the next

/** Today's workout: the figure acts out each exercise of the plan in turn (tap it for the next). The words open Body. */
export function GymCard({ body, onOpen }: { body: BodyToday; onOpen: () => void }) {
  const items = body.live || !body.trained.length ? body.next?.items ?? [] : [];
  const [i, setI] = useState(0);
  const n = items.length;
  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), EVERY);
    return () => clearInterval(id);
  }, [n]);
  const at = n ? i % n : 0;
  const lift = items[at];

  const done = body.trained[0];
  const label = body.live ? 'Gym, in progress' : done ? 'Gym, done today' : body.next?.at ? `Gym at ${body.next.at}` : 'Gym';
  const title = body.live?.name ?? done?.name ?? body.next?.name ?? 'No workout planned';
  const sub = body.live ? `${body.live.sets} sets logged` : done ? `${done.sets} sets` : n ? `${n} exercises` : 'Plan one on the Body page';
  const action = body.live ? 'Resume' : done ? 'Open' : n ? 'Start' : 'Plan';

  return (
    <View style={s.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}. ${title}. ${sub}. ${action}`} onPress={onOpen}
        style={({ pressed }) => [s.text, pressed && { opacity: 0.7 }]}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <Text style={s.sub}>{sub}</Text>
        {body.week.target ? <Text style={s.week}>{`${body.week.days} of ${body.week.target} days this week`}</Text> : null}
        {lift ? (
          <Animated.View key={at} entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)} style={s.now}>
            <Text style={s.lift} numberOfLines={2}>{lift.name}</Text>
            <Text style={s.target}>{liftTarget(lift)}</Text>
          </Animated.View>
        ) : <View style={s.now} />}
        {n > 1 ? (
          <View style={s.dots}>
            {items.map((x, k) => <View key={`${x.ex}${k}`} style={[s.dot, k === at && s.dotOn]} />)}
          </View>
        ) : null}
        <View style={s.foot}>
          <View style={s.btn}><Text style={s.btnText}>{action}</Text></View>
        </View>
      </Pressable>
      {/* tap the figure for the next exercise */}
      <Pressable accessibilityRole="button" accessibilityLabel="Next exercise" disabled={n < 2} style={s.fig}
        onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setI((x) => (x + 1) % Math.max(1, n)); }}>
        <Animated.View key={lift?.ex ?? 'rest'} entering={FadeIn.duration(300)} exiting={FadeOut.duration(180)} style={StyleSheet.absoluteFill}>
          <Lifter move={lift ? moveOf(lift.ex, lift.name) : 'curl'} size={156} color={BODY} playing={!!lift && !done} />
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
  dots: { flexDirection: 'row', gap: 4, marginTop: 10 },
  dot: { width: 14, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.16)' },
  dotOn: { backgroundColor: BODY },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  btn: { height: 36, paddingHorizontal: 18, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' },
  btnText: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  week: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, fontVariant: ['tabular-nums'] },
  fig: { width: 156, height: 156, alignSelf: 'center', marginLeft: -8 },
});
