import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Block, Button, CheckRing, Chip, Failed, Field, Group, haptic, Press, Sheet, shortDay, Skeleton, t, undoable, useAspect,
} from '@/aspects/kit';
import { useCollection } from '@/lib/mod';
import { C } from '@/theme';
import { refreshGrowth } from './data';
import { useNav } from './nav';
import type { Rule, RuleCheck } from './types';
import { weekWords } from './ui';

// Rules he has learned: "when X, I do Y". Each comes from a miss; each later review asks whether it held, and the
// marks under a rule are those answers. He can also tick a rule the week it held, in one tap with Undo, and the
// review starts from that tick. A rule that keeps breaking is a rule to rewrite or retire, not a failure.

export const useRules = () => useCollection<Rule>('growth', 'rules');

/** "When the evening gets away from me, I write the first line of tomorrow." */
export const ruleText = (r: Pick<Rule, 'when' | 'then'>) => {
  const w = r.when.trim().replace(/^when\s+/i, '').replace(/[.,]+$/, '');
  const th = r.then.trim().replace(/[.]+$/, '');
  const lead = /^I\b/.test(th) ? th : `${th.charAt(0).toLowerCase()}${th.slice(1)}`; // a leading "I" stays a capital
  return w && th ? `When ${w}, ${lead}.` : '';
};
const heldOf = (r: Rule) => {
  const c = r.checks ?? [];
  return { held: c.filter((x) => x.held).length, of: c.length };
};
/** This week's mark on a rule: held, broke it, or none yet. */
export const markOf = (r: Pick<Rule, 'checks'>, week: string): boolean | null => (r.checks ?? []).find((c) => c.week === week)?.held ?? null;

/**
 * Mark a rule for a week (null takes the mark off). The marks stay in week order with this week's last, as the
 * review writes them, so closing the week replaces this mark rather than adding a second.
 */
export async function markRule(col: ReturnType<typeof useRules>, rule: Rule, week: string, held: boolean | null, notice: (t: string) => void) {
  const before: RuleCheck[] = rule.checks ?? [];
  const rest = before.filter((c) => c.week !== week);
  const next = held == null ? rest : [...rest, { week, held }].sort((a, b) => a.week.localeCompare(b.week));
  try {
    await col.patch(rule.id, { checks: next });
    refreshGrowth();
    haptic.medium();
    const short = rule.when.replace(/^when\s+/i, '').trim();
    undoable(held === true ? `Held this week: when ${short}` : held === false ? 'Marked as broken this week' : 'Mark taken off', async () => {
      try { await col.patch(rule.id, { checks: before }); refreshGrowth(); } catch (e) { notice(`Couldn't undo that. ${(e as Error).message}`); }
    });
  } catch (e) {
    notice(`Couldn't save that. ${(e as Error).message}`);
  }
}

/** The one tap tick beside a rule: held this week, or not marked yet. */
export function RuleTick({ rule, week }: { rule: Rule; week: string }) {
  const a = useAspect();
  const rules = useRules();
  const held = markOf(rule, week) === true;
  return (
    <Press label={held ? `Held this week. Take the tick off: ${ruleText(rule)}` : `Held this week: ${ruleText(rule)}`} role="checkbox" state={{ checked: held }}
      onPress={() => void markRule(rules, rule, week, held ? null : true, a.notice)} feel="none" scale={0.9} style={s.tick} hitSlop={4}>
      <CheckRing done={held} size={28} />
    </Press>
  );
}

/** The last eight answers on a rule, oldest first: filled where it held. */
function Marks({ checks, dim = false }: { checks: RuleCheck[]; dim?: boolean }) {
  const { color: tone } = useAspect();
  const color = dim ? C.muted : tone;
  if (!checks.length) return null;
  return (
    <View style={s.marks} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[...checks].sort((x, y) => x.week.localeCompare(y.week)).slice(-8).map((c) => (
        <View key={c.week} style={[s.mark, c.held ? { backgroundColor: color, borderColor: color } : { borderColor: C.faint }]} />
      ))}
    </View>
  );
}

