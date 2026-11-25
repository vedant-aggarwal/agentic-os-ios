import { StyleSheet, Text, View } from 'react-native';
import { Linked } from '@/aspects/_linked/Linked';
import {
  Block, Button, dayLabel, Failed, Group, Icon, Item, Lead, Metric, Metrics, Press, Skeleton, t, timer, today, useAspect, WeekStrip,
} from '@/aspects/kit';
import { C } from '@/theme';
import { statusWords } from './Debrief';
import { reloadAll, useRomance, type Romance, type Week } from './data';
import { afterPlans, dueNow, upcoming, type Entry, type PlanItem } from './model';
import { useNav } from './nav';
import { capital, CheckButton, dueWords, Gl, placeAt, placeName, plural, useNow, whenIn } from './parts';
import type { Outing } from './types';

// Now: the one thing that matters for this part of his life today, lit, with one action. While he is out, the outing;
// then a debrief while it is fresh (an outing, or a plan with someone that has just happened); a plan for today; a
// follow up due; else the week and going out. Under it the week, the thing to try, the follow ups and the last
// debrief. Nothing intimate shows here: names and days only, no notes, plans or readings until he opens them.

type Pick =
  | { k: 'live'; o: Outing }
  | { k: 'debrief'; o: Outing }
  | { k: 'after'; p: PlanItem }
  | { k: 'today'; p: PlanItem }
  | { k: 'follow'; e: Entry }
  | { k: 'week' };

function pickLead(r: Romance): Pick {
  if (r.live) return { k: 'live', o: r.live };
  if (r.pending) return { k: 'debrief', o: r.pending };
  const plans = r.plans ?? [];
  const after = afterPlans(plans, 3)[0];
  if (after) return { k: 'after', p: after };
  const soon = upcoming(plans).find((p) => p.date === today());
  if (soon) return { k: 'today', p: soon };
  const due = r.list ? dueNow(r.list)[0] : null;
  if (due) return { k: 'follow', e: due };
  return { k: 'week' };
}

export function NowTab() {
  const r = useRomance();
  const pick = pickLead(r);
  const due = r.list ? dueNow(r.list).filter((e) => !(pick.k === 'follow' && e.person.id === pick.e.person.id)) : [];
  // the PC can't be reached at all: one message says so; every block would only repeat it
  const down = !!r.outings.error && !r.primer.data && !!r.primer.error && r.debriefs.items == null && !!r.debriefs.error && r.active == null && !!r.people.error;
  return (
    <>
      <NowLead r={r} pick={pick} down={down} />
      {!down ? (
        <>
          {pick.k !== 'week' && r.week ? <WeekBlock week={r.week} target={r.prefs.target} /> : null}
          <NextTime r={r} />
          {due.length ? <FollowUps list={due} /> : null}
          <LastDebrief r={r} />
        </>
      ) : null}
      <Linked />
    </>
  );
}

function NowLead({ r, pick, down }: { r: Romance; pick: Pick; down: boolean }) {
  const a = useAspect();
  const nav = useNav();
  if (pick.k === 'live') return <LiveLead outing={pick.o} />;
  if (pick.k === 'debrief') return <OutingDebriefLead o={pick.o} />;
  if (pick.k === 'after') return <AfterLead p={pick.p} discreet />;
  if (pick.k === 'today') return <PlanLead p={pick.p} discreet />;
  if (pick.k === 'follow') return <FollowLead e={pick.e} />;
  if (r.week) return <WeekLead week={r.week} target={r.prefs.target} targetLoaded={r.prefs.items != null} />;
  if (r.outings.error) {
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>This week</Text>
        <Failed message={down ? "Your PC isn't answering. What you count on this phone reaches it later." : r.outings.error} onRetry={reloadAll} />
        <Button label="Go out" kind="accent" onPress={nav.goOut} />
        <Text style={t.footnote}>Going out works without your PC. The count reaches it later.</Text>
      </Lead>
    );
  }
  return (
    <Lead>
      <Skeleton height={18} width="30%" />
      <Skeleton height={64} width="45%" />
      <Skeleton height={56} radius={18} />
      <Skeleton height={48} radius={24} />
    </Lead>
  );
}

// ── the leads ────────────────────────────────────────────────────────────────────────────────────────────────────
/** While he's out, the top of the page is the outing. */
export function LiveLead({ outing }: { outing: Outing }) {
  const a = useAspect();
  const nav = useNav();
  const now = useNow(1000, a.open);
  const secs = Math.max(0, Math.floor((now - Date.parse(outing.start ?? new Date().toISOString())) / 1000));
  const old = outing.day < today();
  const n = outing.reps.length;
  return (
    <Lead>
      <View style={s.between}>
        <View style={s.liveTag}>
          <View style={[s.liveDot, { backgroundColor: a.color }]} />
          <Text style={[t.footnote, { color: a.color }]}>{old ? `Started ${whenIn(outing.day)}. Still out?` : `Out now ${placeAt(outing.place) ?? ''}`.trim()}</Text>
        </View>
        {!old ? <Text style={[t.footnote, t.num]} accessibilityLabel={`Out for ${timer(secs)}`}>{timer(secs)}</Text> : null}
      </View>
      <Metric size="xl" value={String(n)} unit="started" color={a.color} />
      <View style={s.row}>
        <Button label="End" kind="quiet" onPress={nav.endLive} wrap={s.flex} />
        <Button label="Back to it" kind="accent" onPress={nav.backToOut} wrap={s.flex2} />
      </View>
    </Lead>
  );
}

