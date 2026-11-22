import type { AspectKey } from '@/theme';

// What the Growth module answers (server/modules/growth.ts, growth-wheel.ts, growth-review.ts).

export type Trend = { state: 'up' | 'down' | 'steady' | 'early'; diff: number | null; now: number | null; before: number | null; weeks: number };

/** One of the nine sections: his own score against what the data shows. */
export type Section = {
  key: AspectKey; name: string;
  felt: number | null; feltDate: string | null; was: number | null; wasDate: string | null;
  change: number | null; moved: boolean;
  measured: number | null; trend: Trend; agree: 'agree' | 'higher' | 'lower' | null;
  evidence: string[]; sources: string[];
  series: (number | null)[];
  feltHistory: { date: string; v: number }[];
};

export type Scoring = { scored: boolean; last: string | null; previous: string | null; days: number | null; due: boolean; next: string | null };

export type WheelData = {
  today: string; scoring: Scoring; sections: Section[];
  weeks: { key: string; label: string; from: string; partial: boolean }[];
  snapshots: { date: string; scores: Partial<Record<AspectKey, number>> }[];
  riser: AspectKey | null; sliding: AspectKey | null; early: boolean;
  noise: { felt: number; trend: number };
};

export type RuleCheck = { week: string; held: boolean };
/** A rule as stored (`/mod/growth/rules`). */
export type Rule = {
  id: string; when: string; then: string; status: 'active' | 'retired';
  born?: { week: string; text: string | null; aspect: AspectKey | null; why: string | null } | null;
  checks?: RuleCheck[]; week?: string; retired_at?: string | null;
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
/** A rule as the computed routes summarise it. */
export type RuleSum = {
  id: string; when: string; then: string; text: string; status: 'active' | 'retired';
  born: Rule['born']; created_at?: string; held: number; of: number; last: RuleCheck | null; retired_at: string | null;
};

export type ReadConnection = {
  id: string; title: string; text: string; aspects: AspectKey[]; strength: string | null;
  verdict: { answer: 'agree' | 'wrong' | 'move'; reason: string | null; note: string | null; at: string } | null;
  move: { text: string; aspect: AspectKey } | null;
};
export type MorningRead = { id: string; date: string; ran: string | null; headline: string; connections: ReadConnection[]; answered: boolean };

export type Home = {
  today: string; week: { key: string; label: string };
  wheel: WheelData; lead: 'review' | 'score' | null;
  review: { week: string | null; label: string | null; open: boolean; sealed: boolean; sealed_at: string | null; nextOpen: string | null; nextSunday: string | null };
  read: MorningRead | null;
  rules: { active: number; top: RuleSum[]; week: string };
  mission: { waiting: number; week: string | null };
  reviews: number;
};

export type Commitment = {
  id: string; kind: 'goal' | 'move'; goal: string | null; text: string; aspect: AspectKey;
  progress: number | null; tasks: number; parent: string | null; suggested: Verdict | null;
};
export type Verdict = 'done' | 'partly' | 'missed';
export type DraftItem = { id: string; text: string; aspect: AspectKey; detail?: string; whys?: string[]; source: string; task?: string | null };
export type DraftMove = { id: string; text: string; aspect: AspectKey; serves: string | null; carry: string | null; from: string | null; source: string };
export type GoalRef = { id: string; title: string; horizon: string; aspect: AspectKey };

export type ReviewDraft = {
  week: string; n: number; label: string; from: string; to: string; nextWeek: string; nextLabel: string;
  window: Home['review'] & { open: boolean };
  status: 'open' | 'sealed' | 'closed';
  drafted_by: 'code' | 'sonnet'; drafted_at: string; prompt: string | null;
  headline: string; feel: string;
  commitments: Commitment[]; moved: DraftItem[]; missed: DraftItem[];
  rules: RuleSum[]; ruleIdeas: { id: string; when: string; then: string; why: string }[];
  moves: DraftMove[]; goals: GoalRef[];
  whys: string[]; taskWhys: string[]; whyTree: Record<string, string[]>; ruleBank: Record<string, { when: string; then: string }>;
  wheel: { due: boolean; last: string | null; sections: { key: AspectKey; name: string; felt: number | null; measured: number | null }[] };
};

/** A sealed review as stored (`/mod/growth/reviews`). Older ones (from the first app) carry fewer fields. */
export type ReviewDoc = {
  id: string; week: string; label?: string; from?: string; to?: string; status: string; sealed_at?: string;
  headline?: string; feel?: { line?: string } | null;
  wins?: { text: string; aspect?: AspectKey }[]; moved?: { text: string; aspect?: AspectKey }[];
  misses?: { text: string; aspect?: AspectKey; why?: string | null; why2?: string | null; detail?: string }[];
  closed?: { text: string; aspect: AspectKey; verdict: Verdict; carry?: boolean }[];
  checks?: { rule: string; text: string; held: boolean }[];
  ruleText?: string | null;
  moves?: { id?: string; text: string; aspect?: AspectKey; state?: string; on?: boolean }[];
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
