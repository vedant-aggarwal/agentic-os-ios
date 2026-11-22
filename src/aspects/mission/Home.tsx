import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Card, CheckRing, Divider, Empty, Failed, haptic, Icon, Press, Row, Skeleton, SURF, shortDay, t, tint, useAspect,
} from '@/aspects/kit';
import { ApiError, call, invalidate, useGet, type Read } from '@/lib/mod';
import { C } from '@/theme';
import {
  act, ASPECT_LABEL, cap, count, daysLeftLabel, HANDOFF, M, message, NUMBER_WORDS, pctKnown, progressOf, refresh, sourceLine, useReadingSync, useSources,
  type Handoff, type HandoffMove, type Sources,
} from './data';
import { useNav } from './nav';
import { colorOf, Dot, GoalBar, Link, Rung, s as ps, Tag, Tile } from './parts';
import type { Commitment, FirstBlock, Goal, Home as HomeData, RecordWeek, WeekBlock } from './types';

/** Mission home: the line he lives by, then this quarter, this week and today's first block, nearer and larger. */
export function Home({ read }: { read: Read<HomeData> }) {
  const a = useAspect();
  const nav = useNav();
  const h = read.data;
  const hand = useGet<Handoff>(HANDOFF);
  const goals = useMemo(() => (h ? [...h.quarter.goals, ...h.week.commitments, ...(h.plan?.commitments ?? [])] : []), [h]);
  const src = useSources(goals);
  useReadingSync(goals, src);
  useClosedSync(h, hand.data);

  if (!h && read.error) return <Failed message={read.error} onRetry={read.refresh} />;
  if (!h) return <HomeSkeleton />;

  const live = h.plan ?? h.week; // the week being set: next week on Sunday, else this one
  const nothing = !h.purpose && !h.stale.length && !h.quarter.goals.length && !h.month.goals.length && !h.year.goals.length
    && !h.week.commitments.length && !h.plan?.commitments.length && !h.first;
  const review = reviewWaiting(h, hand.data);
  const moves = hand.data?.moves.week === live.key ? hand.data.moves.items.filter((m) => m.state === 'offered').slice(0, 3) : [];

  return (
    <>
      <PurposeLine h={h} />
      {nothing ? (
        <Card>
          <Empty title={`Start with ${h.plan ? 'next' : 'this'} week`} body={`Pick up to three things ${h.plan ? 'next' : 'this'} week has to move. The rest of the ladder can wait.`}
            action={`Set ${h.plan ? 'next' : 'this'} week`} onAction={() => nav.add({ horizon: 'week', start: live.start })} />
        </Card>
      ) : null}
      {h.stale.length ? <CleanUp h={h} /> : null}

      <View>
        <Rung label="This quarter" right={`${h.quarter.goals.length} of ${h.quarter.limit}`} onLabel={nav.ladder}>
          {h.quarter.goals.length ? h.quarter.goals.map((g) => <GoalLine key={g.id} g={g} s={src} />) : (
            <View style={st.emptyRung}>
              <Text style={t.small}>Nothing set for this quarter.</Text>
              <Link label="Add a quarter goal" onPress={() => nav.add({ horizon: 'quarter' })} />
            </View>
          )}
        </Rung>
        {h.plan && h.week.commitments.length ? <LastDays week={h.week} /> : null}
        <Rung label={h.plan ? 'Next week' : 'This week'} right={live.label} live>
          {review ? <ReviewLine /> : null}
          {moves.map((m) => <MoveCard key={m.id} m={m} week={live} name={h.plan ? 'Next week' : 'This week'} reviewed={hand.data?.reviewed ?? null} />)}
          {live.commitments.map((c) => <CommitCard key={c.id} c={c} s={src} />)}
          {Array.from({ length: Math.max(0, live.limit - live.commitments.length) }, (_, i) => (
            <Press key={i} label="Add a commitment" onPress={() => nav.add({ horizon: 'week', start: live.start })} style={st.slot}>
              <Icon name="plus" size={16} color={C.muted} />
              <Text style={t.label}>{i === 0 && !live.commitments.length ? 'Add the first commitment' : 'Add a commitment'}</Text>
            </Press>
          ))}
        </Rung>
        <Rung label="First block" last>
          <FirstCard f={h.first} />
        </Rung>
      </View>

      <View>
        <Row title="All goals" sub={cap(`${count(h.year.goals.length, 'goal')} this year, ${count(h.month.goals.length, 'goal')} this month`)} chevron onPress={nav.ladder} />
        <Divider />
        <Row title="Projects" chevron onPress={nav.projects}
          sub={cap(`${count(h.projects.running, 'project')} running, ${h.projects.parked ? `${count(h.projects.parked, 'project')} parked` : 'none parked'}`)} />
        <Divider />
        <Row title="The record" sub="Set against done, week by week" chevron onPress={nav.record} right={<WeekTicks weeks={h.record.weeks} color={a.color} />} />
      </View>
    </>
  );
}

