import type { Folder, JobBrief, NeedItem, OrcaAgent, OrcaState, ProjectCard, ProjectHome, ResolvedItem, ResolvedRead, WorkHome } from './types';

// Dev only (web build with `?demo`, see lib/demo.ts): the hub on sample data, for layout work without the PC.
// The project list mirrors the seed in PROJECTS-HUB-SPEC.md section 12; jobs, ideas and tasks are samples.

const U = 'C:\\Users\\VEDANT';
const f = (label: string, path: string, start = false): Folder => ({ label, path: `${U}\\${path}`, ...(start ? { start } : {}) });
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const card = (slug: string, name: string, folders: Folder[], extra: Partial<ProjectCard> = {}): ProjectCard => ({
  slug, name, color: null, icon: null, status: 'active', pinned: false, lastActiveAt: null, folders,
  counts: { ideas: 0, tasks: 0, jobs: 0, live: 0, needs: 0 }, ...extra,
});

const PROJECTS: ProjectCard[] = [
  card('agentic-os', 'Agentic OS', [
    f('Design', 'Desktop\\Agentic OS phone app design', true), f('App', 'agentic-os-mobile'), f('Server', 'agentic-os-ios-ai'), f('CLI', 'agentos'),
  ], { pinned: true, lastActiveAt: ago(2), counts: { ideas: 4, tasks: 6, jobs: 12, live: 1, needs: 1 } }),
  card('content-os', 'Content OS', [f('Main', 'content-os', true), f('Design', 'Desktop\\Content OS phone app design')],
    { lastActiveAt: ago(9), counts: { ideas: 7, tasks: 3, jobs: 5, live: 1, needs: 0 } }),
  card('bizbrain', 'BizBrain', [f('App', 'bizbrain-expo', true), f('Server', 'bizbrain-os')], { lastActiveAt: ago(40), counts: { ideas: 1, tasks: 2, jobs: 3, live: 0, needs: 0 } }),
  card('nora', 'Nora', [f('Server', 'agentic-os-ios-ai', true)], { lastActiveAt: ago(180), counts: { ideas: 1, tasks: 0, jobs: 0, live: 0, needs: 0 } }),
  card('hermes', 'Hermes', [f('Main', 'nora-hermes', true), f('Home', '.hermes')], { lastActiveAt: ago(240) }),
  card('innovex', 'Innovex', [f('Main', 'innovex', true), f('ERP', 'innovex-erp')], { lastActiveAt: ago(3000), counts: { ideas: 1, tasks: 0, jobs: 0, live: 0, needs: 0 } }),
  card('agentic-os-v48', 'Agentic OS V4.8', [f('Main', 'Desktop\\⭐️ Agentic OS V4.8\\Agentic-OS-V4.8', true)], { lastActiveAt: ago(4000) }),
  // Idea projects: kept, not worked on now (paused on the PC)
  card('chatflow', 'Chatflow', [f('Main', 'Documents\\Codex\\chatflow', true), f('Design', 'Desktop\\Chatflow Design')], { status: 'paused', lastActiveAt: ago(15000) }),
  card('wonder-bazaar', 'Wonder Bazaar', [f('Main', 'wonderbazaar', true), f('Shopify', 'Desktop\\shopify-workflow')], { status: 'paused', lastActiveAt: ago(50000) }),
  card('tapstar', 'Tapstar', [f('Main', 'Desktop\\tapstar-workspace', true)], { status: 'paused', lastActiveAt: ago(28000) }),
  card('tarahood', 'Tarahood', [f('Main', 'tarahood-os', true)], { status: 'paused', lastActiveAt: ago(29000) }),
  card('norrita-os', 'Norrita OS', [f('Main', 'norrita-os', true)], { status: 'paused', lastActiveAt: ago(40000) }),
  card('reel-studio', 'Reel Studio', [f('Main', 'Desktop\\Reel Studio', true)], { status: 'paused', lastActiveAt: ago(30000) }),
  card('realflow', 'Realflow', [], { status: 'paused' }),
  card('bahi', 'Bahi', [], { status: 'paused' }),
];

