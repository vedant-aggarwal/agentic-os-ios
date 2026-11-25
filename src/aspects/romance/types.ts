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
/** Did he try the last thing to try. Asked at the start of every debrief; the next reading steps up or down from it. */
export type TriedAnswer = 'yes' | 'partly' | 'no';
export type Tried = { answer: TriedAnswer; try: string | null };
export type DebriefStatus = 'saved' | 'transcribing' | 'reviewing' | 'reviewed' | 'failed';
export type Debrief = Doc & {
  day: string; at: string; session: string | null; kind: 'voice' | 'chips';
  chips: { well?: string[]; stuck?: string[]; feel?: string | null } | null; text?: string | null; tried?: Tried | null;
  file?: string; secs?: number | null; status: DebriefStatus; failed_step?: 'transcribe' | 'review' | 'short' | null;
  error?: string | null; transcript?: string | null; review?: Review | null;
};

export type Step = { what: string; due: string | null };
/** A step he did. `kind: 'plan'` is a plan that happened, moved here when he plans the next one. */
export type Done = { what: string; at: string; kind?: 'plan' | null };
/** A plan to meet someone: the idea, its small steps, the day, and the debrief made after it (its id). */
export type Plan = { title: string; steps: { text: string; done: boolean }[]; date?: string | null; debrief?: string | null };
export type Follow = Doc & {
  person: string;
  met?: { day: string; place: Place | null; session: string | null } | null;
  talked?: string | null;
  next?: Step | null;
  done?: Done[];
  line?: { options: string[]; by: 'ai' | 'rules'; v: string; at: string } | null;
  ideas?: { budget: Budget; items: Idea[]; by: 'ai' | 'rules'; v: string; at: string } | null;
  plan?: Plan | null;
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

// ── read from People (server/modules/people.ts, shared with Family and Friends) ──
/** Time together: a meet, a call or a chat (Nora files calendar events and chats here). Romance reads its people's. */
export type Moment = Doc & { date: string; at?: string | null; people: string[]; aspect?: string | null; kind?: string | null; title?: string | null };
/** An idea in People's bank. Romance keeps its own (aspect romance); `person` null is an idea for anyone. */
export type IdeaRec = Doc & {
  person: string | null; aspect: string; kind: 'gift' | 'plan' | 'showup'; title: string; from?: string | null;
  done: boolean; done_on?: string | null; by?: string;
};
/** A plan in People (Nora's people_plan tool makes these). `debrief` is the debrief made after it. */
export type SharedPlan = Doc & {
  title: string; people: string[]; aspect?: string | null; date?: string | null; slot?: string | null; state?: string | null; debrief?: string | null;
};
