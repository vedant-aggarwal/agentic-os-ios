// The shapes the Family page reads from the PC (server/modules/family.ts and people.ts). Nothing personal here.

export type Cand = {
  key: string; title: string; done_title: string; from: 'nora' | 'idea' | 'rhythm' | 'bank' | 'own';
  why: string | null; idea: string | null;
};
export type Week = {
  id: string; pick: Cand | null; options: Cand[]; skipped: string[];
  done: { moment: string; at: string | null; title: string | null } | null;
};
export type MomentBrief = {
  id: string; date: string; at: string | null; title: string | null; note: string | null; photo: string | null;
  people: string[]; kind: string | null; act: string | null; source: string | null; showup: boolean; chip: string | null;
};
export type Card = {
  id: string; name: string; role: string | null; pronoun: 'he' | 'she' | 'they';
  last: MomentBrief | null; photo: { id: string; moment: string; date: string; title: string | null } | null;
  quiet: boolean; week: Week; mentioned: number; birthday: 'known' | 'not known yet';
};
/** `thing`: the person whose small thing this week is the same routine (one tap on either files one moment). */
export type Chip = { key: string; label: string; people: string[]; act: string | null; dinner: boolean; moment: string | null; thing?: string | null };
export type DateItem = {
  id: string; title: string; kind: string; on: string; days: number; people: string[]; annual: boolean;
  years: number | null; turning: string | null; plan: { id: string; idea: string | null; total: number; done: number } | null;
};
export type Home = {
  today: string; week: string; people: Card[]; together: Chip[];
  dates: { soon: DateItem[]; next: DateItem | null; passed: { id: string; title: string; kind: string; on: string; ago: number; people: string[] }[]; unknown: { id: string; name: string }[] };
  memories: { recent: MomentBrief[]; onThisDay: MomentBrief[]; count: number };
  nora: { made_at: string | null; week: string | null } | null;
};
export type Memories = {
  today: string; person: string | null; people: { id: string; name: string }[]; count: number; memories: number;
  onThisDay: MomentBrief[]; year: MomentBrief[]; months: { month: string; label: string; items: MomentBrief[] }[];
};
export type Step = { id: string; title: string; kind: 'book' | 'buy' | 'involve' | 'do'; done: boolean };
export type NoraPlan = { title: string; why: string; steps: { title: string; kind: Step['kind'] }[] };
export type DateView = {
  today: string;
  date: { id: string; title: string; kind: string; on: string | null; days: number | null; people: { id: string; name: string }[]; annual: boolean; year: number | null; years: number | null; turning: string | null; md: string | null };
  plan: PlanDoc | null;
  ideas: { id: string; person: string; kind: string; title: string; from: string | null }[];
  past: MomentBrief[];
  after: number | null; lastOn: string | null;
  nora: { made_at: string; ideas: NoraPlan[]; year: string } | null;
};

// records written through People's collections (the store contract)
export type MomentDoc = {
  id: string; date: string; at?: string | null; people: string[]; aspect: string; kind: 'meet' | 'call' | 'chat'; act?: string | null;
  minutes?: number; title?: string | null; note?: string | null; photo?: string | null; dinner?: boolean; by?: string; source?: string;
  showup?: boolean; week?: string; chip?: string; memory?: boolean; from?: string;
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type IdeaDoc = {
  id: string; person: string; aspect: string; kind: 'gift' | 'plan' | 'showup'; title: string; from?: string | null; likes?: boolean;
  done: boolean; done_on?: string | null; by?: string;
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type DateDoc = {
  id: string; kind: 'birthday' | 'anniversary' | 'festival' | 'other'; people: string[]; aspect: string; md?: string | null;
  date?: string | null; annual: boolean; year?: number | null; title: string; source?: string;
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type PlanDoc = {
  id: string; title: string; people: string[]; aspect: string; date: string | null; for_date: string; year: number;
  state: string; idea: string | null; idea_from?: string | null; steps: Step[];
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type PersonDoc = {
  id: string; name: string; rel?: string; aspect: string; role?: string | null; pronoun?: string | null; sort?: number;
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type WeekDoc = {
  id: string; week: string; person: string; chosen: Cand | null; skipped: string[]; done: Week['done'];
  created_at?: string; updated_at?: string; deleted_at?: string | null;
};
export type Goal = { id: string; title: string; aspects: string[] | null; status: string; progress: number | null; due: string | null; horizon: string; label: string };
/** Money's `GET /mod/money/jars` (HANDOFFS.md): Family shows the jars whose goal is a family goal. */
export type Jar = { id: string; name: string; target: number | null; saved: number; pct: number | null; due: string | null; monthly: number | null; goal: string | null };
export type CalItem = { id: string; title: string; date: string; start: string; end: string; allDay: boolean; people: string[]; kind: string };
