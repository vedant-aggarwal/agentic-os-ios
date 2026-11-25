// Sample records for the `?demo` preview of the Mission page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data, nobody's real life: a photo book, a 10 km run, a weekend away with friends. Every title and
// number here is made up for the preview. The phone never loads this file. The answers follow the shapes in
// server/modules/mission-core.ts (home, ladder, one goal, projects, the record, slots), worked out from the sample
// goals, tasks and projects below, so a tick or a close in the preview moves the page the way the PC would.
import { addDays, myDay, weekStart } from '@/aspects/kit/time';
import { ApiError, collection, demoSource, type Doc } from '@/lib/mod';

const day = myDay();
// `?demo&aspect=mission&empty`: the page on day one, with nothing set yet
const EMPTY = typeof location !== 'undefined' && new URLSearchParams(location.search).has('empty');
const M = '/mod/mission';
const LIMITS: Record<string, number> = { week: 3, month: 3, quarter: 3, year: 5 };
const RANK: Record<string, number> = { day: 0, week: 1, month: 2, quarter: 3, year: 4, decade: 5, life: 6 };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const dm = (s: string) => `${Number(s.slice(8))} ${MON[Number(s.slice(5, 7)) - 1]}`;
/** 1 Monday .. 7 Sunday. */
const weekdayOf = (s: string) => ((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const at = (d: string, h = 6) => `${d}T${pad(h)}:00:00.000Z`;
const span = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const now = () => new Date().toISOString();

// ── periods, as agentos names them ──
type Period = { key: string; start: string | null; end: string | null };
function weekKey(monday: string) {
  const ty = Number(addDays(monday, 3).slice(0, 4)); // an ISO week belongs to the year its Thursday is in
  return `${ty}-W${pad(span(weekStart(`${ty}-01-04`), monday) / 7 + 1)}`;
}
function period(h: string, d: string): Period {
  const [y, m] = d.split('-').map(Number);
  if (h === 'week') { const s = weekStart(d); return { key: weekKey(s), start: s, end: addDays(s, 6) }; }
  if (h === 'month') return { key: `${y}-${pad(m)}`, start: `${y}-${pad(m)}-01`, end: addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`, -1) };
  if (h === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    return { key: `${y}-Q${q + 1}`, start: `${y}-${pad(q * 3 + 1)}-01`, end: addDays(q === 3 ? `${y + 1}-01-01` : `${y}-${pad(q * 3 + 4)}-01`, -1) };
  }
  if (h === 'year') return { key: String(y), start: `${y}-01-01`, end: `${y}-12-31` };
  return { key: h, start: null, end: null };
}
function periodOfKey(h: string, key: string): Period | null {
  const w = key.match(/^(\d{4})-W(\d{2})$/);
  if (h === 'week' && w) return period('week', addDays(weekStart(`${w[1]}-01-04`), (Number(w[2]) - 1) * 7));
  if (h === 'month' && /^\d{4}-\d{2}$/.test(key)) return period('month', `${key}-01`);
  const q = key.match(/^(\d{4})-Q([1-4])$/);
  if (h === 'quarter' && q) return period('quarter', `${q[1]}-${pad(Number(q[2]) * 3 - 2)}-01`);
  if (h === 'year' && /^\d{4}$/.test(key)) return period('year', `${key}-01-01`);
  return null;
}
const next = (h: string, p: Period) => period(h, addDays(p.end!, 1));
function spanLabel(h: string, p: Period) {
  const s = p.start, e = p.end;
  if (!s || !e || h === 'life') return 'Life';
  if (h === 'week') return s.slice(5, 7) === e.slice(5, 7) ? `${Number(s.slice(8))} to ${dm(e)}` : `${dm(s)} to ${dm(e)}`;
  if (h === 'month') return MONTH[Number(s.slice(5, 7)) - 1] + (s.slice(0, 4) === day.slice(0, 4) ? '' : ` ${s.slice(0, 4)}`);
  if (h === 'quarter') return `${MON[Number(s.slice(5, 7)) - 1]} to ${MON[Number(e.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  if (h === 'year') return s.slice(0, 4);
  return p.key;
}
const sunday = weekdayOf(day) === 7;
const cw = period('week', day);
const lw = period('week', addDays(cw.start!, -7));
const planWeek = sunday ? next('week', cw) : cw;

// ── the sample life ──
type G = {
  id: number; title: string; horizon: string; period: string; start: string | null; end: string | null; status: 'active' | 'done' | 'dropped';
  aspects: string[]; parent: number | null; progress: number; mode: 'auto' | 'manual'; created: string; doneAt: string | null;
};
type T = { id: number; title: string; status: 'todo' | 'done' | 'dropped'; goal: number | null; project: string | null; due: string | null; area: string | null; doneAt: string | null };
type Pj = { slug: string; name: string; status: 'active' | 'paused' | 'done'; area: string | null; aspect: string | null; description: string | null; deadline: string | null; goal: number | null };
type Switch = { from: string; fromName: string; to: string; why: string | null; at: string };
type Move = { id: string; review: string | null; text: string; aspect: string | null; state: 'accepted' | 'declined'; goal: string | null; by: string; at: string };
type Week = { id: string; first: string | null; why: string | null; since: string | null; switches: Switch[]; moves: Move[] };
type Carry = Period & { horizon: string; label: string };
type Closing = { id: string; goal: string; title: string; horizon: string; period: string; label: string; outcome: string; why: string | null; to: Carry | null; by: string; at: string; aspect: string | null };
type Milestone = Doc & { goal: string; title: string; done: boolean; due: string | null; position: number; done_at?: string | null };
type Measure = Doc & { goal: string; source: string; target?: number | null; unit?: string | null; jar?: string | null; from?: number | null };
type Purpose = Doc & { text: string; by: string };
type Life = Doc & { title: string; fam: string; position: number };

const goals: G[] = [];
let gseq = 100;
const goal = (title: string, horizon: string, inDay: string, aspects: string[], extra: Partial<G> = {}): G => {
  const p = period(horizon, inDay);
  const g: G = { id: ++gseq, title, horizon, period: p.key, start: p.start, end: p.end, status: 'active', aspects, parent: null, progress: 0, mode: 'auto', created: at(addDays(day, -60)), doneAt: null, ...extra };
  goals.push(g);
  return g;
};
const pOf = (g: G): Period => ({ key: g.period, start: g.start, end: g.end });
const closings: Closing[] = [];
let cseq = 0;
const closingOf = (g: G, outcome: string, why: string | null, when: string, by = 'me'): Closing => ({
  id: `cl-${++cseq}`, goal: `g${g.id}`, title: g.title, horizon: g.horizon, period: g.period, label: spanLabel(g.horizon, pOf(g)), outcome, why, to: null, by, at: when, aspect: g.aspects[0] ?? null,
});

const lifeWork = goal('Make things people keep', 'life', day, ['mission']);
const lifeBody = goal('Stay strong enough to hike at seventy', 'life', day, ['body']);
const yBook = goal('Publish the harbour photo book', 'year', day, ['mission'], { parent: lifeWork.id });
const yRun = goal('Run a half marathon', 'year', day, ['body'], { parent: lifeBody.id });
goal('Keep three months of costs saved', 'year', day, ['money'], { progress: 55, mode: 'manual' });
const qDraft = goal('Finish the book draft', 'quarter', day, ['mission'], { parent: yBook.id });
const q10k = goal('Run 10 km without stopping', 'quarter', day, ['body'], { parent: yRun.id, progress: 60, mode: 'manual' });
goal('Call home every Sunday', 'quarter', day, ['family']);
const mShoot = goal('Shoot the last two chapters', 'month', day, ['mission'], { parent: qDraft.id });
goal('Book the printer', 'month', addDays(period('month', day).end!, 1), ['mission'], { parent: yBook.id });
goal('Clear out the spare room', 'month', addDays(period('month', day).start!, -1), ['family']);
const wEdit = goal('Edit the harbour chapter', 'week', cw.start!, ['mission'], { parent: qDraft.id, created: at(cw.start!) });
const wRuns = goal('Three runs this week', 'week', cw.start!, ['body'], { parent: q10k.id, created: at(cw.start!) });
const wTrip = goal('Plan the weekend away with friends', 'week', cw.start!, ['friends'], { created: at(cw.start!) });

// the weeks before this one, for the record: what was set and what happened to each
const past: [number, string, string, 'done' | 'missed' | 'dropped' | 'open', string?][] = [
  [7, 'Sort the photo archive by year', 'mission', 'done'], [7, 'Run twice', 'body', 'done'],
  [6, 'Write the book outline', 'mission', 'done'], [6, 'Fix the leaking tap', 'family', 'missed', 'No time'],
  [5, 'Edit twenty photos a day', 'mission', 'missed', 'Too big'], [5, 'Run three times', 'body', 'done'], [5, 'Call home on Sunday', 'family', 'done'],
  [4, 'Pick the paper for the book', 'mission', 'done'], [4, 'Run three times', 'body', 'missed', 'No time'],
  [3, 'Run three times', 'body', 'done'],
  [2, 'Book the dentist', 'family', 'dropped', 'Plans changed'], [2, 'Run three times', 'body', 'done'],
  [1, 'Send the print quotes out', 'mission', 'done'], [1, 'Run twice', 'body', 'done'], [1, 'Fix the bike brakes', 'body', 'open'],
];
let bike: G | null = null;
for (const [ago, title, aspect, out, why] of past) {
  const wk = addDays(cw.start!, -7 * ago);
  const g = goal(title, 'week', wk, [aspect], { created: at(wk) });
  const when = at(addDays(wk, 6), 12);
  if (out === 'done') { g.status = 'done'; g.doneAt = when; closings.push(closingOf(g, 'done', null, when, ago % 2 ? 'growth' : 'me')); }
  if (out === 'missed' || out === 'dropped') { g.status = 'dropped'; closings.push(closingOf(g, out, why ?? null, when, ago % 2 ? 'growth' : 'me')); }
  if (out === 'open') bike = g;
}
// carried on: set three weeks ago, carried a week on, done there
{
  const g = goal('Draft the printer email', 'week', addDays(cw.start!, -21), ['mission'], { created: at(addDays(cw.start!, -21)) });
  const into = period('week', addDays(cw.start!, -14));
  closings.push({ ...closingOf(g, 'carried', 'No time', at(addDays(cw.start!, -15), 12)), to: { ...into, horizon: 'week', label: spanLabel('week', into) } });
  Object.assign(g, { period: into.key, start: into.start, end: into.end, status: 'done', doneAt: at(addDays(cw.start!, -10), 12) });
  closings.push(closingOf(g, 'done', null, g.doneAt!));
}

const tasks: T[] = [];
let tseq = 0;
const task = (title: string, extra: Partial<T> = {}) => { tasks.push({ id: ++tseq, title, status: 'todo', goal: null, project: null, due: null, area: null, doneAt: null, ...extra }); };
task('Pick the twelve best frames', { goal: wEdit.id, project: 'photo-book', area: 'creative', status: 'done', doneAt: at(addDays(day, -1), 9) });
task('Write the chapter intro', { goal: wEdit.id, project: 'photo-book', area: 'creative', due: day });
task('Send the proofs to the printer', { goal: wEdit.id, project: 'photo-book', area: 'creative', due: addDays(day, 2) });
task('Message the group with three dates', { goal: wTrip.id, area: 'friends' });
task('Book the cabin', { goal: wTrip.id, area: 'friends' });
if (bike) task('Order new brake pads', { goal: bike.id, area: 'body', status: 'done', doneAt: at(addDays(day, -8)) });
task('Choose the cover photo', { project: 'photo-book', area: 'creative', status: 'done', doneAt: at(addDays(day, -4)) });
task('Order paper samples', { project: 'photo-book', area: 'creative', status: 'done', doneAt: at(addDays(day, -9)) });
task('Ask two friends to read the draft', { project: 'photo-book', area: 'creative' });
task('Pick a theme for the site', { project: 'portfolio', area: 'creative', due: addDays(day, 1) });
task('Write the about page', { project: 'portfolio', area: 'creative' });
task('Buy the domain', { project: 'portfolio', area: 'creative', status: 'done', doneAt: at(addDays(day, -5)) });
task('Scan the recipe cards', { project: 'cookbook', area: 'home' });
task('Write down the soup recipe', { project: 'cookbook', area: 'home', status: 'done', doneAt: at(addDays(day, -41)) });
task('Buy seed trays', { project: 'garden', area: 'home' });
task('Renew the passport', { area: 'admin', due: addDays(day, 9) });
task('Back up the photo drive', { area: 'creative' });
task('Call the bank about the card', { area: 'money' });

const projects: Pj[] = [
  { slug: 'photo-book', name: 'Harbour photo book', status: 'active', area: 'creative', aspect: 'mission', description: 'Sixty photos from the harbour with short captions, printed as a small book.', deadline: addDays(day, 36), goal: qDraft.id },
  { slug: 'portfolio', name: 'Portfolio site', status: 'active', area: 'creative', aspect: 'mission', description: 'A simple site with the best work and a way to get in touch.', deadline: null, goal: null },
  { slug: 'cookbook', name: 'Family recipe book', status: 'active', area: 'home', aspect: 'family', description: null, deadline: null, goal: null },
  { slug: 'garden', name: 'Balcony garden', status: 'paused', area: 'home', aspect: 'family', description: null, deadline: null, goal: null },
];
const weeks: Week[] = [
  { id: lw.key, first: 'photo-book', why: 'A deadline moved', since: at(addDays(lw.start!, 2)), moves: [],
    switches: [{ from: 'portfolio', fromName: 'Portfolio site', to: 'photo-book', why: 'A deadline moved', at: at(addDays(lw.start!, 2), 5) }] },
  { id: cw.key, first: 'photo-book', why: 'A deadline moved', since: at(addDays(lw.start!, 2)), switches: [], moves: [] },
];
// Growth's sealed review of last week, as Mission reads it: one move offered for this week
const hand = {
  reviewed: lw.key, sealed_at: at(lw.end!, 14), closed: [] as { goal: string; verdict: string; carry: boolean }[],
  moves: { week: planWeek.key, items: [{ id: 'mv-1', text: 'Stretch for ten minutes after each run', aspect: 'body', serves: `g${q10k.id}`, carry: null as string | null, state: 'offered', goal: null as string | null }] },
};

const milestoneSeed: Milestone[] = EMPTY ? [] : [
  ...['Pick the sixty photos', 'Write the captions', 'Lay out the pages', 'Send the draft to two readers'].map((title, i) => ({
    id: `ms-d${i}`, goal: `g${qDraft.id}`, title, done: i < 2, due: null, position: i, done_at: i < 2 ? at(addDays(day, -20 + i * 6)) : null,
  })),
  ...['Market at dawn', 'Rooftops at dusk'].map((title, i) => ({ id: `ms-s${i}`, goal: `g${mShoot.id}`, title, done: i === 0, due: null, position: i, done_at: i === 0 ? at(addDays(day, -6)) : null })),
  ...['First run', 'Second run', 'Third run'].map((title, i) => ({
    id: `ms-r${i}`, goal: `g${wRuns.id}`, title, done: i === 0 && day > cw.start!, due: null, position: i, done_at: i === 0 && day > cw.start! ? at(addDays(day, -1), 1) : null,
  })),
];
const measureSeed: Measure[] = EMPTY ? [] : [{ id: `g${q10k.id}`, goal: `g${q10k.id}`, source: 'manual' }];
const purposeSeed: Purpose[] = EMPTY ? [] : [
  { id: 'pu-1', text: 'Make honest work slowly, and share it.', by: 'me', created_at: at(addDays(day, -140)) },
  { id: 'pu-2', text: 'Make things that last, stay well enough to enjoy them, and keep the people I love close.', by: 'me', created_at: at(addDays(day, -21)) },
];
const lifeSeed: Life[] = EMPTY ? [] : [
  { id: 'li-1', title: 'Make work I am proud to sign', fam: 'work', position: 0 },
  { id: 'li-2', title: 'Stay strong and rested', fam: 'health', position: 1 },
  { id: 'li-3', title: 'Be there for the people close to me', fam: 'people', position: 2 },
];
// a collection opened before this file loaded keeps what it had, so the samples are added to it
const seed = <D extends Doc>(coll: string, docs: D[]) => {
  if (!docs.length) return;
  const c = collection<D>('mission', coll);
  const have = c.get();
  if (have && !have.some((x) => x.id === docs[0].id)) for (const d of docs) void c.put(d);
};
seed('milestones', milestoneSeed); seed('measures', measureSeed); seed('purpose', purposeSeed); seed('life', lifeSeed);
const docs = <D extends Doc>(coll: string, fallback: D[]) => (collection<D>('mission', coll).get() ?? fallback).filter((d) => !d.deleted_at);

if (EMPTY) { goals.length = 0; tasks.length = 0; projects.length = 0; weeks.length = 0; closings.length = 0; hand.moves.items.length = 0; }

// ── the views, worked out as the PC does ──
const byId = (k: unknown) => goals.find((g) => g.id === Number(String(k ?? '').replace(/^g/, ''))) ?? null;
const aspectOf = (g: G) => g.aspects[0] ?? null;
const ref = (g: G) => ({ id: `g${g.id}`, title: g.title, horizon: g.horizon, status: g.status, aspect: aspectOf(g) });
const tid = (t: T) => `t${t.id}`;
const openTasks = (pred: (t: T) => boolean) => tasks.filter((t) => t.status === 'todo' && pred(t))
  .sort((a, b) => (a.due == null ? 1 : 0) - (b.due == null ? 1 : 0) || String(a.due).localeCompare(String(b.due)) || a.id - b.id);
const kidsOf = (g: G) => goals.filter((x) => x.parent === g.id && x.status !== 'dropped');
const msOf = (g: G) => docs<Milestone>('milestones', milestoneSeed).filter((m) => m.goal === `g${g.id}`).sort((a, b) => a.position - b.position);
function progressOf(g: G): number {
  if (g.status === 'done') return 100;
  if (g.mode === 'manual') return g.progress;
  const kids = kidsOf(g);
  if (kids.length) return Math.round(kids.reduce((n, k) => n + progressOf(k), 0) / kids.length);
  const ts = tasks.filter((t) => t.goal === g.id && t.status !== 'dropped');
  if (ts.length) return Math.round((ts.filter((t) => t.status === 'done').length / ts.length) * 100);
  const ms = msOf(g);
  return ms.length ? Math.round((ms.filter((m) => m.done).length / ms.length) * 100) : 0;
}
const timeOf = (g: G) => (g.start && g.end ? Math.max(0, Math.min(1, (span(g.start, day) + 1) / (span(g.start, g.end) + 1))) : null);
function shape(g: G) {
  const id = `g${g.id}`;
  const ts = tasks.filter((t) => t.goal === g.id && t.status !== 'dropped');
  const done = ts.filter((t) => t.status === 'done');
  const ms = msOf(g);
  const nextMs = ms.find((m) => !m.done) ?? null;
  const nt = openTasks((t) => t.goal === g.id)[0] ?? null;
  const kids = kidsOf(g).length;
  const kind = g.mode === 'manual' ? 'manual' : kids ? 'goals' : ts.length ? 'tasks' : ms.length ? 'milestones' : 'none';
  const parent = g.parent ? byId(g.parent) : null;
  const lastClosing = closings.filter((c) => c.goal === id).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  return {
    id, title: g.title, horizon: g.horizon, period: g.period, label: spanLabel(g.horizon, pOf(g)), start: g.start, end: g.end, status: g.status,
    aspect: aspectOf(g), aspects: g.aspects, area: null, progress: progressOf(g), progressMode: g.mode, measure: null, due: null, notes: null,
    time: g.status === 'active' ? timeOf(g) : null, stale: g.status === 'active' && !!g.end && g.end < day,
    parent: parent ? { id: `g${parent.id}`, title: parent.title, horizon: parent.horizon, status: parent.status, aspect: aspectOf(parent) } : null,
    children: kids, source: { kind },
    milestones: { done: ms.filter((m) => m.done).length, total: ms.length, next: nextMs ? { id: nextMs.id, title: nextMs.title } : null },
    tasks: {
      open: ts.length - done.length, done: done.length, doneWeek: done.filter((t) => t.doneAt && t.doneAt.slice(0, 10) >= cw.start!).length,
      lastDone: done.map((t) => t.doneAt!).sort().pop() ?? null, next: nt ? { id: tid(nt), title: nt.title, due: nt.due } : null,
    },
    closing: lastClosing,
  };
}
function commitment(g: G) {
  const s = shape(g);
  const moving = s.tasks.done > 0 || s.milestones.done > 0 || s.progress > 0;
  const state = g.status === 'done' ? 'done' : moving ? 'moving' : g.period === cw.key && weekdayOf(day) >= 4 ? 'not_started' : 'open';
  const step = s.tasks.next ? { kind: 'task', ...s.tasks.next } : s.milestones.next ? { kind: 'milestone', ...s.milestones.next, due: null } : null;
  return { ...s, state, next: step };
}
const inPeriod = (h: string, key: string) => goals.filter((g) => g.horizon === h && g.period === key && g.status !== 'dropped');
function weekBlock(p: Period) {
  const cs = inPeriod('week', p.key).map(commitment);
  return { key: p.key, start: p.start, end: p.end, label: spanLabel('week', p), commitments: cs, done: cs.filter((c) => c.status === 'done').length,
    moves: weeks.find((w) => w.id === p.key)?.moves ?? [], limit: LIMITS.week };
}
const staleGoals = () => goals.filter((g) => g.status === 'active' && g.end && g.end < day && !(weekdayOf(day) <= 2 && g.horizon === 'week' && g.period === lw.key));
function firstBlock(key: string) {
  const w = weeks.filter((x) => x.id <= key && x.first).sort((a, b) => b.id.localeCompare(a.id))[0];
  const p = w ? projects.find((x) => x.slug === w.first) : null;
  if (!w || !p || p.status === 'done') return null;
  const g = p.goal ? byId(p.goal) : null;
  return { slug: p.slug, name: p.name, status: p.status, goal: g ? `g${g.id}` : null, serves: g ? ref(g) : null, why: w.why, since: w.since, week: w.id, inherited: w.id !== key };
}
function slots(h: string, key: string, except?: number) {
  const p = periodOfKey(h, key);
  return { horizon: h, key, label: p ? spanLabel(h, p) : key, limit: LIMITS[h] ?? null,
    goals: inPeriod(h, key).filter((g) => g.id !== except).map((g) => ({ id: `g${g.id}`, title: g.title, status: g.status, aspect: aspectOf(g) })) };
}
function record(nWeeks = 12) {
  const entries: { horizon: string; period: string; state: string }[] = [];
  for (const g of goals) {
    const c = closings.find((x) => x.goal === `g${g.id}` && x.period === g.period && x.outcome !== 'carried');
    const state = g.status === 'done' ? 'done' : g.status === 'dropped' ? (c?.outcome === 'missed' ? 'missed' : 'dropped') : g.end && g.end < day ? 'overdue' : 'open';
    entries.push({ horizon: g.horizon, period: g.period, state });
  }
  for (const c of closings) if (c.outcome === 'carried') entries.push({ horizon: c.horizon, period: c.period, state: 'carried' });
  const sum = (h: string, key: string) => {
    const es = entries.filter((e) => e.horizon === h && e.period === key && e.state !== 'dropped');
    return { set: es.length, done: es.filter((e) => e.state === 'done').length };
  };
  const ws = Array.from({ length: nWeeks }, (_, i) => {
    const p = period('week', addDays(cw.start!, -7 * (nWeeks - 1 - i)));
    return { key: p.key, start: p.start, label: spanLabel('week', p), now: p.key === cw.key, ...sum('week', p.key) };
  });
  const back = (h: string, n: number) => {
    const out: { key: string; label: string; now: boolean; set: number; done: number }[] = [];
    let p = period(h, day);
    for (let i = 0; i < n; i++) { out.unshift({ key: p.key, label: spanLabel(h, p), now: i === 0, ...sum(h, p.key) }); p = period(h, addDays(p.start!, -1)); }
    return out;
  };
  const totals: Record<string, number> = { set: 0, done: 0, missed: 0, dropped: 0, carried: 0, open: 0, overdue: 0 };
  for (const e of entries) { if (e.state !== 'dropped') totals.set++; totals[e.state]++; }
  return {
    today: day, since: goals.map((g) => g.created.slice(0, 10)).sort()[0] ?? null, totals, weeks: ws, months: back('month', 6), quarters: back('quarter', 4),
    closed: [...closings],
    done: goals.filter((g) => g.status === 'done' && !closings.some((c) => c.goal === `g${g.id}` && c.outcome === 'done'))
      .map((g) => ({ id: `done:g${g.id}`, goal: `g${g.id}`, title: g.title, horizon: g.horizon, label: spanLabel(g.horizon, pOf(g)), outcome: 'done', why: null, to: null, by: 'me', at: g.doneAt ?? now(), aspect: aspectOf(g) })),
  };
}
function home() {
  const cur = docs<Purpose>('purpose', purposeSeed).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
  const horizon = (h: string) => { const p = period(h, day); return { key: p.key, label: spanLabel(h, p), limit: LIMITS[h], start: p.start, end: p.end, goals: inPeriod(h, p.key).map(shape) }; };
  const lastOpen = weekdayOf(day) <= 2 ? goals.filter((g) => g.horizon === 'week' && g.period === lw.key && g.status === 'active') : [];
  const rec = record(8);
  return {
    today: day, weekday: weekdayOf(day), purpose: cur ? { text: cur.text, at: cur.created_at } : null, directions: docs<Life>('life', lifeSeed).length,
    stale: staleGoals().map(shape), year: horizon('year'), quarter: horizon('quarter'), month: horizon('month'),
    week: weekBlock(cw), plan: sunday ? weekBlock(planWeek) : null,
    lastWeek: lastOpen.length ? { key: lw.key, label: spanLabel('week', lw), open: lastOpen.map(shape), done: goals.filter((g) => g.horizon === 'week' && g.period === lw.key && g.status === 'done').length } : null,
    first: firstBlock(planWeek.key),
    projects: { running: projects.filter((p) => p.status === 'active').length, parked: projects.filter((p) => p.status === 'paused').length },
    record: { weeks: rec.weeks, totals: rec.totals }, limits: LIMITS,
  };
}
function ladder() {
  const rungs = ['year', 'quarter', 'month', 'week'].map((h) => {
    const p = h === 'week' ? planWeek : period(h, day);
    return { horizon: h, key: p.key, start: p.start, end: p.end, label: spanLabel(h, p), limit: LIMITS[h], goals: inPeriod(h, p.key).map(shape) };
  });
  const shown = new Set(rungs.flatMap((r) => r.goals.map((g) => g.id)));
  return {
    today: day, directions: docs<Life>('life', lifeSeed).sort((a, b) => a.position - b.position),
    far: goals.filter((g) => (g.horizon === 'life' || g.horizon === 'decade') && g.status !== 'dropped').map(shape), rungs,
    later: goals.filter((g) => g.status === 'active' && ['week', 'month', 'quarter', 'year'].includes(g.horizon) && g.start && g.start > day && !shown.has(`g${g.id}`)).map(shape),
    stale: staleGoals().length, limits: LIMITS,
  };
}
const carryPeriod = (h: string, from: string | null): Carry => {
  let p = period(h, h === 'week' && sunday ? addDays(day, 1) : day);
  if (p.key === from) p = next(h, p);
  return { horizon: h, ...p, label: spanLabel(h, p) };
};
function goalDetail(idIn: string) {
  const g = byId(idIn);
  if (!g) throw new ApiError(404, 'No such goal.');
  const chain = [];
  for (let p = g.parent ? byId(g.parent) : null, i = 0; p && i < 8; p = p.parent ? byId(p.parent) : null, i++) chain.push(ref(p));
  return {
    goal: g.horizon === 'week' ? commitment(g) : shape(g),
    milestones: msOf(g),
    tasks: tasks.filter((t) => t.goal === g.id && t.status !== 'dropped').sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due == null ? 1 : 0) - (b.due == null ? 1 : 0) || String(a.due).localeCompare(String(b.due)) || b.id - a.id)
      .map((t) => ({ id: tid(t), title: t.title, status: t.status, due: t.due, doneAt: t.doneAt, project: t.project })),
    children: kidsOf(g).map(shape),
    projects: projects.filter((p) => p.goal === g.id).map((p) => ({ slug: p.slug, name: p.name, status: p.status })),
    chain,
    parents: goals.filter((x) => x.status === 'active' && x.id !== g.id && RANK[x.horizon] > RANK[g.horizon] && !(x.end && x.end < day))
      .map((x) => ({ id: `g${x.id}`, title: x.title, horizon: x.horizon, aspect: aspectOf(x) })),
    closings: closings.filter((c) => c.goal === `g${g.id}`),
    checkins: [],
    measure: docs<Measure>('measures', measureSeed).find((m) => m.goal === `g${g.id}`) ?? null,
    carry: g.status === 'active' ? Object.fromEntries(['week', 'month', 'quarter'].map((h) => [h, carryPeriod(h, g.horizon === h ? g.period : null)])) : null,
  };
}
function projectsView() {
  const fb = firstBlock(planWeek.key);
  const since = (n: number) => addDays(day, -n);
  const items = projects.map((p) => {
    const mine = tasks.filter((t) => t.project === p.slug);
    const done = mine.filter((t) => t.status === 'done' && t.doneAt);
    const d30 = done.filter((t) => t.doneAt!.slice(0, 10) >= since(29)).length;
    const nt = openTasks((t) => t.project === p.slug)[0] ?? null;
    const g = p.goal ? byId(p.goal) : null;
    return {
      slug: p.slug, name: p.name, status: p.status, area: p.area, aspect: p.aspect, description: p.description, deadline: p.deadline, link: null,
      goal: g ? ref(g) : null, done14: done.filter((t) => t.doneAt!.slice(0, 10) >= since(13)).length, done30: d30, open: mine.filter((t) => t.status === 'todo').length,
      lastDone: done.map((t) => t.doneAt!).sort().pop() ?? null, next: nt ? { id: tid(nt), title: nt.title, due: nt.due } : null,
      first: fb?.slug === p.slug, quiet: p.status === 'active' && d30 === 0 && fb?.slug !== p.slug,
    };
  });
  return {
    today: day, week: planWeek.key, first: fb, why: weeks.find((w) => w.id === planWeek.key)?.why ?? fb?.why ?? null,
    switches: weeks.flatMap((w) => w.switches.map((s) => ({ ...s, week: w.id }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10),
    items, goals: goals.filter((g) => g.status === 'active' && !(g.end && g.end < day) && g.horizon !== 'week').map((g) => ({ id: `g${g.id}`, title: g.title, horizon: g.horizon, aspect: aspectOf(g) })),
  };
}

// ── writes ──
type B = Record<string, unknown>;
const word = ['no', 'one', 'two', 'three', 'four', 'five'];
function checkRoom(h: string, key: string, except?: number) {
  const n = inPeriod(h, key).filter((g) => g.id !== except).length;
  if (LIMITS[h] && n >= LIMITS[h]) throw new ApiError(409, `That ${h} already holds ${word[LIMITS[h]] ?? LIMITS[h]}.`);
}
function close(b: B) {
  const g = byId(b.goal);
  if (!g) throw new ApiError(404, 'No such goal.');
  const outcome = String(b.outcome);
  const why = b.why == null ? null : String(b.why);
  const by = b.by === 'growth' ? 'growth' : 'me';
  if (outcome === 'done') { g.status = 'done'; g.doneAt = now(); }
  if (outcome === 'missed' || outcome === 'dropped') g.status = 'dropped';
  const c = closingOf(g, outcome, why, now(), by);
  if (outcome === 'carried') {
    const to = String(b.to ?? '');
    const h = ['week', 'month', 'quarter', 'year'].includes(to) ? to : /W\d{2}$/.test(to) ? 'week' : /Q\d$/.test(to) ? 'quarter' : /^\d{4}-\d{2}$/.test(to) ? 'month' : g.horizon;
    const into: Carry = ['week', 'month', 'quarter', 'year'].includes(to) ? carryPeriod(h, g.horizon === h ? g.period : null)
      : (() => { const p = periodOfKey(h, to)!; return { horizon: h, ...p, label: spanLabel(h, p) }; })();
    if (b.replaces) { const r = byId(b.replaces); if (r) { r.status = 'dropped'; closings.push(closingOf(r, 'dropped', `Replaced by ${g.title.slice(0, 80)}`, now(), by)); } }
    else checkRoom(h, into.key, g.id);
    c.to = into;
    Object.assign(g, { horizon: h, period: into.key, start: into.start, end: into.end });
  }
  closings.push(c);
  return { closing: c };
}
function reopen(b: B) {
  const g = byId(b.goal);
  if (!g) throw new ApiError(404, 'No such goal.');
  const i = closings.map((c) => c.goal).lastIndexOf(`g${g.id}`);
  const c = i >= 0 ? closings[i] : null;
  if (c) closings.splice(i, 1); // opening a goal again takes back how it was closed
  if (c?.outcome === 'carried') { const p = periodOfKey(c.horizon, c.period); if (p) Object.assign(g, { horizon: c.horizon, period: p.key, start: p.start, end: p.end }); }
  g.status = 'active'; g.doneAt = null;
  return { goal: shape(g) };
}
function createGoal(b: B) {
  const h = String(b.horizon ?? 'week');
  const p = period(h, typeof b.start === 'string' && b.start ? b.start : h === 'week' && sunday ? addDays(day, 1) : day);
  const title = String(b.title ?? '').trim();
  if (!title) throw new ApiError(400, 'Give the goal a title.');
  if (b.replaces) { const r = byId(b.replaces); if (r) { r.status = 'dropped'; closings.push(closingOf(r, 'dropped', `Replaced by ${title.slice(0, 80)}`, now())); } }
  else checkRoom(h, p.key);
  const parent = byId(b.parent);
  const g = goal(title.slice(0, 300), h, p.start ?? day, Array.isArray(b.aspects) ? (b.aspects as string[]) : [], { parent: parent?.id ?? null, created: now() });
  const steps = Array.isArray(b.milestones) ? (b.milestones as string[]).filter((x) => x.trim()) : [];
  const ms = collection<Milestone>('mission', 'milestones');
  steps.forEach((title2, i) => { void ms.put({ goal: `g${g.id}`, title: title2, done: false, due: null, position: i }); });
  return shape(g);
}

demoSource({
  collections: { 'mission/milestones': milestoneSeed, 'mission/measures': measureSeed, 'mission/purpose': purposeSeed, 'mission/life': lifeSeed },
  gets: {
    [`${M}/home`]: () => home(),
    [`${M}/ladder`]: () => ladder(),
    [`${M}/projects`]: () => projectsView(),
    [`${M}/record`]: () => record(),
    [`${M}/goal/*`]: (path: string) => goalDetail(path.split('?')[0].split('/').pop()!),
    [`${M}/slots`]: (_p: string, q: URLSearchParams) => {
      const h = q.get('horizon') ?? 'week';
      return slots(h, period(h, q.get('start') || (h === 'week' && sunday ? addDays(day, 1) : day)).key);
    },
    '/mod/growth/handoff': () => hand,
    '/tasks': (_p: string, q: URLSearchParams) => ({
      tasks: tasks.filter((t) => (q.get('status') === 'open' ? t.status === 'todo' : true))
        .map((t) => ({ id: tid(t), title: t.title, status: t.status, area: t.area, project: t.project, goal: t.goal ? `g${t.goal}` : null, due: t.due })),
    }),
  },
  calls: {
    [`${M}/goal`]: (b) => ({ goal: createGoal(b as B) }),
    [`${M}/goal/*`]: (body, { path }) => {
      const b = body as B;
      const parts = path.split('/');
      const g = byId(parts[4]);
      if (!g) throw new ApiError(404, 'No such goal.');
      if (parts[5] === 'task') {
        if (b.task) { const t = tasks.find((x) => tid(x) === b.task); if (t) t.goal = b.on === false ? null : g.id; return { task: t }; }
        const title = String(b.title ?? '').trim();
        if (!title) throw new ApiError(400, 'Give the task a title.');
        task(title.slice(0, 300), { goal: g.id, due: typeof b.due === 'string' ? b.due : null });
        return { task: tasks[tasks.length - 1] };
      }
      if (typeof b.title === 'string' && b.title.trim()) g.title = b.title.trim();
      if (Array.isArray(b.aspects)) g.aspects = b.aspects as string[];
      if ('parent' in b) {
        const p = b.parent == null ? null : byId(b.parent);
        if (b.parent != null && (!p || RANK[p.horizon] <= RANK[g.horizon])) throw new ApiError(400, 'A goal can only serve one on a longer horizon.');
        g.parent = p?.id ?? null;
      }
      if ('progress' in b) { g.mode = 'manual'; g.progress = Math.max(0, Math.min(100, Math.round(Number(b.progress) || 0))); }
      if (b.progressMode === 'auto') g.mode = 'auto';
      return { goal: shape(g) };
    },
    [`${M}/close`]: (b) => close(b as B),
    [`${M}/reopen`]: (b) => reopen(b as B),
    [`${M}/project/*`]: (body, { path }) => {
      const b = body as B;
      const p = projects.find((x) => x.slug === path.split('/').pop());
      if (!p) throw new ApiError(404, 'No such project.');
      if ('goal' in b) p.goal = b.goal == null ? null : byId(b.goal)?.id ?? null;
      if (b.status === 'active' || b.status === 'paused') p.status = b.status;
      return { project: p };
    },
    [`${M}/week/*`]: (body, { path }) => {
      const b = body as B;
      const [, , , , key, what] = path.split('/');
      const p = periodOfKey('week', key);
      if (!p) throw new ApiError(400, 'Bad week.');
      let w = weeks.find((x) => x.id === key);
      if (!w) { w = { id: key, first: null, why: null, since: null, switches: [], moves: [] }; weeks.push(w); }
      if (what === 'first') {
        const proj = projects.find((x) => x.slug === b.project);
        if (!proj) throw new ApiError(404, `No project ${String(b.project)}.`);
        if (proj.status !== 'active') proj.status = 'active';
        const before = firstBlock(key);
        const why = typeof b.why === 'string' && b.why.trim() ? b.why.trim() : null;
        if (before && before.slug !== proj.slug) w.switches.push({ from: before.slug, fromName: before.name, to: proj.slug, why, at: now() });
        w.why = before?.slug === proj.slug && why == null ? before.why : why;
        w.since = before?.slug === proj.slug ? before.since : now();
        w.first = proj.slug;
        return { week: w };
      }
      // a move from Growth's review: kept, it becomes one of the week's commitments
      const text = String(b.text ?? '').trim();
      let made: string | null = null;
      if (b.accept) {
        if (b.replaces) { const r = byId(b.replaces); if (r) { r.status = 'dropped'; closings.push(closingOf(r, 'dropped', `Replaced by ${text.slice(0, 80)}`, now(), 'growth')); } }
        else checkRoom('week', key);
        const parent = byId(b.serves);
        made = `g${goal(text, 'week', p.start!, typeof b.aspect === 'string' ? [b.aspect] : [], { parent: parent?.id ?? null, created: now() }).id}`;
      }
      w.moves.push({ id: String(b.id), review: b.review == null ? null : String(b.review), text, aspect: typeof b.aspect === 'string' ? b.aspect : null, state: b.accept ? 'accepted' : 'declined', goal: made, by: 'me', at: now() });
      return { week: w, goal: made };
    },
    [`${M}/measure/*`]: () => ({ measure: null, progress: null }),
    [`${M}/draft`]: (body) => {
      const b = body as B;
      if (b.kind === 'purpose') {
        return { text: 'Make honest things that last, and stay well enough to share them.', why: 'Drawn from your year goals: the photo book, the half marathon and the savings.' };
      }
      const text = String(b.text ?? '').trim();
      return {
        title: text ? text[0].toUpperCase() + text.slice(1) : 'A new goal', measure: 'It is finished and you can show it', horizon: b.horizon ?? 'week',
        aspects: Array.isArray(b.aspects) ? b.aspects : [], area: null, parent: b.parent ?? null, due: null,
        milestones: ['Decide what done looks like', 'Do the first half', 'Finish it and check it'], note: 'Three milestones to start with. Change or remove any of them.',
        draft: 'sample', at: now(), prompt: '',
      };
    },
    '/mod/growth/moves/*': (body, { path }) => {
      const b = body as B;
      const m = hand.moves.items.find((x) => x.id === decodeURIComponent(path.split('/').pop() ?? ''));
      if (m) { m.state = String(b.state); m.goal = typeof b.goal === 'string' ? b.goal : null; }
      return { ok: true };
    },
    '/tasks': (body) => {
      const b = body as B;
      const title = String(b.title ?? '').trim();
      if (!title) throw new ApiError(400, 'Give the task a title.');
      task(title.slice(0, 300), { project: typeof b.project === 'string' ? b.project : null, due: typeof b.due === 'string' ? b.due : null });
      const t = tasks[tasks.length - 1];
      return { ...t, id: tid(t) };
    },
    '/tasks/*': (body, { path, method }) => {
      const t = tasks.find((x) => tid(x) === path.split('/').pop());
      if (!t) throw new ApiError(404, 'No such task.');
      const b = body as B;
      if (method === 'DELETE') t.status = 'dropped';
      else if (b.status === 'done' || b.status === 'todo') { t.status = b.status; t.doneAt = b.status === 'done' ? now() : null; }
      return { ...t, id: tid(t) };
    },
  },
});
