import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ago, Bar, Block, Button, Failed, Group, haptic, Item, Lead, Loading, Metric, Metrics, Sheet, Skeleton, Stepper, SURF, t, useAspect,
} from '@/aspects/kit';
import { call, newId, useCollection } from '@/lib/mod';
import { C } from '@/theme';
import {
  errText, refreshClean, rememberKit, send, useCleanNow, useNow, type CleanNow, type CleanRec, type Plan, type PatternOut, type Reading,
} from './data';
import { useNav } from './nav';
import { Choice, DayDots, Gl, Hours, Lines, pct, plural } from './parts';
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
 * Clean: the count live, the rough moment, the numbers a slip never takes away, the last 13 weeks, quick logs, his
 * reasons and his list, the hours his urges come, Nora's reading with plans, and the log. Private: nothing here
 * leaves this tab except "Day N".
 */
export function CleanTab({ active }: { active: boolean }) {
  const now = useCleanNow();
  const d = now.data;
  if (!d) {
    return now.error ? <Failed message={now.error} onRetry={() => { void now.refresh(); }} /> : (
      <View style={s.gap16}>
        <Skeleton height={232} radius={28} />
        <Skeleton height={200} radius={22} />
        <Skeleton height={112} radius={22} />
      </View>
    );
  }
  return d.setup ? <Live d={d} active={active} /> : <Setup reasons={d.reasons} />;
}

// ── before he starts ──
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
      <Lead>
        <View style={s.gap4}>
          <Text style={[t.footnote, { color }]}>Day count</Text>
          <Text style={t.title3}>Start your count</Text>
          <Text style={t.subhead}>Day 1 starts when you say. A slip later moves only the current run: every day you kept stays counted, and so does your longest run.</Text>
        </View>
        <Stepper label="Days already kept" value={days} onChange={setDays} min={0} max={365} format={(v) => (v ? plural(v, 'day') : 'Start now')} />
        <Button label="Start" kind="accent" onPress={() => { void start(); }} busy={busy} />
      </Lead>
      <Block title="Why you're doing this" sub="In your own words. They show in a rough moment and on milestones. You can add them later.">
        <Lines items={reasons} onChange={setReasons} placeholder="A reason" />
      </Block>
    </>
  );
}

// ── the running count ──
function Live({ d, active }: { d: On; active: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const { color, notice } = a;
  const clock = useNow(60_000, active && a.open);
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
      <Lead>
        <View style={s.gap4}>
          <View style={s.between}>
            <Text style={[t.footnote, { color }]}>Current run</Text>
            {d.pledged ? <Text style={t.footnote}>Promised for today</Text> : <Button label="Promise today" kind="soft" small onPress={() => { void pledge(); }} />}
          </View>
          <Text accessibilityRole="header" style={[t.hero, t.num, { color }]}>{`Day ${d.day}`}</Text>
          <Text style={[t.subhead, t.num]}>{since(d.since, clock)}</Text>
        </View>
        {m.reached?.today ? (
          <View style={s.gap4}>
            <Text style={[t.headline, { color }]}>{`${plural(m.reached.days, 'day')} today.`}</Text>
            {reason ? <Text style={t.subhead}>{`You said: ${reason}`}</Text> : null}
          </View>
        ) : null}
        {d.change && clock - Date.parse(d.change.at) < 7 * 86_400_000 ? (
          <Text style={t.subhead}>{`Your change for now: ${d.change.text.replace(/\.$/, '')}.`}</Text>
        ) : null}
        <Button label="Rough moment" kind="accent" onPress={nav.moment} icon={<Gl k="wind" size={18} color="#14161C" />} />
      </Lead>

      <Block title="Your record" sub="A slip never takes these away.">
        <Group pad>
          <Metrics>
            <Metric size="s" label="Days kept" value={String(d.kept.kept)} unit={`of ${d.kept.of}`} />
            <Metric size="s" label="Last 30" value={pct(d.last30)} />
            <Metric size="s" label="Last 90" value={pct(d.last90)} />
            <Metric size="s" label="Longest" value={String(d.best)} unit={d.best === 1 ? 'day' : 'days'} />
          </Metrics>
          <View style={s.strip}><DayDots strip={d.strip} color={color} size={18} gap={6} /></View>
          <Text style={t.micro}>Last 13 weeks, a week to a column. Filled: kept. Open ring: a slip. Today has the coloured ring.</Text>
          {m.next ? (
            <View style={s.gap8}>
              <View style={s.between}>
                <Text style={t.subhead}>{`Next: ${plural(m.next.days, 'day')}`}</Text>
                <Text style={[t.footnote, t.num]}>{`in ${plural(m.next.in, 'day')}`}</Text>
              </View>
              <Bar progress={d.full / Math.max(1, m.next.days)} height={6} />
            </View>
          ) : null}
          {d.yesterday.closed === 'auto' && !d.yesterday.slip ? <Text style={t.footnote}>Yesterday closed itself as kept.</Text> : null}
        </Group>
      </Block>

      <Block title="Log">
        <Group inset={60}>
          <Item title="An urge that passed" sub="How strong and what came before, two taps" onPress={() => setUrgeOpen(true)} chevron
            left={<View style={s.glyph}><Gl k="leaf" size={16} color={color} /></View>} />
          <Item title="It happened" sub="Log it and let it go. Your kept days stay." onPress={nav.slip} chevron
            left={<View style={s.glyph}><Gl k="circle" size={16} color={C.muted} /></View>} />
        </Group>
      </Block>

      <Block title="Why you're doing this">
        <Lines items={d.reasons} onChange={(v) => { void saveList('reasons', v); }} placeholder="A reason, in your words" />
      </Block>

      <Block title="What helps right now" sub="Shown in a rough moment. Moving your body has the best backing.">
        <Lines items={d.actions} onChange={(v) => { void saveList('actions', v); }} placeholder="Something to do" max={16} limit={80} suggestions={ACTION_BANK} chips />
      </Block>

      <Block title="Your hours">
        {d.hours.n ? (
          <Group pad>
            <Hours counts={d.hours.counts} slips={d.hours.slips} color={color} />
            <Text style={t.subhead}>
              {top ? `Most often: ${top.days.length === 5 ? 'weekdays' : 'every day'} from ${top.start} to ${top.end}.` : 'Not enough yet to see a pattern.'}
              {d.tags.before.length ? ` Often after ${d.tags.before.slice(0, 2).map((x) => x.k.toLowerCase()).join(' or ')}.` : ''}
            </Text>
            <Text style={[t.footnote, t.num]}>{`In 30 days: ${plural(d.month.urges, 'urge')} logged, ${d.month.rode} passed, ${plural(d.month.slips, 'slip')}.`}</Text>
          </Group>
        ) : (
          <Group pad>
            <Text style={t.footnote}>Each urge you log adds to this chart. After a few, it shows the hours to plan for.</Text>
          </Group>
        )}
      </Block>

      <PatternRead d={d} onUse={(p) => { setPlan(p); setPlanOpen(true); }} />

      <PlanList onAdd={() => { setPlan(top ? { start: top.start, days: top.days } : null); setPlanOpen(true); }} onEdit={(p) => { setPlan(p); setPlanOpen(true); }} />

      <Block title="Recent">
        {d.recent.length ? (
          <Group inset={42}>
            {d.recent.slice(0, 8).map((u) => (
              <Item key={u.id} title={u.out === 'slip' ? 'A slip' : 'Passed'} sub={[ago(u.at), u.before, u.feel].filter(Boolean).join(', ')}
                left={<View style={[s.dot, u.out === 'slip' ? s.dotSlip : { backgroundColor: color }]} />} />
            ))}
          </Group>
        ) : <Group pad><Text style={t.footnote}>Nothing logged yet.</Text></Group>}
      </Block>

      <Group>
        <Item title="Kept private" sub="Soul covers itself in the app switcher. A Face ID lock comes with the next app build." lines={3}
          left={<View style={s.glyph}><Gl k="lock" size={16} color={C.muted} /></View>} />
      </Group>

      <UrgeSheet open={urgeOpen} onClose={() => setUrgeOpen(false)} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} plan={plan} />
    </>
  );
}

