import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, Button, Card, Empty, Failed, Field, haptic, Screen, Section, Sheet, shortDay, Skeleton, SP, t, useAspect, weekday } from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { refreshGrowth } from './data';
import type { Rule } from './types';
import { NAME } from './ui';

// Rules he has learned: "when X, I do Y". Each comes from a miss; each later review asks whether it held, and the
// marks below a rule are those answers. A rule that keeps breaking is a rule to rewrite or retire, not a failure.

const text = (r: Pick<Rule, 'when' | 'then'>) => {
  const w = r.when.trim().replace(/^when\s+/i, '').replace(/[.,]+$/, '');
  const th = r.then.trim().replace(/[.]+$/, '');
  const lead = /^I\b/.test(th) ? th : `${th.charAt(0).toLowerCase()}${th.slice(1)}`; // a leading "I" stays a capital
  return w && th ? `When ${w}, ${lead}.` : '';
};
const held = (r: Rule) => {
  const c = r.checks ?? [];
  return { held: c.filter((x) => x.held).length, of: c.length };
};

export function RulesScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rules = useCollection<Rule>('growth', 'rules');
  const [edit, setEdit] = useState<Rule | null>(null);
  const [adding, setAdding] = useState(false);
  const all = (rules.items ?? []).filter((r) => !r.deleted_at);
  const active = all.filter((r) => r.status !== 'retired').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const retired = all.filter((r) => r.status === 'retired');

  return (
    <Screen open={open} onClose={onClose} title="Your rules">
      {!rules.items ? (
        rules.error ? <Failed message={rules.error} onRetry={rules.refresh} /> : (
          <View style={s.list}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={72} radius={16} />)}</View>
        )
      ) : (
        <View style={s.list}>
          {active.length ? (
            <Section title="Living by" action="New rule" onAction={() => setAdding(true)}>
              {active.map((r) => <RuleRow key={r.id} r={r} onPress={() => setEdit(r)} />)}
            </Section>
          ) : (
            <Card>
              <Empty title="No rules yet" body="A rule comes from a miss: when this happens, I do that. The Sunday review offers one from the week's misses, or write one now." action="Write a rule" onAction={() => setAdding(true)} />
            </Card>
          )}
          {retired.length ? (
            <Section title="Retired">
              {retired.map((r) => <RuleRow key={r.id} r={r} onPress={() => setEdit(r)} />)}
            </Section>
          ) : null}
        </View>
      )}
      <RuleSheet open={adding || !!edit} rule={edit} onClose={() => { setAdding(false); setEdit(null); }} />
    </Screen>
  );
}

function RuleRow({ r, onPress }: { r: Rule; onPress: () => void }) {
  const { color } = useAspect();
  const h = held(r);
  const checks = (r.checks ?? []).slice(-8);
  const sub = r.status === 'retired' ? 'Retired'
    : h.of ? `Held ${h.held} of ${h.of} ${h.of === 1 ? 'time' : 'times'}` : 'Not checked yet';
  const from = r.born?.text ? `From ${r.born.week ? `the week of ${weekWords(r.born.week)}` : 'a review'}: ${r.born.text}` : null; // "the week of 16 Nov"
  return (
    <Card onPress={onPress} label={`${text(r)} ${sub}`} style={s.rule}>
      <Text style={[t.strong, r.status === 'retired' && { color: C.muted }]}>{text(r)}</Text>
      <View style={s.ruleFoot}>
        {checks.length ? (
          <View style={s.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {checks.map((c) => (
              <View key={c.week} style={[s.mark, c.held ? { backgroundColor: color, borderColor: color } : { borderColor: C.faint }]} />
            ))}
          </View>
        ) : null}
        <Text style={t.caption}>{sub}</Text>
      </View>
      {from ? <Text numberOfLines={2} style={t.caption}>{from}{r.born?.aspect ? `, ${NAME[r.born.aspect]}` : ''}</Text> : null}
    </Card>
  );
}

/** An ISO week key as the day it starts: "2026-W47" is "16 Nov". */
function weekWords(key: string) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = `${y}-01-04`;
  const monday = addDays(jan4, -((weekday(jan4) + 6) % 7));
  return shortDay(addDays(monday, (w - 1) * 7));
}

/** Write, rewrite, retire or delete one rule. */
export function RuleSheet({ open, rule, onClose }: { open: boolean; rule: Rule | null; onClose: () => void }) {
  const a = useAspect();
  const rules = useCollection<Rule>('growth', 'rules');
  const [when, setWhen] = useState('');
  const [then, setThen] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const sig = open ? (rule?.id ?? 'new') : null;
  const [was, setWas] = useState<string | null>(null);
  if (sig !== was) {
    setWas(sig);
    if (sig) { setWhen(rule?.when ?? ''); setThen(rule?.then ?? ''); setSure(false); }
  }
  const ok = when.trim().length > 1 && then.trim().length > 1;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      refreshGrowth();
      haptic.medium();
      a.notice(done);
      onClose();
    } catch (e) {
      a.notice((e as Error).message);
    } finally { setBusy(false); }
  };
  const save = () => run(() => rule
    ? rules.patch(rule.id, { when: when.trim(), then: then.trim() })
    : rules.put({ id: `r_${Date.now().toString(36)}`, when: when.trim(), then: then.trim(), status: 'active', checks: [], born: null } as Rule), rule ? 'Rule updated' : 'Rule saved');

  const preview = text({ when, then });
  return (
    <Sheet open={open} onClose={onClose} title={rule ? 'Your rule' : 'A new rule'}>
      <View style={s.sheet}>
        <Field label="When" value={when} onChangeText={setWhen} placeholder="the evening gets away from me" maxLength={140} />
        <Field label="I do" value={then} onChangeText={setThen} placeholder="write the first line of tomorrow before bed" maxLength={140} />
        {preview ? <Text style={t.small}>{preview}</Text> : <Text style={t.caption}>One situation and one thing you do. Small enough to keep on a bad day.</Text>}
        {rule && (rule.checks ?? []).length ? (
          <Text style={t.caption}>
            Checked in {(rule.checks ?? []).length} {(rule.checks ?? []).length === 1 ? 'review' : 'reviews'}, last in the week of {weekWords(rule.checks!.at(-1)!.week)}.
          </Text>
        ) : null}
        <Button label={rule ? 'Save changes' : 'Save rule'} onPress={save} disabled={!ok} busy={busy} />
        {rule ? (
          <View style={s.more}>
            <Button label={rule.status === 'retired' ? 'Live by it again' : 'Retire it'} kind="quiet" small
              onPress={() => run(() => rules.patch(rule.id, { status: rule.status === 'retired' ? 'active' : 'retired', retired_at: rule.status === 'retired' ? null : new Date().toISOString() }), rule.status === 'retired' ? 'Back in your rules' : 'Retired')} />
            <Button label={sure ? 'Delete for good' : 'Delete'} kind="danger" small
              onPress={() => (sure ? run(() => rules.remove(rule.id), 'Rule deleted') : setSure(true))} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  list: { gap: SP[24] },
  rule: { gap: SP[8] },
  ruleFoot: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  marks: { flexDirection: 'row', gap: SP[4] },
  mark: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  sheet: { gap: SP[16] },
  more: { flexDirection: 'row', gap: SP[8], justifyContent: 'space-between' },
});
