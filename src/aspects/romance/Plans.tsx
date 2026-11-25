import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, dayLabel, DayPicker, Failed, Group, haptic, Icon, Item, Lead, myDay, Sheet, Skeleton, t, useAspect } from '@/aspects/kit';
import { openLink } from '@/lib/links';
import { C } from '@/theme';
import { useRomance, type Romance } from './data';
import { afterPlans, upcoming, type PlanItem } from './model';
import { useNav } from './nav';
import { AfterLead, LiveLead, PlanLead } from './Now';
import { capital, Gl, placeName, planDay, plural, whenIn } from './parts';
import type { Debrief, Primer } from './types';

// Plans: going out and meeting up. The lead is the plan that matters next: one that just happened (debrief it while
// it's fresh), else the next one coming, else the next outing with the thing to try. Under it the other plans, going
// out and getting ready, and the debriefs by day.

export function PlansTab() {
  const r = useRomance();
  const plans = r.plans;
  const after = plans ? afterPlans(plans) : [];
  const next = plans ? upcoming(plans) : [];
  const lead = r.live ? 'live' : after[0] ? 'after' : next[0] ? 'plan' : 'go';
  return (
    <>
      {r.live ? <LiveLead outing={r.live} />
        : plans == null && !r.people.error ? <Skeleton height={200} radius={28} />
          : after[0] ? <AfterLead p={after[0]} />
            : next[0] ? <PlanLead p={next[0]} />
              : <GoLead primer={r.primer.data} />}

      {plans == null && r.people.error ? <Group><Failed message={r.people.error} onRetry={r.people.refresh} /></Group> : null}
      <ComingUp list={lead === 'plan' ? next.slice(1) : next} none={plans != null && !next.length && !after.length} />
      <After list={lead === 'after' ? after.slice(1) : after} />
      <GoingOut withGo={lead !== 'go'} primer={r.primer.data} />
      <DebriefList r={r} />
    </>
  );
}

const tryFrom = (p: Primer | null) => {
  if (!p) return 'A first step';
  if (p.try.from === 'ladder') return 'A first step. Your debriefs take over from here.';
  return p.try.by === 'ai' ? 'From your last debrief, read by Nora' : 'From your last debrief';
};

/** No plan with anyone yet: the next outing is the plan. */
function GoLead({ primer }: { primer: Primer | null }) {
  const a = useAspect();
  const nav = useNav();
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>Next time out</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>{primer?.try.text ?? 'Say hello to one person. That is the whole step.'}</Text>
        <Text style={t.footnote}>{tryFrom(primer)}</Text>
      </View>
      <Button label="Go out" kind="accent" onPress={nav.goOut} />
    </Lead>
  );
}

function ComingUp({ list, none }: { list: PlanItem[]; none: boolean }) {
  const nav = useNav();
  if (none) {
    return (
      <Block title="Coming up">
        <Group inset={56}>
          <Item title="No plans yet" sub="Plan an idea with someone you're talking to and it shows here with its day." lines={3}
            left={<Icon name="calendar" size={18} color={C.muted} />} action={<Button label="Ideas" kind="soft" small onPress={() => nav.openTab('ideas')} />} />
        </Group>
      </Block>
    );
  }
  if (!list.length) return null;
  return (
    <Block title="Coming up">
      <Group inset={56}>
        {list.map((p) => (
          <Item key={p.key} title={p.title} sub={`With ${p.names}, ${planDay(p.date)}`} left={<Icon name="calendar" size={18} color={C.muted} />} chevron
            onPress={() => (p.kind === 'follow' && p.person ? nav.person(p.person.id) : nav.planDay(p))} />
        ))}
      </Group>
    </Block>
  );
}

function After({ list }: { list: PlanItem[] }) {
  const nav = useNav();
  if (!list.length) return null;
  return (
    <Block title="After a plan" sub="Talk it through while it's fresh. One thing to try comes back.">
      <Group inset={56}>
        {list.map((p) => (
          <Item key={p.key} title={p.title} sub={`With ${p.names}, ${p.date ? whenIn(p.date) : ''}`} left={<Gl k="bubble" color={C.muted} />}
            onPress={() => (p.person && p.kind === 'follow' ? nav.person(p.person.id) : nav.planDay(p))}
            action={<Button label="Debrief" kind="soft" small onPress={() => nav.debrief({ outing: null, view: null, plan: p })} />} />
        ))}
      </Group>
    </Block>
  );
}

