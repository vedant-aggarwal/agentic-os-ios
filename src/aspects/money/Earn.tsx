import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line as SvgLine } from 'react-native-svg';
import { C } from '@/theme';
import {
  Bar, Button, Chip, dayLabel, Empty, Field, haptic, Icon, R, Row, rupees, Screen, Sheet, SP, SURF, t, tint, today, addDays, useAspect,
} from '@/aspects/kit';
import { act, amountOf, setTarget, useSources, useTx } from './data';
import type { Home, Income, Owed } from './types';
import { AmountInput, ChipWrap, Group, Head, MonthLine, owedText, s as ui } from './ui';

const dayWord = (n: number) => (n <= 1 ? 'Last day' : `${n} days left`);

/** The lead: what he earned this month against his target, the line, and the honest gap. */
export function EarnLead({ home, onMoneyIn, onTarget }: { home: Home; onMoneyIn: () => void; onTarget: () => void }) {
  const a = useAspect();
  const { earn, target, month } = home;
  const owed = earn.pending?.total ?? 0;
  const owedCount = earn.pending?.count ?? 0;
  let gap: string;
  if (target.amount == null) gap = 'Set a monthly target to measure this against.';
  else if (earn.left && earn.left > 0) gap = `${rupees(earn.left)} to go. ${dayWord(month.daysToGo)}.`;
  else gap = `Target reached, ${rupees(earn.earned - target.amount)} beyond it.`;
  const owedLine = owed > 0 ? `${earn.pending?.approx ? 'About ' : ''}${rupees(owed)} is owed to you.`
    : owedCount > 0 ? `${owedCount === 1 ? 'One payment is' : `${owedCount} payments are`} owed to you, amount not set.` : null;
  return (
    <View style={s.lead}>
      <View style={s.figure}>
        <Text style={[t.display, t.num]} accessibilityLabel={`Earned ${rupees(earn.earned)} this month`}>{rupees(earn.earned)}</Text>
        <Text style={t.label}>{target.amount != null ? `earned of ${rupees(target.amount)} this month` : `earned in ${month.name}`}</Text>
      </View>
      {target.amount != null ? <MonthLine earned={earn.earned} owed={owed} target={target.amount} /> : null}
      <View style={s.words}>
        <Text style={t.body}>{gap}</Text>
        {owedLine ? <Text style={[t.body, { color: tint(a.color, 0.85) }]}>{owedLine}</Text> : null}
      </View>
      <View style={s.actions}>
        <Button label="Money in" kind="soft" small onPress={onMoneyIn} icon={<Icon name="plus" size={14} color={a.color} />} />
        {target.amount == null ? <Button label="Set a target" kind="quiet" small onPress={onTarget} /> : null}
      </View>
    </View>
  );
}

export function OwedRow({ o, onPress }: { o: Owed; onPress?: () => void }) {
  const since = o.since ? (o.what ? o.since.charAt(0).toLowerCase() + o.since.slice(1) : o.since) : null;
  const sub = [o.what, since].filter(Boolean).join(', ');
  return <Row title={o.name} sub={sub || o.note} right={owedText(o)} onPress={onPress} chevron={!!onPress} label={`${o.name}, ${owedText(o)}${o.since ? `, ${o.since}` : ''}`} />;
}

