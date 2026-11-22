import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Button, Card, Chip, Field, haptic, Icon, IconButton, MOTION, Press, Row, SP, SURF, t, useAspect } from '@/aspects/kit';
import type { Actions } from './actions';
import { ACT_CHIP, actWord, firstName, lastLine, LOG_ACTS, type Kind, type Moment } from './data';
import type { DeepenIdea, FriendView } from './model';
import { usualAct } from './model';
import { Avatar, canPickPhoto, pickPhoto } from './parts';

const layout = LinearTransition.springify().duration(MOTION.spring.duration).dampingRatio(1);

/** The easiest next step for someone he hasn't seen in a while. Plain, never a countdown. */
function hint(v: FriendView) {
  if (v.warmth === 'due') return v.rhythm?.mode === 'talk' ? 'A good week for a call.' : 'A good week to meet.';
  if (v.warmth === 'drift') return 'A short message is enough to pick it up again.';
  return null;
}

/** One friend in the circle: when they last met, and the one button that logs today. */
export function FriendRow({ v, logged, onLog, onOpen }: {
  v: FriendView; logged: boolean; onLog: (kind: Kind) => void; onOpen: () => void;
}) {
  const { color } = useAspect();
  const talk = v.rhythm?.mode === 'talk';
  const h = hint(v);
  return (
    <Row title={v.p.name} sub={`${lastLine(v.st)}${h ? `. ${h}` : ''}`} onPress={onOpen} label={`${v.p.name}. ${lastLine(v.st)}`}
      left={<Avatar person={v.p} stage="friend" />}
      right={logged ? (
        <View style={s.done}><Icon name="check" size={16} color={color} /><Text style={[t.label, { color }]}>Logged</Text></View>
      ) : (
        <Button label={talk ? 'Talked today' : 'Met today'} kind="soft" small onPress={() => onLog(talk ? 'call' : 'meet')} />
      )} />
  );
}

/** After a one-tap log: what they did, a line, a photo. All optional; the log is already saved. */
export function LogDetail({ moment, a, onClose, indent = true }: { moment: Moment; a: Actions; onClose: () => void; indent?: boolean }) {
  const { color } = useAspect();
  const [line, setLine] = useState(moment.line ?? '');
  const [writing, setWriting] = useState(false);
  const kind = (moment.kind ?? 'meet') as Kind;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} layout={layout} style={[s.detail, indent && s.indent]}>
      <View style={s.detailHead}>
        <Text style={t.label}>{kind === 'meet' ? 'What did you do?' : 'How did you talk?'}</Text>
        <Press label="Undo the log" onPress={() => { a.undoLog(moment.id); onClose(); }} hitSlop={12} feel="tick">
          <Text style={t.label}>Undo</Text>
        </Press>
      </View>
      <View style={s.chips}>
        {kind !== 'meet' ? (['call', 'chat'] as const).map((k) => (
          <Chip key={k} label={k === 'call' ? 'A call' : 'A chat'} selected={kind === k} onPress={() => a.detail(moment.id, { kind: k })} />
        )) : LOG_ACTS.map((act) => (
          <Chip key={act} label={ACT_CHIP[act]} selected={moment.act === act} onPress={() => a.detail(moment.id, { act: moment.act === act ? null : act })} />
        ))}
        {kind !== 'meet' ? <Chip label="Met in person" onPress={() => a.detail(moment.id, { kind: 'meet' })} /> : null}
      </View>
      {writing ? (
        <View style={s.lineRow}>
          <View style={s.flex}><Field value={line} onChangeText={setLine} placeholder="One line to remember it by" autoFocus maxLength={200}
            onSubmit={() => { a.detail(moment.id, { line: line.trim() || null }); setWriting(false); }} /></View>
          <Button label="Save" kind="quiet" small onPress={() => { a.detail(moment.id, { line: line.trim() || null }); setWriting(false); }} />
        </View>
      ) : (
        <View style={s.actions}>
          <Button label={moment.line ? 'Edit the line' : 'Add a line'} kind="quiet" small onPress={() => setWriting(true)} />
          {canPickPhoto ? <Button label={moment.photo ? 'Photo added' : 'Add a photo'} kind="quiet" small disabled={!!moment.photo}
            onPress={async () => { const ph = await pickPhoto(); if (ph) void a.photo(moment.id, ph); }} /> : null}
          <View style={s.flex} />
          <IconButton label="Done" size={40} onPress={onClose}><Icon name="check" size={16} color={color} /></IconButton>
        </View>
      )}
      {moment.line && !writing ? <Text style={t.small} numberOfLines={2}>{moment.line}</Text> : null}
    </Animated.View>
  );
}

/** A plan they keep without planning it (the weekly meal): logged for this week in one tap. */
export function UsualRow({ v, onLog }: { v: FriendView; onLog: () => void }) {
  const { color } = useAspect();
  if (!v.usual) return null;
  const what = actWord(v.usual.act) ?? v.usual.act;
  return (
    <View style={s.usual}>
      <Text style={[t.small, s.flex]} numberOfLines={1}>Weekly {what} with {firstName(v.p)}</Text>
      {v.usual.thisWeek ? (
        <View style={s.done}><Icon name="check" size={14} color={color} /><Text style={[t.label, { color }]}>This week</Text></View>
      ) : (
        <Press label={`Had ${what} with ${firstName(v.p)} this week`} onPress={() => { haptic.medium(); onLog(); }} hitSlop={10} feel="none">
          <Text style={[t.label, { color }]}>Had it this week</Text>
        </Press>
      )}
    </View>
  );
}

/** Something they haven't done together yet: his own saved ideas first, then the bank's firsts. */
export function DeepenCard({ v, ideas, onPlan, compact }: { v: FriendView; ideas: DeepenIdea[]; onPlan: (idea: DeepenIdea) => void; compact?: boolean }) {
  const [i, setI] = useState(0);
  if (!ideas.length) return null;
  const idea = ideas[i % ideas.length];
  const usual = usualAct(v.st);
  return (
    <Card style={s.deepen}>
      <Text style={t.label}>{compact ? 'Something new together' : `Something new with ${firstName(v.p)}`}</Text>
      <Animated.View key={idea.id} entering={FadeIn.duration(160)} style={s.gap4}>
        <Text style={t.lead}>{idea.title}</Text>
        <Text style={t.small}>{idea.saved ? 'From your ideas for them.' : usual ? `You two mostly do ${usual}. This would be a first.` : 'Something you two have not done yet.'}</Text>
      </Animated.View>
      <View style={s.row}>
        <Button label="Plan it" kind="soft" small onPress={() => onPlan(idea)} wrap={s.flex} />
        {ideas.length > 1 ? <Button label="Another" kind="quiet" small onPress={() => setI((n) => n + 1)} wrap={s.flex} /> : null}
      </View>
    </Card>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: SP[4] },
  row: { flexDirection: 'row', gap: SP[8] },
  done: { flexDirection: 'row', alignItems: 'center', gap: SP[4], minHeight: 40 },
  detail: { marginBottom: SP[8], gap: SP[12], padding: SP[12], borderRadius: 16, borderCurve: 'continuous', backgroundColor: SURF.row },
  indent: { marginLeft: 52 },
  detailHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SP[8] },
  usual: { flexDirection: 'row', alignItems: 'center', gap: SP[12], marginLeft: 52, minHeight: 36, marginTop: -SP[8], marginBottom: SP[4] },
  deepen: { gap: SP[12] },
});
