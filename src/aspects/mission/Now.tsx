import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, dayOf, Failed, Group, haptic, Icon, Item, Lead, Press, shortDay, Skeleton, t, tint, undoable, useAspect,
} from '@/aspects/kit';
import { Linked } from '@/aspects/_linked/Linked';
import { openLink } from '@/lib/links';
import { ApiError, call, invalidate, useCollection, useGet, type Read } from '@/lib/mod';
import { C } from '@/theme';
import {
  act, ASPECT_LABEL, cap, count, daysLeftLabel, dueWords, HANDOFF, M, message, NUMBER_WORDS, pctKnown, progressOf, refresh, useReadingSync, useSources,
  type Handoff, type HandoffMove, type Sources,
} from './data';
import { useNav } from './nav';
import { colorOf, Disc, Dot, GoalBar, goalLine, GoalRow, s as ps, Serves, TickRow, Tile, useTickMilestone, useTickTask } from './parts';
import type { Commitment, FirstBlock, Home as HomeData, Milestone, RecordWeek, WeekBlock } from './types';

/**
 * Now: the one goal to move this week and its next step, lit. Under it what waits on him (goals past their date, the
 * weekly review), the week's commitments ticked in one tap, the project with the first block, the quarter the week
 * serves, and the record.
 */
export function NowTab({ read }: { read: Read<HomeData> }) {
  const a = useAspect();
  const h = read.data;
  const hand = useGet<Handoff>(a.open ? HANDOFF : null);
  const goals = useMemo(() => (h ? [...h.quarter.goals, ...h.week.commitments, ...(h.plan?.commitments ?? [])] : []), [h]);
  const src = useSources(goals);
  useReadingSync(goals, src);
  useClosedSync(h, hand.data);

  if (!h && read.error) return <Failed message={read.error} onRetry={read.refresh} />;
  if (!h) return <NowSkeleton />;

  const live = h.plan ?? h.week; // the week being set: next week on Sunday, else this one
  const nothing = !h.purpose && !h.stale.length && !h.quarter.goals.length && !h.month.goals.length && !h.year.goals.length
    && !h.week.commitments.length && !h.plan?.commitments.length && !h.first;
  const review = reviewWaiting(h, hand.data);
  const moves = hand.data?.moves.week === live.key ? hand.data.moves.items.filter((m) => m.state === 'offered').slice(0, 3) : [];
  return (
    <>
      <LeadCard h={h} live={live} src={src} nothing={nothing} />
      <Waiting h={h} review={review} />
      {moves.length ? (
        <Block title="From your weekly review" sub={`Keep one and it becomes a commitment for ${h.plan ? 'next' : 'this'} week`}>
          {moves.map((m) => <MoveCard key={m.id} m={m} week={live} name={h.plan ? 'Next week' : 'This week'} reviewed={hand.data?.reviewed ?? null} />)}
        </Block>
      ) : null}
      <WeekList h={h} live={live} src={src} />
      {h.plan && h.week.commitments.length ? <LastDays week={h.week} /> : null}
      {h.first || h.projects.running + h.projects.parked > 0 ? <FirstRow f={h.first} /> : null}
      {nothing ? null : <Quarter h={h} src={src} />}
      {h.record.totals.set ? <RecordRow weeks={h.record.weeks} /> : null}
      <Linked goals={false} />
    </>
  );
}

// ── the lead ──
const ORDER: Record<Commitment['state'], number> = { not_started: 0, open: 1, moving: 2, done: 3 };
/** The commitment that most needs moving: not started, then untouched, then the furthest behind; one with a step first. */
const rank = (cs: Commitment[]) => [...cs].sort((x, y) => ORDER[x.state] - ORDER[y.state] || Number(!x.next) - Number(!y.next) || x.progress - y.progress);

