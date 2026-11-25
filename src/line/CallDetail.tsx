import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, dayLabel, dayOf, clock as timeOf, Glyph, haptic, t, tint } from '@/aspects/kit';
import { clock } from '@/lib/nora';
import { callerOf, categoryOf, directionOf, formatNumber, line, TASK_OPTIONS, type LineAction, type LineCall, type LineOption } from '@/lib/line';
import { C, F } from '@/theme';
import { Recording } from './Recording';
import { callerShort, Turns } from './Transcript';
import {
  ActionTile, CategoryMark, copy, Dots, errText, Group, GroupHead, LineScreen, LineTop, NORA, NORA_TEXT, StatusDot, useNow, useToast,
} from './parts';

// One call after it ended: who called, the decisions Nora left for him (tap an option and she carries it out), what
// was said and agreed, the recording and the transcript. Call back, copy the number, or block it from here.

const HANDLED = { nora: 'Nora handled it', you: 'You took the call', both: 'You and Nora talked' } as const;
const PHONE_D = 'M6.5 3.5h3l1.5 4.5-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 5 5a1.5 1.5 0 0 1 1.5-1.5z';
const COPY_D = 'M9 9h10v11H9zM5 15V4h10';
const BLOCK_D = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8';

export function CallDetail({ call: first }: { call: LineCall }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [call, setCall] = useState(first);
  const [given, setGiven] = useState(first); // a fresh record from the route replaces the one shown
  if (given !== first) { setGiven(first); setCall(first); }
  const [blockBusy, setBlockBusy] = useState(false);

  // a call that just ended: the summary and the recording follow within a minute or two; look again until they're in
  const now = useNow(15_000);
  const since = call.endedAt ? now - Date.parse(call.endedAt) : Infinity;
  const writing = since < 5 * 60_000 && !call.summary.trim();
  const saving = since < 30 * 60_000 && (call.recording.status === 'recording' || call.recording.status === 'encoding');
  useEffect(() => {
    if (!writing && !saving) return;
    const id = setInterval(() => { line.call(call.id).then(setCall).catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [call.id, writing, saving]);

  const caller = callerOf(call);
  const named = !!call.name?.trim();
  const meta = [categoryOf(call.category).label, `${dayLabel(dayOf(call.startedAt))}, ${timeOf(call.startedAt)}`, call.seconds > 0 ? clock(call.seconds) : null]
    .filter(Boolean).join(' · ');
  const spam = call.category === 'spam';

  const block = async (on: boolean, undo = false) => {
    setBlockBusy(true);
    try {
      const b = await line.block(call.id, on);
      setCall((c) => ({ ...c, blocked: b }));
      haptic.medium();
      toast.say(b ? 'Number blocked' : 'Number unblocked', undo ? null : { label: 'Undo', onPress: () => { toast.hide(); void block(!b, true); } });
    } catch (e) {
      toast.say(errText(e));
    } finally { setBlockBusy(false); }
  };
  const callBack = () => {
    Linking.openURL(`tel:${call.number.replace(/[^\d+]/g, '')}`).catch(() => toast.say("This device can't make calls."));
  };
  const copyNumber = async () => toast.say((await copy(call.number)) ? 'Number copied' : "Couldn't reach the clipboard");
  const decided = (a: LineAction) => {
    setCall((c) => {
      const actions = c.actions.map((x) => (x.id === a.id ? a : x));
      return { ...c, actions, needsYou: actions.some((x) => !x.decided) };
    });
    toast.say("Nora's on it. She'll report back on WhatsApp.");
  };

  const told = call.outcome.trim();
  const summary = call.summary.trim();
  return (
    <LineScreen overlay={toast.node}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.page, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 72 }]}>
        <LineTop backLabel="Calls" />

        <View style={st.who}>
          <CategoryMark category={call.category} size={72} />
          <Text accessibilityRole="header" numberOfLines={2} style={[t.title2, st.centre, spam && { color: C.textSoft }]}>{caller}</Text>
          {named ? <Text selectable style={[t.small, t.num]}>{formatNumber(call.number)}</Text> : null}
          <Text style={[t.caption, t.num, st.centre]}>{meta}</Text>
        </View>

        <View style={st.tiles}>
          <ActionTile label="Call back" sf="phone.fill" d={PHONE_D} onPress={callBack} a11y={`Call ${caller} back`} />
          <ActionTile label="Copy" sf="doc.on.doc" d={COPY_D} onPress={() => void copyNumber()} a11y="Copy the number" />
          <ActionTile label={call.blocked ? 'Unblock' : 'Block'} sf="nosign" d={BLOCK_D} busy={blockBusy}
            color={call.blocked ? C.text : C.danger} a11y={call.blocked ? 'Unblock this number' : 'Block this number'}
            onPress={() => void block(!call.blocked)} />
        </View>

        {call.actions.length ? (
          <View style={st.stack}>{call.actions.map((a) => <Decision key={a.id} callId={call.id} a={a} onDecided={decided} />)}</View>
        ) : null}

        {call.headline || summary || told || writing ? (
          <Group style={st.card}>
            {call.headline ? <Text style={t.lead}>{call.headline}</Text> : null}
            {summary ? <Text style={t.body}>{summary}</Text> : writing ? (
              <View style={st.inline}><Dots color={NORA} /><Text style={t.small}>Nora is writing the summary</Text></View>
            ) : null}
            {told ? (
              <View style={st.told}>
                <Text style={t.label}>What Nora told them</Text>
                <Text style={t.body}>{told}</Text>
              </View>
            ) : null}
          </Group>
        ) : null}

        {call.recording.status !== 'none' ? (
          <View>
            <GroupHead>Recording</GroupHead>
            <Group style={st.card}><Recording rec={call.recording} src={line.recording(call.id, call.recording.seconds || call.seconds)} /></Group>
          </View>
        ) : null}

        {call.transcript.length ? (
          <View>
            <GroupHead>Transcript</GroupHead>
            <Group style={st.card}><Turns lines={call.transcript} caller={callerShort(call.name)} /></Group>
          </View>
        ) : null}

        <Text style={[t.caption, st.centre]}>{[directionOf(call.direction), HANDLED[call.handledBy]].filter(Boolean).join(' · ')}</Text>
      </ScrollView>
    </LineScreen>
  );
}

