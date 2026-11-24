// Sample records for the `?demo` preview of the Money page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data: nobody's real money, clients, accounts or bills. The figures are worked out here from the
// sample records the way the PC works them out (GET /mod/money/home), so logging, putting in, planning and undo all
// move them. The phone never loads this file.
import { collection, demoSource, newId, type Doc } from '@/lib/mod';
import { addDays, daysBetween, myDay, shortDay } from '@/aspects/kit/time';
import type { Account, Bill, Ended, Home, Income, Jar, Leak, Owed, Repeat, Source, Spent } from '@/aspects/money/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const day = myDay();
/** `?demo&aspect=money&empty`: the page as it looks before anything is logged, to check the empty states. */
const EMPTY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('empty');
const ym = day.slice(0, 7);
const dom = Number(day.slice(8, 10));
const daysIn = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
const addMonths = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const dayIn = (m: string, d: number) => `${m}-${String(Math.min(d, daysIn(m))).padStart(2, '0')}`;
/** Noon India time on a day, as the PC stores it. */
const at = (d: string, hh = 6, mm = 30) => `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;

type Tx = Doc & { kind: 'out' | 'in' | 'move'; amount: number; category?: string | null; merchant?: string | null; note?: string; at?: string; source?: string; fund?: string; bill?: string; account?: string | null };
type BillDoc = Doc & { name: string; amount: number; every?: 'month' | 'year' | 'week'; day?: number; state?: string; group?: 'ai' | 'other'; next?: string | null; cancelled_at?: string | null; leak?: boolean };
type FundDoc = Doc & { name: string; target?: number | null; start?: number; due?: string | null; monthly?: number | null; goal?: string | null; aspect?: string | null };
type AccountDoc = Doc & { name: string; kind: string; balance: number; as_of: string; counted?: boolean };
type SourceDoc = Doc & { name: string; kind: 'earned' | 'other' };
type LeakDoc = Doc & Omit<Leak, 'id'> & { state: 'open' | 'decided'; decided?: string | null };
type BudgetDoc = Doc & { month: string; category: string; amount: number };
const stamp = { created_at: at(addDays(day, -60)), updated_at: at(addDays(day, -60)), deleted_at: null };

const CATS = [
  { id: 'food', name: 'Food & drinks' }, { id: 'transport', name: 'Transport' }, { id: 'shopping', name: 'Shopping' }, { id: 'college', name: 'College' },
  { id: 'family', name: 'Family' }, { id: 'fun', name: 'Fun' }, { id: 'health', name: 'Health & gym' }, { id: 'other', name: 'Other' },
];
const SOURCES: Omit<Source, 'custom'>[] = [
  { id: 'client', name: 'Client work', earned: true }, { id: 'shop', name: 'Shop sales', earned: true }, { id: 'content', name: 'Content', earned: true },
  { id: 'pocket', name: 'Pocket money', earned: false }, { id: 'gift', name: 'Gift', earned: false }, { id: 'refund', name: 'Refund', earned: false },
  { id: 'otherin', name: 'Other money in', earned: false },
];
const GUESS: [RegExp, string][] = [
  [/chai|tea|coffee|cafe|lunch|dinner|snack|food|zomato|swiggy|canteen|juice/i, 'food'], [/metro|auto|cab|uber|ola|bus|petrol|rickshaw/i, 'transport'],
  [/book|notes|xerox|print|stationery|fees/i, 'college'], [/movie|game|party|concert/i, 'fun'], [/gym|pharmacy|medicine|doctor/i, 'health'],
  [/shirt|shoes|jeans|amazon|flipkart|myntra/i, 'shopping'], [/groceries|home|mummy|papa/i, 'family'],
];

// ── the sample month ──
const txs: Tx[] = [];
const out = (d: string, amount: number, category: string, merchant: string, hh = 6) => txs.push({ id: `tx-${txs.length}`, ...stamp, kind: 'out', amount, category, merchant, at: at(d, hh), source: 'app' });
for (let i = 1; i <= dom; i++) {
  const d = dayIn(ym, i);
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  if (wd !== 0) out(d, 20, 'food', 'Chai', 4);
  if (wd >= 1 && wd <= 5) out(d, 40, 'transport', 'Metro', 3);
  if (wd === 1 || wd === 3 || wd === 5) out(d, 80, 'food', 'Canteen lunch', 7);
  if (wd === 2 || wd === 6) out(d, 160, 'food', 'Cafe coffee', 11);
}
const once: [number, number, string, string][] = [
  [2, 640, 'family', 'Groceries for home'], [6, 180, 'college', 'Stationery'], [9, 350, 'fun', 'Movie'], [14, 1899, 'shopping', 'Shoes'],
  [16, 220, 'health', 'Pharmacy'], [21, 450, 'college', 'Books'], [23, 500, 'other', 'Gift for a friend'],
];
for (const [d, amount, cat, name] of once) if (d <= dom) out(dayIn(ym, d), amount, cat, name, 9);
// last month, so the repeats and the months chart have something behind them
for (let i = 1; i <= 10; i++) out(addDays(dayIn(ym, 1), -i), 20, 'food', 'Chai', 4);

const BILLS: BillDoc[] = [
  { id: 'bill-ai', ...stamp, name: 'AI assistant', amount: 1999, every: 'month', day: 3, state: 'active', group: 'ai' },
  { id: 'bill-code', ...stamp, name: 'Code editor', amount: 1700, every: 'month', day: 27, state: 'active', group: 'ai' },
  { id: 'bill-phone', ...stamp, name: 'Phone plan', amount: 399, every: 'month', day: 28, state: 'active', group: 'other' },
  { id: 'bill-cloud', ...stamp, name: 'Cloud storage', amount: 130, every: 'month', day: 12, state: 'active', group: 'other' },
  { id: 'bill-music', ...stamp, name: 'Music app', amount: 119, every: 'month', day: 8, state: 'active', group: 'other', leak: true },
  { id: 'bill-domain', ...stamp, name: 'Website domain', amount: 899, every: 'year', day: 14, state: 'active', group: 'other', next: `${Number(day.slice(0, 4)) + 1}-02-14` },
  { id: 'bill-video', ...stamp, name: 'Video streaming', amount: 199, every: 'month', day: 20, state: 'cancelled', group: 'other', cancelled_at: at(addDays(day, -34)) },
];
for (const b of BILLS) {
  if (b.state === 'active' && b.every === 'month' && (b.day ?? 1) <= dom) {
    txs.push({ id: `tx-bill-${b.id}`, ...stamp, kind: 'out', amount: b.amount, category: 'bills', merchant: b.name, bill: b.id, at: at(dayIn(ym, b.day ?? 1), 2), source: 'recurring' });
  }
}

const inTx = (d: string, amount: number, category: string, note = '') => txs.push({ id: `tx-in-${txs.length}`, ...stamp, kind: 'in', amount, category, merchant: null, note, at: at(d, 8), source: 'app' });
if (dom >= 1) inTx(dayIn(ym, 1), 2000, 'pocket');
if (dom >= 5) inTx(dayIn(ym, 5), 25000, 'client', 'First half of a website');
if (dom >= 12) inTx(dayIn(ym, 12), 8500, 'shop', 'Weekend orders');
if (dom >= 18) inTx(dayIn(ym, 18), 3200, 'content', 'Two sponsored posts');
const PAST_EARNED = [41000, 52500, 38000, 61200, 57800];
PAST_EARNED.forEach((v, i) => {
  const m = addMonths(ym, i - 5);
  inTx(dayIn(m, 6), Math.round(v * 0.6), 'client');
  inTx(dayIn(m, 19), v - Math.round(v * 0.6), 'shop');
});

const FUNDS: FundDoc[] = [
  { id: 'jar-laptop', ...stamp, name: 'New laptop', target: 80000, start: 18000, due: dayIn(addMonths(ym, 5), 31), monthly: null, goal: null, aspect: null },
  { id: 'jar-cushion', ...stamp, name: 'Emergency cushion', target: 30000, start: 12000, due: null, monthly: 2000, goal: null, aspect: null },
  { id: 'jar-trip', ...stamp, name: 'Trip with friends', target: 12000, start: 12000, due: dayIn(addMonths(ym, 1), 31), monthly: null, goal: null, aspect: null },
];
const move = (d: string, amount: number, fund: string, name: string) => txs.push({ id: `tx-mv-${txs.length}`, ...stamp, kind: 'move', amount, fund, merchant: name, at: at(d, 10), source: 'app' });
move(dayIn(addMonths(ym, -2), 4), 4000, 'jar-laptop', 'New laptop');
move(dayIn(addMonths(ym, -1), 4), 4000, 'jar-laptop', 'New laptop');
move(dayIn(addMonths(ym, -1), 9), 2000, 'jar-cushion', 'Emergency cushion');
if (dom >= 3) move(dayIn(ym, 3), 3000, 'jar-laptop', 'New laptop');

const ACCOUNTS: AccountDoc[] = [
  { id: 'acct-bank', ...stamp, name: 'Savings account', kind: 'bank', balance: 42350, as_of: at(addDays(day, -2)), counted: true },
  { id: 'acct-cash', ...stamp, name: 'Cash', kind: 'cash', balance: 1800, as_of: at(day), counted: true },
  { id: 'acct-upi', ...stamp, name: 'UPI wallet', kind: 'upi', balance: 640, as_of: at(addDays(day, -9)), counted: true },
  { id: 'acct-card', ...stamp, name: 'Credit card', kind: 'card', balance: 3200, as_of: at(addDays(day, -2)), counted: true },
];

const PLAN: Record<string, number> = { food: 3500, transport: 1200, shopping: 2500, college: 1000, family: 1000, fun: 1500, health: 800, other: 500 };
const BUDGETS: BudgetDoc[] = Object.entries(PLAN).map(([category, amount]) => ({ id: `${ym}:${category}`, ...stamp, month: ym, category, amount }));

const LEAKS: LeakDoc[] = [
  { id: 'sub:bill-music', ...stamp, kind: 'subscription', title: 'Music app', amount: 119, every: 'month', monthly: true, meta: 'Charged on the 8th. Nothing else from it this month.', why: null, ref: 'bill-music', state: 'open' },
  { id: 'repeat:cafe', ...stamp, kind: 'repeat', title: 'Cafe coffee', amount: 1280, every: 'month', monthly: true, meta: 'Twice a week at ₹160 each', why: null, ref: null, state: 'open' },
];

let target: Home['target'] = EMPTY ? { amount: null, set: false, since: null } : { amount: 60000, set: true, since: addDays(day, -48) };

// ── the figures, worked out from the records each time they are asked for ──
/** A collection's records now. One no screen has opened yet starts from its sample records first (a demo pull is instant). */
function live<T extends Doc>(mod: string, coll: string): T[] {
  const c = collection<T>(mod, coll);
  if (!c.get()) void c.refresh();
  return (c.get() ?? []).filter((d) => !d.deleted_at);
}
const dayOfTx = (x: Tx) => myDay(x.at ?? x.created_at);
const sum = (xs: number[]) => xs.reduce((n, v) => n + v, 0);

function nextCharge(b: BillDoc) {
  if (b.every === 'year') return b.next ?? dayIn(ym, b.day ?? 1);
  if (b.every === 'week') return addDays(day, 7 - ((daysBetween(dayIn(ym, 1), day)) % 7));
  const here = dayIn(ym, b.day ?? 1);
  return here >= day ? here : dayIn(addMonths(ym, 1), b.day ?? 1);
}

function choicesOf(all: Tx[]): Source[] {
  const custom = live<SourceDoc>('money', 'sources').map((s) => ({ id: s.id, name: s.name, earned: s.kind === 'earned', custom: true }));
  const list: Source[] = [...SOURCES.map((s) => ({ ...s, custom: false })), ...custom];
  const n = new Map<string, number>();
  for (const x of all) if (x.kind === 'in' && x.category && daysBetween(dayOfTx(x), day) <= 90) n.set(x.category, (n.get(x.category) ?? 0) + 1);
  return list.sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0));
}

function jarsOf(all: Tx[]): Jar[] {
  return live<FundDoc>('money', 'funds').map((f) => {
    const moves = all.filter((x) => x.kind === 'move' && x.fund === f.id).sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
    const saved = (f.start ?? 0) + sum(moves.map((x) => x.amount));
    const month = sum(moves.filter((x) => dayOfTx(x).startsWith(ym)).map((x) => x.amount));
    const tgt = f.target ?? null;
    const left = tgt != null ? Math.max(0, tgt - saved) : null;
    const done = tgt != null && saved >= tgt;
    const due = f.due ?? null;
    const monthsLeft = due ? Math.max(0, (Number(due.slice(0, 4)) - Number(ym.slice(0, 4))) * 12 + Number(due.slice(5, 7)) - Number(ym.slice(5, 7)) + 1) : null;
    const late = !!due && due < day && !done;
    const need = done ? null : due && monthsLeft && left != null ? Math.ceil((left + month) / monthsLeft) : f.monthly ?? null;
    const dueThisMonth = need != null ? Math.max(0, need - month) : null;
    return {
      id: f.id, name: f.name, target: tgt, saved, left, pct: tgt ? Math.min(1, saved / tgt) : null, month, need, dueThisMonth: dueThisMonth || null, due,
      monthsLeft, late, done, onTrack: need != null ? month >= need : null, monthly: f.monthly ?? null, goal: f.goal ?? null, aspect: f.aspect ?? null,
      last: moves.at(-1)?.amount ?? null,
    };
  });
}

function home(): Home {
  const all = live<Tx>('money', 'transactions');
  const thisMonth = all.filter((x) => dayOfTx(x).startsWith(ym));
  const choices = choicesOf(all);
  const srcOf = (id: string | null | undefined) => choices.find((c) => c.id === id) ?? { id: 'otherin', name: 'Other money in', earned: false, custom: false };

  // earn
  const ins = thisMonth.filter((x) => x.kind === 'in');
  const earned = sum(ins.filter((x) => srcOf(x.category).earned).map((x) => x.amount));
  const inAll = sum(ins.map((x) => x.amount));
  const bySource = new Map<string, { id: string; name: string; amount: number; n: number; earned: boolean }>();
  for (const x of ins) {
    const s = srcOf(x.category);
    const row = bySource.get(s.id) ?? { id: s.id, name: s.name, amount: 0, n: 0, earned: s.earned };
    row.amount += x.amount; row.n += 1; bySource.set(s.id, row);
  }
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(ym, i - 5);
    const mi = all.filter((x) => x.kind === 'in' && dayOfTx(x).startsWith(m));
    return { ym: m, label: MON[Number(m.slice(5, 7)) - 1], earned: sum(mi.filter((x) => srcOf(x.category).earned).map((x) => x.amount)), in: sum(mi.map((x) => x.amount)) };
  });
  const income: Income[] = ins.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).map((x) => {
    const s = srcOf(x.category);
    return { id: x.id, amount: x.amount, source: s.id, sourceName: s.custom ? s.name : x.merchant || s.name, from: null, note: x.note || null, date: dayOfTx(x), at: x.at ?? null, by: x.source ?? 'app', earned: s.earned };
  });
  const owed: Owed[] = [
    { id: 'owed-1', name: 'Sample client A', what: 'Website, second half', amount: 25000, approx: false, label: '₹25,000', note: null, due: addDays(day, 5), since: `Since ${shortDay(addDays(day, -13))}`, late: null },
    { id: 'owed-2', name: 'Sample client B', what: 'Logo work', amount: null, approx: false, label: 'Amount not set', note: 'Waiting on the final quote', due: null, since: null, late: null },
  ];

  // spend
  const outs = thisMonth.filter((x) => x.kind === 'out');
  const isBill = (x: Tx) => x.category === 'bills' || !!x.bill;
  const spends = outs.filter((x) => !isBill(x));
  const spent = sum(spends.map((x) => x.amount));
  const bills = sum(outs.filter(isBill).map((x) => x.amount));
  const todays = spends.filter((x) => dayOfTx(x) === day);
  const todaySpent = sum(todays.map((x) => x.amount));
  const budgets = live<BudgetDoc>('money', 'budgets');
  const planMonths = [...new Set(budgets.map((b) => b.month))].filter((m) => m <= ym).sort();
  const planFrom = planMonths.includes(ym) ? ym : planMonths.at(-1) ?? null;
  const planTotal = planFrom ? sum(budgets.filter((b) => b.month === planFrom).map((b) => Math.max(0, b.amount))) : 0;
  const budgeted = planTotal > 0;
  const jars = jarsOf(all);
  const savedMonth = sum(jars.map((j) => j.month));
  const budget = budgeted ? Math.max(0, planTotal - savedMonth) : null;
  const daysToGo = daysIn(ym) - dom + 1;
  const spentBefore = spent - todaySpent;
  const allowance = budget != null ? Math.max(0, Math.round((budget - spentBefore) / daysToGo)) : null;

  const active = live<BillDoc>('money', 'recurring').filter((b) => b.state !== 'cancelled');
  const ended: Ended[] = live<BillDoc>('money', 'recurring').filter((b) => b.state === 'cancelled').map((b) => ({
    id: b.id, name: b.name, amount: b.amount, every: b.every ?? 'month', monthly: b.every === 'year' ? Math.round(b.amount / 12) : b.amount, cancelledAt: b.cancelled_at ?? null,
  }));
  const items: Bill[] = active.map((b) => {
    const monthly = b.every === 'year' ? Math.round(b.amount / 12) : b.every === 'week' ? Math.round((b.amount * 52) / 12) : b.amount;
    const charged = outs.some((x) => x.bill === b.id);
    return {
      id: b.id, name: b.name, amount: b.amount, every: b.every ?? 'month', monthly, day: b.day ?? 1, next: nextCharge(b), ai: b.group === 'ai', charged, note: null, found: false,
      thisMonth: charged ? b.amount : 0,
    };
  }).sort((a, b) => a.next.localeCompare(b.next));

  const leaks: Leak[] = live<LeakDoc>('money', 'leaks').filter((l) => l.state === 'open').map((l) => ({
    id: l.id, kind: l.kind, title: l.title, amount: l.amount, every: l.every, monthly: l.monthly, meta: l.meta, why: l.why, ref: l.ref,
  }));

  const groups = new Map<string, Repeat>();
  for (const x of all) {
    if (x.kind !== 'out' || isBill(x) || daysBetween(dayOfTx(x), day) > 30 || !x.merchant) continue;
    const k = `${x.merchant}|${x.amount}`;
    const g = groups.get(k) ?? { amount: x.amount, merchant: x.merchant, category: x.category ?? 'other', n: 0, last: dayOfTx(x) };
    g.n += 1; if (dayOfTx(x) > g.last) g.last = dayOfTx(x);
    groups.set(k, g);
  }
  const repeats = [...groups.values()].filter((g) => g.n >= 3).sort((a, b) => b.n - a.n).slice(0, 6);

  const recent: Spent[] = outs.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 80).map((x) => ({
    id: x.id, amount: x.amount, share: x.amount, merchant: x.merchant || (CATS.find((c) => c.id === x.category)?.name ?? 'Spend'), category: x.category ?? 'other',
    bill: isBill(x), date: dayOfTx(x), at: x.at ?? null, by: x.source ?? 'app', statement: null,
  }));

  // save
  const accounts: Account[] = live<AccountDoc>('money', 'accounts').map((x) => {
    const asOf = x.as_of ? myDay(x.as_of) : null;
    return {
      id: x.id, name: x.name, kind: x.kind, group: x.kind, liability: x.kind === 'card' || x.kind === 'loan', balance: x.balance,
      asOf, ageDays: asOf ? Math.max(0, daysBetween(asOf, day)) : null, counted: x.counted !== false,
    };
  });
  const net = accounts.length ? sum(accounts.filter((x) => x.counted).map((x) => (x.liability ? -x.balance : x.balance))) : null;
  const oldestAcct = accounts.filter((x) => x.asOf).sort((a, b) => (a.asOf ?? '').localeCompare(b.asOf ?? ''))[0];

  return {
    date: day,
    month: { ym, name: MONTH[Number(ym.slice(5, 7)) - 1], days: daysIn(ym), day: dom, daysToGo },
    target,
    earn: {
      earned, otherIn: inAll - earned, in: inAll, left: target.amount != null ? Math.max(0, target.amount - earned) : null, pct: target.amount ? earned / target.amount : null,
      sources: [...bySource.values()].sort((a, b) => b.amount - a.amount), months, income, choices,
      pending: EMPTY ? null : { items: owed, total: sum(owed.map((o) => o.amount ?? 0)), count: owed.length, unknown: owed.filter((o) => o.amount == null).length, approx: false },
      pendingError: null,
    },
    spend: {
      budgeted,
      today: { spent: todaySpent, count: todays.length, allowance, left: allowance != null ? allowance - todaySpent : null },
      month: { spent, bills, out: spent + bills, budget, left: budget != null ? budget - spent : null, count: spends.length },
      recurring: {
        monthly: sum(items.map((b) => b.monthly)), ai: sum(items.filter((b) => b.ai).map((b) => b.monthly)), count: items.length, items, ended,
      },
      leaks, repeats, recent, cats: CATS,
      imports: { review: [], lastFiled: EMPTY ? null : { id: 'imp-sample', at: at(dayIn(ym, Math.min(3, dom))), bank: 'Sample bank', period: { from: dayIn(addMonths(ym, -1), 1), to: dayIn(addMonths(ym, -1), 31) }, n: 42 } },
    },
    save: {
      jars, total: { saved: sum(jars.map((j) => j.saved)), target: sum(jars.map((j) => j.target ?? 0)), month: savedMonth },
      accounts, net, oldest: oldestAcct?.asOf ? { date: oldestAcct.asOf, ageDays: oldestAcct.ageDays ?? 0 } : null,
    },
  };
}

/** The one line log and the spend keys: an amount, maybe words; the category is where that place went last time. */
function log(body: { text?: string; amount?: number; merchant?: string; category?: string }) {
  let amount = Number(body.amount) || 0;
  let merchant = (body.merchant ?? '').trim();
  if (body.text) {
    const m = /^\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)\s*(?:rs|rupees)?\s*(?:for|on|at)?\s*(.*)$/i.exec(body.text);
    if (!m) throw new Error('Start with the amount, like 20 for chai');
    amount = Number(m[1]); merchant = m[2].trim();
  }
  if (!amount) throw new Error('Start with the amount, like 20 for chai');
  const name = merchant ? merchant.charAt(0).toUpperCase() + merchant.slice(1) : '';
  const before = name ? live<Tx>('money', 'transactions').filter((x) => x.kind === 'out' && x.merchant?.toLowerCase() === name.toLowerCase()).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0] : undefined;
  const category = body.category ?? before?.category ?? GUESS.find(([re]) => re.test(name))?.[1] ?? 'other';
  const now = new Date().toISOString();
  const item: Tx = { id: newId(), created_at: now, updated_at: now, deleted_at: null, kind: 'out', amount, category, merchant: name || null, at: now, source: 'app' };
  collection<Tx>('money', 'transactions').put(item);
  return { item, line: `Logged ₹${amount}${name ? ` for ${name}` : ''}` };
}

demoSource({
  collections: {
    'money/transactions': EMPTY ? [] : txs,
    'money/recurring': EMPTY ? [] : BILLS,
    'money/funds': EMPTY ? [] : FUNDS,
    'money/accounts': EMPTY ? [] : ACCOUNTS,
    'money/budgets': EMPTY ? [] : BUDGETS,
    'money/leaks': EMPTY ? [] : LEAKS,
    'money/sources': [],
    'money/imports': [],
  },
  gets: {
    '/mod/money/home': () => home(),
    '/mod/money/statements/files': (_p: string, q: URLSearchParams) => ({ where: q.get('where') === 'downloads' ? 'downloads' : 'inbox', files: [] }),
    '/mod/money/summary': () => {
      const h = home();
      return {
        today: h.spend.today.allowance != null ? { allowance: h.spend.today.allowance, spent: h.spend.today.spent, left: h.spend.today.left ?? 0 } : null,
        month: h.spend.month.budget != null ? { name: h.month.name, budget: h.spend.month.budget, spent: h.spend.month.spent, left: h.spend.month.left ?? 0, daysLeft: h.month.daysToGo } : null,
        income: { earned: h.earn.earned, goal: h.target.amount ?? 0, goalSet: h.target.amount != null },
      };
    },
  },
  calls: {
    '/mod/money/log': (body) => log(body ?? {}),
    '/mod/money/target': (body: { amount: number | null }) => {
      target = body?.amount ? { amount: Math.round(body.amount), set: true, since: day } : { amount: null, set: false, since: null };
      return { target };
    },
    '/mod/money/leaks/*': (body: { keep: boolean }, info) => {
      const id = decodeURIComponent(info.path.split('/')[4] ?? '');
      const leaks = collection<LeakDoc>('money', 'leaks');
      const leak = leaks.get()?.find((l) => l.id === id);
      if (!leak) throw new Error('That is no longer open');
      const next = { ...leak, state: 'decided' as const, decided: body?.keep ? 'keep' : 'cut' };
      leaks.put(next);
      if (!body?.keep && leak.ref && id.startsWith('sub:')) {
        const bills = collection<BillDoc>('money', 'recurring');
        const bill = bills.get()?.find((b) => b.id === leak.ref);
        if (bill) bills.put({ ...bill, state: 'cancelled', cancelled_at: new Date().toISOString(), leak: false });
      }
      return { leak: next, bill: null };
    },
  },
});
