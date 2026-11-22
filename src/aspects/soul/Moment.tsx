import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, haptic, Press, Screen, Section, t, timer, tint, useAspect } from '@/aspects/kit';
import { newId } from '@/lib/mod';
import { Breath } from './Breath';
import { istMin, kit, readLocal, send, useForeground, useNow, type Plan } from './data';
import { Choice } from './parts';
import { ACTION_BANK, BEFORE, LEVELS, patternOf } from './words';

const WAIT = 600; // the ten minute decision delay, in seconds

/** The plan that fits this hour: active, starting within the last three hours or the next one. */
function planNow(plans: Plan[]) {
  const now = istMin();
  let best: Plan | null = null, bestGap = Infinity;
  for (const p of plans) {
    if (p.active === false || !p.start) continue;
    const [h, m] = p.start.split(':').map(Number);
    let gap = now - (h * 60 + m);
    if (gap < -720) gap += 1440; else if (gap > 720) gap -= 1440;
    if (gap < -60 || gap > 180) continue;
    if (Math.abs(gap) < bestGap) { best = p; bestGap = Math.abs(gap); }
  }
  return best;
}

type Base = { reasons: string[]; actions: string[]; plans: Plan[] };

/**
 * The rough moment. Everything it needs is on the phone (his reasons, his list, his plans), so it works with the
 * PC away. It breathes with him, runs a ten minute "then decide" timer, shows his plan for this hour and his
 * reasons, offers one thing to do, and ends in three choices. Leaving without choosing still logs the urge.
 */