function PurposeLine({ h }: { h: HomeData }) {
  const nav = useNav();
  if (!h.purpose) return <Link label="Write the line you live by" onPress={nav.purpose} />;
  return (
    <Press label={`Purpose: ${h.purpose.text}`} onPress={nav.purpose} scale={0.99} feel="tick">
      <Text style={[t.body, st.purpose]}>{h.purpose.text}</Text>
    </Press>
  );
}

function CleanUp({ h }: { h: HomeData }) {
  const a = useAspect();
  const nav = useNav();
  const n = h.stale.length;
  return (
    <Card tone={a.color} style={st.cleanup}>
      <Text style={t.strong}>{cap(count(n, 'goal'))} ran past {n === 1 ? 'its end date' : 'their end dates'}</Text>
      <Text style={t.small}>Close each with what happened. Done, missed, carried on or let go, it all stays on your record.</Text>
      <Button label="Close them" kind="soft" small onPress={nav.close} wrap={st.left} />
    </Card>
  );
}

/** A goal with its bar, the time gone, and where its number came from. */
export function GoalLine({ g, s }: { g: Goal; s: Sources }) {
  const a = useAspect();
  const nav = useNav();
  const p = progressOf(g, s);
  return (
    <Press label={g.title} onPress={() => nav.goal(g.id)} scale={0.98} style={st.goalLine}>
      <View style={st.goalHead}>
        <Dot aspect={g.aspect} top={8} />
        <Text numberOfLines={3} style={[t.strong, ps.flex]}>{g.title}</Text>
      </View>
      <GoalBar progress={p} time={g.time} color={colorOf(g.aspect, a.color)} />
      <Text numberOfLines={2} style={[t.caption, t.num]}>
        {g.source.kind === 'none' ? 'No number yet' : pctKnown(g, s) ? `${Math.round(p * 100)}%, ${lower(sourceLine(g, s))}` : sourceLine(g, s)}
        {g.end && g.status === 'active' ? `. ${daysLeftLabel(g.end)}` : ''}
      </Text>
    </Press>
  );
}
const lower = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);

