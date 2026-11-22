import { useState } from 'react';
import { Text, View } from 'react-native';
import { C } from '@/theme';
import { api } from '@/lib/api';
import { call } from '@/lib/mod';
import {
  Bar, Button, Card, Empty, Failed, num, Press, Row, Screen, Section, shortDay, Skeleton, Spark, SP, SURF, t, tint, today, useAspect, weekLetter,
} from '@/aspects/kit';
import { agoDays, B, goalOf, planAgain, quickLog, useGym, useSession, type Gym, type HistoryRow } from '../api';
import { useNav } from '../nav';
import { List, s as u, useInnerWidth, useSeen } from '../ui';
import { setText } from './workout';

export function GymScreen({ open, onClose, title }: { open: boolean; onClose: () => void; title: string }) {
  const read = useGym(useSeen(open));
  const [detail, setDetail] = useState<string | null>(null);
  const { data, error, refresh } = read;
  return (
    <>
      <Screen open={open} onClose={onClose} title={title}>
        {!data && error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : null}
        {!data && !error ? <GymSkeleton /> : null}
        {data ? (
          <>
            <TodayCard g={data} />
            <QuickRow g={data} />
            <WeekStrip g={data} />
            <WeightCard g={data} />
            <Recovery g={data} />
            <Lifts g={data} />
            <History g={data} onOpen={setDetail} />
          </>
        ) : null}
      </Screen>
      <SessionDetail id={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function GymSkeleton() {
  return (
    <View style={u.gap16}>
      <Skeleton height={260} radius={24} />
      <Skeleton height={44} />
      <Skeleton height={88} radius={24} />
      <Skeleton height={160} radius={24} />
    </View>
  );
}

// ── today's session ──
function TodayCard({ g }: { g: Gym }) {
  const a = useAspect();
  const nav = useNav();
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState<'ai' | 'short' | null>(null);
  const s = g.session;
  const again = async (o: { minutes?: number }, k: 'ai' | 'short') => {
    setBusy(k);
    try {
      const r = await planAgain(o);
      a.notice(r.note ? r.note : r.by === 'rules' ? 'Planned by the rules.' : 'New plan ready.');
    } catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  if (g.trained.length && !s) {
    return (
      <Card tone={a.color} style={u.gap8}>
        <Text style={[t.label, { color: a.color }]}>Done today</Text>
        <Text style={t.title2}>{g.trained.map((x) => x.name).join(' and ')}</Text>
        <Text style={t.body}>{g.trained.map((x) => `${x.sets} sets${x.volume ? `, ${num(x.volume / 1000)} tonnes moved` : ''}`).join('. ')}</Text>
        {g.next ? <Text style={t.small}>{`Next: ${g.next.name}, ${shortDay(g.next.date)}`}</Text> : null}
      </Card>
    );
  }
  if (!s) {
    return (
      <Card style={u.gap12}>
        <Empty title="No session planned for today" body="Plan one from your recovery, or start an empty workout and add exercises as you go." />
        <View style={u.row}>
          <Button label="Plan today" kind="soft" busy={busy === 'ai'} onPress={() => { void again({}, 'ai'); }} wrap={u.flex} />
          <Button label="Empty workout" kind="quiet" onPress={() => { void nav.startWorkout(null); }} />
        </View>
      </Card>
    );
  }
  const live = g.sessionSource === 'live';
  return (
    <Card tone={a.color} style={u.gap16}>
      <View style={u.gap4}>
        <Text style={[t.label, { color: a.color }]}>{live ? 'In progress' : s.plan_by === 'rules' ? 'Today, planned by the rules' : 'Today, planned by Nora'}</Text>
        <Text style={t.title2}>{s.name}</Text>
        {s.why ? <Text style={t.body}>{s.why}</Text> : null}
        {s.reasons.length ? (
          <Press label={why ? 'Hide the reasons' : 'Why this plan'} onPress={() => setWhy(!why)} feel="tick" hitSlop={8} wrap={{ alignSelf: 'flex-start' }}>
            <Text style={[t.label, { color: a.color, paddingVertical: SP[8] }]}>{why ? 'Hide the reasons' : 'Why this plan'}</Text>
          </Press>
        ) : null}
        {why ? <View style={u.gap4}>{s.reasons.map((r, i) => <Text key={i} style={t.small}>{r}</Text>)}</View> : null}
      </View>
      <View style={u.gap8}>
        {s.items.map((it) => (
          <View key={it.ex} style={u.between}>
            <Text numberOfLines={1} style={[t.strong, u.flex]}>{it.name}</Text>
            <Text style={[t.label, t.num]}>{`${it.sets.length} × ${setText(it.kind, it.sets[0] ?? {}).replace('Pick a weight × ', '')}`}</Text>
          </View>
        ))}
        {s.items.some((it) => it.kind === 'weight' && it.prev == null) ? <Text style={t.caption}>First time on some of these: pick a weight you could lift two more times.</Text> : null}
      </View>
      <View style={u.gap8}>
        <Button label={live ? 'Resume workout' : 'Start workout'} kind="accent" onPress={() => { void nav.startWorkout(s); }} />
        {!live ? (
          <View style={u.row}>
            <Button label="Plan again" kind="quiet" small busy={busy === 'ai'} onPress={() => { void again({}, 'ai'); }} wrap={u.flex} />
            <Button label="Shorter" kind="quiet" small busy={busy === 'short'} onPress={() => { void again({ minutes: 30 }, 'short'); }} wrap={u.flex} />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// ── other training, one tap each ──
function QuickRow({ g }: { g: Gym }) {
  const a = useAspect();
  const nav = useNav();
  const [busy, setBusy] = useState<string | null>(null);
  const log = async (kind: string, min: number, name: string) => {
    setBusy(kind);
    try { await quickLog(kind, min); a.notice(`${name}, ${min} min logged`); }
    catch (e) { a.notice((e as Error).message); }
    setBusy(null);
  };
  const boxing = g.quick.find((q) => q.kind === 'boxing');
  return (
    <Section title="Other training" action="Other time" onAction={() => nav.openSheet({ kind: 'quick', quick: 'boxing' })}>
      <View style={u.wrap}>
        {g.quick.map((q) => (
          <Button key={q.kind} label={`${q.name}, ${q.min} min`} kind="quiet" small busy={busy === q.kind} onPress={() => { void log(q.kind, q.min, q.name); }} />
        ))}
      </View>
      <Text style={t.caption}>{`One tap logs it at your usual length; Other time changes the length or the day.${boxing && boxing.month ? ` Boxing this month: ${boxing.month}.` : ''}`}</Text>
    </Section>
  );
}

// ── this week ──
function WeekStrip({ g }: { g: Gym }) {
  const a = useAspect();
  return (
    <Section title="This week">
      <Card style={u.gap12}>
        <View style={u.between}>
          {g.week.days.map((d) => (
            <View key={d.d} style={{ alignItems: 'center', gap: SP[8] }} accessibilityLabel={`${shortDay(d.d)}: ${d.trained ? d.names.join(', ') : d.planned ? 'planned' : 'rest'}`}>
              <Text style={[t.caption, d.today && { color: C.text }]}>{weekLetter(d.d)}</Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                backgroundColor: d.trained ? a.color : 'transparent', borderWidth: d.trained ? 0 : 1.5, borderColor: d.today ? C.text : d.planned ? tint(a.color, 0.5) : SURF.line }} />
            </View>
          ))}
        </View>
        <Text style={t.small}>{`${g.week.count} of ${g.week.target} training days`}</Text>
      </Card>
    </Section>
  );
}

// ── weight ──
function WeightCard({ g }: { g: Gym }) {
  const nav = useNav();
  const w = useInnerWidth();
  const { weight } = g;
  const goal = goalOf(weight);
  return (
    <Section title="Weight">
      <Card style={u.gap12}>
        {weight.now == null ? (
          <Empty title="No weight yet" body="Weigh in once a week, same time of day, to see the trend." action="Weigh in" onAction={() => nav.openSheet({ kind: 'weigh' })} />
        ) : (
          <>
            <View style={u.between}>
              <View style={u.gap4}>
                <Text style={[t.title2, t.num]}>{`${num(weight.now)} kg`}</Text>
                <Text style={t.small}>{`${shortDay(weight.date!)}, ${agoDays(weight.days)}`}</Text>
              </View>
              <Button label="Weigh in" kind={(weight.days ?? 0) > 7 ? 'soft' : 'quiet'} small onPress={() => nav.openSheet({ kind: 'weigh' })} />
            </View>
            {weight.trail.length > 1 ? <Spark values={weight.trail.map((x) => x.v)} width={w} height={72} goal={goal ?? undefined} /> : null}
            {goal ? <Text style={t.caption}>{`Goal ${num(goal)} kg${typeof weight.goal === 'object' && weight.goal?.by && weight.goal.by >= today() ? ` by ${shortDay(weight.goal.by)}` : ''}. The dashed line.`}</Text> : null}
          </>
        )}
      </Card>
    </Section>
  );
}

// ── recovery ──
function Recovery({ g }: { g: Gym }) {
  const a = useAspect();
  const [all, setAll] = useState(false);
  const sorted = [...g.recovery].sort((x, y) => x.pct - y.pct);
  const tired = sorted.filter((m) => m.pct < 90);
  const shown = all ? sorted : tired.slice(0, 6);
  const fresh = async (m: string, name: string) => {
    try {
      const cur = await api<{ item?: { muscles?: Record<string, string> } }>(`${B}/settings/fresh`).catch(() => ({ item: undefined }));
      await call(`${B}/settings/fresh`, { id: 'fresh', muscles: { ...(cur.item?.muscles ?? {}), [m]: new Date().toISOString() }, updated_at: new Date().toISOString() }, 'PUT');
      a.notice(`${name} marked fresh`);
      void planAgain({ ai: false }).catch(() => {});
    } catch (e) { a.notice((e as Error).message); }
  };
  return (
    <Section title="Recovery" action={all ? 'Fewer' : 'All muscles'} onAction={() => setAll(!all)}>
      {shown.length === 0 ? <Card><Text style={t.body}>Every muscle is fresh. Train anything.</Text></Card> : (
        <List>
          {shown.map((m) => (
            <View key={m.m} style={[u.gap8, { paddingVertical: SP[12] }]}>
              <View style={u.between}>
                <Text style={t.strong}>{m.name}</Text>
                <Text style={[t.label, t.num]}>{m.pct >= 90 ? 'Fresh' : m.ready_in ? `${m.pct}%, ready in ${Math.max(1, Math.round(m.ready_in))} h` : `${m.pct}%`}</Text>
              </View>
              <Bar progress={m.pct / 100} height={6} color={m.pct >= 90 ? a.color : tint(a.color, 0.55)} />
              {m.pct < 90 ? (
                <Press label={`Mark ${m.name} fresh`} onPress={() => { void fresh(m.m, m.name); }} feel="tick" hitSlop={8} wrap={{ alignSelf: 'flex-start' }}>
                  <Text style={[t.label, { color: C.muted }]}>Feels fresh</Text>
                </Press>
              ) : null}
            </View>
          ))}
        </List>
      )}
    </Section>
  );
}

// ── lifts ──
function Lifts({ g }: { g: Gym }) {
  const [all, setAll] = useState(false);
  if (!g.lifts.length) return null;
  const shown = all ? g.lifts : g.lifts.slice(0, 5);
  return (
    <Section title="Lifts" action={g.lifts.length > 5 ? (all ? 'Fewer' : 'All') : undefined} onAction={() => setAll(!all)}>
      <List>
        {shown.map((l) => (
          <View key={l.ex} style={[u.row, { paddingVertical: SP[12] }]}>
            <View style={[u.flex, u.gap4]}>
              <Text numberOfLines={1} style={t.strong}>{l.name}</Text>
              <Text style={[t.small, t.num]}>{`Best ${l.kind === 'weight' ? `${l.set.w} kg × ${l.set.r}` : l.kind === 'time' ? `${l.set.t} s` : `${l.set.r} reps`}, ${shortDay(l.date)}`}</Text>
              {l.est ? <Text style={[t.caption, t.num]}>{`Estimated max ${num(l.est)} kg`}</Text> : null}
            </View>
            {l.trend.length > 1 ? <Spark values={l.trend} width={88} height={40} /> : null}
          </View>
        ))}
      </List>
    </Section>
  );
}

// ── history ──
function History({ g, onOpen }: { g: Gym; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const done = g.history.filter((h) => h.status === 'done');
  if (!done.length) return <Section title="History"><Card><Text style={t.body}>Finished workouts show here.</Text></Card></Section>;
  const shown = all ? done : done.slice(0, 6);
  return (
    <Section title="History" action={done.length > 6 ? (all ? 'Fewer' : 'All') : undefined} onAction={() => setAll(!all)}>
      <List>{shown.map((h) => <HistoryLine key={h.id} h={h} onOpen={onOpen} />)}</List>
    </Section>
  );
}
function HistoryLine({ h, onOpen }: { h: HistoryRow; onOpen: (id: string) => void }) {
  const parts = [h.minutes ? `${h.minutes} min` : null, h.sets ? `${h.sets} ${h.sets === 1 ? 'set' : 'sets'}` : null, h.records ? `${h.records} ${h.records === 1 ? 'record' : 'records'}` : null].filter(Boolean);
  return <Row title={h.name} sub={`${shortDay(h.date)}${parts.length ? `, ${parts.join(', ')}` : ''}`} chevron onPress={() => onOpen(h.id)} />;
}

function SessionDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const a = useAspect();
  const read = useSession(id);
  const d = read.data;
  return (
    <Screen open={!!id} onClose={onClose} title={d?.name ?? 'Session'}>
      {!d && read.error ? <Failed message={read.error} onRetry={() => { void read.refresh(); }} /> : null}
      {!d && !read.error ? <Skeleton height={240} radius={24} /> : null}
      {d ? (
        <>
          <View style={[u.row, { gap: SP[24] }]}>
            <Stat2 v={d.minutes != null ? String(d.minutes) : 'Not timed'} unit={d.minutes != null ? 'min' : ''} label={shortDay(d.date)} />
            <Stat2 v={String(d.sets)} unit="sets" label="Done" />
            {d.volume ? <Stat2 v={num(d.volume / 1000)} unit="t" label="Moved" /> : null}
          </View>
          {d.records.length ? (
            <Section title="Records">
              <List>{d.records.map((r, i) => <Row key={i} title={r.name} sub={r.was ? `Was ${setText('weight', r.was)}` : 'First time'} right={<Text style={[t.strong, t.num, { color: a.color }]}>{setText('weight', r.set)}</Text>} />)}</List>
            </Section>
          ) : null}
          {d.items.map((it) => (
            <Section key={it.ex} title={it.name}>
              <List>
                {it.sets.map((x, i) => (
                  <View key={i} style={[u.between, { minHeight: 44 }]}>
                    <Text style={[t.label, t.num]}>{`Set ${i + 1}`}</Text>
                    <Text style={[t.strong, t.num, x.pr && { color: a.color }]}>{setText(it.kind as never, x)}</Text>
                  </View>
                ))}
              </List>
            </Section>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
function Stat2({ v, unit, label }: { v: string; unit: string; label: string }) {
  return (
    <View style={u.gap4}>
      <View style={u.row}><Text style={[t.title2, t.num]}>{v}</Text>{unit ? <Text style={t.label}>{unit}</Text> : null}</View>
      <Text style={t.caption}>{label}</Text>
    </View>
  );
}
