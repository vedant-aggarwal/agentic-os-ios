import type { Folder, JobStatus, ProjectCard, ProjectCounts, RepoState, SessionBrief, Task } from '../types';

/** `C:\Users\VEDANT\agentic-os-mobile` -> `~\agentic-os-mobile`. */
export function shortPath(p: string) {
  return p
    .replace(/^[A-Za-z]:\\Users\\[^\\]+/, '~')
    .replace(/^\/(Users|home)\/[^/]+/, '~');
}

/** The folder a job starts in: the one marked start, else the first. */
export const startFolder = (folders: Folder[]) => folders.find((f) => f.start) ?? folders[0] ?? null;

const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

export const repoFor = (repo: RepoState[], folder: string) => repo.find((r) => samePath(r.folder, folder)) ?? null;

/** A repo row's name: its folder's label in the project, else the folder's own name. */
export function folderName(folders: Folder[], path: string) {
  const f = folders.find((x) => samePath(x.path, path));
  return f?.label || path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "4 ideas, 6 tasks" for a project row. */
export function countsLine(c: ProjectCounts) {
  const parts = [c.ideas ? plural(c.ideas, 'idea') : '', c.tasks ? plural(c.tasks, 'task') : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Nothing open';
}

/** Short age for the right edge of a row: now, 5m, 2h, 3d, then a date. */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** A task's due day, short: Today, Tomorrow, Yesterday, 24 Nov. */
export function dueLabel(due: Task['due']) {
  if (!due) return '';
  const day = due.slice(0, 10);
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const STATUS_WORD: Record<JobStatus, string> = {
  starting: 'Starting', running: 'Working', needs_input: 'Needs you', idle: 'Idle',
  stopped: 'Stopped', failed: 'Failed', done: 'Done',
};

export const isWorking = (s: JobStatus) => s === 'starting' || s === 'running';

const TOOL = { claude: 'Claude', codex: 'Codex' } as const;
const WHERE: Record<SessionBrief['where'], string> = {
  app: 'in the desktop app', terminal: 'in a terminal', background: 'in the background', closed: 'closed',
};
export const sessionLine = (s: SessionBrief) =>
  s.where === 'closed' ? `${TOOL[s.tool]}, closed` : `${TOOL[s.tool]} ${WHERE[s.where]}`;

/** Projects that need him or have an agent working, for the live dot. */
export const projectTone = (p: ProjectCard) => (p.counts.needs ? 'needs' : p.counts.live ? 'live' : null);
