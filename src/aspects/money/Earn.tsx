import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line as SvgLine } from 'react-native-svg';
import { C } from '@/theme';
import {
  addDays, Bar, Block, Button, Chip, dayLabel, Field, Group, haptic, Icon, Item, Lead, myDay, R, rupees, Sheet, SURF, t, tint, undoable, useAspect,
} from '@/aspects/kit';
import { act, setTarget, useSources, useTx } from './data';
import { useNav } from './nav';
import { AmountKeys, AmountSheet, AmountShown, useDigits } from './pad';
import type { Home, Income, Owed } from './types';
import { ChipWrap, HeroNumber, MonthLine, owedText, s as u } from './ui';

const dayWord = (n: number) => (n <= 1 ? 'Last day of the month' : `${n} days left`);

/** "today", "yesterday" or "on Fri 20 Nov", to follow "Set". */
const since = (d: string) => { const l = dayLabel(d); return /^(Today|Yesterday)$/.test(l) ? l.toLowerCase() : `on ${l}`; };

/**
 * Earn: what he earned this month against his target (the money still owed to him sits softer on the same line),
 * what is still to come in, where this month's money came from, the last six months, and every rupee in.
 */
export function EarnTab({ home }: { home: Home }) {
  const nav = useNav();
  const { earn, target } = home;
  const [edit, setEdit] = useState<Income | null>(null);
  const top = Math.max(1, ...earn.sources.map((x) => x.amount));
  return (
    <>
      <EarnLead home={home} />

      <Block title="Still to come in" right={earn.pending && earn.pending.total > 0 ? <Text style={[t.subhead, t.num, { color: C.muted }]}>{`${earn.pending.approx ? 'about ' : ''}${rupees(earn.pending.total)}`}</Text> : undefined}>
        {earn.pendingError ? (
          <Group pad><Text style={t.footnote}>{earn.pendingError}</Text></Group>
        ) : earn.pending && earn.pending.items.length ? (
          <Group>{earn.pending.items.map((o) => <OwedRow key={o.id} o={o} />)}</Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>Nothing is waiting</Text>
            <Text style={t.footnote}>Money owed to you shows here from the client payment files on your PC.</Text>
          </Group>
        )}
      </Block>

      <Block title={`${home.month.name} by source`} right={earn.in > 0 ? <Text style={[t.subhead, t.num, { color: C.muted }]}>{rupees(earn.in)}</Text> : undefined}>
        {earn.sources.length ? (
          <Group pad>
            {earn.sources.map((x) => (
              <View key={x.id} style={u.gap8} accessible accessibilityLabel={`${x.name}, ${rupees(x.amount)}${x.earned ? '' : ', not counted as earned'}`}>
                <View style={u.between}>
                  <Text style={[t.callout, u.fill]} numberOfLines={1}>{x.name}</Text>
                  <Text style={[t.headline, t.num]}>{rupees(x.amount)}</Text>
                </View>
                <Bar progress={x.amount / top} height={6} color={x.earned ? undefined : 'rgba(255,255,255,0.28)'} />
                {!x.earned ? <Text style={t.footnote}>Not counted as earned</Text> : null}
              </View>
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>Nothing in yet this month</Text>
            <Text style={t.footnote}>Money from the shop, clients or your own work lands here when you log it.</Text>
            <View style={s.left}><Button label="Log money in" kind="soft" small onPress={() => nav.openSheet({ kind: 'moneyIn' })} /></View>
          </Group>
        )}
      </Block>

      <Block title="Last six months" right={target.amount ? <Text style={[t.footnote, t.num]}>{`Target ${rupees(target.amount)}`}</Text> : undefined}>
        <Group pad><MonthsChart months={earn.months} target={target.amount} /></Group>
      </Block>

      <Block title="Monthly target">
        <Group>
          <Item title={target.amount != null ? rupees(target.amount) : 'Not set'} titleStyle={t.num}
            sub={target.since ? `Set ${since(target.since)}. Earned money counts; pocket money, gifts and refunds do not.` : 'What you want to earn in a month'}
            onPress={() => nav.openSheet({ kind: 'target' })} chevron label={target.amount != null ? `Monthly target ${rupees(target.amount)}. Change` : 'Set a monthly target'} />
        </Group>
      </Block>

      {earn.income.length ? (
        <Block title={`Money in, ${home.month.name}`}>
          <Group>
            {earn.income.map((x) => (
              <Item key={x.id} title={x.sourceName} sub={x.note ? `${x.note}, ${dayLabel(x.date)}` : dayLabel(x.date)}
                right={<Text style={[t.callout, t.num]}>{rupees(x.amount)}</Text>} onPress={() => setEdit(x)}
                label={`${x.sourceName}, ${rupees(x.amount)}, ${dayLabel(x.date)}. Change`} />
            ))}
          </Group>
        </Block>
      ) : null}
      <IncomeSheet item={edit} onClose={() => setEdit(null)} home={home} />
    </>
  );
}

/** The lead: what he earned this month against his target, the line, and the honest gap. */
function EarnLead({ home }: { home: Home }) {
  const a = useAspect();
  const nav = useNav();
  const { earn, target, month } = home;
  const owed = earn.pending?.total ?? 0;
  const owedCount = earn.pending?.count ?? 0;
  let gap: string | null;
  if (target.amount == null) gap = null;
  else if (earn.left && earn.left > 0) gap = `${rupees(earn.left)} to go. ${dayWord(month.daysToGo)}.`;
  else gap = earn.earned > target.amount ? `Target reached, ${rupees(earn.earned - target.amount)} beyond it.` : 'Target reached.';
  const owedLine = owed > 0 ? `${earn.pending?.approx ? 'About ' : ''}${rupees(owed)} is owed to you.`
    : owedCount > 0 ? `${owedCount === 1 ? 'One payment is' : `${owedCount} payments are`} owed to you, amount not set.` : null;
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>{`Earned in ${month.name}`}</Text>
      <View style={u.gap4}>
        <HeroNumber value={rupees(earn.earned)} label={`Earned ${rupees(earn.earned)} this month${target.amount != null ? ` of ${rupees(target.amount)}` : ''}`} />
        <Text style={t.subhead}>{target.amount != null ? `of the ${rupees(target.amount)} target` : 'No monthly target yet'}</Text>
      </View>
      {target.amount != null ? <MonthLine earned={earn.earned} owed={owed} target={target.amount} height={8} /> : null}
      {gap || owedLine ? (
        <View style={u.gap4}>
          {gap ? <Text style={[t.subhead, t.num]}>{gap}</Text> : null}
          {owedLine ? <Text style={[t.subhead, t.num, { color: tint(a.color, 0.85) }]}>{owedLine}</Text> : null}
        </View>
      ) : null}
      {earn.otherIn > 0 ? <Text style={[t.footnote, t.num]}>{`Plus ${rupees(earn.otherIn)} in that does not count as earned.`}</Text> : null}
      <View style={u.row}>
        <Button label="Money in" kind="accent" icon={<Icon name="plus" size={18} color="#14161C" />} onPress={() => nav.openSheet({ kind: 'moneyIn' })} wrap={u.fill} />
        {target.amount == null ? <Button label="Set a target" kind="quiet" onPress={() => nav.openSheet({ kind: 'target' })} /> : null}
      </View>
    </Lead>
  );
}

export function OwedRow({ o, onPress }: { o: Owed; onPress?: () => void }) {
  const since = o.since ? (o.what ? o.since.charAt(0).toLowerCase() + o.since.slice(1) : o.since) : null;
  const sub = [o.what, since].filter(Boolean).join(', ');
  return (
    <Item title={o.name} sub={sub || o.note} right={<Text style={[t.callout, t.num]}>{owedText(o)}</Text>} onPress={onPress} chevron={!!onPress}
      label={`${o.name}, ${owedText(o)}${o.since ? `, ${o.since}` : ''}`} />
  );
}

/** Earned money for each of the last six months, this one in full colour, the target as a dashed line. */
function MonthsChart({ months, target }: { months: Home['earn']['months']; target: number | null }) {
  const a = useAspect();
  const [w, setW] = useState(0);
  const H = 112;
  const max = Math.max(1, target ?? 0, ...months.map((m) => m.earned));
  const best = months.reduce((b, m) => (m.earned > b.earned ? m : b), months[0]);
  const any = months.some((m) => m.earned > 0);
  const hit = target ? months.filter((m) => m.earned >= target).length : 0;
  return (
    <View style={u.gap8}>
      <View style={[s.chart, { height: H }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessible accessibilityLabel={months.map((m) => `${m.label} ${rupees(m.earned)}`).join(', ')}>
        {months.map((m, i) => {
          const h = m.earned > 0 ? Math.max(4, (m.earned / max) * H) : 2;
          const now = i === months.length - 1;
          return (
            <View key={m.ym} style={s.col}>
              <View style={{ height: h, borderRadius: 6, borderCurve: 'continuous', backgroundColor: m.earned > 0 ? (now ? a.color : tint(a.color, 0.4)) : SURF.raised }} />
            </View>
          );
        })}
        {target && w > 0 ? (
          <Svg width={w} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
            <SvgLine x1={0} x2={w} y1={H - (target / max) * H} y2={H - (target / max) * H} stroke={C.muted} strokeWidth={1} strokeDasharray="3 5" />
          </Svg>
        ) : null}
      </View>
      <View style={s.labels}>
        {months.map((m, i) => <Text key={m.ym} style={[t.micro, s.label, i === months.length - 1 && { color: C.text }]}>{m.label}</Text>)}
      </View>
      <Text style={[t.footnote, t.num]}>
        {!any ? 'No earned money logged in these months yet.'
          : `Best was ${best.label}, ${rupees(best.earned)}.${target ? ` ${hit === 0 ? 'No month has reached the target yet.' : hit === 1 ? 'One month reached the target.' : `${hit} months reached the target.`}` : ''}`}
      </Text>
    </View>
  );
}

/** Change where a rupee in came from, or remove it. */
function IncomeSheet({ item, onClose, home }: { item: Income | null; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const [shown, setShown] = useState<Income | null>(item);
  if (item && item !== shown) setShown(item);
  const x = item ?? shown;
  const move = async (source: string) => {
    if (!x) return;
    onClose();
    await act(tx.patch(x.id, { category: source }), a.notice);
  };
  const remove = async () => {
    if (!x) return;
    const before = tx.items?.find((d) => d.id === x.id) ?? null;
    onClose();
    const r = await act(tx.remove(x.id).then(() => true), a.notice, "Couldn't remove that");
    if (r && before) undoable(`Removed ${rupees(x.amount)} in`, () => void act(tx.put(before), a.notice, "Couldn't undo that"));
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={x ? `${rupees(x.amount)} in, ${dayLabel(x.date)}` : ''}>
      <Text style={t.footnote}>Where it came from</Text>
      <ChipWrap>
        {home.earn.choices.map((c) => <Chip key={c.id} label={c.name} selected={x?.source === c.id} onPress={() => void move(c.id)} />)}
      </ChipWrap>
      <Button label="Remove this" kind="quiet" onPress={() => void remove()} />
    </Sheet>
  );
}

/** Money in on big keys: the amount, where it came from (most used first), an optional note, today or yesterday. */
export function MoneyInSheet({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const sources = useSources();
  const k = useDigits();
  const [src, setSrc] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEarned, setNewEarned] = useState(true);
  const [was, setWas] = useState(false);
  if (open !== was) {
    setWas(open);
    if (open) { k.setDigits(''); setNote(''); setSrc(null); setDay('today'); setAdding(false); setNewName(''); setNewEarned(true); }
  }
  const choices = home.earn.choices;
  const pick = src ?? choices[0]?.id ?? 'otherin';
  const pickName = choices.find((c) => c.id === pick)?.name ?? 'Other';
  const n = k.amount;
  const save = async () => {
    if (!n) return;
    const at = day === 'today' ? new Date().toISOString() : `${addDays(myDay(), -1)}T06:30:00.000Z`;
    const custom = choices.find((c) => c.id === pick && c.custom);
    onClose();
    const r = await act(tx.put({ kind: 'in', amount: n, category: pick, merchant: custom ? custom.name : null, note: note.trim(), at, source: 'app' }), a.notice);
    if (r) { haptic.success(); undoable(`${rupees(n)} in from ${pickName}`, () => void act(tx.remove(r.id), a.notice, "Couldn't undo that")); }
  };
  const addSource = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await act(sources.put({ name: name.slice(0, 40), kind: newEarned ? 'earned' : 'other' }), a.notice);
    if (r) { setSrc(r.id); setAdding(false); setNewName(''); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Money in">
      <AmountShown amount={n} />
      <ChipWrap>
        {choices.map((c) => <Chip key={c.id} label={c.name} selected={c.id === pick} onPress={() => setSrc(c.id)} />)}
        <Chip label="New source" selected={adding} onPress={() => setAdding((v) => !v)} icon={<Icon name="plus" size={14} color={adding ? a.color : C.textSoft} />} />
      </ChipWrap>
      {adding ? (
        <View style={s.newSource}>
          <Field label="Name of the source" value={newName} onChangeText={setNewName} placeholder="Content, freelance work" maxLength={40} onSubmit={() => void addSource()} />
          <ChipWrap>
            <Chip label="Counts as earned" selected={newEarned} onPress={() => setNewEarned(true)} />
            <Chip label="Not earned" selected={!newEarned} onPress={() => setNewEarned(false)} />
          </ChipWrap>
          <Button label="Add source" kind="quiet" small onPress={() => void addSource()} disabled={!newName.trim()} />
        </View>
      ) : null}
      <AmountKeys onKey={k.press} />
      <Button label={n ? `Log ${rupees(n)} in` : 'Log'} kind="accent" onPress={() => void save()} disabled={!n} />
      <Field label="What for" value={note} onChangeText={setNote} placeholder="Optional" maxLength={80} />
      <ChipWrap>
        <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
        <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
      </ChipWrap>
    </Sheet>
  );
}

/** His monthly income target, kept on the PC. Earned money counts toward it; pocket money, gifts and refunds do not. */
export function TargetSheet({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home }) {
  const a = useAspect();
  const cur = home.target.amount;
  const save = async (amount: number | null) => {
    onClose();
    const r = await act(setTarget(amount), a.notice);
    if (r) { haptic.medium(); a.notice(amount ? `Target set to ${rupees(amount)} a month` : 'Target removed'); }
  };
  return (
    <AmountSheet open={open} onClose={onClose} title="Monthly target" start={cur}
      sub="What you want to earn in a month. Money you earn counts toward it; pocket money, gifts and refunds do not."
      done="Save target" onDone={(n) => void save(n)}
      extra={cur != null ? <Button label="Remove the target" kind="quiet" onPress={() => void save(null)} /> : undefined} />
  );
}

const s = StyleSheet.create({
  left: { flexDirection: 'row', marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  col: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  labels: { flexDirection: 'row', gap: 8 },
  label: { flex: 1, textAlign: 'center' },
  newSource: { gap: 12, padding: 12, borderRadius: R.row, borderCurve: 'continuous', backgroundColor: SURF.row },
});