function sub(r: Rule, week: string) {
  if (r.status === 'retired') return r.retired_at ? `Retired ${shortDay(r.retired_at.slice(0, 10))}` : 'Retired';
  const h = heldOf(r);
  const mark = markOf(r, week);
  const weeks = `${h.of} ${h.of === 1 ? 'week' : 'weeks'}`;
  if (mark === true) return `Held this week, ${h.held} of ${weeks} so far`;
  if (mark === false) return `Broke it this week, held ${h.held} of ${weeks}`;
  return h.of ? `Held ${h.held} of ${weeks}` : r.born?.week === week ? 'New this week' : 'Not checked yet';
}

/** A rule in a list: the words, its marks, how often it held; the tick for this week on the right. */
export function RuleRow({ r, week }: { r: Rule; week: string }) {
  const nav = useNav();
  const line = sub(r, week);
  const from = r.born?.text ? `From “${r.born.text}”${r.born.week ? ` in the week of ${weekWords(r.born.week)}` : ''}` : null;
  const retired = r.status === 'retired';
  return (
    <View style={s.row}>
      <Press label={`${ruleText(r)} ${line}. Change`} onPress={() => nav.openRule(r)} scale={0.99} wrap={s.fill} style={s.rowMain}>
        <Text style={[t.callout, retired && { color: C.muted }]}>{ruleText(r)}</Text>
        <View style={s.foot}>
          <Marks checks={r.checks ?? []} dim={retired} />
          <Text style={[t.footnote, s.fill]} numberOfLines={2}>{line}</Text>
        </View>
        {from ? <Text style={t.footnote} numberOfLines={2}>{from}</Text> : null}
      </Press>
      {!retired ? <RuleTick rule={r} week={week} /> : null}
    </View>
  );
}

/** Rules: the ones he lives by, each tickable for this week, and the retired ones. */
export function RulesTab({ week }: { week: string }) {
  const nav = useNav();
  const rules = useRules();
  const all = (rules.items ?? []).filter((r) => !r.deleted_at);
  const active = all.filter((r) => r.status !== 'retired').sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const retired = all.filter((r) => r.status === 'retired');
  if (!rules.items) {
    return rules.error ? <Failed message={rules.error} onRetry={rules.refresh} /> : (
      <View style={s.list}><Skeleton height={20} width={120} radius={8} />{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={96} radius={22} />)}</View>
    );
  }
  const held = active.filter((r) => markOf(r, week) === true).length;
  return (
    <>
      <Block title="Living by"
        sub={active.length ? `${held ? `${held} of ${active.length} ticked this week` : 'Tick a rule the week it held'}. The Sunday review asks about each one.` : null}>
        {active.length ? (
          <Group>{active.map((r) => <RuleRow key={r.id} r={r} week={week} />)}</Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>No rules yet</Text>
            <Text style={t.footnote}>A rule comes from a miss: when this happens, I do that. The Sunday review offers one from the week, or write one now.</Text>
            <View style={s.left}><Button label="Write a rule" kind="soft" small onPress={() => nav.openRule('new')} /></View>
          </Group>
        )}
      </Block>
      {retired.length ? (
        <Block title="Retired">
          <Group>{retired.map((r) => <RuleRow key={r.id} r={r} week={week} />)}</Group>
        </Block>
      ) : null}
      {active.length ? <Text style={t.footnote}>A rule that keeps breaking is one to rewrite or retire. Tap it to change the words.</Text> : null}
    </>
  );
}

