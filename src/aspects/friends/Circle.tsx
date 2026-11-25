import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Block, Button, Chip, Empty, Field, Group, haptic, Icon, IconButton, Item, MOTION, Press, R, SURF, t, useAspect } from '@/aspects/kit';
import type { Actions } from './actions';
import { ACT_CHIP, actWord, firstName, lastLine, LOG_ACTS, type Friends, type Kind, type Moment } from './data';
import { nextStep, overdue, plannedIds, rings, type DeepenIdea, type FriendView, type Model } from './model';
import { usualAct } from './model';
import { Avatar, canPickPhoto, pickPhoto } from './parts';

const layout = LinearTransition.springify().duration(MOTION.spring.duration).dampingRatio(1);

/** One friend in the circle: when they last met, and the one button that logs today. Once today is logged, the button
 *  says so and opens the details instead of saving another meeting. */
export function FriendRow({ v, planned, onLog, onLogged, onOpen }: {
  v: FriendView; planned?: boolean; onLog: (kind: Kind) => void; onLogged: (moment: Moment) => void; onOpen: () => void;
}) {
  const { color } = useAspect();
  const talk = v.rhythm?.mode === 'talk';
  const done = talk ? v.todayTalk ?? v.todayMeet : v.todayMeet;
  const h = !done && !planned && overdue(v) >= 1 ? nextStep(v) : null;
  const doneWord = !done || (done.kind ?? 'meet') === 'meet' ? 'Met today' : done.kind === 'chat' ? 'Messaged today' : 'Talked today';
  return (
    <Item title={v.p.name} sub={`${lastLine(v.st)}${h ? `. ${h}` : ''}`} onPress={onOpen} label={`${v.p.name}. ${lastLine(v.st)}. Open`}
      left={<Avatar person={v.p} stage="friend" />}
      action={done ? (
        <Press label={`${doneWord}. Add what you did`} onPress={() => onLogged(done)} feel="tick" hitSlop={6} style={s.done}>
          <Icon name="check" size={16} color={color} /><Text style={[t.subhead, { color }]}>{doneWord}</Text>
        </Press>
      ) : (
        <Button label={talk ? 'Talked today' : 'Met today'} kind="quiet" small onPress={() => onLog(talk ? 'call' : 'meet')} />
      )} />
  );
}

/** Whether to ask what he and this friend usually do: a rhythm is set, nothing is logged, no usual yet. */
export const asksUsual = (v: FriendView) => !!v.rhythm && !v.rhythm.act && !v.usual && !Object.keys(v.st.acts).length;

/** Asked once, before anything is logged: what he and this friend usually do. Saved on their rhythm. */
export function UsualAsk({ v, a }: { v: FriendView; a: Actions }) {
  if (!asksUsual(v)) return null;
  const r = v.rhythm!;
  return (
    <View style={s.panel}>
      <Text style={t.footnote}>{`What do you and ${firstName(v.p)} usually do?`}</Text>
      <View style={s.chips}>
        {USUAL_ACTS.map((act) => <Chip key={act} label={ACT_CHIP[act]} onPress={() => a.setUsual(r, act)} />)}
      </View>
    </View>
  );
}
const USUAL_ACTS = ['food', 'chai', 'gym', 'walk', 'game', 'study', 'drive', 'sport'] as const;

/** After a one-tap log: what they did, a line, a photo. All optional; the log is already saved. */
export function LogDetail({ moment, a, onClose, framed = false }: { moment: Moment; a: Actions; onClose: () => void; framed?: boolean }) {
  const { color } = useAspect();
  const [line, setLine] = useState(moment.line ?? '');
  const [writing, setWriting] = useState(false);
  const kind = (moment.kind ?? 'meet') as Kind;
  const saveLine = () => { a.detail(moment.id, { line: line.trim() || null }); setWriting(false); };
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} layout={layout} style={[s.panel, framed && s.framed]}>
      <View style={s.detailHead}>
        <Text style={[t.footnote, s.flex]}>{kind === 'meet' ? 'What did you do?' : 'How did you talk?'}</Text>
        <Press label="Undo the log" onPress={() => { a.undoLog(moment.id); onClose(); }} hitSlop={12} feel="tick" style={s.link}>
          <Text style={t.subhead}>Undo</Text>
        </Press>
      </View>
      <View style={s.chips}>
        {kind !== 'meet' ? (['call', 'chat'] as const).map((k) => (
          <Chip key={k} label={k === 'call' ? 'A call' : 'A message'} selected={kind === k} onPress={() => a.detail(moment.id, { kind: k })} />
        )) : LOG_ACTS.map((act) => (
          <Chip key={act} label={ACT_CHIP[act]} selected={moment.act === act} onPress={() => a.detail(moment.id, { act: moment.act === act ? null : act })} />
        ))}
        {kind !== 'meet' ? <Chip label="Met in person" onPress={() => a.detail(moment.id, { kind: 'meet' })} /> : null}
      </View>
      {writing ? (
        <View style={s.lineRow}>
          <View style={s.flex}><Field value={line} onChangeText={setLine} placeholder="One line to remember it by" autoFocus maxLength={200} onSubmit={saveLine} /></View>
          <Button label="Save" kind="quiet" small onPress={saveLine} />
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
      {moment.line && !writing ? <Text style={t.footnote} numberOfLines={2}>{moment.line}</Text> : null}
    </Animated.View>
  );
}

