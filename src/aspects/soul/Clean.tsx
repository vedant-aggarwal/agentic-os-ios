import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ago, Bar, Button, Card, Divider, Failed, haptic, Loading, Row, Screen, Section, Sheet, Skeleton, Stepper, t, useAspect,
} from '@/aspects/kit';
import { call, newId, useCollection, type Read } from '@/lib/mod';
import { C } from '@/theme';
import {
  errText, refreshClean, rememberKit, send, useNow, type CleanNow, type CleanRec, type Plan, type PatternOut, type Reading,
} from './data';
import { Choice, DayDots, Fig, Gl, Hours, Lines, pct, plural } from './parts';
import { PlanList, PlanSheet, planLine } from './Plans';
import { ACTION_BANK, BEFORE, LEVELS, PLACES } from './words';

type On = Extract<CleanNow, { setup: true }>;

/** "12 days 4 h 33 min" since an instant. */
function since(at: string, now: number) {
  const min = Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return `${d ? `${plural(d, 'day')} ` : ''}${h} h ${m} min`;
}

/**
 * The Clean screen: Day N live, the numbers that survive a slip, the last 13 weeks, the next milestone, quick logs,
 * his reasons and his list, the hours his urges come, the AI reading with plans, and the log.
 */
export function Clean({ open, onClose, now, onMoment, onSlip }: {
  open: boolean; onClose: () => void; now: Read<CleanNow>; onMoment: () => void; onSlip: () => void;
}) {
  const d = now.data;
  return (
    <Screen open={open} onClose={onClose} title="Clean">
      {!d && now.error ? <Failed message={now.error} onRetry={now.refresh} /> : null}
      {!d && !now.error ? <Sk /> : null}
      {d && !d.setup ? <Setup reasons={d.reasons} /> : null}
      {d && d.setup ? <Live d={d} open={open} onMoment={onMoment} onSlip={onSlip} /> : null}
    </Screen>
  );
}

function Sk() {
  return (
    <View style={{ gap: 16 }}>
      <Skeleton height={120} radius={24} />
      <Skeleton height={48} radius={24} />
      <Skeleton height={140} radius={24} />
      <Skeleton height={96} radius={24} />
    </View>
  );
}

// ── before he starts ────────────────────────────────────────────────────────────────────────────────────────────
function Setup({ reasons: initial }: { reasons: string[] }) {
  const { notice, color } = useAspect();
  const clean = useCollection<CleanRec>('soul', 'clean');
  const [days, setDays] = useState(0);
  const [reasons, setReasons] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const at = new Date(Date.now() - days * 86_400_000).toISOString();
      const st = await call<CleanNow>('/mod/soul/clean/start', { at });
      await clean.refresh();
      const rec = (clean.items ?? []).find((r) => r.id === 'clean') ?? (clean.items ?? [])[0];
      if (rec && reasons.length) await clean.patch(rec.id, { reasons });
      rememberKit({ ...st, reasons } as CleanNow);
      haptic.success();
      refreshClean();
    } catch (e) { notice(errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <View style={{ gap: 8 }}>
        <Text style={[t.title2, { color }]}>Start your count</Text>
        <Text style={t.body}>Day 1 starts when you say. A slip later moves only the current run: every day you kept stays counted, and so does your longest run.</Text>
      </View>
      <Section title="Days already behind you">
        <Stepper label="Days already kept" value={days} onChange={setDays} min={0} max={365} format={(v) => (v ? plural(v, 'day') : 'Start now')} />
      </Section>
      <Section title="Why you're doing this">
        <Text style={t.small}>In your own words. They show in a rough moment and on milestones. You can add them later.</Text>
        <Lines items={reasons} onChange={setReasons} placeholder="A reason" />
      </Section>
      <Button label="Start" kind="accent" onPress={start} busy={busy} />
    </>
  );
}

