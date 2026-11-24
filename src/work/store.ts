import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ApiError, loadToken, setToken } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { newKey, workApi } from './api';
import { readCache, writeCache } from './cache';
import { demoHome, demoOrca, demoProject } from './demo';
import { openSSE } from './sse';
import type {
  ContinueResolved, FeedChange, Folder, Idea, JobBrief, NewJob, OrcaLaunch, OrcaState, ProjectCard, ProjectHome, ResolvedItem, Task, WorkHome,
} from './types';

// The hub's one store. Screens read it through the hooks at the bottom; nothing renders from a fetch directly.
// Order on every read: the phone's cached copy first (instant), then the PC's answer (ETag, so usually a 304),
// then live changes from /work/feed. Writes are optimistic: they show at once and settle when the PC answers.

export type Load = 'loading' | 'ready' | 'error' | 'signedOut';
type Slot<T> = { data: T | null; load: Load; error: string | null };
/** What the phone already knows about a row being resolved, so its Resolved row reads right before the PC answers. */
export type ResolveHint = { title: string; project?: string | null; engine?: string };
type State = {
  home: Slot<WorkHome>;
  projects: Record<string, Slot<ProjectHome>>;
  /** The Orca app on the PC: its agents and the Claude/Codex usage it reads. */
  orca: Slot<OrcaState>;
  live: boolean; // the feed is connected
  notice: string | null;
};

let state: State = {
  home: { data: null, load: 'loading', error: null }, projects: {}, orca: { data: null, load: 'loading', error: null }, live: false, notice: null,
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (fn: (s: State) => State) => { state = fn(state); emit(); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const LIVE: JobBrief['status'][] = ['starting', 'running', 'needs_input', 'idle'];
const isLive = (j: JobBrief) => j.status === 'starting' || j.status === 'running' || j.status === 'needs_input';
const nowIso = () => new Date().toISOString();

/** Fan and list order: pinned first, then most recently active, then name. */
export function fanOrder(projects: ProjectCard[]) {
  return [...projects]
    .filter((p) => p.status !== 'archived')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '')
      || a.name.localeCompare(b.name));
}

/** A cached copy or an answer from an older server can miss lists; a missing list must never crash the screen. */
function normHome(h: WorkHome | null | undefined): WorkHome | null {
  if (!h || typeof h !== 'object' || !Array.isArray(h.projects)) return null;
  return {
    ...h, projects: h.projects, needs: Array.isArray(h.needs) ? h.needs : [], live: Array.isArray(h.live) ? h.live : [],
    inbox: { ideas: Array.isArray(h.inbox?.ideas) ? h.inbox.ideas : [], tasks: Array.isArray(h.inbox?.tasks) ? h.inbox.tasks : [] },
    resolved: Array.isArray(h.resolved) ? h.resolved : [],
  };
}

function fail(e: unknown): { load: Load; error: string | null } {
  if (e instanceof ApiError && e.status === 401) { setToken(null).catch(() => {}); return { load: 'signedOut', error: null }; }
  return { load: 'error', error: (e as Error).message };
}

// ---- reads ----
let homeBusy: Promise<void> | null = null;
export function loadHome(): Promise<void> {
  if (homeBusy) return homeBusy;
  homeBusy = (async () => {
    if (DEMO) { set((s) => ({ ...s, home: { data: s.home.data ?? demoHome(), load: 'ready', error: null } })); return; }
    if (!state.home.data) {
      const cached = normHome(await readCache<WorkHome>('home'));
      if (cached && !state.home.data) set((s) => ({ ...s, home: { data: cached, load: 'ready', error: null } }));
    }
    if (!(await loadToken())) { set((s) => ({ ...s, home: { ...s.home, load: 'signedOut' } })); return; }
    try {
      const raw = await workApi.home();
      const fresh = raw === null ? null : normHome(raw);
      if (raw !== null && !fresh) throw new Error('Your PC answered, but not with Work data. Update the server and try again.');
      if (fresh) { writeCache('home', fresh); set((s) => ({ ...s, home: { data: fresh, load: 'ready', error: null } })); }
      else set((s) => ({ ...s, home: { ...s.home, load: 'ready', error: null } }));
    } catch (e) {
      const f = fail(e);
      // With a cached copy on screen, a failed refresh is a notice, not an error screen.
      if (state.home.data && f.load === 'error') set((s) => ({ ...s, notice: f.error }));
      else set((s) => ({ ...s, home: { ...s.home, ...f } }));
    }
  })().finally(() => { homeBusy = null; });
  return homeBusy;
}