function GoingOut({ withGo, primer }: { withGo: boolean; primer: Primer | null }) {
  const nav = useNav();
  return (
    <Block title={withGo ? 'Going out' : 'Getting ready'}>
      <Group inset={56}>
        {withGo ? (
          <Item title="Go out" sub={primer?.try.text ? `Next time: ${primer.try.text}` : 'Thirty seconds to get ready, then a counter'} lines={3}
            left={<Gl k="walk" color={C.muted} />} chevron onPress={nav.goOut} />
        ) : null}
        <Item title="Face" sub="In Body" left={<Gl k="face" color={C.muted} />} chevron onPress={() => openLink('body/face')} />
        <Item title="Speak" sub="In Mind" left={<Gl k="speak" color={C.muted} />} chevron onPress={() => openLink('mind/speak')} />
      </Group>
    </Block>
  );
}

/** A debrief's state in a word or two; nothing for one that has been read. */
export function shortStatus(d: Debrief) {
  if ((d as Debrief & { waiting?: boolean }).waiting) return 'On this phone';
  if (d.status === 'transcribing' || d.status === 'reviewing' || (d.status === 'saved' && !d.review)) return 'Being read';
  if (d.status === 'failed' && !d.review) return 'Not read';
  return null;
}

/** What a debrief was about, without what it said. */
export function debriefAbout(d: Debrief, r: Romance) {
  const o = d.session ? r.outings.items?.find((x) => x.id === d.session) : null;
  if (o) return `${placeName(o.place)}, ${plural(o.reps.length, 'conversation')}`;
  const p = r.plans?.find((x) => x.debrief === d.id);
  if (p) return `After the plan with ${p.names}`;
  return 'Not tied to an outing';
}

function DebriefList({ r }: { r: Romance }) {
  const nav = useNav();
  const items = r.debriefs.items?.filter((x) => !(x as Debrief & { waiting?: boolean }).waiting) ?? null;
  return (
    <Block title="Debriefs" sub={items?.length ? 'By day. What each one said opens with it.' : null} action={items?.length ? 'All' : undefined} onAction={nav.debriefs}>
      {items == null ? (
        r.debriefs.error ? <Group><Failed message={r.debriefs.error} onRetry={r.debriefs.refresh} /></Group> : <Skeleton height={120} radius={22} />
      ) : items.length ? (
        <Group inset={56}>
          {items.slice(0, 3).map((x) => (
            <Item key={x.id} title={capital(dayLabel(x.day))} sub={debriefAbout(x, r)} value={shortStatus(x)} left={<Gl k="bubble" color={C.muted} />} chevron
              onPress={() => nav.debrief({ outing: r.outings.items?.find((o) => o.id === x.session) ?? null, view: x.id })} />
          ))}
        </Group>
      ) : (
        <Group inset={56}>
          <Item title="No debriefs yet" sub="After an outing or a plan, talk for a minute or tap a few chips. One thing to try comes back." lines={4}
            left={<Gl k="bubble" color={C.muted} />} action={<Button label="Start" kind="soft" small onPress={() => nav.debrief({ outing: null, view: null })} />} />
        </Group>
      )}
    </Block>
  );
}

// ── the day of a plan ───────────────────────────────────────────────────────────────────────────────────────────
export function DaySheet({ plan, onClose }: { plan: PlanItem | null; onClose: () => void }) {
  const a = useAspect();
  const r = useRomance();
  const [day, setDay] = useState(myDay());
  const [was, setWas] = useState<string | null>(null);
  const key = plan?.key ?? null;
  if (key !== was) { setWas(key); if (plan) setDay(plan.date ?? myDay()); }
  const save = (date: string | null) => {
    if (!plan) return;
    if (plan.kind === 'follow') {
      const f = r.list?.find((x) => x.person.id === plan.id)?.follow;
      if (f?.plan) r.people.follow.put({ ...f, plan: { ...f.plan, date } }).catch((err: Error) => a.notice(err.message));
    } else {
      r.shared.patch(plan.id, { date }).catch((err: Error) => a.notice(err.message));
    }
    haptic.medium();
    onClose();
  };
  return (
    <Sheet open={!!plan} onClose={onClose} title="The day">
      {plan ? <Text style={t.subhead}>{`${plan.title} with ${plan.names}`}</Text> : null}
      <DayPicker value={day} onChange={setDay} past={1} />
      <Button label={`Save, ${dayLabel(day).replace(/^(Today|Tomorrow|Yesterday)$/, (x) => x.toLowerCase())}`} kind="accent" onPress={() => save(day)} />
      {plan?.date ? <Button label="No day yet" kind="quiet" onPress={() => save(null)} /> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  gap4: { gap: 4 },
});
