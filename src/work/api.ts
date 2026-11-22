import { API, ApiError, currentToken } from '@/lib/api';
import type {
  EngineHealth, FolderSuggestion, Idea, JobDiff, JobEvent, JobFull, NewJob, ProjectCard, ProjectHome, Task, WorkHome,
} from './types';

// Thin client for the hub's routes (contract in ./types.ts). GETs remember their ETag so an unchanged answer is a
// 304 with no body; writes carry an Idempotency-Key so a retried write never lands twice.

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
  patchTask: (id: string, b: Partial<Pick<Task, 'title' | 'project' | 'status' | 'due'>>, key: string) =>
    must(call<Task>(`/tasks/${id}`, { method: 'PATCH', body: b, key })),

  startJob: (b: NewJob, key: string) => must(call<{ job: JobFull }>('/jobs', { method: 'POST', body: b, key })),
  job: (id: string, tail = 200) => must(call<{ job: JobFull; events: JobEvent[]; more: boolean }>(`/jobs/${id}?tail=${tail}`)),
  events: (id: string, before: number, limit = 200) =>
    must(call<{ events: JobEvent[]; more: boolean }>(`/jobs/${id}/events?before=${before}&limit=${limit}`)),
  prompt: (id: string, text: string, key: string) => must(call<{ job: JobFull }>(`/jobs/${id}/prompt`, { method: 'POST', body: { text }, key })),
  permission: (id: string, requestId: string, optionId: string) =>
    must(call<{ job: JobFull }>(`/jobs/${id}/permission`, { method: 'POST', body: { requestId, optionId } })),
  control: (id: string, what: 'cancel' | 'stop' | 'done') => must(call<{ job: JobFull }>(`/jobs/${id}/${what}`, { method: 'POST', body: {} })),
  diff: (id: string, turn = 0, file?: string) =>
    must(call<JobDiff>(`/jobs/${id}/diff?turn=${turn}${file ? `&file=${encodeURIComponent(file)}` : ''}`)),
  revert: (id: string, turn: number) => must(call<{ ok: boolean }>(`/jobs/${id}/revert`, { method: 'POST', body: { turn } })),
};