/** An outing that ended in the last three days with no debrief. */
function OutingDebriefLead({ o }: { o: Outing }) {
  const a = useAspect();
  const nav = useNav();
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>Debrief</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>How did it go?</Text>
        <Text style={[t.subhead, t.num]}>{`${placeName(o.place)} ${whenIn(o.day)}, ${o.reps.length} started`}</Text>
      </View>
      <Button label="Talk for a minute" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => nav.debrief({ outing: o, view: null })} />
    </Lead>
  );
}

/** A plan whose day has gone by: talk it through while it's fresh. `discreet` leaves the plan's words out. */
export function AfterLead({ p, discreet }: { p: PlanItem; discreet?: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const when = p.date ? whenIn(p.date) : '';
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>After your plan</Text>
      <View style={s.gap4}>
        <Text style={t.title3}>How did it go?</Text>
        <Text style={t.subhead}>{discreet ? `Your plan with ${p.names}, ${when}` : `${p.title} with ${p.names}, ${when}`}</Text>
      </View>
      <Button label="Debrief" kind="accent" icon={<Icon name="mic" size={18} color="#14161C" />} onPress={() => nav.debrief({ outing: null, view: null, plan: p })} />
    </Lead>
  );
}

/** The next plan with someone. On Now (`discreet`) only who and when. */
export function PlanLead({ p, discreet }: { p: PlanItem; discreet?: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const done = p.steps.filter((x) => x.done).length;
  const day = p.date ? dayLabel(p.date) : 'No day yet';
  const open = () => { if (!p.date) nav.planDay(p); else if (p.person) nav.person(p.person.id); };
  return (
    <Lead>
      <View style={s.between}>
        <Text style={[t.footnote, { color: a.color }]}>{p.date === today() ? 'Plan today' : 'Next plan'}</Text>
        <Text style={[t.footnote, t.num]}>{day}</Text>
      </View>
      <View style={s.gap4}>
        <Text style={t.title3} numberOfLines={2}>{discreet ? `With ${p.names}` : p.title}</Text>
        {!discreet ? <Text style={t.subhead}>{`With ${p.names}`}</Text> : null}
      </View>
      {p.steps.length ? <Text style={[t.footnote, t.num]}>{`${done} of ${plural(p.steps.length, 'step')} done`}</Text> : null}
      <Button label={p.date ? 'Open plan' : 'Pick a day'} kind="accent" onPress={open} />
    </Lead>
  );
}

/** A follow up due now, done in one tap (with Undo). */
export function FollowLead({ e }: { e: Entry }) {
  const a = useAspect();
  const nav = useNav();
  const next = e.follow?.next;
  if (!next) return null;
  const due = dueWords(next.due);
  return (
    <Lead>
      <View style={s.between}>
        <Text style={[t.footnote, { color: a.color }]}>Follow up</Text>
        {due ? <Text style={[t.footnote, t.num]}>{capital(due)}</Text> : null}
      </View>
      <View style={s.gap4}>
        <Text style={t.title3}>{e.person.name}</Text>
        <Text style={t.subhead}>{next.what}</Text>
      </View>
      <View style={s.row}>
        <Button label="Done" kind="accent" onPress={() => nav.markDone(e)} wrap={s.flex} />
        <Button label="Open" kind="quiet" onPress={() => nav.person(e.person.id)} />
      </View>
    </Lead>
  );
}

/** No outing, debrief, plan or follow up waiting: the week, and going out. */
function WeekLead({ week, target, targetLoaded }: { week: Week; target: number | null; targetLoaded: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const reached = target != null && week.count >= target;
  const line = week.count === 0
    ? (week.total ? 'None yet this week. One is enough to start.' : 'Each conversation you start counts here, however it goes.')
    : reached ? "That's your week. Every extra one still counts." : 'Every one counts, however it went.';
  return (
    <Lead>
      <View style={s.between}>
        <Text style={[t.footnote, { color: a.color }]}>This week</Text>
        {targetLoaded ? (
          <Press label={target ? `Weekly target ${target}, change` : 'Set a weekly target'} onPress={nav.target} hitSlop={8} style={s.target}>
            <Text style={[t.footnote, t.num, { color: target ? C.muted : a.color }]}>{target ? `Target ${target}` : 'Set a target'}</Text>
            <Icon name="pencil" size={13} color={target ? C.muted : a.color} />
          </Press>
        ) : null}
      </View>
      <View style={s.gap4}>
        <Metric size="xl" value={String(week.count)} unit={target ? `of ${target}` : null} color={week.count ? a.color : undefined} />
        <Text style={t.subhead}>{`${week.count === 1 ? 'Conversation' : 'Conversations'} started. ${line}`}</Text>
      </View>
      <WeekStrip days={stripOf(week)} />
      <Button label="Go out" kind="accent" onPress={nav.goOut} />
      <Press label="Add a conversation you didn't count" onPress={nav.addOne} feel="none" style={s.addOne}>
        <Icon name="plus" size={14} color={C.muted} />
        <Text style={t.footnote}>Add one you didn&apos;t count</Text>
      </Press>
    </Lead>
  );
}

/** The week as days: a day with a conversation is filled; the others stay open rings, never marked as missed. */
export function stripOf(week: Week) {
  const now = today();
  return week.days.map((d) => ({
    day: d.day, mark: d.n > 0 ? 'done' as const : 'none' as const, today: d.day === now,
    label: `${dayLabel(d.day)}: ${d.n === 0 ? 'none' : plural(d.n, 'conversation')}`,
  }));
}

// ── under the lead ──────────────────────────────────────────────────────────────────────────────────────────────
function WeekBlock({ week, target }: { week: Week; target: number | null }) {
  const nav = useNav();
  return (
    <Block title="This week" action={target ? `Target ${target}` : 'Set a target'} onAction={nav.target}>
      <Group pad>
        <WeekStrip days={stripOf(week)} />
        <Metrics>
          <Metric label="This week" value={String(week.count)} unit={target ? `of ${target}` : null} />
          <Metric label="Last week" value={String(week.lastWeek)} />
          <Metric label="In all" value={String(week.total)} />
        </Metrics>
      </Group>
      <Group inset={56}>
        <Item title="Go out" sub="Thirty seconds to get ready, then a counter" left={<Gl k="walk" color={C.muted} />} chevron onPress={nav.goOut} />
        <Item title="Add one you didn't count" sub="A conversation outside an outing" left={<Icon name="plus" size={18} color={C.muted} />}
          action={<Button label="Add" kind="soft" small onPress={nav.addOne} />} />
      </Group>
    </Block>
  );
}

/** The one thing to try, from the last debrief (or the first steps before there is one). */
function NextTime({ r }: { r: Romance }) {
  const p = r.primer;
  return (
    <Block title="Next time">
      {p.data ? (
        <Group pad>
          <Text style={t.headline}>{p.data.try.text}</Text>
          <Text style={t.footnote}>
            {p.data.try.from === 'ladder' ? 'A first step. After your first debrief, this comes from what you said.'
              : `From your debrief${p.data.try.day ? ` ${whenIn(p.data.try.day)}` : ''}${p.data.try.by === 'ai' ? ', read by Nora' : ''}`}
          </Text>
        </Group>
      ) : p.error ? <Group><Failed message={p.error} onRetry={p.refresh} /></Group> : <Skeleton height={96} radius={22} />}
    </Block>
  );
}

function FollowUps({ list }: { list: Entry[] }) {
  const nav = useNav();
  return (
    <Block title="Follow ups">
      <Group inset={56}>
        {list.map((e) => {
          const next = e.follow?.next;
          const due = dueWords(next?.due);
          return (
            <Item key={e.person.id} title={e.person.name} sub={next ? (due ? `${next.what}, ${due}` : next.what) : null} chevron onPress={() => nav.person(e.person.id)}
              left={<CheckButton label={`Mark done: ${next?.what ?? ''}`} onPress={() => nav.markDone(e)} />} />
          );
        })}
      </Group>
    </Block>
  );
}

/** The last debrief, by day only: what it said opens with it. */
function LastDebrief({ r }: { r: Romance }) {
  const nav = useNav();
  const items = r.debriefs.items;
  const latest = items?.[0] ?? null;
  return (
    <Block title="Debriefs" action={items?.length ? 'All' : undefined} onAction={nav.debriefs}>
      {items == null ? (
        r.debriefs.error ? <Group><Failed message={r.debriefs.error} onRetry={r.debriefs.refresh} /></Group> : <Skeleton height={64} radius={22} />
      ) : latest ? (
        <Group inset={56}>
          <Item title={`Last one, ${dayLabel(latest.day).replace(/^(Today|Yesterday)$/, (x) => x.toLowerCase())}`}
            sub={latest.review ? 'Read, with one thing to try' : statusWords(latest) || 'Saved'} left={<Gl k="bubble" color={C.muted} />} chevron
            onPress={() => nav.debrief({ outing: r.outings.items?.find((o) => o.id === latest.session) ?? null, view: latest.id })} />
        </Group>
      ) : (
        <Group inset={56}>
          <Item title="Debrief something now" sub="A minute of talk or a few taps about any conversation. One thing to try comes back."
            left={<Gl k="bubble" color={C.muted} />} chevron onPress={() => nav.debrief({ outing: null, view: null })} />
        </Group>
      )}
    </Block>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  flex2: { flex: 2 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  addOne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: -8 },
});
