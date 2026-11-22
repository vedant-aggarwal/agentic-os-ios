import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, Empty, Field, Icon, Screen, Section, Sheet, SP, t } from '@/aspects/kit';
import type { Actions } from './actions';
import { dayAhead, roundSlot, type Plan, type Week } from './data';
import { AskCard, inviteFor, PlanRow, whenLine, withNames } from './LeadPlan';
import type { Model } from './model';
import { copy } from './parts';

/** One plan: the invite to copy, they're in, another day, or remove it. */
function PlanSheet({ plan, onClose, m, a, week, notice }: { plan: Plan | null; onClose: () => void; m: Model; a: Actions; week: Week | null; notice: (t: string) => void }) {
  const live = plan ? m.plans.find((p) => p.id === plan.id) ?? plan : null;
  const [invite, setInvite] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if ((live?.id ?? null) !== seen) { setSeen(live?.id ?? null); setInvite(live ? inviteFor(live, m) : ''); }
  return (
    <Sheet open={!!plan} onClose={onClose} title={live?.title}>
      {live ? (
        <>
          <Text style={t.small}>{whenLine(live)}, with {withNames(live, m)}</Text>
          {live.state !== 'done' ? (
            <>
              <Field label="Invite" value={invite} onChangeText={setInvite} multiline maxLength={300} />
              <View style={s.row}>
                <Button label="Copy invite" kind="accent" small wrap={s.flex} onPress={async () => {
                  a.patchPlan(live.id, { invite });
                  const ok = await copy(invite);
                  notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device.");
                }} />
                <Button label={live.state === 'confirmed' ? 'Not confirmed' : "They're in"} kind="quiet" small wrap={s.flex}
                  onPress={() => a.patchPlan(live.id, { state: live.state === 'confirmed' ? 'tentative' : 'confirmed' })} />
              </View>
              <Text style={t.label}>Another day</Text>
              <View style={s.chips}>
                {(week?.free ?? []).slice(0, 5).map((w) => (
                  <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} selected={live.date === w.date}
                    onPress={() => { a.movePlan(live, w.date, roundSlot(w.from)); notice(`Moved to ${dayAhead(w.date).toLowerCase()}`); }} />
                ))}
              </View>
            </>
          ) : null}
          <Button label="Remove this plan" kind="danger" onPress={() => { a.removePlan(live); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

/** Every plan: the ones waiting for "did it happen?", what is ahead, and what happened. */
export function PlansScreen({ open, onClose, m, a, week, onMake, notice }: {
  open: boolean; onClose: () => void; m: Model; a: Actions; week: Week | null; onMake: () => void; notice: (t: string) => void;
}) {
  const [sel, setSel] = useState<Plan | null>(null);
  return (
    <Screen open={open} onClose={onClose} title="Plans">
      <Button label="Make a plan" kind="accent" onPress={onMake} icon={<Icon name="plus" size={18} color="#14161C" />} />
      {m.ask.length ? (
        <Section title="Did these happen?">
          {m.ask.map((p) => <AskCard key={p.id} plan={p} m={m} a={a} free={week?.free ?? []} />)}
        </Section>
      ) : null}
      <Section title="Ahead" gap={0}>
        {m.upcoming.length ? m.upcoming.map((p) => <PlanRow key={p.id} plan={p} m={m} onPress={() => setSel(p)} />)
          : <Empty title="Nothing planned" body="Who, what and when, in three taps. Your free evenings come from your calendar." />}
      </Section>
      {m.done.length ? (
        <Section title="Happened" gap={0}>
          {m.done.slice(0, 12).map((p) => <PlanRow key={p.id} plan={p} m={m} onPress={() => setSel(p)} />)}
        </Section>
      ) : null}
      <PlanSheet plan={sel} onClose={() => setSel(null)} m={m} a={a} week={week} notice={notice} />
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8] },
});
