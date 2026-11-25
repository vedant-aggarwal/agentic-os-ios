import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/theme';
import {
  Bar, Block, Button, Chip, dayLabel, Field, Group, haptic, Icon, Item, MonthDayPicker, myDay, Press, rupees, Segmented, Sheet, shortDay, SP, t, undoable, useAspect,
} from '@/aspects/kit';
import { collection, type Doc } from '@/lib/mod';
import { act, amountOf, decideLeak, useBills, useTx, type BillDoc, type TxDoc } from './data';
import { LogLine } from './log';
import { useNav } from './nav';
import { AmountSheet } from './pad';
import { planOf, setPlan, spentByCat, useBudgets } from './plan';
import type { Bill, Home, Leak, Spent } from './types';
import { AmountInput, CategorySheet, ChipRow, ChipWrap, s as u } from './ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// common names, so the first few take seconds to add; AI tools first, as they cost him the most
const COMMON = ['Claude', 'ChatGPT', 'Cursor', 'GitHub Copilot', 'Google One', 'iCloud', 'YouTube Premium', 'Netflix', 'Spotify', 'Phone plan', 'Home wifi'];

/** "Today: ₹120 left of ₹500" when he has a budget; otherwise what went out. */
export function todayLine(home: Home) {
  const d = home.spend.today;
  if (d.allowance != null && d.left != null) return d.left >= 0 ? `${rupees(d.left)} left of today's ${rupees(d.allowance)}` : `${rupees(-d.left)} over today's ${rupees(d.allowance)}`;
  return d.count === 0 ? 'Nothing logged yet' : d.count === 1 ? 'One spend' : `${d.count} spends`;
}

/**
 * Spend: where this month's money went by category (each with its plan, set in one tap), the one line log, every
 * spend by day, the subscriptions and bills, what the PC thinks could be cut, and the bank statement.
 */