/** A plan they keep without planning it (the weekly gym): logged for this week in one tap. */
export function UsualRow({ v, onLog, framed = false }: { v: FriendView; onLog: () => void; framed?: boolean }) {
  const { color } = useAspect();
  if (!v.usual) return null;
  const what = actWord(v.usual.act) ?? v.usual.act;
  return (
    <View style={[s.usual, framed && s.framed]}>
      <Text style={[t.footnote, s.flex]} numberOfLines={2}>{`${what.charAt(0).toUpperCase()}${what.slice(1)} every week with ${firstName(v.p)}`}</Text>
      {v.usual.thisWeek ? (
        <View style={s.done}><Icon name="check" size={14} color={color} /><Text style={[t.subhead, { color }]}>This week</Text></View>
      ) : (
        <Press label={`Log ${what} with ${firstName(v.p)} for this week`} onPress={() => { haptic.medium(); onLog(); }} hitSlop={10} feel="none" style={s.link}>
          <Text style={[t.subhead, { color }]}>Log this week</Text>
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
  const usual = usualAct(v.st, v.rhythm);
  return (
    <Block title={compact ? 'Something new together' : `Something new with ${firstName(v.p)}`}>
      <Group pad>
        <Animated.View key={idea.id} entering={FadeIn.duration(160)} style={s.gap4}>
          <Text style={t.headline}>{idea.title}</Text>
          <Text style={t.footnote}>{idea.saved ? 'From your ideas for them.' : usual ? `Usually ${usual} together. This would be a first.` : 'Something you two have not done yet.'}</Text>
        </Animated.View>
        <View style={s.row}>
          <Button label="Plan it" kind="soft" small onPress={() => onPlan(idea)} wrap={s.flex} />
          {ideas.length > 1 ? <Button label="Another" kind="quiet" small onPress={() => setI((n) => n + 1)} wrap={s.flex} /> : null}
        </View>
      </Group>
    </Block>
  );
}

/** The circle by closeness, each friend with when they last met and today's one tap. */
export function CircleTab({ m, f, a, onOpen, onAdd }: { m: Model; f: Friends; a: Actions; onOpen: (v: FriendView) => void; onAdd: () => void }) {
  const [logged, setLogged] = useState<{ person: string; moment: string } | null>(null);
  const loggedMoment = logged ? f.moments.items?.find((x) => x.id === logged.moment) ?? null : null;
  const log = (v: FriendView, kind: Kind, act?: string) => setLogged({ person: v.p.id, moment: a.log(v.p, kind, act ? { act } : {}) });
  const planned = plannedIds(m);
  if (!m.friends.length) {
    return (
      <Empty title="Your friends will be here" body="Someone you meet joins your circle once you have spent time together. A friend you already have can be added too."
        action="Add someone" onAction={onAdd} />
    );
  }
  return (
    <>
      {rings(m.friends).map((ring, i) => (
        <Block key={ring.key} title={ring.title} action={i === 0 ? 'Add someone' : undefined} onAction={onAdd}>
          <Group inset={68}>
            {ring.friends.flatMap((v) => [
              <FriendRow key={v.p.id} v={v} planned={planned.has(v.p.id)} onLog={(kind) => log(v, kind)} onOpen={() => onOpen(v)}
                onLogged={(mo) => setLogged(logged?.moment === mo.id ? null : { person: v.p.id, moment: mo.id })} />,
              logged?.person === v.p.id && loggedMoment ? <LogDetail key={`d-${loggedMoment.id}`} moment={loggedMoment} a={a} onClose={() => setLogged(null)} /> : null,
              v.usual ? <UsualRow key={`u-${v.p.id}`} v={v} onLog={() => log(v, 'meet', v.usual!.act)} /> : null,
              asksUsual(v) ? <UsualAsk key={`a-${v.p.id}`} v={v} a={a} /> : null,
            ])}
          </Group>
        </Block>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', gap: 8 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  link: { minHeight: 44, justifyContent: 'center' },
  panel: { gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  framed: { borderRadius: R.tile, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair, backgroundColor: SURF.group },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  usual: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16 },
});
