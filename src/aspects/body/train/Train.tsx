import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import {
  Block, Button, Failed, Glyph, Group, haptic, Item, Lead, num, QuickAction, Sheet, shortDay, Skeleton, Tag, t, undoable, useAspect, WeekStrip, type DayMark,
} from '@/aspects/kit';
import { dayAhead, streakWords, trainedWords } from '@/lib/body';
import { agoDays, goalOf, planAgain, quickLog, removeDoc, useGym, type Gym, type HistoryRow } from '../api';
import { useNav } from '../nav';
import { minutesFor, s as u, Trend, volumeText } from '../parts';
import { BodyMap } from './BodyMap';
import { Measurements, Rotation } from './More';

// Train: the gym, done properly. Today's session with its reasons, other training in one tap, the week, recovery on
// a figure, records per lift, and every session he has done.

const QUICK_ICON: Record<string, [string, string]> = {
  boxing: ['figure.boxing', 'M7 10a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-1v3H9v-3a2 2 0 0 1-2-2v-3z'],
  run: ['figure.run', 'M13 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l2-6 3 2v4M7 12l3-4 4 1 3 3M12 15l-2-3'],
  walk: ['figure.walk', 'M12 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l1.5-6 2.5 2v4M9 11l2-3 3 1 2 3M11.5 15L11 10'],
  cycle: ['figure.outdoor.cycle', 'M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15l4-6h5l3 6M10 9l2 6'],
};

export function TrainTab({ active }: { active: boolean }) {
  const read = useGym(active);
  const { data: g, error, refresh } = read;
  if (!g) return error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : <TrainSkeleton />;
  return (
    <>
      <Session g={g} />
      <Quick g={g} />
      <Week g={g} />
      <Rotation active={active} />
      <Recovery g={g} />
      <Records g={g} />
      <History g={g} />
      <BodyWeight g={g} />
      <Measurements active={active} />
    </>
  );
}

function TrainSkeleton() {
  return (
    <View style={u.gap16}>
      <Skeleton height={340} radius={28} />
      <Skeleton height={96} />
      <Skeleton height={240} radius={22} />
    </View>
  );
}

