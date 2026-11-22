import { call, collection, invalidate, upload, useCollection, useGet, type Doc } from '@/lib/mod';
import type { Home, Import, Repeat } from './types';

// Money's data. Figures come from GET /mod/money/home, computed on the PC with the same arithmetic the agent and the
// widget use. Edits go through the module's collections (shown at once, sent in order) or its routes, then the
// figures are fetched again.

export const HOME = '/mod/money/home';
export const useHome = () => useGet<Home>(HOME);

const COLLS = ['transactions', 'recurring', 'funds', 'accounts', 'sources', 'leaks', 'imports'] as const;
/** After any write: the figures again, and the collections in case a route changed a record behind them. */
export function refresh(only?: (typeof COLLS)[number][]) {
  invalidate('/mod/money/');
  for (const c of only ?? COLLS) void collection('money', c).refresh();
}

export type TxDoc = Doc & {
  kind: 'out' | 'in' | 'move'; amount: number; category?: string | null; merchant?: string | null; note?: string;
  at?: string; source?: string; fund?: string; account?: string | null; from?: string;
};
export type BillDoc = Doc & {
  name: string; amount: number; every?: 'month' | 'year' | 'week'; day?: number; state?: string; group?: 'ai' | 'other';
  next?: string | null; cancelled_at?: string | null; leak?: boolean; why?: string;
};
export type FundDoc = Doc & { name: string; target?: number | null; start?: number; due?: string | null; monthly?: number | null; goal?: string | null; aspect?: string | null };
export type AccountDoc = Doc & { name: string; kind: string; balance: number; as_of: string; counted?: boolean };
export type SourceDoc = Doc & { name: string; kind: 'earned' | 'other' };

export const useTx = () => useCollection<TxDoc>('money', 'transactions');
export const useBills = () => useCollection<BillDoc>('money', 'recurring');
export const useFunds = () => useCollection<FundDoc>('money', 'funds');
export const useAccounts = () => useCollection<AccountDoc>('money', 'accounts');
export const useSources = () => useCollection<SourceDoc>('money', 'sources');

/** Run a write; refetch the figures after; turn a refusal into the page's notice. Resolves to the result or null. */
export async function act<T>(p: Promise<T>, notice: (t: string) => void, fail = "Couldn't save that"): Promise<T | null> {
  try {
    const r = await p;
    refresh();
    return r;
  } catch (e) {
    notice(`${fail}. ${(e as Error).message}`);
    return null;
  }
}

type Logged = { item: TxDoc & { id: string }; line: string };
export const logLine = (text: string) => call<Logged>('/mod/money/log', { text, source: 'app' });
export const logAgain = (r: Repeat) => call<Logged>('/mod/money/log', { amount: r.amount, merchant: r.merchant, category: r.category, source: 'app' });
export const setTarget = (amount: number | null) => call<{ target: Home['target'] }>('/mod/money/target', { amount });
export const decideLeak = (id: string, keep: boolean) => call(`/mod/money/leaks/${encodeURIComponent(id)}/decide`, { keep });

// statements
export type StatementFile = { id: string; name: string; where: 'inbox' | 'downloads'; size: number; at: string };
export const useStatementFiles = (on: boolean) => useGet<{ files: StatementFile[] }>(on ? '/mod/money/statements/files' : null);
export const useImport = (id: string | null) => useGet<{ item: Import }>(id ? `/mod/money/imports/${encodeURIComponent(id)}` : null);
export const readFile = (id: string, password?: string) => call<{ item: Import }>('/mod/money/statements/read', { id, password });
export const readPasted = (text: string) => call<{ item: Import }>('/mod/money/statement', { text, source: 'paste' });
export const uploadFile = (file: Blob & { name?: string }) =>
  upload<{ item: Import }>(`/mod/money/statements/upload?name=${encodeURIComponent(file.name ?? 'statement')}`, file, file.type || 'application/octet-stream');
export const fileImport = (id: string, decisions: Record<string, unknown>, account: string | null) =>
  call<{ item: Import; added: unknown[] }>(`/mod/money/imports/${encodeURIComponent(id)}/file`, { decisions, ...(account ? { account } : {}) });

/** Digits typed into an amount field, as rupees (null when empty or zero). */
export function amountOf(text: string): number | null {
  const n = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
