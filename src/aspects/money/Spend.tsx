import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button, Chip, dayLabel, Empty, Field, haptic, Icon, Press, Row, rupees, Screen, Segmented, Sheet, shortDay, SP, Stepper, t, today, useAspect,
} from '@/aspects/kit';
import { act, amountOf, decideLeak, useBills, useTx, type BillDoc } from './data';
import { LogLine } from './log';
import type { Bill, Home, Leak, Spent } from './types';
import { AmountInput, CategorySheet, ChipRow, Group, Head, s as ui } from './ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// common names, so the first few take seconds to add; AI tools first, as they cost him the most
const COMMON = ['Claude', 'ChatGPT', 'Cursor', 'GitHub Copilot', 'Google One', 'iCloud', 'YouTube Premium', 'Netflix', 'Spotify', 'Phone plan', 'Home wifi'];

/** "Today: ₹120 left of ₹500" when he has a budget; otherwise what went out. */
export function todayLine(home: Home) {
  const d = home.spend.today;
  if (d.allowance != null && d.left != null) return d.left >= 0 ? `${rupees(d.left)} left of today's ${rupees(d.allowance)}` : `${rupees(-d.left)} over today's ${rupees(d.allowance)}`;
  return d.count === 0 ? 'Nothing logged yet' : d.count === 1 ? 'One spend' : `${d.count} spends`;
}