// ── the running count ───────────────────────────────────────────────────────────────────────────────────────────
function Live({ d, open, onMoment, onSlip }: { d: On; open: boolean; onMoment: () => void; onSlip: () => void }) {
  const a = useAspect();
  const { color, notice } = a;
  const clock = useNow(60_000, open && a.open);
  const clean = useCollection<CleanRec>('soul', 'clean');
  const rec = (clean.items ?? []).find((r) => r.id === 'clean') ?? (clean.items ?? []).find((r) => r.active !== false) ?? null;
  const [urgeOpen, setUrgeOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plan, setPlan] = useState<Partial<Plan> | null>(null);

  useEffect(() => { rememberKit(d); }, [d]);

  const pledge = async () => {
    haptic.success();
    const r = await send({ id: `pledge:${d.today}`, method: 'POST', path: '/mod/soul/clean/pledge', body: { at: new Date().toISOString() } });
    if (r === 'queued') notice('Saved on this phone. It goes to the PC when it can.');
  };
  const saveList = async (field: 'reasons' | 'actions', v: string[]) => {
    if (!rec) return notice('Still loading. Try again in a moment.');
    try { await clean.patch(rec.id, { [field]: v }); refreshClean(); } catch (e) { notice(errText(e)); }
  };

  const m = d.milestone;
  const reason = d.reasons.length ? d.reasons[d.day % d.reasons.length] : null;
  const top = d.windows[0];

  return (
    <>
      <View style={s.hero}>
        <Text accessibilityRole="header" style={[t.display, t.num, { color }]}>Day {d.day}</Text>
        <Text style={[t.label, t.num]}>{since(d.since, clock)}</Text>
        {d.pledged ? (
          <Text style={t.small}>Promised for today.</Text>
        ) : (
          <Button label="Promise today" kind="soft" small onPress={pledge} wrap={s.self} />
        )}
      </View>

      <Button label="Rough moment" kind="accent" onPress={onMoment} icon={<Gl k="wind" size={18} color="#14161C" />} />

      {m.reached?.today ? (
        <Card tone={color}>
          <Text style={[t.title2, { color }]}>{plural(m.reached.days, 'day')}.</Text>
          {reason ? <Text style={[t.lead, s.gap4]}>You said: {reason}</Text> : null}
        </Card>
      ) : null}

      <Card>
        <View style={s.figs}>
          <Fig value={`${d.kept.kept}`} label={`of ${plural(d.kept.of, 'day')} kept`} color={color} />
          <Fig value={pct(d.last30)} label="last 30 days" />
          <Fig value={pct(d.last90)} label="last 90 days" />
          <Fig value={`${d.best}`} label="longest run" />
        </View>
        <Divider />
        <View style={s.strip}>
          <DayDots strip={d.strip} color={color} size={11} gap={4} />
        </View>
        <Text style={t.caption}>Last 13 weeks. Filled: kept. Open ring: a slip. Today has the coloured ring.</Text>
        {m.next ? (
          <View style={s.next}>
            <View style={s.nextHead}>
              <Text style={t.label}>Next: {plural(m.next.days, 'day')}</Text>
              <Text style={[t.caption, t.num]}>in {plural(m.next.in, 'day')}</Text>
            </View>
            <Bar progress={d.day / Math.max(1, m.next.days)} />
          </View>
        ) : null}
        {d.yesterday.closed === 'auto' && !d.yesterday.slip ? <Text style={t.caption}>Yesterday closed itself as kept.</Text> : null}
      </Card>

      <View style={s.two}>
        <Button label="Log an urge" kind="quiet" small onPress={() => setUrgeOpen(true)} wrap={s.flex} />
        <Button label="It happened" kind="quiet" small onPress={onSlip} wrap={s.flex} />
      </View>

      <Section title="Why you're doing this">
        <Lines items={d.reasons} onChange={(v) => saveList('reasons', v)} placeholder="A reason, in your words" />
      </Section>

      <Section title="What helps right now">
        <Text style={t.small}>Shown in a rough moment. Moving your body has the best backing.</Text>
        <Lines items={d.actions} onChange={(v) => saveList('actions', v)} placeholder="Something to do" max={16} limit={80} suggestions={ACTION_BANK} />
      </Section>

      <Section title="Your hours">
        {d.hours.n ? (
          <Card>
            <Hours counts={d.hours.counts} slips={d.hours.slips} color={color} />
            <Text style={[t.small, s.gap8]}>
              {top ? `Most often: ${top.label}.` : 'Not enough yet to see a pattern.'}
              {d.tags.before.length ? ` Often after ${d.tags.before.slice(0, 2).map((x) => x.k.toLowerCase()).join(' or ')}.` : ''}
            </Text>
            <Text style={t.caption}>{d.month.urges} logged in 30 days · {d.month.rode} passed · {d.month.slips} {d.month.slips === 1 ? 'slip' : 'slips'}</Text>
          </Card>
        ) : (
          <Text style={t.small}>Each urge you log adds to this chart. After a few, it shows the hours to plan for.</Text>
        )}
      </Section>

      <PatternRead d={d} onUse={(p) => { setPlan(p); setPlanOpen(true); }} />

      <PlanList onAdd={() => { setPlan(top ? { start: top.start, days: top.days } : null); setPlanOpen(true); }} onEdit={(p) => { setPlan(p); setPlanOpen(true); }} />

      <Section title="Log">
        {d.recent.length === 0 ? <Text style={t.small}>Nothing logged yet.</Text> : null}
        {d.recent.slice(0, 8).map((u) => (
          <Row key={u.id} title={u.out === 'slip' ? 'A slip' : 'Passed'} sub={[ago(u.at), u.before, u.feel].filter(Boolean).join(' · ')}
            left={<View style={[s.dot, u.out === 'slip' ? s.dotSlip : { backgroundColor: color }]} />} />
        ))}
      </Section>

      <Card>
        <View style={s.lockRow}>
          <Gl k="lock" size={18} color={C.muted} />
          <Text style={[t.small, s.flex]}>Soul covers itself in the app switcher. A Face ID lock comes with the next app build.</Text>
        </View>
      </Card>

      <UrgeSheet open={urgeOpen} onClose={() => setUrgeOpen(false)} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} plan={plan} />
    </>
  );
}

