import type { Doc } from '@/lib/mod';

// The records Romance keeps on the PC (server/modules/romance.ts). Nothing personal is written here; it all arrives at
// run time.

export type Place = 'cowork' | 'cafe' | 'college' | 'other';
export type Depth = 'hello' | 'talked' | 'contact' | 'exit';
export type Expect = 'most' | 'half' | 'few';

/** One conversation he started. The depth is optional and never changes how it counts. */
export type Rep = { at: string; depth: Depth | null };

/** One outing, with its conversations inside. `day:<date>` records hold ones added outside an outing (place "logged"). */
export type Outing = Doc & {
  day: string; start: string | null; end: string | null; place: Place | 'logged';
  primer: { try: string | null; opener: string | null; expect?: Expect | null } | null;
  reps: Rep[];
};

export type Review = {
  well: string[]; try: { text: string; why: string | null }; pattern: string | null;
  openers: Partial<Record<Place, { id: string; line: string }>> | null;
  by: 'ai' | 'rules'; v: string; model?: string; ms?: number; at: string;
};
export type DebriefStatus = 'saved' | 'transcribing' | 'reviewing' | 'reviewed' | 'failed';
export type Debrief = Doc & {
  day: string; at: string; session: string | null; kind: 'voice' | 'chips';
  chips: { well?: string[]; stuck?: string[]; feel?: string | null } | null; text?: string | null;
  file?: string; secs?: number | null; status: DebriefStatus; failed_step?: 'transcribe' | 'review' | 'short' | null;
  error?: string | null; transcript?: string | null; review?: Review | null;
};

export type Step = { what: string; due: string | null };
export type Follow = Doc & {
  person: string;
  met?: { day: string; place: Place | null; session: string | null } | null;
  talked?: string | null;
  next?: Step | null;
  done?: { what: string; at: string }[];
  line?: { options: string[]; by: 'ai' | 'rules'; v: string; at: string } | null;
  ideas?: { budget: Budget; items: Idea[]; by: 'ai' | 'rules'; v: string; at: string } | null;
  plan?: { title: string; steps: { text: string; done: boolean }[]; date?: string | null } | null;
  archived?: boolean;
};
export type Budget = 'free' | 'low' | 'mid';
export type Idea = { title: string; why: string; cost: string; steps: string[] };

export type Pref = Doc & { per_week?: number; text?: string };

/** A People row; Romance only reads and writes rows whose aspect is romance. */
export type Person = Doc & { name: string; aspect: string; rel?: string | null; where?: string | null; added?: string | null };

export type Opener = { id: string; line: string; when: string; by: 'ai' | 'bank' };
export type Primer = {
  day: string; total: number;
  try: { text: string; why: string | null; from: 'debrief' | 'ladder'; debrief?: string; day?: string; by?: 'ai' | 'rules'; step?: number; of?: number };
  openers: Record<Place, Opener[]>;
  places: { key: Place; label: string }[];
  last_place: Place | null;
  respect: string[];
};