const projectBusy = new Map<string, Promise<void>>();
export function loadProject(slug: string): Promise<void> {
  const running = projectBusy.get(slug);
  if (running) return running;
  const p = (async () => {
    const slot = (patch: Partial<Slot<ProjectHome>>) => set((s) => ({
      ...s, projects: { ...s.projects, [slug]: { ...(s.projects[slug] ?? { data: null, load: 'loading', error: null }), ...patch } },
    }));
    if (DEMO) { slot({ data: state.projects[slug]?.data ?? demoProject(slug), load: 'ready', error: null }); return; }
    if (!state.projects[slug]?.data) {
      // A project card from the hub draws the header before anything else arrives.
      const cached = await readCache<ProjectHome>(`project:${slug}`);
      if (cached) slot({ data: cached, load: 'ready' });
      else if (!state.projects[slug]) slot({ load: 'loading' });
    }
    if (!(await loadToken())) { slot({ load: 'signedOut' }); return; }
    try {
      const fresh = await workApi.projectHome(slug);
      if (fresh) { writeCache(`project:${slug}`, fresh); slot({ data: fresh, load: 'ready', error: null }); }
      else slot({ load: 'ready', error: null });
    } catch (e) {
      const f = fail(e);
      if (state.projects[slug]?.data && f.load === 'error') set((s) => ({ ...s, notice: f.error }));
      else slot(f);
    }
  })().finally(() => { projectBusy.delete(slug); });
  projectBusy.set(slug, p);
  return p;
}

let orcaBusy: Promise<void> | null = null;
/** Orca's agents and usage: the cached copy first, then the PC (ETag). A failure keeps the copy. */
export function loadOrca(): Promise<void> {
  if (orcaBusy) return orcaBusy;
  orcaBusy = (async () => {
    if (DEMO) { set((s) => ({ ...s, orca: { data: s.orca.data ?? demoOrca(), load: 'ready', error: null } })); return; }
    if (!state.orca.data) {
      const cached = await readCache<OrcaState>('orca');
      if (cached?.agents && !state.orca.data) set((s) => ({ ...s, orca: { data: cached, load: 'ready', error: null } }));
    }
    if (!(await loadToken())) return;
    try {
      const fresh = await workApi.orca();
      if (fresh && Array.isArray(fresh.agents)) { writeCache('orca', fresh); set((s) => ({ ...s, orca: { data: fresh, load: 'ready', error: null } })); }
      else set((s) => ({ ...s, orca: { ...s.orca, load: 'ready', error: null } }));
    } catch (e) {
      const f = fail(e);
      set((s) => ({ ...s, orca: { ...s.orca, load: f.load === 'signedOut' ? 'signedOut' : s.orca.data ? 'ready' : 'error', error: f.error } }));
    }
  })().finally(() => { orcaBusy = null; });
  return orcaBusy;
}

// ---- live feed ----
let feedRefs = 0, closeFeed: (() => void) | null = null, refetch: ReturnType<typeof setTimeout> | null = null;
let orcaTimer: ReturnType<typeof setTimeout> | null = null;
const dirty = new Set<string>();
let lastRefetch = 0;

