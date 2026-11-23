import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press, R as RAD, t, tint } from '@/aspects/kit';
import { clock } from '@/lib/nora';
import { C } from '@/theme';
import { NORA, useElapsed } from '../parts';
import { noraUi, useNora } from '../state';
import { currentCall, useLiveText, type LiveLine } from './liveText';

// The words of a call as they are spoken (call/liveText.ts): the call screen's transcript, and a compact card over
// Today while a call runs with the call screen closed (as when he rang her SIM line and then opened the app).
// A line still being spoken is dimmer; it settles to full strength once that turn is over.

function Line({ l, compact }: { l: LiveLine; compact?: boolean }) {
  const her = l.who === 'nora';
  return (
    <View style={compact ? s.lineC : s.line}>
      <Text style={[t.caption, s.who, her && { color: NORA }]}>{her ? 'Nora' : 'You'}</Text>
      <Text style={[compact ? t.small : t.body, { color: her ? C.text : C.textSoft }, !l.final && s.partial]}
        numberOfLines={compact ? 2 : undefined}>{l.text}</Text>
    </View>
  );
}

/** The call screen's transcript: every line, kept scrolled to the newest. Null until the first words arrive. */
export function CallTranscript({ callId }: { callId?: string | null }) {
  const st = useLiveText();
  const c = currentCall(st, callId);
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [pinned, setPinned] = useState(true); // follows the newest line unless he scrolled up to read
  const lines = c?.lines ?? [];
  if (!lines.length) return null;
  return (
    <ScrollView ref={ref} style={s.scroll} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}
      onContentSizeChange={() => { if (pinned) ref.current?.scrollToEnd({ animated: true }); }}
      onScroll={(e) => { const n = e.nativeEvent; setPinned(n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 40); }}
      scrollEventThrottle={100} accessibilityLabel="Call transcript">
      {lines.map((l) => <Line key={l.id} l={l} />)}
    </ScrollView>
  );
}

/** Whether a call's words are streaming (the call screen shrinks her sphere to make room). */
export function useHasTranscript(callId?: string | null) {
  return (currentCall(useLiveText(), callId)?.lines.length ?? 0) > 0;
}

/** Over Today while a call runs and the call screen is closed: the last two lines, live. Tap to open the call. */
export function LiveCallCard() {
  const ui = useNora();
  const st = useLiveText();
  const insets = useSafeAreaInsets();
  const c = currentCall(st);
  const live = !!c && !c.ended;
  const [gone, setGone] = useState<string | null>(null); // "Call ended" stays a moment, then the card goes
  const endedId = c?.ended ? c.id : null;
  useEffect(() => {
    if (!endedId) return;
    const id = setTimeout(() => setGone(endedId), 3000);
    return () => clearTimeout(id);
  }, [endedId]);
  const lingering = !!endedId && gone !== endedId;
  const since = c ? Date.parse(c.started) : null;
  const secs = useElapsed(live ? since : null);
  if (!c || ui.call || (!live && !lingering)) return null;
  const last = c.lines.slice(-2);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[s.cardWrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Press label={live ? 'On a call with Nora. Open the call' : 'Call with Nora ended'} onPress={() => { if (live) noraUi.call({ follow: true }); }}
        disabled={!live} style={s.card}>
        <View style={s.head}>
          <View style={[s.dot, !live && { backgroundColor: C.faint }]} />
          <Text style={[t.strong, s.flex]}>{live ? 'On a call with Nora' : 'Call ended'}</Text>
          {live ? <Text style={[t.label, t.num]}>{clock(secs)}</Text> : null}
        </View>
        {last.length ? last.map((l) => <Line key={l.id} l={l} compact />) : <Text style={t.small}>Listening…</Text>}
      </Press>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, alignSelf: 'stretch' },
  list: { gap: 12, paddingVertical: 8 },
  line: { gap: 2 },
  lineC: { gap: 0 },
  who: { textTransform: 'uppercase', letterSpacing: 0.6 },
  partial: { opacity: 0.6 },
  flex: { flex: 1 },
  cardWrap: { position: 'absolute', left: 16, right: 16, zIndex: 20 },
  card: {
    backgroundColor: 'rgba(20,21,26,0.96)', borderRadius: RAD.card, padding: 16, gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: tint(NORA, 0.4), boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: NORA },
});