/** One of this week's commitments: what it serves, how it stands, and the next step. The ring marks it done. */
export function CommitCard({ c, s }: { c: Commitment; s: Sources }) {
  const a = useAspect();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const done = c.status === 'done';
  const tone = colorOf(c.aspect, a.color);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (done) await act('/reopen', { goal: c.id });
      else { await act('/close', { goal: c.id, outcome: 'done' }); haptic.success(); }
    } catch (e) { a.notice(message(e)); } finally { setBusy(false); }
  };
  const state = done ? 'Done' : c.state === 'moving' ? (c.tasks.doneWeek ? `Moving, ${count(c.tasks.doneWeek, 'task')} done this week` : 'Moving')
    : c.state === 'not_started' ? 'Not started yet' : c.next ? 'Next step' : 'No next step yet';
  const p = progressOf(c, s);
  // the ring and the body are side by side, not nested, so each is its own control
  return (
    <View style={[st.card, st.commitHead]}>
      <Press label={done ? `Mark ${c.title} not done` : `Mark ${c.title} done`} role="checkbox" state={{ checked: done }} onPress={toggle}
        feel="none" hitSlop={10}>
        <CheckRing done={done} color={tone} size={28} />
      </Press>
      <Press label={`${c.title}, ${state}`} onPress={() => nav.goal(c.id)} scale={0.98} wrap={ps.flex} style={st.commit}>
        <View style={st.commitText}>
          <Text numberOfLines={3} style={[t.lead, done && { color: C.muted }]}>{c.title}</Text>
          <Tag aspect={c.parent?.aspect ?? c.aspect} text={c.parent ? `Serves ${c.parent.title}` : 'Serves no bigger goal yet'} />
        </View>
        {!done && c.source.kind !== 'none' && c.source.kind !== 'tasks' ? <GoalBar progress={p} time={c.time} color={tone} height={4} /> : null}
        {done ? null : (
          <View style={st.next}>
            <Text style={[t.label, c.state === 'moving' && { color: tone }]}>{state}</Text>
            {c.next ? (
              <View style={st.nextRow}>
                <Icon name="right" size={14} color={C.faint} />
                <Text numberOfLines={2} style={[t.body, ps.flex]}>
                  {c.state === 'not_started' ? `Smallest next step: ${c.next.title}` : c.next.title}
                </Text>
              </View>
            ) : <Text style={t.small}>Open it to add a milestone or a task.</Text>}
          </View>
        )}
      </Press>
    </View>
  );
}

/** Sunday: the week that ends today, read only. Growth's review closes it. */
function LastDays({ week }: { week: WeekBlock }) {
  return (
    <Rung label="This week" right={`${week.done} of ${week.commitments.length} done`}>
      {week.commitments.map((c) => (
        <View key={c.id} style={st.past}>
          <Dot aspect={c.aspect} />
          <Text numberOfLines={1} style={[t.small, ps.flex, c.status === 'done' && { color: C.textSoft }]}>{c.title}</Text>
          <Text style={t.caption}>{c.status === 'done' ? 'Done' : c.closing ? cap(c.closing.outcome === 'dropped' ? 'let go' : c.closing.outcome) : 'Open'}</Text>
        </View>
      ))}
    </Rung>
  );
}

function ReviewLine() {
  const a = useAspect();
  return (
    <View style={st.review}>
      <Text style={t.small}>Your weekly review is waiting in Growth. It closes the week and suggests what comes next.</Text>
      <Link label="Open Growth" onPress={() => a.openAspect('growth')} />
    </View>
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
    <View style={st.move}>
      <Text style={t.caption}>{m.carry ? 'From your weekly review, carried on' : 'From your weekly review'}</Text>
      <Text style={t.strong}>{m.text}</Text>
      {m.aspect && ASPECT_LABEL[m.aspect] ? <Tag aspect={m.aspect} text={ASPECT_LABEL[m.aspect]} /> : null}
      {full ? (
        <View style={st.replace}>
          <Text style={t.small}>{`${name} already holds ${NUMBER_WORDS[week.limit] ?? week.limit}. Keep this in place of one, and that one is let go with the reason kept.`}</Text>
          {open.map((c) => (
            <Tile key={c.id} title={c.title} color={colorOf(c.aspect, a.color)} nested selected={busy === c.id} onPress={() => void answer(true, c.id)} wrap={st.replaceTile} />
          ))}
          <View style={st.moveButtons}>
            <Button label="Not this week" kind="quiet" small busy={busy === 'skip'} disabled={!!busy} onPress={() => answer(false)} />
            <Button label="Back" kind="quiet" small disabled={!!busy} onPress={() => setFull(false)} />
          </View>
        </View>
      ) : (
        <View style={st.moveButtons}>
          <Button label="Keep it" kind="soft" small busy={busy === 'keep'} disabled={!!busy} onPress={() => answer(true)} />
          <Button label="Not this week" kind="quiet" small busy={busy === 'skip'} disabled={!!busy} onPress={() => answer(false)} />
        </View>
      )}
    </View>
  );
}