/**
 * Fetches home (and touched projects) again after a change. `lazy` is for a running job's own updates, which the
 * store already applied (patchJob): those refetch at most every 3 s, so a streaming job doesn't reload the hub
 * several times a second (each reload re-renders every visible row).
 */
function scheduleRefetch(project: string | null, lazy = false) {
  dirty.add('home');
  if (project) dirty.add(project);
  if (refetch) return;
  const wait = lazy ? Math.max(400, lastRefetch + 3000 - Date.now()) : 400;
  refetch = setTimeout(() => {
    refetch = null;
    lastRefetch = Date.now();
    const list = [...dirty];
    dirty.clear();
    for (const k of list) {
      if (k === 'home') loadHome();
      else if (state.projects[k]) loadProject(k);
    }
  }, wait);
}
function scheduleOrca() {
  if (orcaTimer) return;
  orcaTimer = setTimeout(() => { orcaTimer = null; loadOrca(); }, 300);
}

function patchJob(j: JobBrief) {
  const upsert = (list: JobBrief[], keep: (x: JobBrief) => boolean) => {
    const rest = list.filter((x) => x.id !== j.id);
    return keep(j) ? [j, ...rest] : rest;
  };
  set((s) => {
    const home = s.home.data ? { ...s.home.data, live: upsert(s.home.data.live, isLive) } : null;
    const projects = { ...s.projects };
    const slot = j.project ? projects[j.project] : undefined;
    // A resolved job's last updates (it stopping) must not put it back on its project's list.
    const gone = (s.home.data?.resolved ?? []).some((r) => r.kind === 'job' && r.ref === j.id);
    if (slot?.data) {
      projects[j.project!] = {
        ...slot, data: { ...slot.data, live: upsert(slot.data.live, isLive), jobs: upsert(slot.data.jobs, () => !gone) },
      };
    }
    return { ...s, home: home ? { ...s.home, data: home } : s.home, projects };
  });
}

function onChange(c: FeedChange) {
  if (c.kind === 'orca') { scheduleOrca(); return; }
  if (c.kind === 'job') { patchJob(c.job); scheduleRefetch(c.project, true); return; }
  scheduleRefetch(c.project);
}

function startFeed() {
  if (DEMO || closeFeed) return;
  closeFeed = openSSE(() => '/work/feed', {
    onOpen: () => { set((s) => ({ ...s, live: true })); scheduleRefetch(null); scheduleOrca(); flushQueue(); },
    onDown: () => set((s) => ({ ...s, live: false })),
    onEvent: (name, data) => {
      if (name !== 'change') return;
      try { onChange(JSON.parse(data) as FeedChange); } catch {}
    },
  });
}
function stopFeed() { closeFeed?.(); closeFeed = null; set((s) => ({ ...s, live: false })); }

/** Keeps the feed open while any hub screen is mounted, and refreshes when the app comes back. */
function useFeed() {
  useEffect(() => {
    if (++feedRefs === 1) startFeed();
    const sub = AppState.addEventListener('change', (a) => {
      if (a === 'active') { startFeed(); scheduleRefetch(null); } else if (a === 'background') stopFeed();
    });
    return () => { sub.remove(); if (--feedRefs === 0) stopFeed(); };
  }, []);
}

// ---- writes ----
// A write that can't reach the PC waits here (and in the cache) and replays when the feed reconnects.
type Queued = { key: string; kind: 'idea' | 'task' | 'project' | 'patch' | 'ideaPatch' | 'taskPatch'; body: Record<string, unknown>; slug?: string; id?: string };
let queue: Queued[] = [];
readCache<Queued[]>('queue').then((q) => { if (q?.length) queue = [...q, ...queue]; });
const saveQueue = () => writeCache('queue', queue);

async function send(q: Queued) {
  switch (q.kind) {
    case 'idea': return workApi.createIdea(q.body, q.key);
    case 'task': return workApi.createTask(q.body as { title: string }, q.key);
    case 'project': return workApi.createProject(q.body as { name: string }, q.key);
    case 'patch': return workApi.patchProject(q.slug!, q.body, q.key);
    case 'ideaPatch': return workApi.patchIdea(q.id!, q.body, q.key);
    case 'taskPatch': return workApi.patchTask(q.id!, q.body, q.key);
  }
}