export function Moment({ open, base, onClose, onSlip }: {
  open: boolean; base: Base | null; onClose: () => void; onSlip: (key: string, steps: string[]) => void;
}) {
  const { color, open: pageOpen, notice } = useAspect();
  const fg = useForeground();
  const [run, setRun] = useState(0); // a new rough moment each time it opens
  const [phase, setPhase] = useState<'room' | 'passed'>('room');
  const [round, setRound] = useState(() => Date.now());
  const [started, setStarted] = useState(() => new Date().toISOString());
  const [reason, setReason] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const [level, setLevel] = useState<string[]>([]);
  const [before, setBefore] = useState<string[]>([]);
  const id = useRef(newId('urg'));
  const logged = useRef(false);
  const buzzed = useRef(false);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      id.current = newId('urg'); logged.current = false; buzzed.current = false;
      setPhase('room'); setRound(Date.now()); setStarted(new Date().toISOString());
      setSteps([]); setLevel([]); setBefore([]); setReason(0); setRun((n) => n + 1);
    }
    wasOpen.current = open;
  }, [open]);

  // what he wrote, from the PC when it answered, else what this phone kept from last time
  const k = useMemo(() => {
    const local = kit();
    return {
      reasons: base?.reasons.length ? base.reasons : local?.reasons ?? [],
      actions: base?.actions.length ? base.actions : local?.actions?.length ? local.actions : ACTION_BANK.slice(0, 6),
      plans: base?.plans.length ? base.plans : local?.plans ?? [],
    };
  }, [base, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planNow(k.plans), [k.plans, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const pattern = useMemo(() => patternOf(readLocal<string>('pattern')), [run]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = open && pageOpen && fg && phase === 'room';
  const now = useNow(1000, live);
  const left = Math.max(0, WAIT - Math.floor((now - round) / 1000));
  useEffect(() => {
    if (live && left === 0 && !buzzed.current) { buzzed.current = true; haptic.medium(); }
  }, [live, left]);

  const urge = (extra: Record<string, unknown>) => ({
    id: id.current, at: started, source: 'moment', steps, mins: Math.max(1, Math.round((Date.now() - Date.parse(started)) / 60_000)),
    level: level.length ? LEVELS.find((l) => l.label === level[0])?.v ?? null : null,
    before: before.length ? before.join(', ') : null, updated_at: new Date().toISOString(), ...extra,
  });
  const put = async (doc: Record<string, unknown>) => {
    const r = await send({ id: `urge:${id.current}`, method: 'PUT', path: `/mod/soul/urges/${id.current}`, body: doc });
    if (r === 'queued') notice('Saved on this phone. It goes to the PC when it can.');
  };

  const passed = () => {
    haptic.success();
    logged.current = true;
    setPhase('passed');
    void put(urge({ out: 'rode', ended: 'passed' }));
  };
  const again = () => { haptic.light(); buzzed.current = false; setRound(Date.now()); };
  const happened = () => { logged.current = true; onSlip(id.current, steps); };
  const leave = () => {
    if (!logged.current) { logged.current = true; void put(urge({ ended: 'closed' })); }
    onClose();
  };
  // the two taps of context after it passed go to the same record
  const tag = (lv: string[], bf: string[]) => {
    setLevel(lv); setBefore(bf);
    void put({ ...urge({ out: 'rode', ended: 'passed' }), level: lv.length ? LEVELS.find((l) => l.label === lv[0])?.v ?? null : null, before: bf.length ? bf.join(', ') : null });
  };

  const reasons = k.reasons;
  return (
    <Screen open={open} onClose={leave} immersive title="">
      {phase === 'room' ? (
        <>
          <View style={s.top}>
            <Text style={[t.lead, s.centre]}>Stand up. Change rooms if you can.</Text>
            <Text style={[t.small, s.centre]}>Breathe with the circle. Slow and low.</Text>
          </View>
          <View style={s.centreBox}>
            <Breath pattern={pattern} running={live} color={color} size={220} />
          </View>
          <View style={s.timerBox} accessible accessibilityLabel={left ? `${timer(left)} left of ten minutes` : 'Ten minutes are up'}>
            <Text style={[t.big, t.num, s.centre]}>{left ? timer(left) : 'Ten minutes'}</Text>
            <Text style={[t.small, s.centre]}>{left ? 'Wait ten minutes, then decide. The urge can stay while you wait.' : 'You waited. How is it now?'}</Text>
          </View>

          {plan ? (
            <Card tone={color}>
              <Text style={t.caption}>Your plan for now</Text>
              <Text style={[t.strong, s.gapTop]}>{plan.if ? `If ${lower(plan.if)}, ` : ''}{plan.if ? lower(plan.then) : plan.then}.</Text>
            </Card>
          ) : null}

          <Section title="Why you're doing this">
            {reasons.length ? (
              <Press label="Next reason" onPress={() => setReason((i) => (i + 1) % reasons.length)} feel="tick" style={[s.reason, { borderColor: tint(color, 0.3) }]}>
                <Text style={t.lead}>{reasons[reason % reasons.length]}</Text>
                {reasons.length > 1 ? <Text style={[t.caption, s.gapTop]}>{reason % reasons.length + 1} of {reasons.length} · tap for the next</Text> : null}
              </Press>
            ) : (
              <Text style={t.small}>Your reasons show here. Add them on the Clean screen when it is calm.</Text>
            )}
          </Section>

          <Section title="Do one now">
            <Choice options={k.actions} value={steps} onChange={setSteps} multi />
          </Section>

          <View style={s.actions}>
            <Button label="It passed" kind="accent" onPress={passed} />
            <Button label="Still here, go again" kind="quiet" onPress={again} />
            <Press label="It happened" onPress={happened} style={s.link}><Text style={t.label}>It happened</Text></Press>
          </View>
        </>
      ) : (
        <View style={s.done}>
          <Text style={[t.title2, s.centre]}>That one passed.</Text>
          <Text style={[t.small, s.centre]}>It&apos;s logged as a day kept. Two taps if you want them.</Text>
          <Section title="How strong was it">
            <Choice options={LEVELS.map((l) => l.label)} value={level} onChange={(v) => tag(v, before)} />
          </Section>
          <Section title="What came before">
            <Choice options={BEFORE} value={before} onChange={(v) => tag(level, v)} multi max={2} />
          </Section>
          <Button label="Done" onPress={onClose} />
        </View>
      )}
    </Screen>
  );
}

const lower = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x).replace(/\.$/, '');

const s = StyleSheet.create({
  top: { gap: 4, paddingTop: 8 },
  centre: { textAlign: 'center' },
  centreBox: { alignItems: 'center' },
  timerBox: { gap: 4, alignItems: 'center' },
  gapTop: { marginTop: 4 },
  reason: { padding: 16, borderRadius: 24, borderWidth: 1, borderCurve: 'continuous' },
  actions: { gap: 12 },
  link: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  done: { gap: 24, paddingTop: 24 },
});