/** The one project that gets each day's first block. */
function FirstCard({ f }: { f: FirstBlock | null }) {
  const nav = useNav();
  if (!f) {
    return (
      <View style={st.emptyRung}>
        <Text style={t.small}>One project gets the first block of every day. The rest wait their turn.</Text>
        <Button label="Pick the project" kind="soft" small onPress={() => nav.first()} wrap={st.left} />
      </View>
    );
  }
  return (
    <Card style={st.first}>
      <View style={st.firstHead}>
        <View style={st.commitText}>
          <Text numberOfLines={2} style={t.lead}>{f.name}</Text>
          <Tag aspect={f.serves?.aspect ?? null} text={f.serves ? `Serves ${f.serves.title}` : 'Serves no goal yet'} />
        </View>
        <Button label="Switch" kind="quiet" small onPress={() => nav.first()} />
      </View>
      <Text style={t.caption}>
        {f.status === 'paused' ? 'Parked, so the block is free for now' : f.inherited ? 'Carried on from an earlier week' : f.since ? `Since ${shortDay(f.since.slice(0, 10))}` : 'This week'}
        {f.why ? `. ${cap(f.why)}` : ''}
      </Text>
    </Card>
  );
}

/** Eight weeks, each a column: how many were set (the track) and how many done (the fill). */
function WeekTicks({ weeks, color }: { weeks: RecordWeek[]; color: string }) {
  const top = Math.max(3, ...weeks.map((w) => w.set));
  const set = weeks.reduce((n, w) => n + w.set, 0), done = weeks.reduce((n, w) => n + w.done, 0);
  return (
    <View style={st.ticks} accessible accessibilityLabel={`${done} done of ${set} set in eight weeks`}>
      {weeks.map((w) => (
        <View key={w.key} style={st.tickCol}>
          <View style={[st.tickSet, { height: Math.max(2, (w.set / top) * 24) }]}>
            <View style={{ height: w.set ? `${(w.done / w.set) * 100}%` : 0, backgroundColor: w.now ? color : tint(color, 0.6), borderRadius: 2 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={st.skeleton} accessibilityLabel="Loading Mission">
      <Skeleton height={20} width="80%" />
      <Skeleton height={96} radius={24} />
      <Skeleton height={20} width="40%" />
      <Skeleton height={148} radius={24} />
      <Skeleton height={148} radius={24} />
      <Skeleton height={72} radius={24} />
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
  purpose: { color: C.textSoft },
  cleanup: { gap: 8 },
  left: { alignSelf: 'flex-start', marginTop: 4 },
  emptyRung: { gap: 8 },
  goalLine: { gap: 8, paddingVertical: 4 },
  goalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  card: { borderRadius: 24, borderCurve: 'continuous', padding: 16, backgroundColor: SURF.card, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line },
  commit: { gap: 12 },
  commitHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  commitText: { flex: 1, minWidth: 0, gap: 4 },
  next: { gap: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SURF.line },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 2 },
  slot: {
    minHeight: 56, borderRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  past: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  review: { gap: 4, padding: 16, borderRadius: 24, borderCurve: 'continuous', backgroundColor: SURF.row },
  move: { gap: 8, padding: 16, borderRadius: 24, borderCurve: 'continuous', backgroundColor: SURF.row, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.line },
  moveButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  replace: { gap: 8, marginTop: 4 },
  replaceTile: { flexBasis: 'auto', flexGrow: 0 },
  first: { gap: 8 },
  firstHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ticks: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 24, width: 92 },
  tickCol: { flex: 1, justifyContent: 'flex-end', height: 24 },
  tickSet: { backgroundColor: SURF.raised, borderRadius: 2, justifyContent: 'flex-end', overflow: 'hidden' },
  skeleton: { gap: 24 },
});
