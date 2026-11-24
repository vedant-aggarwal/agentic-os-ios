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
//   POST   /jobs/:id/prompt                { text, force? }            -> { job }  409 while a turn runs; 428 when Claude's
//                                                                      prompt cache went cold (force: true sends anyway)
//   POST   /jobs/:id/permission            { requestId, optionId, answers? } -> { job }  answers: { [question]: text }
//   POST   /jobs/:id/cancel | stop | done  -> { job }
//   GET    /jobs/:id/diff?turn=&file=      -> JobDiff
//   POST   /jobs/:id/revert                { turn }
//   GET    /work/feed                      SSE: "change" (FeedChange), keep-alive comments every 15 s
//   GET    /engines/health                 -> EngineHealth
//   GET    /work/orca                      -> OrcaState  (ETag) the Orca app's agents and Claude/Codex usage
//   GET    /orca/agents/:id?limit=         -> OrcaRead   one Orca agent's conversation, newest last
//   POST   /orca/agents/:id/prompt         { text, force? } -> { ok }  428 cold cache, 409 working, 501 a chat tab
//   POST   /orca/launch                    { agent, folder, prompt } -> { agent: OrcaAgent | null, outcome }
//   POST   /work/resolve                   { kind, id, force? } -> ResolveResult   409 while it works (force resolves anyway)
//   GET    /work/resolved/:id              -> ResolvedRead   the saved chat, oldest first
//   POST   /work/resolved/:id/continue     ContinueResolved -> { item, job?, agent?, where }   a new job that carries it on
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
/** Claude's prompt cache for a job as the PC sees it: warm until `warmUntil`, then a message re-reads the whole chat. */
export type JobCache = {
  state: 'warm' | 'cold' | 'none'; ttlMin: number; lastAt: string | null; warmUntil: string | null; tokens: number | null;
  /** Keep-warm pings hold the cache open until then. */
  keepWarmUntil?: string | null;
};
export type JobFull = JobBrief & {
  perm: Perm; model: string | null; createdAt: string; finishedAt: string | null;
  cache?: JobCache;
  tasks: string[]; idea: string | null;
  /** "New session with summary": the job this one carries on from, and the one that carried on from it. */
  continuedFrom?: string | null; continuedTo?: string | null;
};

export type PermOption = { optionId: string; name: string; kind: string };
/** A question the agent asks (Claude's AskUserQuestion, Codex's requestUserInput): pick an option or type an answer. */
export type FormQuestion = { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] };
/** The server keeps the permission it raised under `permission`: `form` for questions, `html` for an ask_form page. */
export type PermDetail = { form?: FormQuestion[]; html?: string };
export type JobEvent =
  | { seq: number; type: 'user'; text: string; at: string }
  | { seq: number; type: 'assistant' | 'thought'; text: string; at: string }
  | { seq: number; type: 'tool'; id: string; title: string; kind?: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; locations?: string[]; output?: string; at: string }
  | { seq: number; type: 'plan'; entries: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]; at: string }
  | { seq: number; type: 'permission'; requestId: string; title: string; kind: string; options: PermOption[]; decided?: string; at: string;
      form?: FormQuestion[]; permission?: PermDetail }
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
  /** What he swiped away lately, newest first (an older PC leaves it out). */
  resolved?: ResolvedItem[];
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
  | { kind: 'idea' | 'task' | 'project'; id: string; project: string | null }
  | { kind: 'orca'; id: '*'; project: null };

export type EngineHealth = Record<Engine, { ok: boolean; detail: string | null; checkedAt: string }>;

// ---- Orca: the agent app on his PC, where jobs also run and where he watches them on the desktop ----
export type CacheState = { state: 'warm' | 'cold' | 'none'; lastAt: string | null; warmUntil: string | null; ttlMin: number };
/** An agent in Orca. `state`: working, blocked (a permission), waiting (a question), done. Only terminal agents take replies from the phone. */
export type OrcaAgent = {
  id: string; kind: 'chat' | 'terminal'; agent: string; state: string; title: string; last: string | null;
  workspace: string | null; path: string | null; project: string | null; updatedAt: string | null; cache: CacheState;
};
export type UsageWindow = { usedPercent: number; resetsAt: string | null; reset: string | null };
export type ProviderUsage = {
  status: string; plan: string | null; error: string | null; at: string | null;
  session: UsageWindow | null; weekly: UsageWindow | null; extra: { label: string; window: UsageWindow }[];
};
export type OrcaUsage = { claude: ProviderUsage | null; codex: ProviderUsage | null; at: string };
export type OrcaState = { up: boolean; error: string | null; agents: OrcaAgent[]; usage: OrcaUsage | null; at: string };
export type OrcaEntry = { kind: 'message' | 'tool'; role: 'user' | 'assistant' | null; text: string | null; name: string | null; state: string | null };
export type OrcaRead = { agent: OrcaAgent; entries: OrcaEntry[]; state: string; limited: boolean };
/** stop: end its turn. allow / deny: answer its permission prompt. show: bring it up in Orca on the PC. end: close its tab. */
export type OrcaControl = 'stop' | 'allow' | 'deny' | 'show' | 'end';
export type OrcaLaunch = { agent?: 'claude' | 'codex'; folder: string; prompt: string; model?: string | null; effort?: string | null };

// ---- Resolved: jobs and Orca agents he swiped away. The PC saved each chat first, so it can be read or carried on ----
export type ResolvedItem = {
  id: string; kind: 'job' | 'orca';
  /** The job id (j12) or Orca session id it was. */
  ref: string;
  title: string; engine: string; project: string | null; folder: string | null;
  /** The agent's own Claude Code or Codex session and transcript file, when the PC found them. */
  sessionId: string | null; transcript: string | null;
  chatFile: string; turns: number; last: string | null;
  updatedAt: string | null; resolvedAt: string;
  /** Its tab on the PC closed (Orca) or its process stopped (job). */
  closed: boolean;
  continuedIn: { kind: 'job' | 'orca'; id: string; at: string }[];
};
export type ResolvedTurn = { role: 'user' | 'assistant' | 'tool' | 'note'; text: string };
export type ResolvedRead = { item: ResolvedItem; turns: ResolvedTurn[] };
export type ResolveResult = { item: ResolvedItem; closed: boolean; note: string | null };
export type ContinueResolved = { text?: string; engine?: Engine; where?: 'orca' | 'app'; perm?: Perm; folder?: string | null };