export function SpendTab({ home }: { home: Home }) {
  const a = useAspect();
  const nav = useNav();
  const { spend, month } = home;
  const [bill, setBill] = useState<Bill | null>(null);
  const [tx, setTx] = useState<Spent | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const [allDays, setAllDays] = useState(false);
  const rec = spend.recurring;
  const days = groupByDay(spend.recent);
  const shown = allDays ? days : days.slice(0, 4);
  return (
    <>
      <WhereItWent home={home} />

      <Block title="Log in one line" sub="Type it the way you would say it. The PC picks the category.">
        <LogLine home={home} />
      </Block>

      <Block title={`${month.name} so far`} right={spend.month.spent > 0 ? <Text style={[t.subhead, t.num, { color: C.muted }]}>{rupees(spend.month.spent)}</Text> : undefined}>
        {days.length ? shown.map((d) => (
          <View key={d.date} style={u.gap8}>
            <View style={[u.between, s.dayHead]}>
              <Text style={t.subhead}>{dayLabel(d.date)}</Text>
              <Text style={[t.subhead, t.num]}>{rupees(d.total)}</Text>
            </View>
            <Group>
              {d.rows.map((x) => (
                <Item key={x.id} title={x.merchant} sub={[catName(home, x.category), x.statement ? 'from a statement' : null].filter(Boolean).join(', ')}
                  right={<Text style={[t.callout, t.num]}>{rupees(x.amount)}</Text>} onPress={() => setTx(x)}
                  label={`${x.merchant}, ${rupees(x.amount)}, ${catName(home, x.category)}. Change`} />
              ))}
            </Group>
          </View>
        )) : (
          <Group pad>
            <Text style={t.callout}>Nothing logged this month yet</Text>
            <Text style={t.footnote}>Log a spend from Today, type one above, or fill the month in from a bank statement.</Text>
          </Group>
        )}
        {days.length > 4 ? (
          <Button label={allDays ? 'Show fewer days' : `Show all ${days.length} days`} kind="quiet" small onPress={() => setAllDays((v) => !v)} />
        ) : null}
      </Block>

      <Block title="Subscriptions and bills" action="Add" onAction={() => nav.openSheet({ kind: 'bill' })}
        sub={rec.count ? `${rupees(rec.monthly)} a month${rec.ai > 0 && rec.ai < rec.monthly ? `, AI tools ${rupees(rec.ai)} of it` : rec.ai > 0 ? ', all AI tools' : ''}.` : null}>
        {rec.count ? (
          <Group>
            {rec.items.map((b) => (
              <Item key={b.id} title={b.name} sub={billSub(b)} right={<Text style={[t.callout, t.num]}>{rupees(b.every === 'month' ? b.amount : b.monthly)}</Text>}
                onPress={() => setBill(b)} chevron label={`${b.name}, ${rupees(b.amount)} ${b.every === 'year' ? 'a year' : b.every === 'week' ? 'a week' : 'a month'}, next on ${shortDay(b.next)}`} />
            ))}
          </Group>
        ) : (
          <Group pad>
            <Text style={t.callout}>What leaves every month on its own</Text>
            <Text style={t.footnote}>AI tools, your phone plan, storage. Add them once and the monthly total stays right.</Text>
            <View style={s.left}><Button label="Add the first" kind="soft" small onPress={() => nav.openSheet({ kind: 'bill' })} /></View>
          </Group>
        )}
        {rec.ended.length ? (
          <Press label={showEnded ? 'Hide cancelled' : 'Show cancelled'} onPress={() => setShowEnded((v) => !v)} hitSlop={8}>
            <Text style={[t.footnote, t.num]}>
              {`${rec.ended.length === 1 ? 'One cancelled' : `${rec.ended.length} cancelled`}, ${rupees(rec.ended.reduce((n, x) => n + x.monthly, 0))} a month you no longer pay. `}
              <Text style={{ color: a.color }}>{showEnded ? 'Hide' : 'Show'}</Text>
            </Text>
          </Press>
        ) : null}
        {showEnded && rec.ended.length ? (
          <Group>{rec.ended.map((x) => <Item key={x.id} title={x.name} sub={x.cancelledAt ? `Cancelled ${dayLabel(x.cancelledAt.slice(0, 10))}` : 'Cancelled'} value={rupees(x.amount)} />)}</Group>
        ) : null}
      </Block>

      {spend.leaks.length ? (
        <Block title="Keep or cut" sub="What the PC noticed. One question each; nothing is cancelled for you.">
          <Group>{spend.leaks.map((l) => <LeakRow key={l.id} leak={l} />)}</Group>
        </Block>
      ) : null}

      <Block title="Bank statement">
        <Group inset={64}>
          {spend.imports.review.map((i) => (
            <Item key={i.id} title={`Review ${i.bank ?? 'the statement'}`} onPress={() => nav.openStatement(i.id)} chevron left={<Glyph name="clock" />}
              sub={[i.period ? `${shortDay(i.period.from)} to ${shortDay(i.period.to)}` : null, i.counts ? waitingCount(i.counts) : null].filter(Boolean).join(', ')} />
          ))}
          <Item title="Fill in from a statement" onPress={() => nav.openStatement(null)} chevron left={<Glyph name="plus" />}
            sub={spend.imports.lastFiled ? `Last one filed ${dayLabel(spend.imports.lastFiled.at.slice(0, 10))}` : 'The spends you did not log, once a month'} />
        </Group>
      </Block>

      <BillSheet bill={bill} onClose={() => setBill(null)} />
      <SpendSheet item={tx} onClose={() => setTx(null)} home={home} />
    </>
  );
}

function Glyph({ name }: { name: 'clock' | 'plus' }) {
  return <View style={s.glyph}><Icon name={name} size={18} color={C.textSoft} /></View>;
}

