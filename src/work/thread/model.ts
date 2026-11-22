import type { Engine, FormQuestion, JobEvent, JobFull, JobStatus } from '../types';

// Turns a job's events into the rows the thread draws. One turn = his message and everything after it until his next.
// Inside a turn: his bubble, the plan, one group holding every tool step (and the narration between steps), the answer
// (text after the last step), then pending permissions, changes and quiet status lines in order.
// Each row carries `sig` (its events by reference, plus flags); memoized rows skip rendering while it is unchanged.

/** Assistant text and thoughts share one shape in the contract. */
export type TextEv = Extract<JobEvent, { type: 'assistant' | 'thought' }>;
export type Ev<T extends Exclude<JobEvent['type'], 'assistant' | 'thought'>> = Extract<JobEvent, { type: T }>;
export type Step = Ev<'tool'> | TextEv;

type Base = { key: string; sig: readonly unknown[] };
export type Row = Base & (
  | { kind: 'user'; ev: Ev<'user'>; shown: Shown }
  | { kind: 'plan'; ev: Ev<'plan'>; live: boolean }
  | { kind: 'steps'; steps: Step[]; live: boolean; engine: Engine }
  | { kind: 'text'; ev: TextEv; streaming: boolean }
  | { kind: 'permission'; ev: Ev<'permission'> }
  | { kind: 'changes'; ev: Ev<'changes'>; turn: number; files: ChangeFile[] }
  | { kind: 'note'; seq: number; text: string; bad: boolean }
);

export type ChangeFile = { path: string; add: number; del: number };
export type Shown = { text: string; tasks: string[]; idea: string | null };

export const ENGINE: Record<Engine, string> = { claude: 'Claude', codex: 'Codex' };
export const isRunning = (s: JobStatus | undefined) => s === 'running' || s === 'starting';

/** What the header says under the title, as one plain phrase. */
export function statusPhrase(job: Pick<JobFull, 'engine' | 'status'>): string {
  const who = ENGINE[job.engine] ?? 'Agent';
  switch (job.status) {
    case 'starting': return `${who} is starting`;
    case 'running': return `${who} is working`;
    case 'needs_input': return `${who} needs you`;
    case 'idle': return `${who} is waiting for you`;
    case 'stopped': return `${who} stopped`;
    case 'failed': return `${who} failed`;
    case 'done': return 'Done';
  }
}

/** A changes event from the contract (`files`) or from the current server (`changes`). */
export function changeFiles(ev: Ev<'changes'>): ChangeFile[] {
  const loose = ev as Ev<'changes'> & { changes?: ChangeFile[] };
  return ev.files ?? loose.changes ?? [];
}

/**
 * The server stores the prompt it built for a job started from tasks or an idea ("Project: …", "Working folder: …").
 * He should see what he wrote: his context, plus the tasks or idea it came from.
 */
export function unwrapPrompt(text: string): Shown {
  if (!/^(Project: |Working folder: )/.test(text)) return { text, tasks: [], idea: null };
  const tasks: string[] = [];
  let idea: string | null = null;
  const ctx = /\nAdditional context from Vedant:\n([\s\S]*?)(?:\n\nDo the work in the working folder\.|$)/.exec(text);
  const taskBlock = /\nTasks?:\n([\s\S]*?)(?:\n\n|$)/.exec(text);
  if (taskBlock) {
    for (const line of taskBlock[1].split('\n')) {
      if (/^\s{3}/.test(line)) continue; // a task's notes
      const t = line.replace(/^\d+\.\s*/, '').trim();
      if (t) tasks.push(t);
    }
  }
  const ideaLine = /\nIdea: (.*)/.exec(text);
  if (ideaLine) idea = ideaLine[1].trim();
  const own = ctx?.[1].trim() ?? '';
  return { text: own || (tasks.length ? '' : idea ?? text), tasks, idea: (own || tasks.length) ? idea : null };
}