/** Earn: the target, money still owed, where this month's money came from, the last six months, every rupee in. */
export function EarnScreen({ open, onClose, home, onMoneyIn, onTarget }: {
  open: boolean; onClose: () => void; home: Home; onMoneyIn: () => void; onTarget: () => void;
}) {
  const a = useAspect();
  const { earn, target } = home;
  const [edit, setEdit] = useState<Income | null>(null);
  const top = Math.max(1, ...earn.sources.map((x) => x.amount));
  return (
    <Screen open={open} onClose={onClose} title="Earn">
      <EarnLead home={home} onMoneyIn={onMoneyIn} onTarget={onTarget} />
      <Group>
        <Row title="Monthly target" sub={target.since ? `Set ${dayLabel(target.since)}` : 'What you want to earn in a month'}
          right={target.amount != null ? rupees(target.amount) : 'Not set'} onPress={onTarget} chevron label="Change the monthly target" />
      </Group>

      <View style={s.part}>
        <Head title="Still to come in" right={earn.pending && earn.pending.total > 0 ? rupees(earn.pending.total) : null} />
        {earn.pendingError ? <Text style={t.small}>{earn.pendingError}</Text>
          : earn.pending && earn.pending.items.length ? <Group>{earn.pending.items.map((o) => <OwedRow key={o.id} o={o} />)}</Group>
            : <Text style={t.small}>No client money is waiting. It shows here from the client payment files on your PC.</Text>}
      </View>

      <View style={s.part}>
        <Head title="This month by source" right={earn.in > 0 ? rupees(earn.in) : null} />
        {earn.sources.length ? (
          <Group>
            {earn.sources.map((x) => (
              <View key={x.id} style={s.source} accessible accessibilityLabel={`${x.name}, ${rupees(x.amount)}${x.earned ? '' : ', not counted as earned'}`}>
                <View style={s.sourceTop}>
                  <Text style={t.strong} numberOfLines={1}>{x.name}</Text>
                  <View style={ui.fill} />
                  <Text style={[t.label, t.num]}>{rupees(x.amount)}</Text>
                </View>
                <Bar progress={x.amount / top} height={6} color={x.earned ? a.color : 'rgba(255,255,255,0.28)'} />
                {!x.earned ? <Text style={t.caption}>Not counted as earned</Text> : null}
              </View>
            ))}
          </Group>
        ) : <Empty title="Nothing in yet this month" body="Money from the shop, clients or your own work lands here." action="Log money in" onAction={onMoneyIn} />}
      </View>

      <View style={s.part}>
        <Head title="Last six months" />
        <MonthsChart months={earn.months} target={target.amount} />
      </View>

      {earn.income.length ? (
        <View style={s.part}>
          <Head title={`Money in, ${home.month.name}`} />
          <Group>
            {earn.income.map((x) => (
              <Row key={x.id} title={x.sourceName} sub={[dayLabel(x.date), x.note].filter(Boolean).join(', ')} right={`+${rupees(x.amount)}`}
                onPress={() => setEdit(x)} label={`${x.sourceName}, ${rupees(x.amount)}, ${dayLabel(x.date)}`} />
            ))}
          </Group>
        </View>
      ) : null}
      <IncomeSheet item={edit} onClose={() => setEdit(null)} home={home} />
    </Screen>
  );
}