let flushing = false;
async function flushQueue() {
  if (flushing || DEMO || !queue.length) return;
  flushing = true;
  try {
    while (queue.length) {
      try { await send(queue[0]); } catch (e) { if (e instanceof ApiError && e.status === 0) break; }
      queue.shift();
      saveQueue();
    }
  } finally { flushing = false; }
  scheduleRefetch(null);
}

/** Runs a write: shows `apply` at once; on failure rolls back with a notice, or queues it when offline. */
async function write<T>(q: Queued, apply: () => void, rollback: () => void): Promise<T | null> {
  apply();
  if (DEMO) return null;
  try {
    const out = (await send(q)) as T;
    scheduleRefetch((q.body.project as string | undefined) ?? q.slug ?? null);
    return out;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      queue.push(q); saveQueue();
      set((s) => ({ ...s, notice: 'Saved on the phone. It goes to your PC when it is back online.' }));
      return null;
    }
    rollback();
    set((s) => ({ ...s, notice: (e as Error).message }));
    return null;
  }
}

function editProjectLists(slug: string | null, fn: (p: ProjectHome) => ProjectHome, inbox?: (h: WorkHome) => WorkHome) {
  set((s) => {
    const projects = { ...s.projects };
    if (slug && projects[slug]?.data) projects[slug] = { ...projects[slug], data: fn(projects[slug].data!) };
    const home = s.home.data && !slug && inbox ? inbox(s.home.data) : s.home.data;
    return { ...s, projects, home: { ...s.home, data: home } };
  });
}

type Item = { id: string; project: string | null; status: string };
/** Finds an idea or task wherever it is cached: the Inbox or any loaded project. */
function findItem<T extends Item>(id: string, key: 'ideas' | 'tasks'): T | null {
  const inbox = (state.home.data?.inbox[key] as unknown as T[] | undefined)?.find((x) => x.id === id);
  if (inbox) return inbox;
  for (const slot of Object.values(state.projects)) {
    const hit = (slot.data?.[key] as unknown as T[] | undefined)?.find((x) => x.id === id);
    if (hit) return hit;
  }
  return null;
}

const CLOSED = new Set(['done', 'dropped', 'archived', 'tasked', 'jobbed']);
/** Applies a patch in place; a project change moves the item between lists, a closing status removes it. */
function moveItem<T extends Item>(id: string, key: 'ideas' | 'tasks', patch: Partial<T>, from: string | null) {
  const item = findItem<T>(id, key);
  if (!item) return;
  const next = { ...item, ...patch } as T;
  const to = 'project' in patch ? (patch.project ?? null) : from;
  const gone = CLOSED.has(next.status);
  set((s) => {
    const strip = <L extends Item>(l: L[]) => l.filter((x) => x.id !== id);
    const put = <L extends Item>(l: L[]) => (gone ? strip(l) : l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? (next as unknown as L) : x)) : [next as unknown as L, ...l]);
    const projects = { ...s.projects };
    for (const [slug, slot] of Object.entries(projects)) {
      if (!slot.data) continue;
      const list = slot.data[key] as unknown as Item[];
      const updated = slug === to ? put(list) : strip(list);
      projects[slug] = { ...slot, data: { ...slot.data, [key]: updated } };
    }
    let home = s.home.data;
    if (home) {
      const list = home.inbox[key] as unknown as Item[];
      home = { ...home, inbox: { ...home.inbox, [key]: to === null ? put(list) : strip(list) } };
    }
    return { ...s, projects, home: { ...s.home, data: home } };
  });
  if (from !== to || gone) {
    if (from) bumpCount(from, key, -1);
    if (to && !gone) bumpCount(to, key, 1);
  }
}