/** A decision Nora left: the question and its buttons; once chosen, the choice and when. */
function Decision({ callId, a, onDecided }: { callId: string; a: LineAction; onDecided: (a: LineAction) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const choose = async (o: LineOption) => {
    setBusy(o.id); setErr(null);
    try {
      onDecided(await line.decide(callId, a.id, o.id));
      haptic.success();
    } catch (e) {
      setErr(errText(e)); haptic.warn();
    } finally { setBusy(null); }
  };
  if (a.decided) {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={[st.card, st.decided]}>
        <View style={st.inline}>
          <Glyph sf="checkmark.circle.fill" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.5 2.5L16 9.5" size={20} color={NORA_TEXT} />
          <Text style={[t.strong, st.flex]}>{a.decided.label}</Text>
          <Text style={[t.caption, t.num]}>{timeOf(a.decided.at)}</Text>
        </View>
        <Text style={t.small}>{a.text}</Text>
      </Animated.View>
    );
  }
  return (
    <View style={[st.card, st.needs]}>
      <View style={st.inline}>
        <StatusDot color={NORA} size={7} />
        <Text style={st.needsText}>Needs you</Text>
      </View>
      <Text accessibilityRole="header" style={t.lead}>{a.text}</Text>
      <View style={st.options}>
        {a.options.map((o) => (
          <Button key={o.id} label={o.label} kind="quiet" busy={busy === o.id} disabled={!!busy && busy !== o.id} onPress={() => void choose(o)} />
        ))}
      </View>
      <View style={st.taskRow}>
        <Text style={[t.caption, st.taskLabel]}>Make it a task</Text>
        <View style={st.taskButtons}>
          {TASK_OPTIONS.map((o) => (
            <View key={o.id} style={st.flex}>
              <Button label={o.label} kind="quiet" busy={busy === o.id} disabled={!!busy && busy !== o.id} onPress={() => void choose(o)} />
            </View>
          ))}
        </View>
      </View>
      {err ? <Text style={[t.small, { color: C.danger }]}>{err}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  page: { paddingHorizontal: 16, gap: 24 },
  centre: { textAlign: 'center' },
  who: { alignItems: 'center', gap: 6, paddingTop: 4 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: -4 },
  stack: { gap: 12 },
  card: { padding: 16, gap: 10 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  told: { gap: 2, marginTop: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  needs: {
    borderRadius: 20, borderCurve: 'continuous', backgroundColor: tint(NORA, 0.08), borderWidth: StyleSheet.hairlineWidth, borderColor: tint(NORA, 0.35),
  },
  needsText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: NORA_TEXT },
  options: { gap: 8, marginTop: 4 },
  taskRow: { gap: 8, marginTop: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: tint(NORA, 0.2) },
  taskLabel: { color: NORA_TEXT },
  taskButtons: { flexDirection: 'row', gap: 8 },
  decided: { borderRadius: 20, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.07)', gap: 6 },
});