/** Rows compare by their events (by reference) and flags, so a row re-renders only when one of them changed. */
export const sameSig = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function buildRows(events: JobEvent[], job: Pick<JobFull, 'status' | 'engine'> | null): Row[] {
  const out: Row[] = [];
  const push = (r: Row) => { out.push(r); };
  const running = isRunning(job?.status);
  // A request only waits while the job is live. One left undecided by a stop or a server restart can't be answered.
  const asking = !job || running || job.status === 'needs_input';
  const engine: Engine = job?.engine ?? 'claude';

  // split into turns at each of his messages (keep-warm pings are not his)
  const turns: { user: Ev<'user'> | null; evs: JobEvent[]; n: number }[] = [];
  let cur: { user: Ev<'user'> | null; evs: JobEvent[]; n: number } = { user: null, evs: [], n: 0 };
  let n = 0;
  for (const e of events) {
    if (e.type === 'user' && !(e as { ping?: boolean }).ping) {
      if (cur.user || cur.evs.length) turns.push(cur);
      n = (e as { turn?: number }).turn ?? n + 1;
      cur = { user: e, evs: [], n };
    } else if (e.type !== 'user') cur.evs.push(e);
  }
  if (cur.user || cur.evs.length) turns.push(cur);

  turns.forEach((t, ti) => {
    const last = ti === turns.length - 1;
    const tk = t.user ? `t${t.user.seq}` : `t0-${t.evs[0]?.seq ?? 0}`;
    if (t.user) push({ kind: 'user', key: `u${t.user.seq}`, ev: t.user, shown: unwrapPrompt(t.user.text), sig: [t.user] });

    let lastStep = -1;
    t.evs.forEach((e, i) => { if (e.type === 'tool' || e.type === 'thought') lastStep = i; });

    const plan = [...t.evs].reverse().find((e): e is Ev<'plan'> => e.type === 'plan');
    if (plan) {
      const live = last && running;
      push({ kind: 'plan', key: `p${tk}`, ev: plan, live, sig: [plan, live] });
    }

    const steps: Step[] = [];
    t.evs.forEach((e, i) => {
      if (e.type === 'tool' || e.type === 'thought') steps.push(e);
      else if (e.type === 'assistant' && i < lastStep && e.text.trim()) steps.push(e);
    });
    if (steps.length) {
      const live = last && running;
      push({ kind: 'steps', key: `g${tk}`, steps, live, engine, sig: [live, engine, ...steps] });
    }

    const lastText = [...t.evs].reverse().find((e) => e.type === 'assistant');
    t.evs.forEach((e, i) => {
      if (e.type === 'assistant' && i < lastStep) return; // narration between steps lives in the group
      switch (e.type) {
        case 'assistant': {
          if (!e.text.trim()) return;
          const streaming = last && running && e === lastText;
          push({ kind: 'text', key: `a${e.seq}`, ev: e, streaming, sig: [e, streaming] });
          return;
        }
        case 'permission':
          if (e.decided || !asking) return; // answered, cancelled, auto approved or no longer open: nothing for him to do
          push({ kind: 'permission', key: `k${e.seq}`, ev: e, sig: [e] });
          return;
        case 'changes': {
          const files = changeFiles(e);
          if (!files.length) return;
          push({ kind: 'changes', key: `c${e.seq}`, ev: e, turn: e.turn ?? t.n, files, sig: [e] });
          return;
        }
        case 'status': {
          const text = statusNote(e);
          if (text) push({ kind: 'note', key: `s${e.seq}`, seq: e.seq, text, bad: e.status === 'failed', sig: [e] });
          return;
        }
        case 'error':
          push({ kind: 'note', key: `e${e.seq}`, seq: e.seq, text: e.text, bad: true, sig: [e] });
          return;
      }
    });
  });
  return out;
}

function statusNote(e: Ev<'status'>): string | null {
  if (e.text) return e.text;
  switch (e.status) {
    case 'stopped': return 'Stopped. Send a message to pick it up again.';
    case 'failed': return 'The job failed.';
    case 'done': return 'Marked done.';
    default: return null; // needs_input shows as the permission card; a normal turn end says nothing
  }
}

/** The questions in a question request (the server keeps them under `permission.form`). Empty for other requests. */
export function formOf(ev: Ev<'permission'>): FormQuestion[] {
  const form = ev.form ?? ev.permission?.form;
  return Array.isArray(form) ? form.filter((q) => q && typeof q.question === 'string' && q.question.trim()) : [];
}

/** "12 s", "2 min", "1 h 5 min". */
export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** The collapsed group's summary: "4 steps in 2 min", "Thought for 12 s". */
export function stepsSummary(steps: Step[], now: number, live: boolean): string {
  const tools = steps.filter((x) => x.type === 'tool').length;
  const first = Date.parse(steps[0].at);
  const end = live ? now : Date.parse(steps[steps.length - 1].at);
  const took = Number.isFinite(first) && Number.isFinite(end) ? end - first : 0;
  if (!tools) return took >= 1000 ? `Thought for ${span(took)}` : 'Thought';
  const count = `${tools} ${tools === 1 ? 'step' : 'steps'}`;
  return took >= 1000 ? `${count} in ${span(took)}` : count;
}

/** The tool working now, for the collapsed group's line ("Editing sort.ts"). */
export function currentStep(steps: Step[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const x = steps[i];
    if (x.type === 'tool' && (x.status === 'in_progress' || x.status === 'pending')) return x.title;
  }
  const lastTool = [...steps].reverse().find((x) => x.type === 'tool');
  return lastTool?.type === 'tool' ? lastTool.title : null;
}

/** The latest answer (text after a turn's last step, not narration between steps), for Copy last answer. */
export function lastAnswer(rows: Row[]): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.kind === 'text') return r.ev.text;
  }
  return null;
}

/** Turns that changed files, newest first, for Revert to a turn. */
export function revertTurns(events: JobEvent[]): { turn: number; files: number; at: string; prompt: string }[] {
  const prompts = new Map<number, string>();
  let n = 0;
  for (const e of events) {
    if (e.type === 'user' && !(e as { ping?: boolean }).ping) {
      n = (e as { turn?: number }).turn ?? n + 1;
      const shown = unwrapPrompt(e.text);
      prompts.set(n, shown.text || shown.tasks[0] || shown.idea || '');
    }
  }
  const out: { turn: number; files: number; at: string; prompt: string }[] = [];
  for (const e of events) {
    if (e.type !== 'changes') continue;
    const files = changeFiles(e).length;
    if (!files || out.some((x) => x.turn === e.turn)) continue;
    out.push({ turn: e.turn, files, at: e.at, prompt: prompts.get(e.turn) ?? '' });
  }
  return out.reverse();
}