/** Spend: today and the month, the one line log, subscriptions and bills, leaks, statements, every spend this month. */
export function SpendScreen({ open, onClose, home, onStatement }: { open: boolean; onClose: () => void; home: Home; onStatement: (id?: string) => void }) {
  const a = useAspect();
  const { spend, month } = home;
  const [bill, setBill] = useState<Bill | null>(null);
  const [adding, setAdding] = useState(false);
  const [tx, setTx] = useState<Spent | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const rec = spend.recurring;
  const days = groupByDay(spend.recent);
  return (
    <Screen open={open} onClose={onClose} title="Spend">
      <View style={s.lead}>
        <View style={s.figure}>
          <Text style={[t.display, t.num]}>{rupees(spend.today.spent)}</Text>
          <Text style={t.label}>spent today, {todayLine(home).toLowerCase()}</Text>
        </View>
        <Text style={t.body}>
          {rupees(spend.month.spent)} in {month.name} so far{spend.month.bills > 0 ? `, plus ${rupees(spend.month.bills)} in bills` : ''}.
        </Text>
      </View>
      <LogLine home={home} />

      <View style={s.part}>
        <Head title="Subscriptions and bills" right={rec.count ? `${rupees(rec.monthly)} a month` : null} action={rec.count ? 'Add' : undefined} onAction={() => setAdding(true)} />
        {rec.count ? (
          <>
            {rec.ai > 0 && rec.ai < rec.monthly ? <Text style={t.small}>AI tools are {rupees(rec.ai)} of it.</Text> : null}
            <Group>
              {rec.items.map((b) => (
                <Row key={b.id} title={b.name} sub={billSub(b)} right={rupees(b.every === 'month' ? b.amount : b.monthly)} onPress={() => setBill(b)} chevron
                  label={`${b.name}, ${rupees(b.amount)} ${b.every === 'year' ? 'a year' : b.every === 'week' ? 'a week' : 'a month'}, next on ${shortDay(b.next)}`} />
              ))}
            </Group>
          </>
        ) : <Empty title="What leaves every month on its own" body="AI tools, your phone plan, storage. Add them once and the monthly total stays right." action="Add the first" onAction={() => setAdding(true)} />}
        {rec.ended.length ? (
          <Press label={showEnded ? 'Hide cancelled' : 'Show cancelled'} onPress={() => setShowEnded((v) => !v)} hitSlop={8}>
            <Text style={t.small}>
              {rec.ended.length === 1 ? 'One cancelled' : `${rec.ended.length} cancelled`}, {rupees(rec.ended.reduce((n, x) => n + x.monthly, 0))} a month you no longer pay. {showEnded ? 'Hide' : 'Show'}
            </Text>
          </Press>
        ) : null}
        {showEnded && rec.ended.length ? <Group>{rec.ended.map((x) => <Row key={x.id} title={x.name} sub={x.cancelledAt ? `Cancelled ${dayLabel(x.cancelledAt.slice(0, 10))}` : 'Cancelled'} right={rupees(x.amount)} />)}</Group> : null}
      </View>

      {spend.leaks.length ? (
        <View style={s.part}>
          <Head title="Keep or cut" />
          <Group>{spend.leaks.map((l) => <LeakRow key={l.id} leak={l} />)}</Group>
        </View>
      ) : null}

      <View style={s.part}>
        <Head title="Bank statement" />
        <Group>
          {spend.imports.review.map((i) => (
            <Row key={i.id} title={`Review ${i.bank ?? 'the statement'}`} sub={[i.period ? `${shortDay(i.period.from)} to ${shortDay(i.period.to)}` : null, i.counts ? waitingCount(i.counts) : null].filter(Boolean).join(', ')}
              onPress={() => onStatement(i.id)} chevron />
          ))}
          <Row title="Fill in from a statement" sub={spend.imports.lastFiled ? `Last one filed ${dayLabel(spend.imports.lastFiled.at.slice(0, 10))}` : 'The spends you didn\'t log, once a month'}
            left={<Icon name="plus" size={18} color={a.color} />} onPress={() => onStatement()} chevron />
        </Group>
      </View>

      <View style={s.part}>
        <Head title={`${month.name} so far`} right={spend.month.spent > 0 ? rupees(spend.month.spent) : null} />
        {days.length ? days.map((d) => (
          <View key={d.date} style={s.day}>
            <View style={s.dayHead}>
              <Text style={t.label}>{dayLabel(d.date)}</Text>
              <View style={ui.fill} />
              <Text style={[t.label, t.num]}>{rupees(d.total)}</Text>
            </View>
            <Group>
              {d.rows.map((x) => (
                <Row key={x.id} title={x.merchant} sub={[catName(home, x.category), x.statement ? 'from a statement' : null].filter(Boolean).join(', ')}
                  right={rupees(x.amount)} onPress={() => setTx(x)} label={`${x.merchant}, ${rupees(x.amount)}, ${catName(home, x.category)}`} />
              ))}
            </Group>
          </View>
        )) : <Text style={t.small}>Nothing logged this month yet.</Text>}
      </View>

      <BillSheet bill={bill} onClose={() => setBill(null)} />
      <AddBillSheet open={adding} onClose={() => setAdding(false)} />
      <SpendSheet item={tx} onClose={() => setTx(null)} home={home} />
    </Screen>
  );
}

const catName = (home: Home, id: string) => (id === 'bills' ? 'Bills' : home.spend.cats.find((c) => c.id === id)?.name ?? 'Other');
const waitingCount = (c: Record<string, number>) => {
  const n = (c.new ?? 0) + (c.ask ?? 0) + (c.sub ?? 0) + (c.income ?? 0);
  return n === 0 ? 'Nothing new' : n === 1 ? 'One row to look at' : `${n} rows to look at`;
};
function billSub(b: Bill) {
  const next = `Next on ${shortDay(b.next)}`;
  if (b.every === 'year') return `${rupees(b.amount)} a year, next on ${shortDay(b.next)}`;
  if (b.every === 'week') return `${rupees(b.amount)} a week`;
  return b.found ? `${next}, found in a statement` : next;
}
function groupByDay(rows: Spent[]) {
  const out: { date: string; total: number; rows: Spent[] }[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.date === r.date);
    if (!g) { g = { date: r.date, total: 0, rows: [] }; out.push(g); }
    g.total += r.amount; g.rows.push(r);
  }
  return out;
}