// ── the AI reading of his pattern ───────────────────────────────────────────────────────────────────────────────
function PatternRead({ d, onUse }: { d: On; onUse: (p: Partial<Plan>) => void }) {
  const { color } = useAspect();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [need, setNeed] = useState<number | null>(null);
  const r = d.reading;
  const read = async (force: boolean) => {
    setBusy(true); setErr(null);
    try {
      const res = await call<{ ready: boolean; need?: number; item: Reading<PatternOut> | null }>('/mod/soul/clean/read', { force });
      if (!res.ready) setNeed(res.need ?? null); else { setNeed(null); refreshClean(); }
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const taken = new Set(d.plans.map((p) => `${p.then}|${p.start}`));
  return (
    <Section title="Reading of your pattern" action={r && !busy ? 'Read again' : undefined} onAction={() => read(true)}>
      {busy ? <Loading label="Reading your last 90 days of logs" /> : null}
      {!busy && r ? (
        <Card>
          <Text style={t.lead}>{r.out.headline}</Text>
          {r.out.when ? <Text style={[t.body, s.gap8]}>{r.out.when}</Text> : null}
          {r.out.why ? <Text style={[t.body, s.gap8]}>{r.out.why}</Text> : null}
          {r.out.kept ? <Text style={[t.body, s.gap8]}>{r.out.kept}</Text> : null}
          <Text style={[t.caption, s.gap8]}>Read {ago(r.at)} from {plural(r.n ?? 0, 'log')}.</Text>
        </Card>
      ) : null}
      {!busy && r?.out.plans.length ? r.out.plans.map((p, i) => {
        const has = taken.has(`${p.then}|${p.start}`);
        return (
          <Card key={i}>
            <Text style={t.strong}>{planLine(p)}</Text>
            <Text style={[t.small, s.gap4]}>{p.start}{p.end ? `–${p.end}` : ''} · {p.why}</Text>
            <Button label={has ? 'In your plans' : 'Use this'} kind="soft" small disabled={has} wrap={[s.self, s.gap8]}
              onPress={() => onUse({ if: p.if, then: p.then, start: p.start, end: p.end, days: p.days, nudge: true, from: 'reading' })} />
          </Card>
        );
      }) : null}
      {!busy && !r ? (
        <Card>
          <Text style={t.body}>
            {need != null ? `Log ${plural(need, 'more urge')} first. The reading needs at least five to say anything true.`
              : 'An AI reading of your logs: when urges come, what tends to come before, what helped, and plans for the risky hours.'}
          </Text>
          <Button label="Read my pattern" kind="soft" small onPress={() => read(false)} wrap={[s.self, s.gap8]} color={color} />
        </Card>
      ) : null}
      {err ? <Text style={[t.small, { color: C.danger }]}>{err}</Text> : null}
    </Section>
  );
}

// ── one urge, logged in a tap or two ────────────────────────────────────────────────────────────────────────────
function UrgeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notice } = useAspect();
  const [level, setLevel] = useState<string[]>([]);
  const [before, setBefore] = useState<string[]>([]);
  const [place, setPlace] = useState<string[]>([]);
  const [was, setWas] = useState(open);
  if (open !== was) { setWas(open); if (open) { setLevel([]); setBefore([]); setPlace([]); } }
  const log = async () => {
    const id = newId('urg');
    const body = {
      id, at: new Date().toISOString(), out: 'rode', source: 'log', updated_at: new Date().toISOString(),
      level: LEVELS.find((l) => l.label === level[0])?.v ?? null, before: before.join(', ') || null, place: place[0] ?? null,
    };
    haptic.medium();
    onClose();
    const r = await send({ id: `urge:${id}`, method: 'PUT', path: `/mod/soul/urges/${id}`, body });
    notice(r === 'queued' ? 'Saved on this phone. It goes to the PC when it can.' : 'Logged. That one passed.');
  };
  return (
    <Sheet open={open} onClose={onClose} title="An urge that passed">
      <Section title="How strong">
        <Choice options={LEVELS.map((l) => l.label)} value={level} onChange={setLevel} />
      </Section>
      <Section title="What came before">
        <Choice options={BEFORE} value={before} onChange={setBefore} multi max={2} />
      </Section>
      <Section title="Where">
        <Choice options={PLACES} value={place} onChange={setPlace} />
      </Section>
      <Button label="Log it" onPress={log} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  hero: { gap: 8, alignItems: 'flex-start', paddingTop: 8 },
  self: { alignSelf: 'flex-start' },
  figs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  strip: { paddingTop: 16, paddingBottom: 8, alignItems: 'center' },
  next: { gap: 8, marginTop: 16 },
  nextHead: { flexDirection: 'row', justifyContent: 'space-between' },
  two: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  gap4: { marginTop: 4 },
  gap8: { marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSlip: { borderWidth: 1.5, borderColor: C.muted },
  lockRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
