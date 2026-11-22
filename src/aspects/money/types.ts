// What GET /mod/money/home answers (server/modules/money-home.ts). Every figure is computed on the PC.

export type Source = { id: string; name: string; earned: boolean; custom: boolean };
export type Owed = {
  id: string; name: string; what: string | null; amount: number | null; approx: boolean; label: string; note: string | null;
  due: string | null; since: string | null; late: number | null;
};
export type Income = {
  id: string; amount: number; source: string; sourceName: string; from: string | null; note: string | null;
  date: string; at: string | null; by: string; earned: boolean;
};
export type Spent = {
  id: string; amount: number; share: number; merchant: string; category: string; bill: boolean;
  date: string; at: string | null; by: string; statement: string | null;
};
export type Bill = {
  id: string; name: string; amount: number; every: 'month' | 'year' | 'week'; monthly: number; day: number;
  next: string; ai: boolean; charged: boolean; note: string | null; found: boolean;
};
export type Ended = { id: string; name: string; amount: number; every: string; monthly: number; cancelledAt: string | null };
export type Leak = {
  id: string; kind: 'subscription' | 'repeat' | 'over' | 'flag'; title: string; amount: number; every: 'month' | 'year' | 'week' | null; monthly: boolean;
  meta: string | null; why: string | null; ref: string | null;
};
export type Repeat = { amount: number; merchant: string; category: string; n: number; last: string };
export type ImportBrief = { id: string; at: string; bank: string | null; period: { from: string; to: string } | null; counts: Record<string, number> | null; name: string | null };
export type Jar = {
  id: string; name: string; target: number | null; saved: number; left: number | null; pct: number | null;
  month: number; need: number | null; dueThisMonth: number | null; due: string | null; monthsLeft: number | null;
  late: boolean; done: boolean; onTrack: boolean | null; monthly: number | null; goal: string | null; aspect: string | null; last: number | null;
};
export type Account = {
  id: string; name: string; kind: string; group: string; liability: boolean; balance: number;
  asOf: string | null; ageDays: number | null; counted: boolean;
};

export type Home = {
  date: string;
  month: { ym: string; name: string; days: number; day: number; daysToGo: number };
  target: { amount: number | null; set: boolean; since: string | null };
  earn: {
    earned: number; otherIn: number; in: number; left: number | null; pct: number | null;
    sources: { id: string; name: string; amount: number; n: number; earned: boolean }[];
    months: { ym: string; label: string; earned: number; in: number }[];
    income: Income[];
    choices: Source[];
    pending: { items: Owed[]; total: number; count: number; unknown: number; approx: boolean } | null;
    pendingError: string | null;
  };
  spend: {
    budgeted: boolean;
    today: { spent: number; count: number; allowance: number | null; left: number | null };
    month: { spent: number; bills: number; out: number; budget: number | null; left: number | null; count: number };
    recurring: { monthly: number; ai: number; count: number; items: Bill[]; ended: Ended[] };
    leaks: Leak[];
    repeats: Repeat[];
    recent: Spent[];
    cats: { id: string; name: string }[];
    imports: { review: ImportBrief[]; lastFiled: { id: string; at: string; bank: string | null; period: { from: string; to: string } | null; n: number } | null };
  };
  save: {
    jars: Jar[]; total: { saved: number; target: number; month: number };
    accounts: Account[]; net: number | null; oldest: { date: string; ageDays: number } | null;
  };
};

/** A statement row as the PC sorted it (money-statement.ts). */
export type Row = {
  id: string; date: string; desc: string; amount: number; dir: 'dr' | 'cr'; merchant: string;
  status: 'new' | 'matched' | 'moved' | 'sub' | 'ask' | 'income'; category: string | null; why: string; person?: string | null;
};
export type Import = {
  id: string; status: 'queued' | 'reading' | 'review' | 'filed' | 'failed'; bank: string | null; name: string | null;
  period: { from: string; to: string } | null; rows: Row[]; counts: Record<string, number>; warnings?: string[];
  account: string | null; closing: number | null; filed?: { n: number; out: number; in: number; bills: number; at: string }; error?: string;
};
export type Decision = { action: 'add' | 'skip' | 'loan' | 'gift' | 'bill' | 'income'; category?: string };
