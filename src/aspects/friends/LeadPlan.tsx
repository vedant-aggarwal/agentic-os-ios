import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import { Button, Chip, Group, haptic, Icon, Item, Lead, Press, t, Tag, useAspect } from '@/aspects/kit';
import type { Actions } from './actions';
import { dayAhead, fillName, firstName, roundSlot, whenAhead, type Person, type Plan, type Window } from './data';
import { copy } from './parts';
import type { Model } from './model';

export const withNames = (plan: Plan, m: Model, omit?: string) => {
  const names = (plan.people ?? []).filter((id) => id !== omit).map((id) => m.persons.find((p) => p.id === id)).filter(Boolean).map((p) => firstName(p as Person));
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};
export const whenLine = (plan: Plan) => (plan.date ? `${dayAhead(plan.date)}${plan.slot ? `, ${plan.slot}` : ''}` : 'No day set yet');
export function inviteFor(plan: Plan, m: Model) {
  const p = m.persons.find((x) => x.id === plan.people?.[0]) ?? null;
  if (plan.invite) return fillName(plan.invite, p);
  const when = `${plan.date ? whenAhead(plan.date) : 'this week'}${plan.slot ? ` at ${plan.slot}` : ''}`;
  // one person: their name first; a group gets one line for everyone
  if (p && (plan.people?.length ?? 0) < 2) return `${firstName(p)}, ${plan.title.charAt(0).toLowerCase()}${plan.title.slice(1)} ${when}?`;
  return `${plan.title} ${when}?`;
}

/** The free stretches to move a plan to, and letting it go, with no comment. */
function MoveChips({ plan, a, free, onDone }: { plan: Plan; a: Actions; free: Window[]; onDone: () => void }) {
  return (
    <View style={s.chips}>
      {free.slice(0, 3).map((w) => (
        <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} onPress={() => { a.movePlan(plan, w.date, roundSlot(w.from)); onDone(); }} />
      ))}
      <Chip label="Let it go" onPress={() => a.letGo(plan)} />
      <Chip label="Back" onPress={onDone} />
    </View>
  );
}

/** Did it happen? Yes keeps it as a moment; Not this time offers to move it or let it go. */
export function AskCard({ plan, m, a, free }: { plan: Plan; m: Model; a: Actions; free: Window[] }) {
  const [moving, setMoving] = useState(false);
  return (
    <Group pad>
      <View style={s.gap4}>
        <Text style={t.footnote}>{whenLine(plan)}</Text>
        <Text style={t.headline}>{plan.title}</Text>
        <Text style={t.footnote}>{`With ${withNames(plan, m)}`}</Text>
      </View>
      <Text style={t.callout}>{moving ? 'Move it?' : 'Did it happen?'}</Text>
      {moving ? <MoveChips plan={plan} a={a} free={free} onDone={() => setMoving(false)} /> : (
        <View style={s.row}>
          <Button label="Yes" kind="soft" small onPress={() => { haptic.success(); a.happened(plan); }} wrap={s.flex} />
          <Button label="Not this time" kind="quiet" small onPress={() => setMoving(true)} wrap={s.flex} />
        </View>
      )}
    </Group>
  );
}

/** A past plan with no answer yet, as one row inside a group: Yes keeps it, Not this time offers to move it. */
export function AskRow({ plan, m, a, free }: { plan: Plan; m: Model; a: Actions; free: Window[] }) {
  const { color } = useAspect();
  const [moving, setMoving] = useState(false);
  const what = `${plan.title} with ${withNames(plan, m)}`;
  return (
    <View style={[s.ask, moving && s.askMoving]}>
      <View style={s.gap4}>
        <Text style={t.callout} numberOfLines={2}>{what}</Text>
        <Text style={t.footnote}>{`${whenLine(plan)}. ${moving ? 'Move it?' : 'Did it happen?'}`}</Text>
      </View>
      {moving ? <MoveChips plan={plan} a={a} free={free} onDone={() => setMoving(false)} /> : (
        <View style={s.askBtns}>
          <Press label={`Yes, ${what} happened`} onPress={() => { haptic.success(); a.happened(plan); }} feel="none" hitSlop={4} style={s.askBtn}>
            <Text style={[t.subhead, { color }]}>Yes, it happened</Text>
          </Press>
          <Press label={`${what} did not happen this time`} onPress={() => setMoving(true)} feel="tick" hitSlop={4} style={s.askBtn}>
            <Text style={t.subhead}>Not this time</Text>
          </Press>
        </View>
      )}
    </View>
  );
}