/** Earned money for each of the last six months, this one in full colour, the target as a dashed line. */
function MonthsChart({ months, target }: { months: Home['earn']['months']; target: number | null }) {
  const a = useAspect();
  const [w, setW] = useState(0);
  const H = 96;
  const max = Math.max(1, target ?? 0, ...months.map((m) => m.earned));
  const best = months.reduce((b, m) => (m.earned > b.earned ? m : b), months[0]);
  const any = months.some((m) => m.earned > 0);
  const hit = target ? months.filter((m) => m.earned >= target).length : 0;
  return (
    <View style={s.chartWrap}>
      <View style={[s.chart, { height: H }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}
        accessible accessibilityLabel={months.map((m) => `${m.label} ${rupees(m.earned)}`).join(', ')}>
        {months.map((m, i) => {
          const h = m.earned > 0 ? Math.max(4, (m.earned / max) * H) : 2;
          const now = i === months.length - 1;
          return (
            <View key={m.ym} style={s.col}>
              <View style={{ height: h, borderRadius: 4, backgroundColor: m.earned > 0 ? (now ? a.color : tint(a.color, 0.45)) : SURF.raised }} />
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
        {months.map((m, i) => <Text key={m.ym} style={[t.caption, s.label, i === months.length - 1 && { color: C.text }]}>{m.label}</Text>)}
      </View>
      <Text style={t.small}>
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
    onClose();
    await act(tx.remove(x.id), a.notice, "Couldn't remove that");
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={x ? `${rupees(x.amount)} in, ${dayLabel(x.date)}` : ''}>
      <Text style={t.label}>Where it came from</Text>
      <ChipWrap>
        {home.earn.choices.map((c) => <Chip key={c.id} label={c.name} selected={x?.source === c.id} onPress={() => void move(c.id)} />)}
      </ChipWrap>
      <Button label="Remove this" kind="danger" onPress={() => void remove()} />
    </Sheet>
  );
}

/** Money in: the amount, where it came from (most used first), an optional note, today or yesterday. */
export function MoneyInSheet({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const sources = useSources();
  const [amount, setAmount] = useState('');
  const [src, setSrc] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEarned, setNewEarned] = useState(true);
  const choices = home.earn.choices;
  const pick = src ?? choices[0]?.id ?? 'otherin';
  const n = amountOf(amount);
  const close = () => { onClose(); setAmount(''); setNote(''); setSrc(null); setDay('today'); setAdding(false); setNewName(''); };
  const save = async () => {
    if (!n) return;
    const at = day === 'today' ? new Date().toISOString() : `${addDays(today(), -1)}T06:30:00.000Z`;
    const custom = choices.find((c) => c.id === pick && c.custom);
    close();
    const r = await act(tx.put({ kind: 'in', amount: n, category: pick, merchant: custom ? custom.name : null, note: note.trim(), at, source: 'app' }), a.notice);
    if (r) haptic.success();
  };
  const addSource = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await act(sources.put({ name: name.slice(0, 40), kind: newEarned ? 'earned' : 'other' }), a.notice);
    if (r) { setSrc(r.id); setAdding(false); setNewName(''); }
  };
  return (
    <Sheet open={open} onClose={close} title="Money in">
      <AmountInput value={amount} onChange={setAmount} label="Amount in rupees" autoFocus={open} />
      <Text style={t.label}>From</Text>
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
      <Field label="What for" value={note} onChangeText={setNote} placeholder="Optional" maxLength={80} />
      <ChipWrap>
        <Chip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
        <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
      </ChipWrap>
      <Button label={n ? `Save ${rupees(n)}` : 'Save'} onPress={() => void save()} disabled={!n} />
    </Sheet>
  );
}

/** His monthly income target, kept on the PC. Earned money counts toward it; pocket money, gifts and refunds do not. */
export function TargetSheet({ open, onClose, home }: { open: boolean; onClose: () => void; home: Home }) {
  const a = useAspect();
  const cur = home.target.amount;
  const [v, setV] = useState('');
  const [was, setWas] = useState(open);
  if (open && !was) { setWas(true); setV(cur ? String(cur) : ''); }
  if (!open && was) setWas(false);
  const n = amountOf(v);
  const save = async (amount: number | null) => {
    onClose();
    const r = await act(setTarget(amount), a.notice);
    if (r) haptic.medium();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Monthly target">
      <Text style={t.small}>What you want to earn in a month. Money you earn counts toward it; pocket money, gifts and refunds don&apos;t.</Text>
      <AmountInput value={v} onChange={setV} label="Monthly target in rupees" autoFocus={open} onSubmit={() => n && void save(n)} />
      <Button label="Save target" onPress={() => n && void save(n)} disabled={!n || n === cur} />
      {cur != null ? <Button label="Remove the target" kind="quiet" onPress={() => void save(null)} /> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  lead: { gap: SP[16] },
  figure: { gap: SP[4] },
  words: { gap: SP[2] },
  actions: { flexDirection: 'row', gap: SP[8], flexWrap: 'wrap' },
  part: { gap: SP[12] },
  source: { gap: SP[8], paddingVertical: SP[12] },
  sourceTop: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  chartWrap: { gap: SP[8] },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: SP[8] },
  col: { flex: 1, justifyContent: 'flex-end', height: '100%' },
  labels: { flexDirection: 'row', gap: SP[8] },
  label: { flex: 1, textAlign: 'center' },
  newSource: { gap: SP[12], padding: SP[12], borderRadius: R.row, backgroundColor: SURF.row },
});
