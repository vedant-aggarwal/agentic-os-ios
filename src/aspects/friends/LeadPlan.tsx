import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import { Button, Card, Chip, haptic, Icon, Press, SP, t, useAspect } from '@/aspects/kit';
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
  return `${p ? `${firstName(p)}, ` : ''}${plan.title.charAt(0).toLowerCase()}${plan.title.slice(1)} ${plan.date ? whenAhead(plan.date) : 'this week'}${plan.slot ? ` at ${plan.slot}` : ''}?`;
}

/** Did it happen? Yes keeps it as a moment; Not this time offers to move it or let it go, with no comment. */
export function AskCard({ plan, m, a, free }: { plan: Plan; m: Model; a: Actions; free: Window[] }) {
  const [moving, setMoving] = useState(false);
  return (
    <Card style={s.card}>
      <Text style={t.label}>{whenLine(plan)}</Text>
      <View style={s.gap4}>
        <Text style={t.title2}>{plan.title}</Text>
        <Text style={t.small}>With {withNames(plan, m)}</Text>
      </View>
      {!moving ? (
        <>
          <Text style={t.strong}>Did it happen?</Text>
          <View style={s.row}>
            <Button label="Yes" kind="accent" small onPress={() => { haptic.success(); a.happened(plan); }} wrap={s.flex} />
            <Button label="Not this time" kind="quiet" small onPress={() => setMoving(true)} wrap={s.flex} />
          </View>
        </>
      ) : (
        <>
          <Text style={t.strong}>Move it?</Text>
          <View style={s.chips}>
            {free.slice(0, 3).map((w) => (
              <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} onPress={() => { a.movePlan(plan, w.date, roundSlot(w.from)); setMoving(false); }} />
            ))}
          </View>
          <View style={s.row}>
            <Button label="Let it go" kind="quiet" small onPress={() => a.letGo(plan)} wrap={s.flex} />
            <Button label="Back" kind="quiet" small onPress={() => setMoving(false)} wrap={s.flex} />
          </View>
        </>
      )}
    </Card>
  );
}

/** The next plan, the page's lead: what, who and when, the invite to copy, and "they're in". */
export function NextCard({ plan, m, a, more, onOpen, notice }: { plan: Plan; m: Model; a: Actions; more: number; onOpen: () => void; notice: (t: string) => void }) {
  const { color } = useAspect();
  const confirmed = plan.state === 'confirmed';
  const names = withNames(plan, m);
  return (
    // not pressable as a whole: it holds its own buttons. The line at the bottom, and the section's "All", open every plan.
    <Card tone={color} style={s.card}>
      <Text style={[t.label, { color }]}>{whenLine(plan)}</Text>
      <View style={s.gap4}>
        <Text style={t.title2}>{plan.title}</Text>
        <Text style={t.small}>With {names}</Text>
      </View>
      {confirmed ? (
        <View style={s.inRow}>
          <Icon name="check" size={16} color={color} />
          <Text style={[t.label, { color: C.textSoft }]}>{names} {plan.people.length > 1 ? 'are' : 'is'} in</Text>
        </View>
      ) : (
        <View style={s.row}>
          <Button label="Copy invite" kind="accent" small wrap={s.flex}
            onPress={async () => { const ok = await copy(inviteFor(plan, m)); notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device."); }} />
          <Button label="They're in" kind="quiet" small wrap={s.flex} onPress={() => a.patchPlan(plan.id, { state: 'confirmed' })} />
        </View>
      )}
      {more > 0 ? (
        <Press label={`${more === 1 ? 'One more plan' : `${more} more plans`} after this. Open plans`} onPress={onOpen} feel="tick" hitSlop={8} style={s.moreRow}>
          <Text style={[t.caption, { color }]}>{more === 1 ? 'One more plan after this' : `${more} more plans after this`}</Text>
          <Icon name="right" size={12} color={color} />
        </Press>
      ) : null}
    </Card>
  );
}

/** No plan yet: the next free stretch from his calendar and the one tap that starts a plan. */
export function NoPlanCard({ free, onMake, calendarKnown }: { free: Window[]; onMake: () => void; calendarKnown: boolean }) {
  const w = free[0];
  const line = w ? (w.part === 'evening' ? `${dayAhead(w.date)} evening is free from ${w.from}.` : `${dayAhead(w.date)} is free from ${w.from} to ${w.to}.`)
    : calendarKnown ? 'Your calendar looks full this week. Pick a day anyway.' : 'Who, what and when, in three taps.';
  return (
    <Card style={s.card}>
      <Text style={t.label}>No plan yet</Text>
      <Text style={t.heading}>{line}</Text>
      <Button label="Make a plan" kind="accent" onPress={onMake} icon={<Icon name="plus" size={18} color="#14161C" />} />
    </Card>
  );
}

export function LeadSkeleton() {
  return <View style={s.skel} />;
}

/** One plan in a list. On a person's own page `self` leaves them out of "with". */
export function PlanRow({ plan, m, onPress, self }: { plan: Plan; m: Model; onPress?: () => void; self?: string }) {
  const names = withNames(plan, m, self);
  const sub = `${whenLine(plan)}${names ? `, with ${names}` : ''}`;
  const body = (
    <>
      <View style={s.flex}>
        <Text numberOfLines={1} style={t.strong}>{plan.title}</Text>
        <Text numberOfLines={1} style={t.small}>{sub}</Text>
      </View>
      {plan.state === 'confirmed' ? <Text style={t.caption}>On</Text> : null}
      {onPress ? <Icon name="right" size={16} color={C.faint} /> : null}
    </>
  );
  return onPress ? <Press label={`${plan.title}, ${sub}`} onPress={onPress} style={s.planRow}>{body}</Press>
    : <View style={s.planRow} accessible accessibilityLabel={`${plan.title}, ${sub}`}>{body}</View>;
}

const s = StyleSheet.create({
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: SP[4], alignSelf: 'flex-start', minHeight: 32 },
  card: { gap: SP[16] },
  gap4: { gap: SP[4] },
  row: { flexDirection: 'row', gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
  flex: { flex: 1, minWidth: 0 },
  inRow: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  skel: { height: 172, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.07)' },
  planRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: SP[12], paddingVertical: SP[8] },
});
