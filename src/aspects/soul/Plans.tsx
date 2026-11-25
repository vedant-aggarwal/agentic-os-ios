import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Chip, Failed, Field, Group, Item, Sheet, Skeleton, SURF, t, useAspect } from '@/aspects/kit';
import { useCollection, type Draft } from '@/lib/mod';
import { C } from '@/theme';
import { errText, refreshClean, type Plan } from './data';
import { Choice, Gl } from './parts';
import { PLAN_IF, PLAN_THEN, PLAN_TIMES } from './words';

const DAYS = [
  { key: 'all', label: 'Every day', days: [1, 2, 3, 4, 5, 6, 7] },
  { key: 'week', label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { key: 'end', label: 'Weekends', days: [6, 7] },
] as const;
const daysKey = (d?: number[]) => DAYS.find((x) => x.days.length === (d?.length ?? 7) && x.days.every((v) => (d ?? [1, 2, 3, 4, 5, 6, 7]).includes(v)))?.key ?? 'all';
const lower = (x: string) => (x && !/^I[\s']/.test(x) ? x[0].toLowerCase() + x.slice(1) : x).replace(/\.$/, '');

/** "If it is late and I am in bed, phone goes on the desk." */
export const planLine = (p: { if?: string | null; then: string }) => (p.if ? `If ${lower(p.if)}, ${lower(p.then)}.` : `${p.then.replace(/\.$/, '')}.`);
/** "From 22:00, every day, with a nudge before." */
export const planWhen = (p: Plan) => {
  const days = (DAYS.find((d) => d.key === daysKey(p.days))?.label ?? 'Every day').toLowerCase();
  return `${p.end ? `${p.start} to ${p.end}` : `From ${p.start}`}, ${days}${p.nudge === false ? '' : ', with a nudge before'}.`;
};

/** His if then plans for risky hours: a list, each one editable, and Add. */
export function PlanList({ onAdd, onEdit }: { onAdd: () => void; onEdit: (p: Plan) => void }) {
  const plans = useCollection<Plan>('soul', 'plans');
  const { color } = useAspect();
  const list = (plans.items ?? []).filter((p) => !p.deleted_at).sort((a, b) => byNight(a.start, b.start));
  return (
    <Block title="Plans for risky hours" action="Add" onAction={onAdd}>
      {plans.items == null ? (plans.error ? <Failed message={plans.error} onRetry={() => { void plans.refresh(); }} /> : <Skeleton height={64} radius={22} />) : null}
      {plans.items && !list.length ? (
        <Group pad>
          <Text style={t.subhead}>A plan is one line: when this happens, I do that.</Text>
          <Text style={t.footnote}>The rough moment shows the plan for the hour, and a quiet nudge comes a few minutes before.</Text>
        </Group>
      ) : null}
      {list.length ? (
        <Group inset={60}>
          {list.map((p) => (
            <Item key={p.id} title={planLine(p)} sub={p.active === false ? 'Paused' : planWhen(p)} onPress={() => onEdit(p)} chevron lines={3}
              style={p.active === false ? s.off : undefined}
              left={<View style={s.glyph}><Gl k="moon" size={16} color={p.active === false ? C.faint : color} /></View>} />
          ))}
        </Group>
      ) : null}
    </Block>
  );
}

/** One plan: if, then, from when, which days, the nudge. */
export function PlanSheet({ open, onClose, plan }: { open: boolean; onClose: () => void; plan: Partial<Plan> | null }) {
  const plans = useCollection<Plan>('soul', 'plans');
  const { notice } = useAspect();
  const [ifs, setIf] = useState('');
  const [then, setThen] = useState('');
  const [start, setStart] = useState('22:00');
  const [days, setDays] = useState<string>('all');
  const [nudge, setNudge] = useState(true);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  const [seen, setSeen] = useState<{ open: boolean; plan: Partial<Plan> | null }>({ open: false, plan: null });
  if (open !== seen.open || (open && plan !== seen.plan)) {
    setSeen({ open, plan });
    if (open) {
      setIf(plan?.if ?? ''); setThen(plan?.then ?? ''); setStart(plan?.start ?? '22:00');
      setDays(daysKey(plan?.days)); setNudge(plan?.nudge !== false); setActive(plan?.active !== false); setSure(false);
    }
  }

  const save = async () => {
    if (!then.trim()) return notice('Say what you will do.');
    setBusy(true);
    try {
      const doc: Draft<Plan> = {
        ...(plan?.id ? { id: plan.id } : {}), if: ifs.trim() || null, then: then.trim(), start, end: plan?.end ?? null,
        days: [...(DAYS.find((d) => d.key === days)?.days ?? DAYS[0].days)], nudge, active, from: plan?.from ?? 'you',
      };
      await plans.put(doc);
      refreshClean();
      onClose();
    } catch (e) { notice(errText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!plan?.id) return;
    if (!sure) { setSure(true); return; }
    setBusy(true);
    try { await plans.remove(plan.id); refreshClean(); onClose(); } catch (e) { notice(errText(e)); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={plan?.id ? 'Edit plan' : 'New plan'}>
      <Block title="If">
        <Choice options={PLAN_IF} value={PLAN_IF.includes(ifs) ? [ifs] : []} onChange={(v) => setIf(v[0] ?? '')} />
        <Field value={ifs} onChangeText={setIf} placeholder="Or in your words" maxLength={120} />
      </Block>
      <Block title="Then I">
        <Choice options={PLAN_THEN} value={PLAN_THEN.includes(then) ? [then] : []} onChange={(v) => setThen(v[0] ?? '')} />
        <Field value={then} onChangeText={setThen} placeholder="What you will do" maxLength={160} />
      </Block>
      <Block title="From">
        <Choice options={[...new Set([...PLAN_TIMES, start])].sort(byNight)} value={[start]} onChange={(v) => { if (v[0]) setStart(v[0]); }} />
      </Block>
      <Block title="Days">
        <View style={s.wrap}>
          {DAYS.map((d) => <Chip key={d.key} label={d.label} selected={days === d.key} onPress={() => setDays(d.key)} />)}
        </View>
      </Block>
      <View style={s.wrap}>
        <Chip label="Nudge me before" selected={nudge} onPress={() => setNudge(!nudge)} />
        {plan?.id ? <Chip label="Active" selected={active} onPress={() => setActive(!active)} /> : null}
      </View>
      {planLineOk(ifs, then) ? <View style={s.preview}><Text style={t.footnote}>Reads as</Text><Text style={t.callout}>{planLine({ if: ifs.trim() || null, then: then.trim() })}</Text></View> : null}
      <Button label="Save plan" kind="accent" onPress={() => { void save(); }} busy={busy} />
      {plan?.id ? <Button label={sure ? 'Tap again to delete' : 'Delete plan'} kind="danger" small onPress={() => { void remove(); }} disabled={busy} wrap={s.self} /> : null}
    </Sheet>
  );
}

const planLineOk = (ifs: string, then: string) => !!then.trim() && (!!ifs.trim() || then.trim().length > 3);

// evening first: 21:00, 22:00, 23:00, then 00:00 and 01:00 after midnight
const byNight = (a: string, b: string) => ((Number(a.slice(0, 2)) + 12) % 24) - ((Number(b.slice(0, 2)) + 12) % 24) || a.localeCompare(b);

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  off: { opacity: 0.55 },
  self: { alignSelf: 'flex-start' },
  glyph: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  preview: { gap: 4, padding: 16, borderRadius: 22, borderCurve: 'continuous', backgroundColor: SURF.group },
});