// ── Nora's reading of his pattern ──
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
    <Block title="Nora's reading of your pattern" action={r && !busy ? 'Read again' : undefined} onAction={() => { void read(true); }}>
      {busy ? <Group pad><Loading label="Nora is reading your last 90 days of logs" /></Group> : null}
      {!busy && r ? (
        <Group pad>
          <Text style={t.headline}>{r.out.headline}</Text>
          {r.out.when ? <Text style={t.subhead}>{r.out.when}</Text> : null}
          {r.out.why ? <Text style={t.subhead}>{r.out.why}</Text> : null}
          {r.out.kept ? <Text style={t.subhead}>{r.out.kept}</Text> : null}
          <Text style={t.footnote}>{`Read ${ago(r.at).toLowerCase()} from ${plural(r.n ?? 0, 'log')}.`}</Text>
        </Group>
      ) : null}
      {!busy && r?.out.plans.length ? (
        <Group>
          {r.out.plans.map((p, i) => {
            const has = taken.has(`${p.then}|${p.start}`);
            return (
              <Item key={i} title={planLine(p)} sub={`From ${p.start}${p.end ? ` to ${p.end}` : ''}. ${p.why}`} lines={3}
                action={<Button label={has ? 'Added' : 'Use'} kind="soft" small disabled={has}
                  onPress={() => onUse({ if: p.if, then: p.then, start: p.start, end: p.end, days: p.days, nudge: true, from: 'reading' })} />} />
            );
          })}
        </Group>
      ) : null}
      {!busy && !r ? (
        <Group pad>
          <Text style={t.subhead}>
            {need != null ? `Log ${plural(need, 'more urge')} first. The reading needs at least five to say anything true.`
              : 'Nora reads your logs: when urges come, what tends to come before, what helped, and plans for the risky hours.'}
          </Text>
          <View style={s.self}><Button label="Read my pattern" kind="soft" small onPress={() => { void read(false); }} color={color} /></View>
        </Group>
      ) : null}
      {err ? <Text style={[t.footnote, { color: C.danger }]}>{err}</Text> : null}
    </Block>
  );
}

// ── one urge, logged in a tap or two ──
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
      <Block title="How strong">
        <Choice options={LEVELS.map((l) => l.label)} value={level} onChange={setLevel} />
      </Block>
      <Block title="What came before">
        <Choice options={BEFORE} value={before} onChange={setBefore} multi max={2} />
      </Block>
      <Block title="Where">
        <Choice options={PLACES} value={place} onChange={setPlace} />
      </Block>
      <Button label="Log it" kind="accent" onPress={() => { void log(); }} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  self: { alignSelf: 'flex-start' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  strip: { paddingVertical: 8, alignItems: 'center' },
  glyph: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSlip: { borderWidth: 1.5, borderColor: C.muted },
});
