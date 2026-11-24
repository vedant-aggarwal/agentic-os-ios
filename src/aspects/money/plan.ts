import { useCollection, type Doc } from '@/lib/mod';
import { myDay } from '@/aspects/kit';
import type { Home } from './types';

// The monthly plan: rupees a month for each spending category, kept as money/budgets docs { id: <month>:<category>,
// month, category, amount }. A month without its own plan uses the latest month before it (the PC does the same), so
// changing one category in a carried month writes the whole carried plan into this month first.

export type BudgetDoc = Doc & { month: string; category: string; amount: number };
export const useBudgets = () => useCollection<BudgetDoc>('money', 'budgets');

/** This month's plan by category, and the month it was set in (null when there is no plan yet). */
export function planOf(docs: BudgetDoc[] | null, ym = myDay().slice(0, 7)): { by: Record<string, number>; from: string | null } {
  const live = (docs ?? []).filter((b) => !b.deleted_at && b.month && b.category);
  const months = [...new Set(live.map((b) => b.month))].filter((m) => m <= ym).sort();
  const from = months.includes(ym) ? ym : months.at(-1) ?? null;
  const by: Record<string, number> = {};
  if (from) for (const b of live) if (b.month === from) by[b.category] = Math.max(0, Number(b.amount) || 0);
  return { by, from };
}

/** Set one category's plan for this month (0 takes it out of the plan). Resolves when every write is queued. */
export function setPlan(col: ReturnType<typeof useBudgets>, category: string, amount: number) {
  const ym = myDay().slice(0, 7);
  const { by, from } = planOf(col.items, ym);
  const next = { ...by, [category]: Math.max(0, Math.round(amount)) };
  const writes: Promise<unknown>[] = [];
  for (const [cat, v] of Object.entries(next)) {
    if (from === ym && cat !== category) continue; // this month already has its own plan: only the one that changed
    writes.push(col.put({ id: `${ym}:${cat}`, month: ym, category: cat, amount: v }));
  }
  return Promise.all(writes);
}

/** This month's spending by category from the page's figures: share of each spend, bills apart. */
export function spentByCat(home: Home) {
  const by = new Map<string, number>();
  let bills = 0;
  for (const x of home.spend.recent) {
    if (x.bill || x.category === 'bills') { bills += x.share || x.amount; continue; }
    by.set(x.category, (by.get(x.category) ?? 0) + (x.share || x.amount));
  }
  /** The page lists the latest 80 spends of the month; past that the split is of those 80. */
  const partial = home.spend.recent.length >= 80;
  return { by, bills, partial };
}
