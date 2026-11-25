import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Empty, Group, Icon, Item, Lead, Press, t, useAspect } from '@/aspects/kit';
import { Linked } from '@/aspects/_linked/Linked';
import { C } from '@/theme';
import type { Actions } from './actions';
import { firstName, lastLine, roleText, type Kind, type Person, type Week } from './data';
import { AskRow, NextCard, NoPlanCard, PlanRow } from './LeadPlan';
import { nextStep, plannedIds, reachOut, type FriendView, type Model } from './model';
import { NudgeRow } from './NewPeople';
import { Avatar } from './parts';

// Friends now: the friend to reach out to (the most overdue against how close they are), logged in one tap with
// Undo or turned into a plan; then the next plan and any plan waiting for "did it happen?"; then the others worth a
// hello this week and the second hellos with people he is getting to know.

/** The lead: one friend, when they last met, and Messaged or Met in one tap. Undo is on the toast. */
function ReachLead({ v, onLog, onPlan, onOpen }: { v: FriendView; onLog: (kind: Kind) => void; onPlan: () => void; onOpen: () => void }) {
  const { color } = useAspect();
  const first = firstName(v.p);
  const who = roleText(v.p) ?? v.rhythm?.label ?? 'Friend';
  return (
    <Lead>
      <Press label={`${v.p.name}. Open`} onPress={onOpen} style={s.who} scale={0.98}>
        <Avatar person={v.p} stage="friend" size={44} />
        <View style={s.flex}>
          <Text style={[t.footnote, { color }]}>Reach out</Text>
          <Text numberOfLines={1} style={t.footnote}>{who}</Text>
        </View>
        <Icon name="right" size={14} color={C.faint} />
      </Press>
      <View style={s.gap4}>
        <Text style={t.title3}>{`Catch up with ${first}`}</Text>
        <Text style={t.subhead}>{`${lastLine(v.st)}. ${nextStep(v)}`}</Text>
      </View>
      <View style={s.row}>
        <Button label="Messaged" kind="accent" onPress={() => onLog('chat')} wrap={s.flex} />
        <Button label="Met" kind="quiet" onPress={() => onLog('meet')} />
      </View>
      <Press label={`Plan a meetup with ${first}`} onPress={onPlan} feel="tick" hitSlop={4} style={s.link}>
        <Icon name="calendar" size={16} color={color} />
        <Text style={[t.subhead, { color }]}>Plan a meetup</Text>
      </Press>
    </Lead>
  );
}

export function NowTab({ m, a, week, onPerson, onPlan, onPlanWith, onPlans, onAdd, notice }: {
  m: Model; a: Actions; week: Week | null; onPerson: (p: Person) => void; onPlan: () => void; onPlanWith: (person: string) => void;
  onPlans: () => void; onAdd: () => void; notice: (t: string) => void;
}) {
  const due = reachOut(m.friends, plannedIds(m));
  const lead = due[0] ?? null;
  const free = week?.free ?? [];
  const next = m.upcoming[0] ?? null;
  const ask = m.askRecent[0] ?? null;
  if (!m.persons.length) {
    return (
      <Empty title="Your friends will be here" body="The friends you keep and the people you meet. Add someone right after you meet them, or a friend you already have."
        action="Add someone" onAction={onAdd} />
    );
  }
  return (
    <>
      {lead ? <ReachLead v={lead} onLog={(k) => a.log(lead.p, k)} onPlan={() => onPlanWith(lead.p.id)} onOpen={() => onPerson(lead.p)} />
        : next ? <NextCard plan={next} m={m} a={a} more={m.upcoming.length - 1} onMore={onPlans} notice={notice} />
          : <NoPlanCard free={free} onMake={onPlan} calendarKnown={!!week} />}

      {(lead && next) || ask ? (
        <Block title="Plans" action="All plans" onAction={onPlans}>
          <Group>
            {lead && next ? <PlanRow plan={next} m={m} onPress={onPlans} /> : null}
            {ask ? <AskRow key={ask.id} plan={ask} m={m} a={a} free={free} /> : null}
          </Group>
        </Block>
      ) : null}

      {due.length > 1 || m.nudges.length ? (
        <Block title="Also this week">
          <Group inset={68}>
            {due.slice(1, 4).map((v) => (
              <Item key={v.p.id} title={v.p.name} sub={`${lastLine(v.st)}. ${nextStep(v)}`} left={<Avatar person={v.p} stage="friend" />} onPress={() => onPerson(v.p)}
                label={`${v.p.name}. ${lastLine(v.st)}. Open`} action={<Button label="Messaged" kind="quiet" small onPress={() => a.log(v.p, 'chat')} />} />
            ))}
            {m.nudges.slice(0, 3).map((n) => <NudgeRow key={n.key} n={n} a={a} onOpen={onPerson} onPlan={(p) => onPlanWith(p.id)} />)}
          </Group>
        </Block>
      ) : null}

      {!lead && m.friends.length ? (
        <Group pad>
          <Text style={t.callout}>Everyone is within your rhythm</Text>
          <Text style={t.footnote}>Nobody in your circle is past the time you set with them. The Circle tab has each friend and when you last met.</Text>
        </Group>
      ) : null}
      <Linked />
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44 },
});