/** Where it went: each category this month against its plan. A tap sets the plan on big keys. */
function WhereItWent({ home }: { home: Home }) {
  const a = useAspect();
  const budgets = useBudgets();
  const [planning, setPlanning] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const plan = planOf(budgets.items);
  const { by, partial } = spentByCat(home);
  const used = home.spend.cats.filter((c) => (by.get(c.id) ?? 0) > 0 || (plan.by[c.id] ?? 0) > 0)
    .sort((x, y) => (by.get(y.id) ?? 0) - (by.get(x.id) ?? 0) || (plan.by[y.id] ?? 0) - (plan.by[x.id] ?? 0));
  const rest = home.spend.cats.filter((c) => !used.includes(c));
  const top = Math.max(1, ...used.map((c) => Math.max(by.get(c.id) ?? 0, plan.by[c.id] ?? 0)));
  const planned = Object.values(plan.by).some((v) => v > 0);
  const name = (id: string) => home.spend.cats.find((c) => c.id === id)?.name ?? 'Other';
  const save = async (cat: string, v: number | null) => {
    setPlanning(null);
    const r = await act(setPlan(budgets, cat, v ?? 0), a.notice, "Couldn't save the plan");
    if (r) { haptic.medium(); a.notice(v ? `${name(cat)}: ${rupees(v)} a month` : `${name(cat)} is out of the plan`); }
  };
  return (
    <Block title="Where it went" sub={planned ? 'Each category against its plan. Tap one to change it.' : 'Tap a category to give it a monthly plan.'}>
      {used.length ? (
        <Group>
          {used.map((c) => {
            const spent = by.get(c.id) ?? 0;
            const p = plan.by[c.id] ?? 0;
            const over = p > 0 && spent > p;
            const sub = p > 0 ? (over ? `${rupees(spent - p)} over the ${rupees(p)} plan` : spent === p ? `Right at the ${rupees(p)} plan` : `${rupees(p - spent)} left of ${rupees(p)}`) : 'No plan yet';
            return (
              <Press key={c.id} label={`${c.name}, ${rupees(spent)}, ${sub}. Change the plan`} onPress={() => setPlanning(c.id)} scale={0.99} style={s.cat}>
                <View style={u.between}>
                  <Text style={[t.callout, u.fill]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[t.headline, t.num]}>{rupees(spent)}</Text>
                </View>
                <Bar progress={p > 0 ? spent / p : spent / top} height={6} color={over ? C.muted : a.color} />
                <Text style={[t.footnote, t.num]}>{sub}</Text>
              </Press>
            );
          })}
        </Group>
      ) : (
        <Group pad>
          <Text style={t.callout}>No spends this month yet</Text>
          <Text style={t.footnote}>Give a category a plan now, or wait for the month to fill in.</Text>
        </Group>
      )}
      {home.spend.month.bills > 0 ? <Text style={[t.footnote, t.num]}>{`Bills so far: ${rupees(home.spend.month.bills)}, kept apart from the plan.`}</Text> : null}
      {partial ? <Text style={t.micro}>From the latest 80 spends of the month.</Text> : null}
      {rest.length ? <View style={s.left}><Button label={planned ? 'Plan another category' : 'Plan a category'} kind="quiet" small onPress={() => setChoosing(true)} /></View> : null}
      <CategorySheet open={choosing} onClose={() => setChoosing(false)} cats={rest} value={null} title="Plan which category" onPick={(id) => setPlanning(id)} />
      <AmountSheet open={planning != null} onClose={() => setPlanning(null)} title={planning ? `Plan for ${name(planning).toLowerCase()}` : 'Plan'}
        sub={`A month. Spends in it count against the plan; bills stay apart.${planning && (by.get(planning) ?? 0) > 0 ? ` ${rupees(by.get(planning) ?? 0)} spent so far this month.` : ''}`}
        start={planning ? plan.by[planning] ?? null : null} done="Save plan" onDone={(n) => { if (planning) void save(planning, n); }}
        extra={planning && (plan.by[planning] ?? 0) > 0 ? <Button label="Take it out of the plan" kind="quiet" onPress={() => { if (planning) void save(planning, 0); }} /> : undefined} />
    </Block>
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
  const bills = useBills();
  const [busy, setBusy] = useState(false);
  const decide = async (keep: boolean) => {
    // what Undo puts back: the bill as it was before a cut (the PC marks it cancelled)
    const billBefore = leak.ref ? bills.items?.find((b) => b.id === leak.ref) ?? null : null;
    setBusy(true);
    const r = (await act(decideLeak(leak.id, keep), a.notice)) as { leak: Doc; bill: Doc | null } | null;
    setBusy(false);
    if (!r) return;
    haptic.medium();
    undoable(leak.kind === 'over' ? `Noted: ${leak.title}` : keep ? `Kept ${leak.title}` : `${leak.title}: marked to cut`, async () => {
      const steps: Promise<unknown>[] = [collection<Doc & { state?: string; decided?: string | null }>('money', 'leaks').put({ ...r.leak, state: 'open', decided: null })];
      // a cut bill comes back as it was; a bill made by keeping a found charge goes again
      if (billBefore && leak.id.startsWith('sub:')) steps.push(bills.put(billBefore));
      else if (r.bill && leak.id.startsWith('charge:')) steps.push(bills.remove(r.bill.id));
      await act(Promise.all(steps), a.notice, "Couldn't undo that");
    });
  };
  const info = leak.kind === 'over';
  return (
    <View style={s.leak}>
      <View style={s.leakTop}>
        <View style={u.fill}>
          <Text style={t.callout} numberOfLines={2}>{leak.title}</Text>
          {leak.meta ? <Text style={t.footnote} numberOfLines={2}>{leak.meta}</Text> : null}
        </View>
        <Text style={[t.subhead, t.num]}>{rupees(leak.amount)}{leak.every === 'year' ? ' a year' : leak.every === 'week' ? ' a week' : leak.monthly ? ' a month' : ''}</Text>
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
  const [day, setDay] = useState<number | null>(null);
  if (bill && bill !== shown) { setShown(bill); setAmount(String(bill.amount)); setDay(bill.day); }
  const b = bill ?? shown;
  const n = amountOf(amount);
  const doc = () => (b ? bills.items?.find((x) => x.id === b.id) ?? null : null);
  const save = async () => {
    if (!b || !n || !day) return;
    onClose();
    // a yearly bill's next charge moves with its day, in the same month
    const next = b.every === 'year' && day !== b.day ? nextYearly(myDay(), Number((doc()?.next ?? b.next).slice(5, 7)), day) : undefined;
    await act(bills.patch(b.id, { amount: n, day, ...(next ? { next } : {}) }), a.notice);
  };
  const cancel = async () => {
    const before = doc();
    if (!b) return;
    onClose();
    const r = await act(bills.patch(b.id, { state: 'cancelled', cancelled_at: new Date().toISOString(), leak: false }), a.notice);
    if (r && before) undoable(`${b.name} marked cancelled`, () => void act(bills.put(before), a.notice, "Couldn't undo that"));
  };
  const remove = async () => {
    const before = doc();
    if (!b) return;
    onClose();
    const r = await act(bills.remove(b.id).then(() => true), a.notice, "Couldn't remove that");
    if (r && before) undoable(`Removed ${b.name}`, () => void act(bills.put(before), a.notice, "Couldn't undo that"));
  };
  return (
    <Sheet open={!!bill} onClose={onClose} title={b?.name ?? ''}>
      <AmountInput value={amount} onChange={setAmount} label={`Amount ${b?.every === 'year' ? 'a year' : 'a month'}`} autoFocus={false} />
      <Text style={t.footnote}>{day ? `Charged on the ${ordinal(day)}` : 'Day it is charged'}</Text>
      <MonthDayPicker value={day} onChange={setDay} />
      <Button label="Save" onPress={() => void save()} disabled={!n || !day} />
      <Text style={t.footnote}>Cancelled it with the company? Mark it here so the monthly total stays true. This page never cancels anything for you.</Text>
      <Button label="Mark cancelled" kind="soft" onPress={() => void cancel()} />
      <Button label="Remove, it was a mistake" kind="quiet" onPress={() => void remove()} />
    </Sheet>
  );
}
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Add a subscription or bill: a name (common ones are chips), the amount, monthly or yearly, the day. */
export function AddBillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const bills = useBills();
  const now = myDay();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [every, setEvery] = useState<'month' | 'year'>('month');
  const [day, setDay] = useState<number | null>(null);
  const [mon, setMon] = useState(Number(now.slice(5, 7)));
  const n = amountOf(amount);
  const reset = () => { setName(''); setAmount(''); setEvery('month'); setDay(null); };
  const close = () => { onClose(); reset(); };
  const save = async (again: boolean) => {
    const nm = name.trim();
    if (!nm || !n || !day) return;
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
      <Text style={t.footnote}>{day ? `Charged on the ${ordinal(day)}` : 'Day it is charged'}</Text>
      <MonthDayPicker value={day} onChange={setDay} />
      <Button label="Save" onPress={() => void save(false)} disabled={!name.trim() || !n || !day} />
      <Button label="Save and add another" kind="quiet" onPress={() => void save(true)} disabled={!name.trim() || !n || !day} />
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

/** One spend: a tap on a category moves it there; the amount can change; it can go. Each with Undo. */
function SpendSheet({ item, onClose, home }: { item: Spent | null; onClose: () => void; home: Home }) {
  const a = useAspect();
  const tx = useTx();
  const [shown, setShown] = useState<Spent | null>(item);
  const [amounting, setAmounting] = useState(false);
  if (item && item !== shown) { setShown(item); setAmounting(false); }
  const x = item ?? shown;
  const cats = [...home.spend.cats, { id: 'bills', name: 'Bills' }];
  const move = async (category: string) => {
    if (!x || category === x.category) return;
    const was = x.category;
    onClose();
    const r = await act(tx.patch(x.id, { category }), a.notice);
    if (r) undoable(`${x.merchant} moved to ${catName(home, category)}`, () => void act(tx.patch(x.id, { category: was }), a.notice, "Couldn't undo that"));
  };
  const reprice = async (amount: number) => {
    if (!x || amount === x.amount) return;
    const was = x.amount;
    const r = await act(tx.patch(x.id, { amount }), a.notice);
    if (r) undoable(`${x.merchant} is now ${rupees(amount)}`, () => void act(tx.patch(x.id, { amount: was }), a.notice, "Couldn't undo that"));
  };
  const remove = async () => {
    if (!x) return;
    const before = tx.items?.find((d) => d.id === x.id) ?? null;
    onClose();
    const r = await act(tx.remove(x.id).then(() => true), a.notice, "Couldn't remove that");
    if (r && before) undoable(`Removed ${rupees(x.amount)}, ${x.merchant}`, () => void act(tx.put(before as TxDoc), a.notice, "Couldn't undo that"));
  };
  return (
    <>
      <Sheet open={!!item && !amounting} onClose={onClose} title={x ? `${rupees(x.amount)}, ${x.merchant}` : ''}>
        <Text style={t.subhead}>{x ? `${dayLabel(x.date)}${x.statement ? ', from a bank statement' : ''}. Tap a category to move it.` : ''}</Text>
        <ChipWrap>
          {cats.map((c) => <Chip key={c.id} label={c.name} selected={x?.category === c.id} onPress={() => void move(c.id)} />)}
        </ChipWrap>
        <Button label="Change the amount" kind="quiet" onPress={() => setAmounting(true)} />
        <Button label="Remove this spend" kind="quiet" onPress={() => void remove()} />
      </Sheet>
      <AmountSheet open={!!item && amounting} onClose={() => setAmounting(false)} title={x ? x.merchant : 'Amount'} start={x?.amount ?? null}
        done="Save" withAmount onDone={(n) => { setAmounting(false); onClose(); void reprice(n); }} />
    </>
  );
}

const s = StyleSheet.create({
  dayHead: { paddingHorizontal: SP[4] },
  left: { alignSelf: 'flex-start' },
  glyph: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  cat: { paddingHorizontal: SP[16], paddingVertical: SP[12], gap: SP[8], minHeight: 72 },
  leak: { paddingVertical: SP[12], paddingHorizontal: SP[16], gap: SP[12] },
  leakTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SP[12] },
  leakActions: { flexDirection: 'row', gap: SP[8] },
});