function bumpCount(slug: string | null, key: 'ideas' | 'tasks', by: number) {
  if (!slug) return;
  set((s) => {
    const fix = (p: ProjectCard) => (p.slug === slug ? { ...p, counts: { ...p.counts, [key]: Math.max(0, p.counts[key] + by) }, lastActiveAt: nowIso() } : p);
    const home = s.home.data ? { ...s.home.data, projects: s.home.data.projects.map(fix) } : null;
    return { ...s, home: { ...s.home, data: home } };
  });
}

export const work = {
  loadHome,
  loadProject,
  loadOrca,
  clearNotice: () => set((s) => ({ ...s, notice: null })),
  notify: (text: string) => set((s) => ({ ...s, notice: text })),
  /** Another surface (the task view) changed something on the PC: read home, and the project it touched, again. */
  refetch: (project: string | null) => scheduleRefetch(project),

  addIdea(project: string | null, title: string, body?: string, source = 'app') {
    const key = newKey();
    const temp: Idea = { id: `tmp-${key}`, title: title || (body ?? '').split('\n')[0], body: body ?? null, project, status: 'open', source, createdAt: nowIso() };
    return write<{ idea: Idea }>(
      { key, kind: 'idea', body: { project, title, body, source } },
      () => {
        editProjectLists(project, (p) => ({ ...p, ideas: [temp, ...p.ideas] }), (h) => ({ ...h, inbox: { ...h.inbox, ideas: [temp, ...h.inbox.ideas] } }));
        bumpCount(project, 'ideas', 1);
      },
      () => {
        editProjectLists(project, (p) => ({ ...p, ideas: p.ideas.filter((i) => i.id !== temp.id) }), (h) => ({ ...h, inbox: { ...h.inbox, ideas: h.inbox.ideas.filter((i) => i.id !== temp.id) } }));
        bumpCount(project, 'ideas', -1);
      },
    );
  },

  addTask(project: string | null, title: string, due?: string | null) {
    const key = newKey();
    const temp: Task = { id: `tmp-${key}`, title, status: project ? 'todo' : 'inbox', project, due: due ?? null };
    return write<Task>(
      { key, kind: 'task', body: { project, title, due } },
      () => {
        editProjectLists(project, (p) => ({ ...p, tasks: [temp, ...p.tasks] }), (h) => ({ ...h, inbox: { ...h.inbox, tasks: [temp, ...h.inbox.tasks] } }));
        bumpCount(project, 'tasks', 1);
      },
      () => {
        editProjectLists(project, (p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== temp.id) }), (h) => ({ ...h, inbox: { ...h.inbox, tasks: h.inbox.tasks.filter((t) => t.id !== temp.id) } }));
        bumpCount(project, 'tasks', -1);
      },
    );
  },

  createProject(name: string, folders: Folder[]) {
    const key = newKey();
    const temp: ProjectCard = {
      slug: `tmp-${key}`, name, color: null, icon: null, status: 'active', pinned: false, lastActiveAt: nowIso(), folders,
      counts: { ideas: 0, tasks: 0, jobs: 0, live: 0, needs: 0 },
    };
    const edit = (fn: (l: ProjectCard[]) => ProjectCard[]) => set((s) => ({
      ...s, home: { ...s.home, data: s.home.data ? { ...s.home.data, projects: fn(s.home.data.projects) } : s.home.data },
    }));
    return write<{ project: ProjectCard }>(
      { key, kind: 'project', body: { name, folders } },
      () => edit((l) => [temp, ...l]),
      () => edit((l) => l.filter((p) => p.slug !== temp.slug)),
    ).then((r) => {
      if (r?.project) edit((l) => l.map((p) => (p.slug === temp.slug ? r.project : p)));
      return r?.project ?? temp;
    });
  },

  patchProject(slug: string, patch: Partial<Pick<ProjectCard, 'name' | 'folders' | 'pinned' | 'color' | 'icon' | 'status'>>) {
    const before = state.home.data?.projects.find((p) => p.slug === slug);
    const apply = (p: Partial<ProjectCard>) => set((s) => {
      const fix = (c: ProjectCard) => (c.slug === slug ? { ...c, ...p } : c);
      const home = s.home.data ? { ...s.home.data, projects: s.home.data.projects.map(fix) } : null;
      const projects = { ...s.projects };
      if (projects[slug]?.data) projects[slug] = { ...projects[slug], data: { ...projects[slug].data!, project: fix(projects[slug].data!.project) } };
      return { ...s, home: { ...s.home, data: home }, projects };
    });
    return write(
      { key: newKey(), kind: 'patch', slug, body: patch },
      () => apply(patch),
      () => { if (before) apply(before); },
    );
  },

  /** Edits an idea (title, body, status, or moves it to another project / the Inbox with `project`). */
  patchIdea(id: string, patch: Partial<Pick<Idea, 'title' | 'body' | 'project' | 'status'>>) {
    const snap = state;
    const from = findItem<Idea>(id, 'ideas');
    return write(
      { key: newKey(), kind: 'ideaPatch', id, body: patch },
      () => moveItem<Idea>(id, 'ideas', patch, from?.project ?? null),
      () => { state = snap; emit(); },
    ).then((r) => { scheduleRefetch(patch.project ?? from?.project ?? null); return r; });
  },

  /** Edits a task (tick with status 'done', rename, notes, due, or move with `project`). */
  patchTask(id: string, patch: Partial<Pick<Task, 'title' | 'project' | 'status' | 'due' | 'notes'>>) {
    const snap = state;
    const from = findItem<Task>(id, 'tasks');
    return write(
      { key: newKey(), kind: 'taskPatch', id, body: patch },
      () => moveItem<Task>(id, 'tasks', patch, from?.project ?? null),
      () => { state = snap; emit(); },
    ).then((r) => { scheduleRefetch(patch.project ?? from?.project ?? null); return r; });
  },

  /** Turns an idea into a task on the PC; true when it worked (a failure shows as the notice). */
  async ideaToTask(id: string) {
    if (DEMO) { set((s) => ({ ...s, notice: 'Demo: ideas become tasks on the real PC.' })); return false; }
    const from = findItem<Idea>(id, 'ideas');
    try {
      await workApi.ideaToTask(id, {}, newKey());
      scheduleRefetch(from?.project ?? null);
      return true;
    } catch (e) {
      set((s) => ({ ...s, notice: (e as Error).message }));
      return false;
    }
  },

  /** Moves a project between Active and Ideas (an idea project is 'paused' on the PC). */
  setProjectStatus(slug: string, status: 'active' | 'paused') {
    return work.patchProject(slug, { status });
  },

  /** Starts an agent in Orca on the PC, in the project's folder: null when it started but has no id yet, undefined on failure. */
  async launchInOrca(b: OrcaLaunch) {
    if (DEMO) { set((s) => ({ ...s, notice: 'Demo: Orca agents only start on the real PC.' })); return undefined; }
    try {
      const r = await workApi.orcaLaunch(b, newKey());
      loadOrca();
      return r.agent ?? null;
    } catch (e) {
      set((s) => ({ ...s, notice: (e as Error).message }));
      return undefined;
    }
  },

  /**
   * Continue on phone: the PC carries an Orca chat tab on in an Orca terminal, which takes replies. Answers that
   * terminal agent (in the Orca list at once) and whether it was carried on before; null when it hasn't reported in
   * yet (the notice says so); undefined on failure (the notice says why).
   */
  async continueOrcaChat(id: string) {
    if (DEMO) { set((s) => ({ ...s, notice: 'Demo: chats move to the phone on the real PC.' })); return undefined; }
    try {
      const r = await workApi.orcaContinue(id, newKey());
      const agent = r.agent;
      if (agent) set((s) => (s.orca.data ? { ...s, orca: { ...s.orca, data: { ...s.orca.data, agents: [agent, ...s.orca.data.agents.filter((x) => x.id !== agent.id)] } } } : s));
      else set((s) => ({ ...s, notice: r.note ?? 'It’s starting in Orca on your PC.' }));
      loadOrca();
      return agent ? { agent, again: r.again } : null;
    } catch (e) {
      set((s) => ({ ...s, notice: (e as Error).message }));
      return undefined;
    }
  },

  /**
   * Resolves a job or an Orca agent: it leaves every list at once and shows under Resolved; the PC saves its chat, then
   * closes it (an Orca tab closes on the PC). 'working' when the PC says it is still working (nothing changed then):
   * ask him, then call again with force.
   */
  async resolve(kind: 'job' | 'orca', id: string, hint: ResolveHint, force = false): Promise<'ok' | 'working' | 'failed'> {
    const snap = state;
    const at = nowIso();
    const temp: ResolvedItem = {
      id: `tmp-${kind}-${id}`, kind, ref: id, title: hint.title, engine: hint.engine ?? 'claude', project: hint.project ?? null, folder: null,
      sessionId: null, transcript: null, chatFile: '', turns: 0, last: null, updatedAt: null, resolvedAt: at, closed: false, continuedIn: [],
    };
    set((s) => {
      const strip = (l: JobBrief[]) => l.filter((j) => j.id !== id);
      const projects = { ...s.projects };
      if (kind === 'job') {
        for (const [slug, slot] of Object.entries(projects)) {
          if (slot.data) projects[slug] = { ...slot, data: { ...slot.data, live: strip(slot.data.live), jobs: strip(slot.data.jobs), needs: slot.data.needs.filter((n) => n.jobId !== id) } };
        }
      }
      const home = s.home.data ? {
        ...s.home.data,
        live: kind === 'job' ? strip(s.home.data.live) : s.home.data.live,
        needs: kind === 'job' ? s.home.data.needs.filter((n) => n.jobId !== id) : s.home.data.needs,
        resolved: [temp, ...(s.home.data.resolved ?? []).filter((r) => !(r.kind === kind && r.ref === id))],
      } : s.home.data;
      const orca = kind === 'orca' && s.orca.data ? { ...s.orca, data: { ...s.orca.data, agents: s.orca.data.agents.filter((a) => a.id !== id) } } : s.orca;
      return { ...s, projects, orca, home: { ...s.home, data: home } };
    });
    if (DEMO) {
      // the preview has no PC: the row settles as if the chat were saved
      set((s) => {
        const done = { ...temp, id: `r_demo_${id}`, turns: 3, closed: true };
        const home = s.home.data ? { ...s.home.data, resolved: (s.home.data.resolved ?? []).map((r) => (r.id === temp.id ? done : r)) } : s.home.data;
        return { ...s, home: { ...s.home, data: home }, notice: kind === 'orca' ? 'Resolved. On the real PC its tab in Orca closes too.' : 'Resolved.' };
      });
      return 'ok';
    }
    try {
      const out = await workApi.resolve({ kind, id, ...(force ? { force: true } : {}) }, newKey());
      set((s) => {
        const home = s.home.data ? { ...s.home.data, resolved: (s.home.data.resolved ?? []).map((r) => (r.id === temp.id ? out.item : r)) } : s.home.data;
        return { ...s, home: { ...s.home, data: home }, notice: out.note ?? (kind === 'orca' ? 'Resolved. Its tab in Orca is closed.' : 'Resolved.') };
      });
      scheduleRefetch(out.item.project);
      scheduleOrca();
      return 'ok';
    } catch (e) {
      state = snap; emit();
      if (e instanceof ApiError && e.status === 409) return 'working';
      set((s) => ({ ...s, notice: (e as Error).message }));
      return 'failed';
    }
  },

  /** Carries a resolved session on in a new job; null on failure (the notice says why). Takes a few seconds in Orca. */
  async continueResolved(id: string, b: ContinueResolved) {
    if (DEMO) { set((s) => ({ ...s, notice: 'Demo: the new job starts on the real PC, with the saved chat handed over.' })); return null; }
    try {
      const out = await workApi.continueResolved(id, b, newKey());
      set((s) => {
        const home = s.home.data ? { ...s.home.data, resolved: (s.home.data.resolved ?? []).map((r) => (r.id === id ? out.item : r)) } : s.home.data;
        return { ...s, home: { ...s.home, data: home } };
      });
      if (out.job) patchJob(out.job);
      if (out.where === 'orca') loadOrca();
      return out;
    } catch (e) {
      set((s) => ({ ...s, notice: (e as Error).message }));
      return null;
    }
  },

  /** Starts a job. Not optimistic: the PC answers at once with the job (status "starting"), then it streams. */
  async startJob(job: NewJob) {
    if (DEMO) { set((s) => ({ ...s, notice: 'Demo: jobs only start on the real server.' })); return null; }
    try {
      const { job: j } = await workApi.startJob(job, newKey());
      patchJob(j);
      return j;
    } catch (e) {
      set((s) => ({ ...s, notice: (e as Error).message }));
      return null;
    }
  },
};

