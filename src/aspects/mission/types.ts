// The shapes Mission's server routes answer (server/modules/mission-core.ts). Copy for the screen is made here on the
// phone; the server sends numbers, states and ids.
import type { AspectKey } from '@/theme';

export type Horizon = 'week' | 'month' | 'quarter' | 'year' | 'decade' | 'life';
export type Outcome = 'done' | 'missed' | 'carried' | 'dropped';
export type SourceKind = 'income' | 'jar' | 'weight' | 'manual' | 'goals' | 'tasks' | 'milestones' | 'none';

export type Reading = { value: number; of: number | null; from: number | null; unit: string | null; date: string; at: string; pct: number | null };
export type GoalRef = { id: string; title: string; horizon: Horizon; status: string; aspect: AspectKey | null };
export type Step = { kind: 'task' | 'milestone'; id: string; title: string; due: string | null };

export type Goal = {
  id: string; title: string; horizon: Horizon; period: string; label: string; start: string | null; end: string | null;
  status: 'active' | 'done' | 'dropped'; aspect: AspectKey | null; aspects: AspectKey[] | null; area: string | null;
  progress: number; progressMode: 'auto' | 'manual'; measure: string | null; due: string | null; notes: string | null;
  time: number | null; stale: boolean; parent: GoalRef | null; children: number;
  source: { kind: SourceKind; jar?: string | null; from?: number | null; target?: number | null; unit?: string | null; reading?: Reading | null };
  milestones: { done: number; total: number; next: { id: string; title: string } | null };
  tasks: { open: number; done: number; doneWeek: number; lastDone: string | null; next: { id: string; title: string; due: string | null } | null };
  closing: Closing | null;
};
export type Commitment = Goal & { state: 'done' | 'moving' | 'open' | 'not_started'; next: Step | null };

export type Move = { id: string; review: string | null; text: string; aspect: AspectKey | null; state: 'accepted' | 'declined'; goal: string | null; at: string };
export type WeekBlock = { key: string; start: string; end: string; label: string; commitments: Commitment[]; done: number; moves: Move[]; limit: number };
export type Rung = { key: string; label: string; limit: number | null; start: string; end: string; goals: Goal[] };
export type FirstBlock = { slug: string; name: string; status: string; goal: string | null; serves: GoalRef | null; why: string | null; since: string | null; week: string; inherited: boolean };
export type RecordWeek = { key: string; start: string; label: string; now: boolean; set: number; done: number };
export type Totals = { set: number; done: number; missed: number; dropped: number; carried: number; open: number; overdue: number };

export type Home = {
  today: string; weekday: number;
  purpose: { text: string; at: string } | null; directions: number;
  stale: Goal[];
  year: Rung; quarter: Rung; month: Rung;
  week: WeekBlock; plan: WeekBlock | null;
  lastWeek: { key: string; label: string; open: Goal[]; done: number } | null;
  first: FirstBlock | null;
  projects: { running: number; parked: number };
  record: { weeks: RecordWeek[]; totals: Totals };
  limits: Record<string, number>;
};

export type Closing = {
  id: string; goal: string; title: string; horizon: Horizon; period: string; label: string; outcome: Outcome; why: string | null;
  to: { horizon: Horizon; key: string; start: string; end: string; label: string } | null; by: string; at: string; aspect: AspectKey | null;
};
export type Carry = { horizon: Horizon; key: string; start: string; end: string; label: string };

export type Milestone = { id: string; goal: string; title: string; done: boolean; due: string | null; position: number; done_at?: string | null; created_at?: string; updated_at?: string; deleted_at?: string | null };
export type TaskLite = { id: string; title: string; status: string; due: string | null; doneAt: string | null; project: string | null };
export type GoalDetail = {
  goal: Goal | Commitment; milestones: Milestone[]; tasks: TaskLite[]; children: Goal[];
  projects: { slug: string; name: string; status: string }[]; chain: GoalRef[]; parents: GoalRef[];
  closings: Closing[]; measure: Measure | null; carry: Record<'week' | 'month' | 'quarter', Carry> | null;
};
export type Measure = { id: string; goal: string; deleted_at?: string | null; source: 'auto' | 'manual' | 'income' | 'jar' | 'weight'; jar?: string | null; from?: number | null; target?: number | null; unit?: string | null; reading?: Reading | null };

export type Ladder = {
  today: string; directions: Direction[]; far: Goal[];
  rungs: (Rung & { horizon: Horizon })[]; later: Goal[]; stale: number; limits: Record<string, number>;
};
export type Direction = { id: string; title: string; fam: 'work' | 'health' | 'people'; position: number; created_at?: string; updated_at?: string; deleted_at?: string | null };
export type Purpose = { id: string; text: string; by?: string; created_at?: string; updated_at?: string; deleted_at?: string | null };

export type Project = {
  slug: string; name: string; status: 'active' | 'paused' | 'done'; area: string | null; aspect: AspectKey | null; description: string | null;
  deadline: string | null; link: string | null; goal: GoalRef | null; done14: number; done30: number; open: number; lastDone: string | null;
  next: { id: string; title: string; due: string | null } | null; first: boolean; quiet: boolean;
};
export type Projects = {
  today: string; week: string; first: FirstBlock | null; why: string | null;
  switches: { from: string; fromName?: string; to: string; why: string | null; at: string; week: string }[];
  items: Project[]; goals: GoalRef[];
};

export type RecordView = {
  today: string; since: string | null; totals: Totals; weeks: RecordWeek[];
  months: { key: string; label: string; now: boolean; set: number; done: number }[];
  quarters: { key: string; label: string; now: boolean; set: number; done: number }[];
  closed: Closing[]; done: Closing[];
};

export type Full = { horizon: Horizon; key: string; label: string; limit: number; goals: { id: string; title: string; status: string; aspect: AspectKey | null }[] };
export type GoalDraft = {
  title: string; measure: string; horizon: Horizon; aspects: AspectKey[]; area: string | null; parent: string | null; due: string | null;
  milestones: string[]; note: string; draft: string; at: string; prompt: string;
};
export type DraftDoc = { id: string; kind: 'goal' | 'purpose'; input: { text?: string; horizon?: Horizon | null }; out: any; prompt: string; at: string; used: string | null; deleted_at?: string | null };

/** Growth's Sunday review, as far as Mission reads it. */
export type GrowthMove = { id: string; text: string; aspect?: string; on?: boolean; goal?: string | null; task?: string | null; lands?: string };
export type GrowthReview = { id: string; week: string; status: 'draft' | 'sealed'; moves?: GrowthMove[] };