const job = (id: string, title: string, project: string, status: JobBrief['status'], step: string | null, min: number, extra: Partial<JobBrief> = {}): JobBrief => ({
  id, title, engine: 'claude', status, project, folder: PROJECTS.find((p) => p.slug === project)?.folders[0]?.path ?? null,
  updatedAt: ago(min), step, changes: null, error: null, ...extra,
});

const LIVE: JobBrief[] = [
  job('j101', 'Priority sort on Today', 'agentic-os', 'running', 'Editing src/lib/today.ts', 1, { changes: { files: 3, add: 24, del: 9 } }),
  job('j102', 'Channel ideas for Roblox', 'content-os', 'needs_input', 'Wants to run bun test', 3, { engine: 'codex' }),
];
const NEEDS: NeedItem[] = [{
  id: 'n1', kind: 'permission', jobId: 'j102', project: 'content-os', title: 'Run bun test', detail: 'bun test src/channels', at: ago(3),
  requestId: 'r1', options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
}, {
  id: 'n2', kind: 'review', jobId: 'j099', project: 'agentic-os', title: 'Voices page: copy button', detail: '2 files changed, +18 −4', at: ago(25),
}];

export function demoHome(): WorkHome {
  return {
    projects: PROJECTS, needs: NEEDS, live: LIVE,
    inbox: {
      ideas: [{ id: 'i1', title: 'Widget that opens straight into idea recording', body: null, project: null, status: 'open', source: 'voice', createdAt: ago(60) }],
      tasks: [{ id: 't1', title: 'Renew the Apple developer account', status: 'inbox', project: null, due: null }],
    },
    resolved: RESOLVED,
    at: new Date().toISOString(),
  };
}

export function demoProject(slug: string): ProjectHome {
  const project = PROJECTS.find((p) => p.slug === slug) ?? card(slug, slug, []);
  const live = LIVE.filter((j) => j.project === slug);
  return {
    project,
    needs: NEEDS.filter((n) => n.project === slug),
    live,
    ideas: project.counts.ideas ? [
      { id: `${slug}-i1`, title: 'Hold the Work orb to open the projects fan', body: null, project: slug, status: 'open', source: 'voice', createdAt: ago(30) },
      { id: `${slug}-i2`, title: 'One live feed instead of polling', body: 'Every list updates from /work/feed.', project: slug, status: 'open', source: 'app', createdAt: ago(300) },
    ] : [],
    tasks: project.counts.tasks ? [
      { id: `${slug}-t1`, title: 'Fix the Claude login for jobs', status: 'todo', project: slug, due: null },
      { id: `${slug}-t2`, title: 'Seed projects with their folders', status: 'doing', project: slug, due: null },
    ] : [],
    jobs: [...live, job(`${slug}-j1`, 'Voices page: copy button', slug, 'idle', null, 25, { changes: { files: 2, add: 18, del: 4 } }),
      job(`${slug}-j2`, 'Files page: resumable uploads', slug, 'done', null, 2000)],
    sessions: [],
    repo: project.folders.slice(0, 2).map((fo, i) => ({ folder: fo.path, branch: i ? 'feature/ai' : 'expo-v3', changed: i ? 0 : 3, ahead: 0, at: ago(1) })),
    at: new Date().toISOString(),
  };
}

const agent = (id: string, title: string, project: string | null, state: string, min: number, extra: Partial<OrcaAgent> = {}): OrcaAgent => {
  const at = Date.now() - min * 60_000;
  const warm = state === 'working' || min < 60;
  return {
    id, kind: 'terminal', agent: 'claude', state, title, last: null, workspace: project ?? '~', path: null, project, updatedAt: new Date(at).toISOString(),
    cache: { state: warm ? 'warm' : 'cold', lastAt: new Date(at).toISOString(), warmUntil: new Date(at + 3_600_000).toISOString(), ttlMin: 60 }, ...extra,
  };
};