/** The ISO week a day is in: "2026-W48". */
export function isoWeek(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7; // Monday 0
  d.setUTCDate(d.getUTCDate() - wd + 3); // the Thursday of this week decides its year
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const n = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(n).padStart(2, '0')}`;
}

const MARKS: [string, boolean | null][] = [['Held', true], ['Broke it', false], ['Not marked', null]];

/** Write, rewrite, mark, retire or delete one rule. */
export function RuleSheet({ open, rule, week, onClose }: { open: boolean; rule: Rule | null; week: string; onClose: () => void }) {
  const a = useAspect();
  const rules = useRules();
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
  const live = rule ? rules.items?.find((x) => x.id === rule.id) ?? rule : null; // the marks as they are now
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

  const preview = ruleText({ when, then });
  const mark = live ? markOf(live, week) : null;
  return (
    <Sheet open={open} onClose={onClose} title={rule ? 'Your rule' : 'A new rule'}>
      <Field label="When" value={when} onChangeText={setWhen} placeholder="the evening gets away from me" maxLength={140} />
      <Field label="I do" value={then} onChangeText={setThen} placeholder="write the first line of tomorrow before bed" maxLength={140} />
      {preview ? <Text style={t.subhead}>{preview}</Text> : <Text style={t.footnote}>One situation and one thing you do. Small enough to keep on a bad day.</Text>}
      {live && live.status !== 'retired' ? (
        <View style={s.gap8}>
          <Text style={t.footnote}>This week</Text>
          <View style={s.chips}>
            {MARKS.map(([label, v]) => (
              <Chip key={label} label={label} selected={mark === v} onPress={() => { if (mark !== v) void markRule(rules, live, week, v, a.notice); }} />
            ))}
          </View>
        </View>
      ) : null}
      {live && (live.checks ?? []).length ? (
        <Text style={t.footnote}>
          {`Checked in ${(live.checks ?? []).length} ${(live.checks ?? []).length === 1 ? 'week' : 'weeks'}, last in the week of ${weekWords(live.checks!.at(-1)!.week)}.`}
        </Text>
      ) : null}
      <Button label={rule ? 'Save changes' : 'Save rule'} onPress={save} disabled={!ok} busy={busy} />
      {rule ? (
        <View style={s.more}>
          <Button label={rule.status === 'retired' ? 'Live by it again' : 'Retire it'} kind="quiet" small
            onPress={() => run(() => rules.patch(rule.id, { status: rule.status === 'retired' ? 'active' : 'retired', retired_at: rule.status === 'retired' ? null : new Date().toISOString() }), rule.status === 'retired' ? 'Back in your rules' : 'Retired')} />
          <Button label={sure ? 'Delete for good' : 'Delete'} kind="quiet" small
            onPress={() => (sure ? run(() => rules.remove(rule.id), 'Rule deleted') : setSure(true))} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** The rules block on Now: the few that matter this week, each tickable, or the way to write the first. */
export function RulesThisWeek({ ids, week }: { ids: string[]; week: string }) {
  const nav = useNav();
  const rules = useRules();
  const docs = ids.map((id) => rules.items?.find((r) => r.id === id)).filter((r): r is Rule => !!r && !r.deleted_at && r.status !== 'retired');
  if (!ids.length || (rules.items && !docs.length)) {
    return (
      <Block title="Your rules">
        <Group pad>
          <Text style={t.callout}>Rules you live by</Text>
          <Text style={t.footnote}>Each one comes from a miss in a Sunday review: when this happens, I do that. A later review asks whether it held.</Text>
          <View style={s.left}><Button label="Write one now" kind="soft" small onPress={() => nav.openRule('new')} /></View>
        </Group>
      </Block>
    );
  }
  return (
    <Block title="Your rules this week" action="All" onAction={() => nav.openTab('rules')} sub="Tick one when it held. The Sunday review starts from your ticks.">
      {docs.length ? <Group>{docs.map((r) => <RuleRow key={r.id} r={r} week={week} />)}</Group>
        : rules.error ? <Failed message={rules.error} onRetry={rules.refresh} /> : <Skeleton height={ids.length * 72} radius={22} />}
    </Block>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  list: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { paddingLeft: 16, paddingRight: 8, paddingVertical: 14, gap: 6, minHeight: 64 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marks: { flexDirection: 'row', gap: 4 },
  mark: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  tick: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  left: { flexDirection: 'row', marginTop: 4 },
  gap8: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  more: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
});
