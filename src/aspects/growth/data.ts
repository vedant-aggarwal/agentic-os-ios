import { today } from '@/aspects/kit';
import { call, invalidate } from '@/lib/mod';
import type { AspectKey } from '@/theme';
import type { MorningRead, ReviewDoc, RuleSum, Verdict } from './types';

// Growth's reads and writes. Computed routes are read with useGet; everything that changes them invalidates the
// module's prefix so the page redraws from the PC's answer.
export const HOME = '/mod/growth/home';
export const WHEEL = '/mod/growth/wheel';
export const REVIEW = '/mod/growth/review';

export const refreshGrowth = () => invalidate('/mod/growth/');

/** Today's scoring: one core snapshot holding all nine (the ones he set). */
export async function saveScores(scores: Partial<Record<AspectKey, number>>) {
  const r = await call<{ date: string; scores: Record<string, number> }>('/life/snapshots', { date: today(), source: 'app', scores });
  refreshGrowth();
  invalidate('/life');
  invalidate('/mod/life/');
  return r;
}

export async function answerRead(body: { date: string; connection: string; answer: 'agree' | 'wrong' | 'move'; reason?: string; note?: string }) {
  const r = await call<{ item: MorningRead; saved: unknown }>('/mod/growth/dream/answer', body);
  refreshGrowth();
  return r;
}

export type SealBody = {
  week: string; headline: string; feel: string; scored: boolean;
  closed: { id: string; kind: 'goal' | 'move'; goal: string | null; text: string; aspect: AspectKey; verdict: Verdict; carry: boolean }[];
  moved: { text: string; aspect: AspectKey }[];
  missed: { text: string; aspect: AspectKey; why: string | null; why2: string | null; detail?: string }[];
  checks: { rule: string; held: boolean | null }[];
  rule: { when: string; then: string; from: { text: string; aspect: AspectKey; why: string | null } | null } | null;
  moves: { text: string; aspect: AspectKey; serves: string | null; carry: string | null; from: string | null }[];
};
export async function sealReview(body: SealBody) {
  const r = await call<{ item: ReviewDoc; already: boolean; rule: RuleSum | null; goals: { goal: string; ok: boolean }[] }>('/mod/growth/review/seal', body);
  refreshGrowth();
  invalidate('/goals');
  return r;
}

/** Ask the PC's model to write this week's draft (spends one Sonnet call; seconds). */
export async function draftWithAI() {
  const r = await call<{ item: unknown }>('/mod/growth/review/draft', { force: true });
  refreshGrowth();
  return r;
}
