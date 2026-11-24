import { API, ApiError, currentToken } from '@/lib/api';
import type {
  ContinueResolved, EngineHealth, FolderSuggestion, Idea, JobDiff, JobEvent, JobFull, NewJob, OrcaAgent, OrcaControl, OrcaLaunch, OrcaRead, OrcaState, ProjectCard,
  ProjectHome, ResolvedItem, ResolvedRead, ResolveResult, Task, WorkHome,
} from './types';

// Thin client for the hub's routes (contract in ./types.ts). GETs remember their ETag so an unchanged answer is a
// 304 with no body; writes carry an Idempotency-Key so a retried write never lands twice.

/** Continue on phone (POST /orca/agents/:id/continue): the terminal agent now carrying an Orca chat tab on, null until
 *  it reports in (note says what happened); again: it was carried on before and that terminal is still open. */
export type OrcaCarry = { agent: OrcaAgent | null; terminal: string | null; again: boolean; note: string | null };

const etags = new Map<string, string>();
let seq = 0;
export const newKey = () => `w${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Init = { method?: string; body?: unknown; key?: string; etag?: boolean; signal?: AbortSignal };

async function call<T>(path: string, init: Init = {}): Promise<T | null> {
  const token = currentToken();
  const headers: Record<string, string> = { 'X-Client': 'native' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.key) headers['Idempotency-Key'] = init.key;
  const tag = init.etag ? etags.get(path) : undefined;
  if (tag) headers['If-None-Match'] = tag;
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: init.method ?? 'GET', headers, signal: init.signal,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, "Can't reach your PC. Check it's on and online.");
  }
  if (res.status === 304) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Server answered ${res.status}.`);
  if (init.etag) { const t = res.headers.get('ETag'); if (t) etags.set(path, t); }
  return data as T;
}
const must = async <T>(p: Promise<T | null>) => { const v = await p; if (v === null) throw new ApiError(500, 'Empty answer.'); return v; };