// ── today's session ──
function Session({ g }: { g: Gym }) {
  const a = useAspect();
  const nav = useNav();
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState<'again' | 'short' | null>(null);
  const s0 = g.session;
  const again = async (o: { minutes?: number }, k: 'again' | 'short') => {
    setBusy(k);
    try { const r = await planAgain(o); a.notice(r.by === 'rules' ? 'Planned again by the rules' : 'Planned again'); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  if (g.sessionSource === 'live' && s0) {
    const done = s0.items.reduce((n, it) => n + it.sets.filter((x) => x.done).length, 0);
    return (
      <Lead>
        <Tag label="In progress" tone="aspect" />
        <Text style={t.large}>{s0.name}</Text>
        <Text style={[t.subhead, t.num]}>{`${done} ${done === 1 ? 'set' : 'sets'} done so far`}</Text>
        <Button label="Resume workout" kind="accent" onPress={() => nav.openFlow({ kind: 'live' })} />
      </Lead>
    );
  }
  // the server's one answer for today (the same as Home's gym card and Body's Today); an older server leaves it out
  const state = g.state ?? (g.trained.length ? 'done' : s0 ? 'planned' : 'rest');
  if (state === 'done' || !s0) {
    const trained = g.trained;
    const next = g.next && g.next.date > g.today ? g.next : null;
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>{trained.length ? 'Trained today' : 'No session planned'}</Text>
        {trained.length ? trained.map((x) => (
          <Text key={x.id} style={t.title3}>{`${x.name}, ${trainedWords(x)}${!x.quick && x.volume ? `, ${volumeText(x.volume)}` : ''}`}</Text>
        )) : <Text style={t.title3}>{next ? `Next: ${next.name}, ${dayAhead(next.date, g.today)}` : 'A free day'}</Text>}
        {trained.length && next ? <Text style={t.subhead}>{`Next: ${next.name}, ${dayAhead(next.date, g.today)}`}</Text> : null}
        {/* today's plan is still there after a quick log or another session: start it if he still wants it */}
        {trained.length && s0 ? (
          <Item title={`${s0.name} is still planned for today`} sub={`${s0.items.length} exercises`} style={s.pending}
            action={<Button label="Start" kind="soft" small onPress={() => { void nav.startWorkout(s0); }} />} />
        ) : null}
        <View style={u.row}>
          <Button label="Empty workout" kind={trained.length ? 'quiet' : 'accent'} onPress={() => { void nav.startWorkout(null); }} wrap={u.flex} />
          {!trained.length ? <Button label="Plan one" kind="quiet" busy={busy === 'again'} onPress={() => { void again({}, 'again'); }} /> : null}
        </View>
      </Lead>
    );
  }
  const sets = s0.items.reduce((n, it) => n + Math.max(1, it.sets.length), 0);
  return (
    <>
      <Lead>
        <View style={u.between}>
          <Text style={[t.footnote, { color: a.color }]}>{s0.plan_by === 'rules' ? 'Today, planned by the rules' : 'Today, planned by Nora'}</Text>
          <Text style={[t.footnote, t.num]}>{`${sets} ${sets === 1 ? 'set' : 'sets'}, about ${minutesFor({ items: s0.items.map((it) => ({ ex: it.ex, name: it.name, sets: it.sets.length, target: it.target, note: it.note })) })} min`}</Text>
        </View>
        <View style={u.gap4}>
          <Text style={t.large}>{s0.name}</Text>
          {s0.why ? <Text style={t.subhead}>{s0.why}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Why ${s0.name} today`} hitSlop={12} onPress={() => { haptic.light(); setWhy(true); }} style={({ pressed }) => [s.whyLink, pressed && s.dim]}>
            <Text style={[t.subhead, { color: a.color }]}>Why this plan</Text>
          </Pressable>
        </View>
        <View style={s.planList}>
          {s0.items.map((it, i) => {
            const tg = it.target ?? {};
            const target = it.kind === 'time' ? `${it.sets.length} × ${tg.t ?? 45} s` : it.kind === 'cardio' ? `${tg.min ?? 20} min` : `${it.sets.length} × ${tg.r ?? 10}${tg.w ? ` at ${num(tg.w)} kg` : ''}`;
            const last = it.prev?.sets?.[0];
            return (
              <Item key={`${it.ex}-${i}`} title={it.name} style={s.planRow} onPress={() => nav.openDetail({ kind: 'exercise', ex: it.ex })}
                sub={last ? `Last ${shortDay(it.prev!.date)}: ${last.w != null ? `${num(last.w)} kg × ${last.r ?? 0}` : last.t != null ? `${last.t} s` : `${last.r ?? 0} reps`}` : 'First time: pick a weight you could lift two more times'}
                value={target} />
            );
          })}
        </View>
        <Button label="Start workout" kind="accent" onPress={() => { void nav.startWorkout(s0); }} />
        <View style={u.row}>
          <Button label="Shorter" kind="quiet" small busy={busy === 'short'} onPress={() => { void again({ minutes: 30 }, 'short'); }} wrap={u.flex} />
          <Button label="Plan again" kind="quiet" small busy={busy === 'again'} onPress={() => { void again({}, 'again'); }} wrap={u.flex} />
        </View>
      </Lead>
      <Sheet open={why} onClose={() => setWhy(false)} title={`Why ${s0.name} today`}>
        {s0.why ? <Text style={t.subhead}>{s0.why}</Text> : null}
        <Group>{(s0.reasons.length ? s0.reasons : ['Recovery and your rotation chose it.']).map((r, i) => <Item key={i} title={r} lines={3} />)}</Group>
        <Text style={t.footnote}>{g.readiness.score != null ? `Readiness ${g.readiness.score}, ${g.readiness.word.toLowerCase()}${g.readiness.partial ? ' (partly measured)' : ''}.` : 'Readiness is not measured today.'}</Text>
      </Sheet>
    </>
  );
}

// ── other training: one tap ──
function Quick({ g }: { g: Gym }) {
  const a = useAspect();
  const nav = useNav();
  const log = async (kind: string, name: string, min: number) => {
    try {
      const r = await quickLog(kind, min);
      undoable(`${name}, ${min} min logged`, () => { void removeDoc('workouts', r.item.id); });
    } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <Block title="Other training" sub="One tap logs it. Hold to change the minutes.">
      <View style={s.quick}>
        {g.quick.map((q) => {
          const [sf, d] = QUICK_ICON[q.kind] ?? QUICK_ICON.walk;
          return (
            <QuickAction key={q.kind} label={`${q.name}`} sub={q.week ? `${q.week} this week` : `${q.min} min`} active={q.week > 0}
              icon={<Glyph sf={sf as never} d={d} size={22} color={q.week ? a.color : C.textSoft} />}
              onPress={() => { void log(q.kind, q.name, q.min); }} onLongPress={() => nav.openSheet({ kind: 'quick', quick: q.kind })} />
          );
        })}
      </View>
    </Block>
  );
}

// ── this week ──
/**
 * The week: each day trained, planned or missed, the count against his target and the streak. Body's Today shows this
 * same block (from the same read), and Home's gym card the same count and streak.
 */
export function Week({ g }: { g: Gym }) {
  const nav = useNav();
  const days = g.week.days.map((d) => ({
    day: d.d, today: d.today, label: `${d.d}, ${d.trained ? d.names.join(' and ') : d.planned ? 'planned' : d.missed ? 'missed' : 'rest'}`,
    mark: (d.trained ? 'done' : d.planned ? 'planned' : d.missed ? 'missed' : 'none') as DayMark,
  }));
  const trainedNames = g.week.days.filter((d) => d.trained).flatMap((d) => d.names);
  const streak = streakWords(g.week.streak);
  return (
    <Block title="This week" sub={streak} right={<Text style={[t.subhead, t.num, { color: C.muted }]}>{`${g.week.count} of ${g.week.target} days`}</Text>}>
      <Group pad>
        <WeekStrip days={days} onPress={(d) => { const h = g.history.find((x) => x.date === d); if (h) nav.openDetail({ kind: 'session', id: h.id }); }} />
        {trainedNames.length ? <Text style={t.footnote} numberOfLines={2}>{trainedNames.join(', ')}</Text> : <Text style={t.footnote}>Nothing logged yet this week.</Text>}
      </Group>
    </Block>
  );
}

// ── recovery ──
function Recovery({ g }: { g: Gym }) {
  const tired = g.recovery.filter((m) => m.pct < 70);
  return (
    <Block title="Recovery" sub="The more colour, the harder and more recently it worked.">
      <Group>
        <View style={s.map}><BodyMap muscles={g.recovery} /></View>
        {tired.length ? tired.slice(0, 4).map((m) => (
          <Item key={m.m} title={m.name} sub={m.ready_in ? `Ready in about ${m.ready_in} h` : 'Ready soon'} value={`${m.pct}%`} />
        )) : <Item title="Everything is recovered" sub="Any session is fine today." />}
      </Group>
    </Block>
  );
}

// ── records ──
function Records({ g }: { g: Gym }) {
  const nav = useNav();
  const [all, setAll] = useState(false);
  if (!g.lifts.length) {
    return (
      <Block title="Records">
        <Group><Item title="No lifts logged yet" sub="Your best set for each lift shows here after the first session." /></Group>
      </Block>
    );
  }
  const shown = all ? g.lifts : g.lifts.slice(0, 5);
  return (
    <Block title="Records" action={g.lifts.length > 5 ? (all ? 'Fewer' : `All ${g.lifts.length}`) : undefined} onAction={() => setAll(!all)}>
      <Group>
        {shown.map((l) => (
          <Item key={l.ex} title={l.name} onPress={() => nav.openDetail({ kind: 'exercise', ex: l.ex })} chevron
            sub={`${l.set.w != null ? `${num(l.set.w)} kg × ${l.set.r ?? 0}` : l.set.t != null ? `${l.set.t} s` : `${l.set.r ?? 0} reps`}, ${agoDays(daysFrom(l.date, g.today))}`}
            right={(
              <View style={s.recRight}>
                <View style={s.recSpark}><Trend values={l.trend} height={24} minSpan={l.kind === 'weight' ? 10 : 4} /></View>
                {l.est ? <Text style={[t.footnote, t.num]}>{`${num(l.est)} kg max`}</Text> : null}
              </View>
            )} />
        ))}
      </Group>
    </Block>
  );
}
const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

// ── history ──
function History({ g }: { g: Gym }) {
  const nav = useNav();
  const [all, setAll] = useState(false);
  if (!g.history.length) return null;
  const shown = all ? g.history : g.history.slice(0, 6);
  return (
    <Block title="History" action={g.history.length > 6 ? (all ? 'Fewer' : 'All') : undefined} onAction={() => setAll(!all)}>
      <Group>{shown.map((h) => <HistoryLine key={h.id} h={h} today={g.today} onOpen={() => nav.openDetail({ kind: 'session', id: h.id })} />)}</Group>
    </Block>
  );
}
function HistoryLine({ h, today, onOpen }: { h: HistoryRow; today: string; onOpen: () => void }) {
  const bits = h.quick ? [`${h.minutes ?? 0} min`] : [trainedWords(h), h.volume ? volumeText(h.volume) : null, h.minutes ? `${h.minutes} min` : null].filter(Boolean);
  return (
    <Item title={h.status === 'skipped' ? `${h.name}, skipped` : h.name} sub={`${dayWord(h.date, today)}, ${bits.join(', ')}`} onPress={onOpen} chevron
      right={h.records ? <Tag label={h.records === 1 ? 'Record' : `${h.records} records`} tone="aspect" /> : undefined} />
  );
}
const dayWord = (d: string, today: string) => { const n = daysFrom(d, today); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? `${n} days ago` : shortDay(d); };

// ── body weight ──
function BodyWeight({ g }: { g: Gym }) {
  const nav = useNav();
  const w = g.weight;
  const goal = goalOf(w);
  return (
    <Block title="Body weight" action="Weigh in" onAction={() => nav.openSheet({ kind: 'weigh' })}>
      <Group>
        <Item title={w.now != null ? `${num(w.now)} kg` : 'Not weighed yet'} titleStyle={t.title3}
          sub={w.date ? `${agoDays(w.days)}${goal ? `, goal ${num(goal)} kg` : ''}` : 'One tap from the last value, every few days.'}
          onPress={() => nav.openDetail({ kind: 'weight' })} chevron
          right={w.trail.length > 1 ? <View style={s.weightSpark}><Trend values={w.trail.map((x) => x.v)} minSpan={5} height={36} goal={goal ?? undefined} /></View> : undefined} />
      </Group>
    </Block>
  );
}

const s = StyleSheet.create({
  planList: { marginHorizontal: -16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  planRow: { minHeight: 56 },
  pending: { marginHorizontal: -16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  quick: { flexDirection: 'row', gap: 8 },
  whyLink: { alignSelf: 'flex-start', paddingTop: 4 },
  dim: { opacity: 0.6 },
  map: { paddingVertical: 16, alignItems: 'center' },
  recRight: { alignItems: 'flex-end', gap: 2, width: 96 },
  recSpark: { width: 88, height: 24, flexDirection: 'row' },
  weightSpark: { width: 120, height: 36, flexDirection: 'row' },
});
