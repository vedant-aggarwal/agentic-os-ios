// The Projects hub's data contract, shared by the phone and the PC server (agentic-os-ios-ai/server).
// Spec: Desktop/Agentic OS phone app design/PROJECTS-HUB-SPEC.md. All routes are under /api/v1 and owner only.
//
//   GET    /work/home                      -> WorkHome            (ETag; 304 when unchanged)
//   GET    /projects/:slug/home            -> ProjectHome         (ETag; also bumps the project's lastActiveAt)
//   POST   /projects                       { name, folders?, color?, icon? }            -> { project: ProjectCard }
//   PATCH  /projects/:slug                 { name?, folders?, pinned?, color?, icon?, status? } -> { project: ProjectCard }
//   GET    /work/folder-suggestions        -> { folders: FolderSuggestion[] }   recent Claude/Codex session folders
//   POST   /ideas                          { project?, title?, body?, source? }  -> { idea: Idea }
//   POST   /tasks                          { project?, title, due? }             -> Task (bare row)
//   POST   /jobs                           NewJob                                -> { job }  (201 at once, status "starting")
//   GET    /jobs/:id?tail=200              -> { job: JobFull, events: JobEvent[], more: boolean }
//   GET    /jobs/:id/events?before=&limit= -> { events: JobEvent[], more: boolean }
//   GET    /jobs/:id/stream?after=<seq>    SSE: "job" (JobFull) and "ev" (JobEvent; a growing event keeps its seq)
//   POST   /jobs/:id/prompt                { text }                    -> { job }
//   POST   /jobs/:id/permission            { requestId, optionId }     -> { job }
//   POST   /jobs/:id/cancel | stop | done  -> { job }
//   GET    /jobs/:id/diff?turn=&file=      -> JobDiff
//   POST   /jobs/:id/revert                { turn }
//   GET    /work/feed                      SSE: "change" (FeedChange), keep-alive comments every 15 s
//   GET    /engines/health                 -> EngineHealth
//
// Writes from the phone carry an `Idempotency-Key` header, so a replayed offline write never doubles.

export type Engine = 'claude' | 'codex';
export type Perm = 'ask' | 'edits' | 'auto';

/** One folder of a project. `start` marks the folder a job runs in by default; the rest are reachable from it. */
export type Folder = { path: string; label: string; start?: boolean };
export type FolderSuggestion = { path: string; name: string; at: string | null };

export type ProjectCounts = { ideas: number; tasks: number; jobs: number; live: number; needs: number };
export type ProjectCard = {
  slug: string;
  name: string;
  color: string | null;
  icon: string | null;
  status: 'active' | 'paused' | 'done' | 'archived';
  pinned: boolean;
  /** ISO. Last time a job ran, an item changed, or he opened it. Sorts the fan after pinned ones. */
  lastActiveAt: string | null;
  folders: Folder[];
  counts: ProjectCounts;
};

export type Idea = {
  id: string; title: string; body: string | null; project: string | null;
  status: 'open' | 'tasked' | 'jobbed' | 'archived'; source: string | null; createdAt: string;
};
export type Task = {
  id: string; title: string; status: 'inbox' | 'todo' | 'doing' | 'done' | 'dropped';
  project: string | null; due: string | null; notes?: string | null;
};

export type JobStatus = 'starting' | 'running' | 'idle' | 'needs_input' | 'stopped' | 'failed' | 'done';
/** A job as lists show it. `step` is the current activity in one line ("Editing sort.ts"). */
export type JobBrief = {
  id: string; title: string; engine: Engine; status: JobStatus; project: string | null;
  folder: string | null; updatedAt: string; step: string | null;
  changes: { files: number; add: number; del: number } | null;
  error: string | null;
};
export type JobFull = JobBrief & {
  perm: Perm; model: string | null; createdAt: string; finishedAt: string | null;
  tasks: string[]; idea: string | null;
};

export type PermOption = { optionId: string; name: string; kind: string };
export type JobEvent =
  | { seq: number; type: 'user'; text: string; at: string }
  | { seq: number; type: 'assistant' | 'thought'; text: string; at: string }
  | { seq: number; type: 'tool'; id: string; title: string; kind?: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; locations?: string[]; output?: string; at: string }
  | { seq: number; type: 'plan'; entries: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]; at: string }
  | { seq: number; type: 'permission'; requestId: string; title: string; kind: string; options: PermOption[]; decided?: string; at: string }
  | { seq: number; type: 'status'; status: JobStatus; text?: string; at: string }
  | { seq: number; type: 'changes'; turn: number; files: { path: string; add: number; del: number }[]; at: string }
  | { seq: number; type: 'error'; text: string; at: string };

export type JobDiff = { turn: number; files: { path: string; add: number; del: number; patch?: string }[] };

/** Something waiting on him. Permission items can be answered from the card itself. */
export type NeedItem = {
  id: string; kind: 'permission' | 'review' | 'question' | 'failed';
  jobId: string; project: string | null; title: string; detail: string | null; at: string;
  requestId?: string; options?: PermOption[];
};

export type SessionBrief = {
  id: string; tool: Engine; title: string; cwd: string; updatedAt: string;
  live: boolean; where: 'app' | 'terminal' | 'background' | 'closed';
};

export type RepoState = { folder: string; branch: string | null; changed: number; ahead: number; at: string };

export type WorkHome = {
  projects: ProjectCard[];
  needs: NeedItem[];
  live: JobBrief[];
  inbox: { ideas: Idea[]; tasks: Task[] };
  at: string;
};
export type ProjectHome = {
  project: ProjectCard;
  needs: NeedItem[];
  live: JobBrief[];
  ideas: Idea[];
  tasks: Task[];
  jobs: JobBrief[];
  sessions: SessionBrief[];
  repo: RepoState[];
  at: string;
};

export type NewJob = {
  engine: Engine; project?: string | null; context?: string; tasks?: string[]; idea?: string | null;
  /** Which folder to start in (a path from the project's folders); default the start folder. */
  folder?: string | null; perm?: Perm; title?: string;
};

export type FeedChange =
  | { kind: 'job'; id: string; project: string | null; job: JobBrief }
  | { kind: 'need'; id: string; project: string | null; need: NeedItem | null }
  | { kind: 'idea' | 'task' | 'project'; id: string; project: string | null };

export type EngineHealth = Record<Engine, { ok: boolean; detail: string | null; checkedAt: string }>;
