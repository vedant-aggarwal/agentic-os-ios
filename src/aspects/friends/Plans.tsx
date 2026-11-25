import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F } from '@/theme';
import { Block, Button, CheckRing, Chip, Field, Group, Item, Press, Sheet, t, undoable } from '@/aspects/kit';
import type { Actions } from './actions';
import { DeepenCard } from './Circle';
import { dayAhead, firstName, roundSlot, type Friends, type Plan, type Week } from './data';
import { AskCard, inviteFor, NextCard, NoPlanCard, PlanRow, whenLine, withNames } from './LeadPlan';
import { deepenIdeas, type DeepenIdea, type Model } from './model';
import { copy } from './parts';

/** One plan: the invite to copy, they're in, another day, or remove it. */
export function PlanSheet({ plan, onClose, m, a, week, notice }: { plan: Plan | null; onClose: () => void; m: Model; a: Actions; week: Week | null; notice: (t: string) => void }) {
  const live = plan ? m.plans.find((p) => p.id === plan.id) ?? plan : null;
  const [invite, setInvite] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  if ((live?.id ?? null) !== seen) { setSeen(live?.id ?? null); setInvite(live ? inviteFor(live, m) : ''); }
  return (
    <Sheet open={!!plan} onClose={onClose} title={live?.title}>
      {live ? (
        <>
          <Text style={t.subhead}>{`${whenLine(live)}, with ${withNames(live, m)}`}</Text>
          {live.state !== 'done' ? (
            <>
              <Field label="Invite" value={invite} onChangeText={setInvite} multiline maxLength={300} />
              <View style={s.row}>
                <Button label="Copy invite" kind="accent" wrap={s.flex} onPress={async () => {
                  a.patchPlan(live.id, { invite });
                  const ok = await copy(invite);
                  notice(ok ? 'Invite copied. Send it from your messages.' : "Couldn't copy on this device.");
                }} />
                <Button label={live.state === 'confirmed' ? 'Not confirmed' : "They're in"} kind="quiet"
                  onPress={() => a.patchPlan(live.id, { state: live.state === 'confirmed' ? 'tentative' : 'confirmed' })} />
              </View>
              {(week?.free ?? []).length ? (
                <View style={s.gap8}>
                  <Text style={[t.footnote, s.medium]}>Another day</Text>
                  <View style={s.chips}>
                    {(week?.free ?? []).slice(0, 5).map((w) => (
                      <Chip key={w.date} label={`${dayAhead(w.date)}, ${roundSlot(w.from)}`} selected={live.date === w.date}
                        onPress={() => a.movePlan(live, w.date, roundSlot(w.from))} />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
          <Button label="Remove this plan" kind="danger" onPress={() => { a.removePlan(live); onClose(); }} />
        </>
      ) : null}
    </Sheet>
  );
}

/** A tick on its own beside a row that opens something else: 44 points to tap. */
function Tick({ done, label, onPress }: { done: boolean; label: string; onPress: () => void }) {
  return (
    <Press label={label} onPress={onPress} role="checkbox" state={{ checked: done }} feel={done ? 'light' : 'medium'} style={s.tick} scale={0.9}>
      <CheckRing done={done} size={26} />
    </Press>
  );
}

/** Every plan: the next one as the lead, the ones waiting for "did it happen?", what is ahead, ideas, and what happened. */
export function PlansTab({ m, f, a, week, onMake, onPlanWith, notice }: {
  m: Model; f: Friends; a: Actions; week: Week | null; onMake: () => void; onPlanWith: (person: string, idea?: DeepenIdea | null) => void; notice: (t: string) => void;
}) {
  const [sel, setSel] = useState<Plan | null>(null);
  const next = m.upcoming[0] ?? null;
  const rest = m.upcoming.slice(1);
  const friendIds = new Set(m.friends.map((v) => v.p.id));
  const saved = (f.ideas.items ?? []).filter((i) => i.kind === 'plan' && friendIds.has(i.person))
    .sort((x, y) => Number(!!x.done) - Number(!!y.done) || String(y.created_at ?? '').localeCompare(String(x.created_at ?? '')));
  const nameOf = (id: string) => { const p = m.persons.find((x) => x.id === id); return p ? firstName(p) : ''; };
  const toggle = (id: string, title: string, done: boolean) => {
    a.toggleIdea(id, done);
    if (done) undoable(`${title}, done`, () => a.toggleIdea(id, false));
  };
  const steady = m.steady;
  const deepen = steady ? deepenIdeas(steady, f.ideas.items ?? [], f.bank.data?.ideas ?? []).filter((d) => !d.saved) : [];
  return (
    <>
      {next ? <NextCard plan={next} m={m} a={a} more={0} onEdit={() => setSel(next)} notice={notice} />
        : <NoPlanCard free={week?.free ?? []} onMake={onMake} calendarKnown={!!week} />}

      {m.ask.length ? (
        <Block title="Did these happen?">
          {m.ask.map((p) => <AskCard key={p.id} plan={p} m={m} a={a} free={week?.free ?? []} />)}
        </Block>
      ) : null}

      <Block title={next ? 'After that' : 'Ahead'} action="Make a plan" onAction={onMake}>
        {rest.length ? (
          <Group>{rest.map((p) => <PlanRow key={p.id} plan={p} m={m} onPress={() => setSel(p)} />)}</Group>
        ) : (
          <Group pad>
            <Text style={t.footnote}>{next ? 'Nothing else planned yet.' : 'Who, what and when, in three taps. Your free evenings come from your calendar.'}</Text>
          </Group>
        )}
      </Block>

      {saved.length ? (
        <Block title="Ideas you saved" sub="Tap one to plan it.">
          <Group>
            {saved.map((i) => (
              <Item key={i.id} title={i.title} sub={`With ${nameOf(i.person)}`} done={!!i.done} onPress={() => onPlanWith(i.person, { id: i.id, title: i.title, act: null, invite: null, saved: true })}
                label={`${i.title}, with ${nameOf(i.person)}. Plan it`}
                action={<Tick done={!!i.done} label={i.done ? `${i.title}, done. Tap to undo` : `Mark ${i.title} done`} onPress={() => toggle(i.id, i.title, !i.done)} />} />
            ))}
          </Group>
        </Block>
      ) : null}

      {steady && deepen.length ? <DeepenCard v={steady} ideas={deepen} onPlan={(d) => onPlanWith(steady.p.id, d)} /> : null}

      {m.done.length ? (
        <Block title="Happened">
          <Group>{m.done.slice(0, 12).map((p) => <PlanRow key={p.id} plan={p} m={m} onPress={() => setSel(p)} />)}</Group>
        </Block>
      ) : null}
      <PlanSheet plan={sel} onClose={() => setSel(null)} m={m} a={a} week={week} notice={notice} />
    </>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  medium: { fontFamily: F.medium },
  tick: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