// ---- hooks ----
export function useWorkHome() {
  useFeed();
  useEffect(() => { loadHome(); }, []);
  return useSyncExternalStore(subscribe, () => state.home);
}

export function useProjectHome(slug: string) {
  useFeed();
  useEffect(() => { loadProject(slug); loadHome(); }, [slug]);
  const slot = useSyncExternalStore(subscribe, () => state.projects[slug]);
  const card = useSyncExternalStore(subscribe, () => state.home.data?.projects.find((p) => p.slug === slug) ?? null);
  return { slot: slot ?? { data: null, load: 'loading' as Load, error: null }, card };
}

/** The fan's list: cached on the first frame, refreshed in the background. Doesn't hold the feed open. */
export function useFanProjects() {
  useEffect(() => { loadHome(); }, []);
  const home = useSyncExternalStore(subscribe, () => state.home.data);
  return home ? fanOrder(home.projects) : null;
}

/** The idea and tasks a job carries, from the phone's copy (the project's page, else the inbox). Missing ones are null. */
export function includedOf(project: string | null, idea: string | null, tasks: string[]) {
  const d = project ? state.projects[project]?.data : null;
  const ideas = [...(d?.ideas ?? []), ...(state.home.data?.inbox.ideas ?? [])];
  const rows = [...(d?.tasks ?? []), ...(state.home.data?.inbox.tasks ?? [])];
  return {
    idea: idea ? ideas.find((i) => i.id === idea) ?? null : null,
    tasks: tasks.map((id) => rows.find((t) => t.id === id) ?? null),
  };
}

/** Orca's agents and usage, kept fresh by the feed while a hub screen is open. */
export function useOrca() {
  useFeed();
  useEffect(() => { loadOrca(); }, []);
  return useSyncExternalStore(subscribe, () => state.orca);
}

export const useWorkLive = () => useSyncExternalStore(subscribe, () => state.live);
const NO_RESOLVED: ResolvedItem[] = [];
/** What he resolved lately, newest first, from the phone's copy of the hub. */
export const useResolvedList = () => useSyncExternalStore(subscribe, () => state.home.data?.resolved ?? NO_RESOLVED);
/** One resolved item from the phone's copy of the hub (null until home has loaded, or when it isn't there). */
export const useResolvedItem = (id: string) => useSyncExternalStore(subscribe, () => state.home.data?.resolved?.find((r) => r.id === id) ?? null);
export const useWorkNotice = () => useSyncExternalStore(subscribe, () => state.notice);
export { LIVE as LIVE_STATUSES };