/** The next plan as a lead: what, who and when, the invite to copy, and "they're in". */
export function NextCard({ plan, m, a, more, onMore, onEdit, notice }: {
  plan: Plan; m: Model; a: Actions; more: number; onMore?: () => void; onEdit?: () => void; notice: (t: string) => void;
}) {
  const { color } = useAspect();
  const confirmed = plan.state === 'confirmed';
  const names = withNames(plan, m);
  return (
    // not pressable as a whole: it holds its own buttons. The line at the bottom opens the rest.
    <Lead>
      <Text style={[t.footnote, { color }]}>{whenLine(plan)}</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>{plan.title}</Text>
        <Text style={t.subhead}>{`With ${names}`}</Text>
      </View>
      {confirmed ? (
        <View style={s.inRow}>
          <Icon name="check" size={16} color={color} />
          <Text style={[t.subhead, { color: C.textSoft }]}>{`${names} ${plan.people.length > 1 ? 'are' : 'is'} in`}</Text>
        </View>
      ) : (
        <View style={s.row}>
          <Button label="Copy invite" kind="accent" wrap={s.flex}
            onPress={async () => { const ok = await copy(inviteFor(plan, m)); notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device."); }} />
          <Button label="They're in" kind="quiet" onPress={() => a.patchPlan(plan.id, { state: 'confirmed' })} />
        </View>
      )}
      {more > 0 && onMore ? (
        <Press label={`${more === 1 ? 'One more plan' : `${more} more plans`} after this. Open plans`} onPress={onMore} feel="tick" hitSlop={4} style={s.moreRow}>
          <Text style={[t.subhead, { color }]}>{more === 1 ? 'One more plan after this' : `${more} more plans after this`}</Text>
          <Icon name="right" size={12} color={color} />
        </Press>
      ) : onEdit ? (
        <Press label="Change, move or remove this plan" onPress={onEdit} feel="tick" hitSlop={4} style={s.moreRow}>
          <Text style={[t.subhead, { color }]}>Change the plan</Text>
          <Icon name="right" size={12} color={color} />
        </Press>
      ) : null}
    </Lead>
  );
}

/** No plan yet: the next free stretch from his calendar and the one tap that starts a plan. */
export function NoPlanCard({ free, onMake, calendarKnown }: { free: Window[]; onMake: () => void; calendarKnown: boolean }) {
  const { color } = useAspect();
  const w = free[0];
  const line = w ? (w.part === 'evening' ? `${dayAhead(w.date)} evening is free from ${w.from}.` : `${dayAhead(w.date)} is free from ${w.from} to ${w.to}.`)
    : calendarKnown ? 'Your calendar looks full this week. Pick a day anyway.' : 'Who, what and when, in three taps.';
  return (
    <Lead>
      <Text style={[t.footnote, { color }]}>No plan yet</Text>
      <Text style={t.title3}>{line}</Text>
      <Button label="Make a plan" kind="accent" onPress={onMake} icon={<Icon name="plus" size={18} color="#14161C" />} />
    </Lead>
  );
}

/** One plan in a list. On a person's own page `self` leaves them out of "with". */
export function PlanRow({ plan, m, onPress, self }: { plan: Plan; m: Model; onPress?: () => void; self?: string }) {
  const names = withNames(plan, m, self);
  const sub = `${whenLine(plan)}${names ? `, with ${names}` : ''}`;
  return (
    <Item title={plan.title} sub={sub} onPress={onPress} chevron={!!onPress} label={`${plan.title}, ${sub}`}
      right={plan.state === 'confirmed' ? <Tag label="They're in" tone="aspect" /> : undefined} />
  );
}

const s = StyleSheet.create({
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  ask: { gap: 4, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  askMoving: { gap: 12, paddingBottom: 14 },
  askBtns: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  askBtn: { minHeight: 44, justifyContent: 'center' },
});