export const workApi = {
  /** null = unchanged since the last call (304). */
  home: () => call<WorkHome>('/work/home', { etag: true }),
  projectHome: (slug: string) => call<ProjectHome>(`/projects/${encodeURIComponent(slug)}/home`, { etag: true }),
  folderSuggestions: () => must(call<{ folders: FolderSuggestion[] }>('/work/folder-suggestions')),
  health: () => must(call<EngineHealth>('/engines/health')),

  createProject: (b: { name: string; folders?: ProjectCard['folders']; color?: string | null; icon?: string | null }, key: string) =>
    must(call<{ project: ProjectCard }>('/projects', { method: 'POST', body: b, key })),
  patchProject: (slug: string, b: Partial<Pick<ProjectCard, 'name' | 'folders' | 'pinned' | 'color' | 'icon' | 'status'>>, key: string) =>
    must(call<{ project: ProjectCard }>(`/projects/${encodeURIComponent(slug)}`, { method: 'PATCH', body: b, key })),

  createIdea: (b: { project?: string | null; title?: string; body?: string; source?: string }, key: string) =>
    must(call<{ idea: Idea }>('/ideas', { method: 'POST', body: b, key })),
  createTask: (b: { project?: string | null; title: string; due?: string | null }, key: string) =>
    must(call<Task>('/tasks', { method: 'POST', body: b, key })),
  patchIdea: (id: string, b: Partial<Pick<Idea, 'title' | 'body' | 'project' | 'status'>>, key: string) =>
    must(call<{ idea: Idea }>(`/ideas/${id}`, { method: 'PATCH', body: b, key })),
  patchTask: (id: string, b: Partial<Pick<Task, 'title' | 'project' | 'status' | 'due' | 'notes'>>, key: string) =>
    must(call<Task>(`/tasks/${id}`, { method: 'PATCH', body: b, key })),
  /** An idea becomes a task (title and detail carried over); answers both. */
  ideaToTask: (id: string, b: { project?: string | null; due?: string | null }, key: string) =>
    must(call<{ idea: Idea; task: Task }>(`/ideas/${id}/task`, { method: 'POST', body: b, key })),

  startJob: (b: NewJob, key: string) => must(call<{ job: JobFull }>('/jobs', { method: 'POST', body: b, key })),
  job: (id: string, tail = 200) => must(call<{ job: JobFull; events: JobEvent[]; more: boolean }>(`/jobs/${id}?tail=${tail}`)),
  events: (id: string, before: number, limit = 200) =>
    must(call<{ events: JobEvent[]; more: boolean }>(`/jobs/${id}/events?before=${before}&limit=${limit}`)),
  /** force: send even though Claude's prompt cache went cold (the PC answers 428 without it). */
  prompt: (id: string, text: string, key: string, force = false) =>
    must(call<{ job: JobFull }>(`/jobs/${id}/prompt`, { method: 'POST', body: force ? { text, force: true } : { text }, key })),
  /** "New session with summary": the PC summarises this job from its record and starts a new one with the text. Takes some seconds. */
  fresh: (id: string, text: string, key: string) =>
    must(call<{ job: JobFull; from: string; summarised: boolean }>(`/jobs/${id}/fresh`, { method: 'POST', body: { text }, key })),
  /** answers: a question form's answers, question text to answer, sent with the "submit" option. */
  permission: (id: string, requestId: string, optionId: string, answers?: Record<string, string>) =>
    must(call<{ job: JobFull }>(`/jobs/${id}/permission`, { method: 'POST', body: answers ? { requestId, optionId, answers } : { requestId, optionId } })),
  control: (id: string, what: 'cancel' | 'stop' | 'done') => must(call<{ job: JobFull }>(`/jobs/${id}/${what}`, { method: 'POST', body: {} })),
  diff: (id: string, turn = 0, file?: string) =>
    must(call<JobDiff>(`/jobs/${id}/diff?turn=${turn}${file ? `&file=${encodeURIComponent(file)}` : ''}`)),
  revert: (id: string, turn: number) => must(call<{ ok: boolean }>(`/jobs/${id}/revert`, { method: 'POST', body: { turn } })),

  /** null = unchanged since the last call (304). */
  orca: () => call<OrcaState>('/work/orca', { etag: true }),
  orcaRead: (id: string, limit = 40) => must(call<OrcaRead>(`/orca/agents/${encodeURIComponent(id)}?limit=${limit}`)),
  /** force: send even though the prompt cache went cold (the PC answers 428 without it). deny: it is on a permission
   *  prompt; the PC denies that first, then sends this as the next message. queued: it was working, so the message
   *  waits in its input until the turn ends. */
  orcaPrompt: (id: string, text: string, key: string, opts: { force?: boolean; deny?: boolean } = {}) =>
    must(call<{ ok: boolean; queued?: boolean; denied?: boolean }>(`/orca/agents/${encodeURIComponent(id)}/prompt`, {
      method: 'POST', key, body: { text, ...(opts.force ? { force: true } : {}), ...(opts.deny ? { deny: true } : {}) },
    })),
  orcaLaunch: (b: OrcaLaunch, key: string) => must(call<{ agent: OrcaAgent | null }>('/orca/launch', { method: 'POST', body: b, key })),
  /** Continue on phone: the PC carries an Orca chat tab on (a fork of its Claude session) in an Orca terminal, which
   *  takes replies. Takes up to ~30 s while Claude starts there. */
  orcaContinue: (id: string, key: string) =>
    must(call<OrcaCarry>(`/orca/agents/${encodeURIComponent(id)}/continue`, { method: 'POST', body: {}, key })),
  /** What a terminal agent's screen shows now, as plain text: what a permission prompt asks, before he answers it. */
  orcaScreen: (id: string) => must(call<{ text: string; state: string }>(`/orca/agents/${encodeURIComponent(id)}/screen`)),
  orcaControl: (id: string, what: OrcaControl) =>
    must(call<{ ok: boolean }>(`/orca/agents/${encodeURIComponent(id)}/${what}`, { method: 'POST', body: {} })),

  /** Saves its chat on the PC, then closes it (a job leaves the board, an Orca tab closes). 409 while it works, unless force. */
  resolve: (b: { kind: 'job' | 'orca'; id: string; force?: boolean }, key: string) =>
    must(call<ResolveResult>('/work/resolve', { method: 'POST', body: b, key })),
  resolvedRead: (id: string) => must(call<ResolvedRead>(`/work/resolved/${encodeURIComponent(id)}`)),
  /** A new job (in Orca or the app) whose first message hands the agent the saved chat through the continue-resolved skill. */
  continueResolved: (id: string, b: ContinueResolved, key: string) =>
    must(call<{ item: ResolvedItem; job: JobFull | null; agent: OrcaAgent | null; where: 'orca' | 'app' }>(`/work/resolved/${encodeURIComponent(id)}/continue`, { method: 'POST', body: b, key })),
};