/** Orca on sample data: two agents working, one waiting on him, a few quiet ones, and both usage meters. */
export function demoOrca(): OrcaState {
  const reset = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  return {
    up: true, error: null, at: new Date().toISOString(),
    agents: [
      agent('o1', 'Work tab: Orca bridge', 'agentic-os', 'working', 1, { last: 'Wiring /work/orca into the hub store.' }),
      agent('o2', 'Hermes heartbeat checks', 'hermes', 'blocked', 4, { last: 'Wants to run hermes cron list.' }),
      agent('o3', 'Reel script for Sheru', 'content-os', 'working', 2, { agent: 'codex' }),
      agent('o4', 'Reply to Skool member', null, 'done', 22, { kind: 'chat', last: 'Post the reply below as your answer.' }),
      agent('o5', 'Nora', 'nora', 'done', 380, { kind: 'chat', last: 'I didn’t change anything in Hermes.' }),
      agent('o6', 'BizBrain punch sync', 'bizbrain', 'done', 140, { last: 'Pushed the hourly copy agent.' }),
    ],
    usage: {
      at: new Date().toISOString(),
      claude: { status: 'ok', plan: 'max_20x', error: null, at: new Date().toISOString(), session: { usedPercent: 31, resetsAt: reset(3), reset: '4:30 pm' },
        weekly: { usedPercent: 42, resetsAt: reset(100), reset: 'Sun, 6:30 pm' }, extra: [{ label: 'Fable', window: { usedPercent: 6, resetsAt: reset(100), reset: 'Sun, 6:30 pm' } }] },
      codex: { status: 'ok', plan: 'plus', error: null, at: new Date().toISOString(), session: null,
        weekly: { usedPercent: 79, resetsAt: reset(23), reset: 'Wed, 1:19 pm' }, extra: [] },
    },
  };
}

const resolvedItem = (id: string, title: string, project: string | null, min: number, extra: Partial<ResolvedItem> = {}): ResolvedItem => ({
  id, kind: 'orca', ref: `o-${id}`, title, engine: 'claude', project, folder: PROJECTS.find((p) => p.slug === project)?.folders[0]?.path ?? null,
  sessionId: '93bb2093-fbaa-427f-ba2b-b8d2bcaec99c', transcript: null, chatFile: `${U}\\agentic-os-ios-ai\\data\\resolved\\${id}.md`, turns: 6,
  last: null, updatedAt: ago(min + 5), resolvedAt: ago(min), closed: true, continuedIn: [], ...extra,
});
const RESOLVED: ResolvedItem[] = [
  resolvedItem('r_demo1', 'BizBrain list order reversal', 'bizbrain', 12, { last: 'Send out now shows the newest bills at the top. Committed on feat/send-newest-first.' }),
  resolvedItem('r_demo2', 'Voices page: copy button', 'agentic-os', 95, { kind: 'job', ref: 'j99', turns: 4, last: 'The copy button sits beside each take now.', continuedIn: [{ kind: 'orca', id: 'o1', at: ago(30) }] }),
  resolvedItem('r_demo3', 'Reel script for Sheru', 'content-os', 300, { engine: 'codex', turns: 9, last: 'Script v3 is in scripts/sheru-07.md.' }),
  resolvedItem('r_demo4', 'Reply to Skool member', null, 1500, { kind: 'orca', closed: false, turns: 2, last: 'Post the reply below as your answer.' }),
];

/** A resolved item's saved chat, for the preview. */
export function demoResolvedRead(id: string): ResolvedRead {
  const item = RESOLVED.find((r) => r.id === id) ?? RESOLVED[0];
  return {
    item,
    turns: [
      { role: 'user', text: 'Project: BizBrain.\n\nIdea: It\'s oldest to latest first. It should be reversed so that the latest ones come at the top.' },
      { role: 'assistant', text: 'Tracing which desk list you meant; Send out is the likely one.' },
      { role: 'tool', text: 'Read plan.ts · Edit plan.ts · Edit send.tsx · Bash: npx tsc --noEmit' },
      { role: 'assistant', text: 'Send out now shows the newest bills at the top, on its own page and in the preview on the desk home.\n\n- **Unchanged:** Auto assign still gives the oldest bills out first.\n- **Files changed:** `src/desk/plan.ts`, `app/desk/send.tsx`\n\nLeft for you:\n- The shop tablet only gets this after a new Android build.' },
    ],
  };
}