/** One thing the PC noticed. It asks one question. */
function LeakRow({ leak }: { leak: Leak }) {
  const a = useAspect();
  const [busy, setBusy] = useState(false);
  const decide = async (keep: boolean) => {
    setBusy(true);
    const r = await act(decideLeak(leak.id, keep), a.notice);
    setBusy(false);
    if (r) { haptic.medium(); a.notice(keep ? `Kept ${leak.title}` : `${leak.title}: marked to cut`); }
  };
  const info = leak.kind === 'over';
  return (
    <View style={s.leak}>
      <View style={s.leakTop}>
        <View style={ui.fill}>
          <Text style={t.strong} numberOfLines={2}>{leak.title}</Text>
          {leak.meta ? <Text style={t.small} numberOfLines={2}>{leak.meta}</Text> : null}
        </View>
        <Text style={[t.label, t.num]}>{rupees(leak.amount)}{leak.every === 'year' ? ' a year' : leak.every === 'week' ? ' a week' : leak.monthly ? ' a month' : ''}</Text>
      </View>
      <View style={s.leakActions}>
        {info ? <Button label="Got it" kind="quiet" small busy={busy} onPress={() => void decide(true)} /> : (
          <>
            <Button label="Keep" kind="quiet" small disabled={busy} onPress={() => void decide(true)} />
            <Button label={leak.kind === 'repeat' ? 'Cut back' : 'Cut'} kind="soft" small disabled={busy} onPress={() => void decide(false)} />
          </>
        )}
      </View>
    </View>
  );
}

/** Change one subscription or bill, or mark it cancelled (kept as history, out of the total). */
function BillSheet({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const a = useAspect();
  const bills = useBills();
  const [shown, setShown] = useState<Bill | null>(bill);
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState(1);
  if (bill && bill !== shown) { setShown(bill); setAmount(String(bill.amount)); setDay(bill.day); }
  const b = bill ?? shown;
  const n = amountOf(amount);
  const save = async () => {
    if (!b || !n) return;
    onClose();
    await act(bills.patch(b.id, { amount: n, day }), a.notice);
  };
  const cancel = async () => {
    if (!b) return;
    onClose();
    const r = await act(bills.patch(b.id, { state: 'cancelled', cancelled_at: new Date().toISOString(), leak: false }), a.notice);
    if (r) a.notice(`${b.name} marked cancelled`);
  };
  const remove = async () => {
    if (!b) return;
    onClose();
    await act(bills.remove(b.id), a.notice, "Couldn't remove that");
  };
  return (
    <Sheet open={!!bill} onClose={onClose} title={b?.name ?? ''}>
      <AmountInput value={amount} onChange={setAmount} label={`Amount ${b?.every === 'year' ? 'a year' : 'a month'}`} autoFocus={false} />
      <Stepper label="Day it is charged" value={day} onChange={setDay} min={1} max={31} format={(v) => `Charged on the ${ordinal(v)}`} />
      <Button label="Save" onPress={() => void save()} disabled={!n} />
      <Text style={t.small}>Cancelled it with the company? Mark it here so the monthly total stays true. This page never cancels anything for you.</Text>
      <Button label="Mark cancelled" kind="soft" onPress={() => void cancel()} />
      <Button label="Remove, it was a mistake" kind="quiet" onPress={() => void remove()} />
    </Sheet>
  );
}
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Add a subscription or bill: a name (common ones are chips), the amount, monthly or yearly, the day. */
function AddBillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const bills = useBills();
  const now = today();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [every, setEvery] = useState<'month' | 'year'>('month');
  const [day, setDay] = useState(Number(now.slice(8, 10)));
  const [mon, setMon] = useState(Number(now.slice(5, 7)));
  const n = amountOf(amount);
  const reset = () => { setName(''); setAmount(''); setEvery('month'); setDay(Number(now.slice(8, 10))); };
  const close = () => { onClose(); reset(); };
  const save = async (again: boolean) => {
    const nm = name.trim();
    if (!nm || !n) return;
    const doc: Omit<BillDoc, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> = { name: nm.slice(0, 60), amount: n, every, day, state: 'active', next: every === 'year' ? nextYearly(now, mon, day) : null };
    if (again) reset(); else close();
    const r = await act(bills.put(doc), a.notice);
    if (r) { haptic.medium(); if (again) a.notice(`Added ${nm}`); }
  };
  const used = new Set((bills.items ?? []).filter((b) => b.state !== 'cancelled').map((b) => b.name.toLowerCase()));
  return (
    <Sheet open={open} onClose={close} title="Add a subscription or bill">
      <Field label="Name" value={name} onChangeText={setName} placeholder="What it is" maxLength={60} autoFocus={open} />
      <ChipRow>
        {COMMON.filter((c) => !used.has(c.toLowerCase())).map((c) => <Chip key={c} label={c} selected={name === c} onPress={() => setName(c)} />)}
      </ChipRow>
      <AmountInput value={amount} onChange={setAmount} label="Amount in rupees" autoFocus={false} />
      <Segmented options={[{ key: 'month', label: 'Every month' }, { key: 'year', label: 'Every year' }] as const} value={every} onChange={setEvery} />
      {every === 'year' ? (
        <ChipRow>{MON.map((m, i) => <Chip key={m} label={m} selected={mon === i + 1} onPress={() => setMon(i + 1)} />)}</ChipRow>
      ) : null}
      <Stepper label="Day it is charged" value={day} onChange={setDay} min={1} max={31} format={(v) => `On the ${ordinal(v)}`} />
      <Button label="Save" onPress={() => void save(false)} disabled={!name.trim() || !n} />
      <Button label="Save and add another" kind="quiet" onPress={() => void save(true)} disabled={!name.trim() || !n} />
    </Sheet>
  );
}
function nextYearly(now: string, mon: number, day: number) {
  const y = Number(now.slice(0, 4));
  const pad = (v: number) => String(v).padStart(2, '0');
  const last = (yy: number) => new Date(Date.UTC(yy, mon, 0)).getUTCDate();
  const at = (yy: number) => `${yy}-${pad(mon)}-${pad(Math.min(day, last(yy)))}`;
  return at(y) >= now ? at(y) : at(y + 1);
}