function LeadCard({ h, live, src, nothing }: { h: HomeData; live: WeekBlock; src: Sources; nothing: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const tickTask = useTickTask();
  const tickMilestone = useTickMilestone();
  useCollection<Milestone>('mission', 'milestones'); // loaded, so a milestone step ticks at once
  const [pin, setPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = h.plan ? 'next week' : 'this week';
  const add = () => nav.add({ horizon: 'week', start: live.start });
  const kicker = (text: string, right?: string | null) => (
    <View style={st.between}>
      <Text style={[t.footnote, { color: a.color }]} numberOfLines={1}>{text}</Text>
      {right ? <Text style={[t.footnote, t.num]}>{right}</Text> : null}
    </View>
  );

  if (nothing || !live.commitments.length) {
    return (
      <Lead>
        <View style={st.gap4}>
          {kicker(cap(name), live.label)}
          <Text style={t.title3}>{nothing ? `Start with ${name}` : `Nothing set for ${name} yet`}</Text>
          <Text style={t.subhead}>
            {`Pick up to ${NUMBER_WORDS[live.limit] ?? live.limit} things ${name} has to move.${nothing ? ' The rest of the ladder can wait.' : h.quarter.goals.length ? ' Each can serve a goal for this quarter.' : ''}`}
          </Text>
        </View>
        <Button label={nothing ? `Set ${name}` : 'Add a commitment'} kind="accent" onPress={add} icon={<Icon name="plus" size={18} color="#14161C" />} />
      </Lead>
    );
  }

  const open = live.commitments.filter((c) => c.status === 'active');
  if (!open.length) {
    const room = live.limit - live.commitments.length;
    const n = live.commitments.length;
    return (
      <Lead>
        <View style={st.gap4}>
          {kicker(cap(name), live.label)}
          <Text style={t.title3}>{n === 1 ? 'Done for the week' : `All ${NUMBER_WORDS[n] ?? n} done`}</Text>
          <Text style={t.subhead}>{`Everything you set for ${name} is done. The record keeps it.`}</Text>
        </View>
        {room > 0 ? <Button label="Add a commitment" kind="soft" onPress={add} /> : <Button label="See the record" kind="soft" onPress={nav.record} />}
      </Lead>
    );
  }

  const c = open.find((x) => x.id === pin) ?? rank(open)[0];
  const next = c.next;
  const manual = c.source.kind === 'manual';
  const state = c.state === 'not_started' ? 'Not started yet'
    : c.state === 'moving' ? (c.tasks.doneWeek ? `Moving, ${count(c.tasks.doneWeek, 'task')} done this week` : 'Moving')
      : `To move ${name}`;
  const stepDone = async () => {
    if (!next || busy) return;
    setPin(c.id); // the lead stays on this goal and shows its following step
    setBusy(true);
    try { await (next.kind === 'task' ? tickTask(next) : tickMilestone(next.id)); } finally { setBusy(false); }
  };
  return (
    <Lead>
      <Press label={`Open ${c.title}`} onPress={() => nav.goal(c.id)} scale={0.99} style={st.gap6}>
        {kicker(state, c.end ? daysLeftLabel(c.end) : null)}
        <Text style={t.title3}>{c.title}</Text>
        <Serves aspect={c.parent?.aspect ?? c.aspect} text={c.parent ? `Serves ${c.parent.title}` : 'Serves no bigger goal yet'} strong />
      </Press>
      {c.source.kind !== 'none' ? (
        <View style={st.gap8}>
          <GoalBar progress={progressOf(c, src)} time={c.time} color={colorOf(c.aspect, a.color)} />
          <Text style={[t.footnote, t.num]}>{goalLine(c, src, false)}</Text>
        </View>
      ) : null}
      <View style={st.step}>
        <Text style={t.footnote}>{next ? (c.state === 'not_started' ? 'Smallest next step' : next.kind === 'milestone' ? 'Next milestone' : 'Next step') : 'No next step yet'}</Text>
        <Text style={next ? t.headline : t.subhead}>{next ? next.title : 'Tie one of your tasks to it, or write the smallest step that moves it.'}</Text>
        {next?.due ? <Text style={[t.footnote, t.num]}>{`Due ${dueWords(next.due)}`}</Text> : null}
      </View>
      <View style={st.buttons}>
        {next ? (
          <>
            <Button label="Mark done" kind="accent" busy={busy} onPress={() => void stepDone()} icon={<Icon name="check" size={18} color="#14161C" />} wrap={ps.flex} />
            {manual ? <Button label="Log progress" kind="quiet" onPress={() => nav.progress(c)} /> : <Button label="Open goal" kind="quiet" onPress={() => nav.goal(c.id)} />}
          </>
        ) : manual ? (
          <>
            <Button label="Log progress" kind="accent" onPress={() => nav.progress(c)} wrap={ps.flex} />
            <Button label="Tie a task" kind="quiet" onPress={() => nav.tie(c.id)} />
          </>
        ) : (
          <>
            <Button label="Tie a task" kind="accent" onPress={() => nav.tie(c.id)} icon={<Icon name="plus" size={18} color="#14161C" />} wrap={ps.flex} />
            <Button label="Open goal" kind="quiet" onPress={() => nav.goal(c.id)} />
          </>
        )}
      </View>
    </Lead>
  );
}

// ── what waits on him ──
function Waiting({ h, review }: { h: HomeData; review: boolean }) {
  const nav = useNav();
  const n = h.stale.length;
  const rows = [];
  if (n) {
    rows.push(
      <Item key="stale" title={`${cap(count(n, 'goal'))} to close`} sub={n === 1 ? 'It ran past its end date' : 'They ran past their end dates'}
        left={<Disc><Icon name="calendar" size={16} color={C.textSoft} /></Disc>} onPress={nav.close}
        action={<Button label={n === 1 ? 'Close it' : 'Close them'} kind="soft" small onPress={nav.close} />} />,
    );
  }
  if (review) {
    rows.push(
      <Item key="review" title="Your weekly review" sub="Waiting in Growth to close the week"
        left={<Disc><Icon name="clock" size={16} color={C.textSoft} /></Disc>} onPress={() => openLink('growth/review')}
        action={<Button label="Open" kind="soft" small onPress={() => openLink('growth/review')} />} />,
    );
  }
  if (!rows.length) return null;
  return <Block title="Waiting on you"><Group inset={64}>{rows}</Group></Block>;
}

// ── the week ──
function WeekList({ h, live, src }: { h: HomeData; live: WeekBlock; src: Sources }) {
  const nav = useNav();
  if (!live.commitments.length) return null; // the lead already asks for the first one
  const room = Math.max(0, live.limit - live.commitments.length);
  return (
    <Block title={h.plan ? 'Next week' : 'This week'} sub={`${live.label}, ${live.done} of ${live.commitments.length} done`}>
      <Group inset={64}>
        {live.commitments.map((c) => <CommitRow key={c.id} c={c} src={src} />)}
        {room ? (
          <Item title="Add a commitment" sub={room === 1 ? 'Room for one more' : `Room for ${NUMBER_WORDS[room] ?? room} more`}
            left={<Disc><Icon name="plus" size={16} color={C.textSoft} /></Disc>} onPress={() => nav.add({ horizon: 'week', start: live.start })} />
        ) : null}
      </Group>
    </Block>
  );
}

/** One commitment: the ring closes it as done (Undo opens it again), the row opens the goal. */
function CommitRow({ c, src }: { c: Commitment; src: Sources }) {
  const a = useAspect();
  const nav = useNav();
  const done = c.status === 'done';
  const toggle = async () => {
    try {
      if (done) { await act('/reopen', { goal: c.id }); return true; }
      await act('/close', { goal: c.id, outcome: 'done' });
      haptic.success();
      undoable(`Done: ${c.title}`, () => act('/reopen', { goal: c.id }).then(() => {}).catch((e) => a.notice(message(e))));
      return true;
    } catch (e) { a.notice(message(e)); return false; }
  };
  const sub = done ? 'Done this week'
    : c.next ? `${c.state === 'not_started' ? 'Not started. Smallest step' : 'Next'}: ${c.next.title}` : 'No next step yet';
  const value = !done && c.source.kind !== 'none' && pctKnown(c, src) ? `${Math.round(progressOf(c, src) * 100)}%` : null;
  return (
    <TickRow done={done} onTick={toggle} tickLabel={done ? `Mark ${c.title} not done` : `Mark ${c.title} done`} title={c.title} sub={sub} value={value}
      color={colorOf(c.aspect, a.color)} onPress={() => nav.goal(c.id)} />
  );
}

/** Sunday: the week that ends today, read only. Growth's review closes it. */
function LastDays({ week }: { week: WeekBlock }) {
  const nav = useNav();
  return (
    <Block title="This week" sub={`Ends today, ${week.done} of ${week.commitments.length} done`}>
      <Group inset={36}>
        {week.commitments.map((c) => (
          <Item key={c.id} title={c.title} done={c.status === 'done'} left={<Dot aspect={c.aspect} />} onPress={() => nav.goal(c.id)}
            value={c.status === 'done' ? 'Done' : c.closing ? cap(c.closing.outcome === 'dropped' ? 'let go' : c.closing.outcome) : 'Open'} />
        ))}
      </Group>
    </Block>
  );
}

/** A move from Growth's sealed review. Keeping it makes it one of the week's commitments. */
function MoveCard({ m, week, name, reviewed }: { m: HandoffMove; week: WeekBlock; name: string; reviewed: string | null }) {
  const a = useAspect();
  const [busy, setBusy] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const open = week.commitments.filter((c) => c.status === 'active');
  const answer = async (keep: boolean, replaces?: string) => {
    setBusy(replaces ?? (keep ? 'keep' : 'skip'));
    try {
      const r = await act<{ goal: string | null }>(`/week/${week.key}/move`, {
        id: m.id, review: reviewed, text: m.text, aspect: m.aspect, serves: m.serves, carry: m.carry, accept: keep, replaces: replaces ?? null,
      });
      await call(`/mod/growth/moves/${encodeURIComponent(m.id)}`, keep ? { state: 'accepted', goal: r.goal } : { state: 'declined' });
      invalidate('/mod/growth/');
      if (keep) haptic.medium();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setFull(true); haptic.light(); } else a.notice(message(e));
    } finally { setBusy(null); }
  };
  return (
    <Group pad>
      <View style={st.gap4}>
        <Text style={t.footnote}>{m.carry ? 'Carried on from last week' : 'A move for the week'}</Text>
        <Text style={t.headline}>{m.text}</Text>
        {m.aspect && ASPECT_LABEL[m.aspect] ? <Serves aspect={m.aspect} text={ASPECT_LABEL[m.aspect]} /> : null}
      </View>
      {full ? (
        <View style={st.gap8}>
          <Text style={t.subhead}>{`${name} already holds ${NUMBER_WORDS[week.limit] ?? week.limit}. Keep this in place of one, and that one is let go with the reason kept.`}</Text>
          {open.map((c) => (
            <Tile key={c.id} title={c.title} color={colorOf(c.aspect, a.color)} nested selected={busy === c.id} onPress={() => void answer(true, c.id)} wrap={st.tileFull} />
          ))}
          <View style={st.buttons}>
            <Button label="Not this week" kind="quiet" small busy={busy === 'skip'} disabled={!!busy} onPress={() => answer(false)} />
            <Button label="Back" kind="quiet" small disabled={!!busy} onPress={() => setFull(false)} />
          </View>
        </View>
      ) : (
        <View style={st.buttons}>
          <Button label="Keep it" kind="soft" small busy={busy === 'keep'} disabled={!!busy} onPress={() => answer(true)} />
          <Button label="Not this week" kind="quiet" small busy={busy === 'skip'} disabled={!!busy} onPress={() => answer(false)} />
        </View>
      )}
    </Group>
  );
}

/** The one project that gets each day's first block. */
function FirstRow({ f }: { f: FirstBlock | null }) {
  const nav = useNav();
  const since = !f ? null : f.status === 'paused' ? 'parked, so the block is free for now' : f.inherited ? 'carried on from an earlier week' : f.since ? `since ${shortDay(dayOf(f.since))}` : null;
  return (
    <Block title="First block" sub="One project gets the first block of every day">
      <Group inset={36}>
        {f ? (
          <Item title={f.name} sub={[f.serves ? `Serves ${f.serves.title}` : 'Serves no goal yet', since].filter(Boolean).join(', ')}
            left={<Dot aspect={f.serves?.aspect ?? null} />} onPress={() => nav.openTab('projects')}
            action={<Button label="Switch" kind="quiet" small onPress={() => nav.first()} />} />
        ) : (
          <Item title="No project has it yet" sub="The rest wait their turn" action={<Button label="Pick" kind="soft" small onPress={() => nav.first()} />} />
        )}
      </Group>
    </Block>
  );
}

/** The quarter the week serves, each goal with its bar. */
function Quarter({ h, src }: { h: HomeData; src: Sources }) {
  const nav = useNav();
  const q = h.quarter;
  return (
    <Block title="This quarter" sub={`${q.label}, ${q.goals.length} of ${q.limit}`} action="All goals" onAction={() => nav.openTab('goals')}>
      <Group>
        {q.goals.length ? q.goals.map((g) => <GoalRow key={g.id} g={g} src={src} />) : (
          <Item title="Nothing set for this quarter" sub={`Room for ${NUMBER_WORDS[q.limit ?? 3] ?? q.limit}. A week goal can serve one.`}
            action={<Button label="Add" kind="soft" small onPress={() => nav.add({ horizon: 'quarter' })} />} />
        )}
      </Group>
    </Block>
  );
}

function RecordRow({ weeks }: { weeks: RecordWeek[] }) {
  const a = useAspect();
  const nav = useNav();
  const set = weeks.reduce((n, w) => n + w.set, 0), done = weeks.reduce((n, w) => n + w.done, 0);
  return (
    <Group>
      <Item title="The record" sub={set ? `${done} of ${set} done in eight weeks` : 'Set against done, week by week'} onPress={nav.record} chevron
        right={<WeekTicks weeks={weeks} color={a.color} />} />
    </Group>
  );
}

/** Eight weeks, each a column: how many were set (the track) and how many done (the fill). */
export function WeekTicks({ weeks, color }: { weeks: RecordWeek[]; color: string }) {
  const top = Math.max(3, ...weeks.map((w) => w.set));
  return (
    <View style={st.ticks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {weeks.map((w) => (
        <View key={w.key} style={st.tickCol}>
          <View style={[st.tickSet, { height: Math.max(3, (w.set / top) * 28) }]}>
            <View style={{ height: w.set ? `${(w.done / w.set) * 100}%` : 0, backgroundColor: w.now ? color : tint(color, 0.6), borderRadius: 2 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function NowSkeleton() {
  return (
    <View style={st.skeleton} accessibilityLabel="Loading Mission">
      <Skeleton height={280} radius={28} />
      <Skeleton height={18} width="40%" />
      <Skeleton height={180} radius={22} />
      <Skeleton height={72} radius={22} />
    </View>
  );
}

/** Sat to Tue, until Growth has sealed the review of the week just lived. */
function reviewWaiting(h: HomeData, hand: Handoff | null) {
  if (!hand || ![6, 7, 1, 2].includes(h.weekday)) return false;
  const now = h.record.weeks.findIndex((w) => w.now);
  const lived = h.weekday >= 6 ? h.week.key : h.record.weeks[now - 1]?.key;
  return !!lived && hand.reviewed !== lived;
}

/**
 * Growth's review closed some week goals as partly done or not done and left them open. Mission writes the outcome
 * once (as Growth's), so the clean-up never asks about them again. A goal he chose to carry waits for its move.
 */
function useClosedSync(h: HomeData | null, hand: Handoff | null) {
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!h || !hand) return;
    const open = new Set([...h.stale, ...h.week.commitments, ...(h.lastWeek?.open ?? [])].filter((g) => g.status === 'active' && !g.closing).map((g) => g.id));
    const waiting = new Set(hand.moves.items.filter((m) => m.state === 'offered' && m.carry).map((m) => m.carry));
    for (const c of hand.closed) {
      if (c.verdict === 'done' || !open.has(c.goal) || sent.current.has(c.goal) || (c.carry && waiting.has(c.goal))) continue;
      sent.current.add(c.goal);
      void call(`${M}/close`, { goal: c.goal, outcome: 'missed', partly: c.verdict === 'partly', by: 'growth' }).then(refresh).catch(() => {});
    }
  }, [h, hand]);
}

const st = StyleSheet.create({
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  step: { gap: 4, padding: 14, borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.06)' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileFull: { flexBasis: 'auto', flexGrow: 0 },
  ticks: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28, width: 84 },
  tickCol: { flex: 1, justifyContent: 'flex-end', height: 28 },
  tickSet: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden' },
  skeleton: { gap: 20 },
});