/** One spend: fix its category, or remove it. */
function SpendSheet({ item, onClose, home }: { item: Spent | null; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const [shown, setShown] = useState<Spent | null>(item);
  const [picking, setPicking] = useState(false);
  if (item && item !== shown) setShown(item);
  const x = item ?? shown;
  const move = async (category: string) => {
    if (!x) return;
    onClose();
    await act(tx.patch(x.id, { category }), a.notice);
  };
  const remove = async () => {
    if (!x) return;
    onClose();
    await act(tx.remove(x.id), a.notice, "Couldn't remove that");
  };
  return (
    <>
      <Sheet open={!!item && !picking} onClose={onClose} title={x ? `${rupees(x.amount)}, ${x.merchant}` : ''}>
        <Text style={t.small}>{x ? `${dayLabel(x.date)}${x.statement ? ', from a bank statement' : ''}` : ''}</Text>
        <Row title="Category" right={x ? catName(home, x.category) : ''} onPress={() => setPicking(true)} chevron />
        <Button label="Remove this spend" kind="danger" onPress={() => void remove()} />
      </Sheet>
      <CategorySheet open={!!item && picking} onClose={() => setPicking(false)} cats={[...home.spend.cats, { id: 'bills', name: 'Bills' }]} value={x?.category ?? null}
        onPick={(id) => { setPicking(false); void move(id); }} />
    </>
  );
}

const s = StyleSheet.create({
  lead: { gap: SP[12] },
  figure: { gap: SP[4] },
  part: { gap: SP[12] },
  day: { gap: SP[8] },
  dayHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[4] },
  leak: { paddingVertical: SP[12], gap: SP[12] },
  leakTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SP[12] },
  leakActions: { flexDirection: 'row', gap: SP[8] },
});
