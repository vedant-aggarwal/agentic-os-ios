import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { DEMO, demoData } from '@/lib/demo';
import { collection, fileSource, invalidate, newId, upload, useCollection, useGet, type Doc } from '@/lib/mod';
import { aspectFields, ASPECT_KEYS, ASPECT_NAME } from '@/lib/aspects';
import { nora } from '@/lib/nora';
import { send as sendOrKeep } from '@/lib/outbox';
import type { LifePayload } from '@/lib/today';
import { tasksChanged } from '@/lib/useToday';
import { homeTasksChanged } from '@/home/data';
import { kv } from '@/work/kv';
import { myDay, today } from '@/aspects/kit/time';
import type { Diet } from '@/aspects/body/api';
import type { Picked } from '@/aspects/body/pick';
import type { ReadView } from '@/aspects/mind/types';
import type { CleanNow } from '@/aspects/soul/data';
import { previewSealed } from '@/lib/seal';
import type { AspectKey } from '@/theme';
import { FRAMES, MEAL_SLOT, type Frame, type FrameId, type TickId } from './moments';
import { takePhoto } from './shoot';

// Where every capture goes. Nothing here is new storage on the PC; each action writes the record its own page writes:
//   meal photo     POST /mod/body/meal-photo (raw image): read by the PC, it waits in Body > Diet to be confirmed
//   body, face and drink photos   POST /mod/soul/photos?entry=vault:<kind>:<day> (the PC's kept-photo store), plus a
//                  body check <day>:photo-<kind> carrying the photo's path: the index the photo vault (t123) reads
//   water          body reading water:<day> (glasses of 250 ml), the write Today's Diet line and Nora make
//   wake, drink, no sugar, night routine   body checks <day>:<item>; wake carries the time he woke
//   chess, sudoku, Matiks   mind sessions game-<day>-<name> (kind "game")
//   book page      POST /mod/mind/read/sitting { book, to_page }, the Read page's "Log a sitting"
//   journal        a Growth journal entry (Soul's Journal habit ticks itself from it)
//   meditation     a Soul sit of 10 minutes
//   clean          POST /mod/soul/clean/pledge, today's pledge (DELETE takes it back)
//   slipped        POST /mod/soul/clean/slip { id, at }: the run restarts; POST /mod/soul/clean/slip/<id>/undo takes it back
//   smart photo    POST /mod/capture/smart-photo?id= (raw image): the PC reads it and files it where it belongs (a meal
//                  with its photo in Diet, the photo vault, the wake-up drink, a reading sitting); the panel polls
//                  GET /mod/capture/smart-photo/<id> and offers POST .../undo
//   describe       POST /mod/capture/describe { id, text }: anything in words (a meal, a spend, a task, an idea, a
//                  journal line, a weight); the PC works out what it is and files it through that page's own route.
//                  POST .../describe/<id>/undo takes it back, POST .../describe/<id>/as { kind } re-files it as that
//   task           POST /tasks { title, aspect, area, due }; "Tag Nora" also sends her the task in chat
//   meal by text   POST /mod/body/meals { name, slot }: the meal record a filed smart photo makes, numbers estimated on the PC
//   cancelled      the item's body check, not done and `skipped` (Today's "Cancel for today"): out of the day's count
// A Soul habit whose title matches (journal, meditat, clean, sugar) is ticked as well, so the core habits stay in step.
// Every log here is for his day, which rolls at 04:00 (`myDay`, as Body and Soul count it): a tick, a glass or a
// journal line at 01:30 counts for the evening before. Only a task's "today" is the calendar's, as on Today.

export type BodyCheck = Doc & { date: string; item: string; done: boolean; at: string; time?: string; photo?: string; by?: string; source?: string;
  /** cancelled for the day: not done, and not counted as left to do either */ skipped?: boolean };
type Session = Doc & { kind?: string; date: string; book?: string | null; title?: string | null };
type Sit = Doc & { date: string; secs: number; source?: string };
type Entry = Doc & { date: string; text: string };
type Habit = Doc & { title: string; archived?: boolean };
/** Soul's row for a day (id = the date): `pledge` is when Clean's promise was made that day. */
type SoulDay = Doc & { pledge?: string | null };

/** The records a day's ticks are read from: the same collections the ticks write. */
export type TickSrc = {
  checks: readonly BodyCheck[]; sessions: readonly Pick<Session, 'id' | 'date' | 'kind'>[];
  journal: readonly Pick<Entry, 'date' | 'text'>[]; sits: readonly Pick<Sit, 'date'>[];
};
/** The capture ticks done on `day`, from what they wrote; `pledged`: Clean's promise was made that day. */
export function ticksOn(day: string, src: TickSrc, pledged: boolean): Set<TickId> {
  const c = new Map(src.checks.filter((x) => x.date === day).map((x) => [x.item, x]));
  const on = (item: string) => !!c.get(item)?.done;
  const s = new Set<TickId>();
  if (on('wake')) s.add('wake');
  if (on('wake-drink')) s.add('drink');
  if (on('no-sugar')) s.add('nosugar');
  if (on('night-routine')) s.add('night');
  for (const g of ['chess', 'sudoku', 'matiks'] as const) if (src.sessions.some((x) => x.id === `game-${day}-${g}`)) s.add(g);
  if (src.sessions.some((x) => x.date === day && x.kind === 'reading')) s.add('book');
  if (src.journal.some((x) => x.date === day && x.text?.trim())) s.add('journal');
  if (src.sits.some((x) => x.date === day)) s.add('meditate');
  if (pledged) s.add('clean');
  return s;
}

/** A meal typed in for an earlier day sits at its slot's usual hour that day. */
const SLOT_HM: Record<string, string> = { breakfast: '08:30', salad: '12:00', lunch: '13:30', evening_snack: '17:30', snack: '17:30', dinner: '20:30' };
/** What a tap did, for the toast, with the way back when it took something off. */
export type Said = { said: string; undo: () => Promise<unknown> };

// ── the photos taken here today, kept on the device so the roll survives closing the app ────────────────────────────
export type Shot = { id?: string; path?: string; uri?: string; state: 'sending' | 'sent' | 'failed'; error?: string; at: string;
  /** filed by the smart photo: what the frame says under its label until the page's own read shows it */ filed?: string };
/** What the PC made of a smart photo (server: modules/capture.ts). */
export type SmartItem = {
  id: string; status: 'reading' | 'filed' | 'unsure' | 'failed' | 'undone'; kind: string | null;
  frame: FrameId | 'salad' | null; tick: TickId | null; said: string | null; canUndo: boolean; photo: string;
  meal?: { protein: number } | null; page?: number | null;
};
/** What the PC made of a line typed or said into "Describe anything" (server: modules/capture-describe.ts). */
export type DescribeKind = 'task' | 'meal' | 'spend' | 'idea' | 'journal' | 'weight';
export type Described = {
  id: string; status: 'filing' | 'filed' | 'failed' | 'undone'; kind: DescribeKind | null; text: string; said: string | null;
  /** the page it landed on: "Body · Diet", "Money", "Tasks" */ where: string | null; link: string | null;
  /** who decided the kind: the model, the PC's rules (AI down), or him ("Not right?") */ by: 'ai' | 'rules' | 'you' | null;
  /** what it made: the task, idea, meal or entry id */ ref: string | null; canUndo: boolean; kinds: DescribeKind[];
};
export const DESCRIBE_KINDS: { kind: DescribeKind; label: string }[] = [
  { kind: 'task', label: 'Task' }, { kind: 'meal', label: 'Meal' }, { kind: 'spend', label: 'Spend' },
  { kind: 'idea', label: 'Idea' }, { kind: 'journal', label: 'Journal' }, { kind: 'weight', label: 'Weight' },
];
/** The demo's stand-in for the PC: the same rough rules the PC falls back on when its AI is down. */
function demoDescribe(id: string, text: string, as?: DescribeKind): Described {
  const n = Number((text.match(/\d+(?:\.\d+)?/) ?? [])[0]);
  const kind: DescribeKind = as ?? (/\b(kg|weigh)/i.test(text) && n ? 'weight' : /\b(spent|paid|rs|rupees?)\b|₹/i.test(text) && n ? 'spend'
    : /^idea\b/i.test(text) ? 'idea' : /^(journal|today i|felt)\b/i.test(text) ? 'journal'
      : /\b(ate|had|breakfast|lunch|dinner|snack|roti|dal|rice|eggs?|oats|paneer|chicken)\b/i.test(text) ? 'meal' : 'task');
  const said = kind === 'weight' ? `Weight ${n} kg logged` : kind === 'spend' ? `Spent ₹${n}` : kind === 'idea' ? `Idea saved: ${text}`
    : kind === 'journal' ? "In today's journal" : kind === 'meal' ? `Meal logged: ${text}, about 20 g protein` : `Task: ${text}`;
  const where = { weight: 'Body', spend: 'Money', idea: 'Ideas', journal: 'Growth · Journal', meal: 'Body · Diet', task: 'Tasks' }[kind];
  return { id, status: 'filed', kind, text, said, where, link: null, ref: null, by: as ? 'you' : 'rules', canUndo: true, kinds: DESCRIBE_KINDS.map((k) => k.kind) };
}

type Roll = { day: string; shots: Partial<Record<FrameId, Shot>> };
const NO_SHOTS: Roll['shots'] = {};
const KEY = 'capture:v1:roll';
let roll: Roll = { day: myDay(), shots: {} };
const subs = new Set<() => void>();
let loaded = false;
function setRoll(next: Roll) {
  roll = next;
  for (const f of subs) f();
  // a local blob or file uri means nothing after a restart: keep only what the PC has
  const keep: Roll = { day: next.day, shots: {} };
  for (const [k, v] of Object.entries(next.shots)) if (v?.state === 'sent') keep.shots[k as FrameId] = { ...v, uri: undefined };
  if (!DEMO) void kv.set(KEY, JSON.stringify(keep)).catch(() => {});
}
function shotsToday() {
  if (roll.day !== myDay()) roll = { day: myDay(), shots: {} };
  return roll.shots;
}
function putShot(id: FrameId, s: Shot | null) {
  const shots = { ...shotsToday() };
  if (s) shots[id] = s; else delete shots[id];
  setRoll({ day: myDay(), shots });
}
function useRoll() {
  useEffect(() => {
    if (loaded || DEMO) return;
    loaded = true;
    void kv.get(KEY).then((raw) => {
      if (!raw) return;
      try {
        const r = JSON.parse(raw) as Roll;
        if (r.day === myDay() && !Object.keys(roll.shots).length) { roll = r; for (const f of subs) f(); }
      } catch {}
    });
  }, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, shotsToday, shotsToday);
}

// ── what a frame in the roll shows ──────────────────────────────────────────────────────────────────────────────────
export type FrameState = {
  /** what to draw in the frame: a local picture while it sends, else the PC's copy */
  src: { uri: string; headers?: Record<string, string> } | null;
  status: 'empty' | 'sending' | 'reading' | 'ready' | 'logged' | 'kept' | 'failed';
  /** under the label */ note: string | null;
  /** a body or face photo: drawn as a lock, shown only after Face ID (src/lib/seal.ts) */ sealed?: boolean;
};
/** The photos that are sealed once taken: shown once as a preview, then only behind Face ID. */
export const SEALED: ReadonlySet<FrameId> = new Set<FrameId>(['body', 'face']);

// ── demo: sample data for the web preview (?demo), nobody's real numbers ───────────────────────────────────────────
function demoDiet(d: string = myDay()): Diet {
  const live = d === myDay();
  return {
    day: d, today: myDay(), totals: live ? { kcal: 640, protein: 42, carbs: 70, fat: 18, n: 1 } : { kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0 }, water: live ? 5 : 0,
    targets: { protein: { v: 140, set: true, from: 'you' }, kcal: { v: 2400, set: true, from: 'you' }, water: { v: 20, set: true, from: 'you' } },
    meals: live ? [{ id: 'm1', name: 'Protein oats, banana, milk', at: `${d}T03:30:00.000Z`, slot: 'breakfast', kcal: 640, protein: 42, carbs: 70, fat: 18, estimate: false, unknown: false, photo: null, source: 'app', items: null }] : [],
    week: [], recent: [], photos: [],
  };
}
const DEMO_CLEAN = { setup: true, day: 12, pledged: false } as unknown as CleanNow;
const SLOT_WORD: Record<string, string> = { breakfast: 'Breakfast', salad: 'Salad', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const DEMO_READ = { reading: [{ id: 'b1', title: 'Deep Work', author: 'Cal Newport', pages: 296, page: 118, status: 'reading' }] } as unknown as ReadView;

const fakeWait = (ms = 700) => new Promise((r) => setTimeout(r, ms));

/** Everything the capture surface reads, and every write it makes, for his day `on` (YYYY-MM-DD; today's by default,
 *  which rolls at 04:00). Today swiped back to an earlier day passes that day, and every tick, glass, meal, line and
 *  pledge then lands on it. Photos are today's only (the meal photo has no day on the PC). */
export function useCapture(on?: string) {
  const today0 = myDay();
  const day = on ?? today0;
  const live = day === today0;
  const diet = useGet<Diet>(DEMO ? null : live ? '/mod/body/diet' : `/mod/body/diet?day=${day}`);
  const clean = useGet<CleanNow>(DEMO ? null : '/mod/soul/clean/now');
  const read = useGet<ReadView>(DEMO ? null : '/mod/mind/read');
  const lifeRead = useGet<LifePayload>(DEMO ? null : '/life');
  const checks = useCollection<BodyCheck>('body', 'checks');
  const sessions = useCollection<Session>('mind', 'sessions');
  const sits = useCollection<Sit>('soul', 'sits');
  const journal = useCollection<Entry>('growth', 'journal');
  const habits = useCollection<Habit>('soul', 'habits');
  const soulDays = useCollection<SoulDay>('soul', 'days');
  const roll = useRoll();
  const shots = live ? roll : NO_SHOTS;

  // the sample preview keeps each day's diet in memory: today's sample, any other day empty until he adds to it
  const [demoDiets, setDemoDiets] = useState<Record<string, Diet>>({});
  const setDemoDiet = (f: (d: Diet | null) => Diet | null) => setDemoDiets((all) => {
    const next = f(all[day] ?? demoDiet(day));
    return next ? { ...all, [day]: next } : all;
  });
  const [demoClean, setDemoClean] = useState(DEMO_CLEAN);
  const [demoSmart] = useState(() => new Map<string, SmartItem>());
  const dietData = DEMO ? demoDiets[day] ?? demoDiet(day) : diet.data;
  const cleanData = DEMO ? demoClean : clean.data;
  // Clean's promise: today's from Clean's own read; an earlier day's from Soul's row for that day
  const dayRow = (soulDays.items ?? []).find((x) => x.id === day);
  const pledged = live ? !!(cleanData && cleanData.setup && cleanData.pledged) : !!dayRow?.pledge;
  const book = (DEMO ? DEMO_READ : read.data)?.reading?.[0] ?? null;
  const demo = useMemo(() => (DEMO ? demoData() : null), []);
  const life = DEMO ? demo?.life : lifeRead.data;
  // a glass shows at once, until the read comes back with it
  const [glass, setGlass] = useState<{ base: number; v: number } | null>(null);
  const baseWater = dietData?.water ?? 0;
  const water = glass && glass.base === baseWater ? glass.v : baseWater;
  const waterTarget = dietData?.targets.water.v ?? 20;

  const todayChecks = useMemo(() => new Map((checks.items ?? []).filter((c) => c.date === day).map((c) => [c.item, c])), [checks.items, day]);
  const checked = (item: string) => !!todayChecks.get(item)?.done;

  // ── done on the day ──
  const doneTicks = useMemo(
    () => ticksOn(day, { checks: checks.items ?? [], sessions: sessions.items ?? [], journal: journal.items ?? [], sits: sits.items ?? [] }, pledged),
    [day, checks.items, sessions.items, journal.items, sits.items, pledged],
  );

  const frames = useMemo(() => {
    const out = {} as Record<FrameId, FrameState>;
    const meals = (dietData?.day === day ? dietData.meals : []) ?? [];
    const photos = dietData?.photos ?? [];
    const thumb = (id: string) => withAuth(`/mod/body/files/${encodeURIComponent(id)}?thumb=1`);
    for (const f of FRAMES) {
      const shot = shots[f.id];
      const local = shot?.uri ? { uri: shot.uri } : null;
      if (shot?.state === 'sending') { out[f.id] = { src: local, status: 'sending', note: 'Sending' }; continue; }
      if (shot?.state === 'failed') { out[f.id] = { src: local, status: 'failed', note: "Didn't send" }; continue; }
      if (f.kind === 'vault') {
        const c = todayChecks.get(`photo-${f.id}`);
        const path = c?.photo ?? shot?.path;
        out[f.id] = path || local ? { src: local ?? withAuth(path), status: 'kept', note: 'Kept' } : { src: null, status: 'empty', note: null };
        continue;
      }
      const meal = meals.find((m) => m.slot === MEAL_SLOT[f.id]);
      const ph = shot?.id ? photos.find((p) => p.id === shot.id) : undefined;
      if (meal) { out[f.id] = { src: local ?? (meal.photo ? thumb(meal.photo) : null), status: 'logged', note: `${meal.protein} g protein` }; continue; }
      if (shot?.filed) { out[f.id] = { src: local ?? withAuth(shot.path), status: 'logged', note: shot.filed }; continue; }
      if (shot?.id) {
        const src = local ?? thumb(shot.id);
        if (ph?.status === 'failed') out[f.id] = { src, status: 'failed', note: ph.error ? 'Not read' : "Didn't read" };
        else if (ph?.status === 'done') out[f.id] = { src, status: 'ready', note: 'Confirm in Diet' };
        else out[f.id] = { src, status: 'reading', note: DEMO ? 'Sent' : 'Reading' };
        continue;
      }
      out[f.id] = { src: null, status: 'empty', note: null };
    }
    for (const id of SEALED) out[id] = { ...out[id], sealed: true };
    return out;
  }, [shots, dietData, todayChecks, day]);

  // ── writes ──
  const stamp = () => new Date().toISOString();
  const putCheck = (item: string, done: boolean, extra: Partial<BodyCheck> = {}) =>
    checks.put({ id: `${day}:${item}`, date: day, item, done, at: stamp(), by: 'me', source: 'capture', ...extra });

  /** Tick the Soul habit whose title matches, if he keeps one. Quiet when there is none. */
  const tickHabit = (match: RegExp, done: boolean) => {
    const h = (habits.items ?? []).find((x) => !x.archived && match.test(x.title));
    if (!h || DEMO) return;
    void sendOrKeep({
      id: `habit:${h.id}:${day}`, method: 'PUT', path: `/mod/soul/checks/${encodeURIComponent(`${h.id}:${day}`)}`,
      body: { id: `${h.id}:${day}`, habit: h.id, date: day, at: stamp(), updated_at: stamp(), done, source: 'capture' },
    }).then((r) => { if (!r.queued) invalidate('/mod/soul/'); }).catch(() => {});
  };

  async function photo(f: Frame, p: Picked, uri: string | undefined) {
    putShot(f.id, { uri, state: 'sending', at: stamp() });
    // a body or face photo shows once, now, while it sends; after that it is sealed behind Face ID
    if (SEALED.has(f.id) && uri) previewSealed({ title: f.long, photos: [{ source: { uri }, label: `${f.long} photo` }], action: { label: 'Take again', run: () => { void again(f); } } });
    try {
      if (f.kind === 'meal') {
        let id = `demo_${f.id}`;
        if (DEMO) await fakeWait(900);
        else id = (await upload<{ photo: { id: string } }>('/mod/body/meal-photo', p.uri, p.type)).photo.id;
        putShot(f.id, { id, uri, state: 'sent', at: stamp() });
        invalidate('/mod/body/');
        return `${f.long}: reading the photo. Confirm it in Diet.`;
      }
      let path = `demo/${f.id}`;
      if (DEMO) await fakeWait(900);
      else path = (await upload<{ item: { id: string }; path: string }>(`/mod/soul/photos?entry=${encodeURIComponent(`vault:${f.id}:${day}`)}`, p.uri, p.type)).path;
      putShot(f.id, { path, uri, state: 'sent', at: stamp() });
      await putCheck(`photo-${f.id}`, true, { photo: path });
      if (f.id === 'drink' && !checked('wake-drink')) await putCheck('wake-drink', true);
      return `${f.long} kept`;
    } catch (e) {
      putShot(f.id, { uri, state: 'failed', error: (e as Error).message, at: stamp() });
      throw e;
    }
  }

  /** A sealed photo taken again from its preview or viewer: the camera, then the same write. A failed send shows on its tile. */
  async function again(f: Frame) {
    const p = await takePhoto().catch(() => null);
    if (!p) return;
    await photo(f, p, typeof p.uri === 'string' ? p.uri : URL.createObjectURL(p.uri)).catch(() => {});
  }

  async function addWater(delta = 1) {
    const v = Math.max(0, water + delta);
    setGlass({ base: baseWater, v });
    if (DEMO) { setDemoDiet((d) => (d ? { ...d, water: v } : d)); setGlass(null); return v; }
    try {
      // with the PC out of reach the glass stays counted and the reading waits on the phone (lib/outbox.ts)
      const r = await sendOrKeep({ id: `water:${day}`, method: 'PUT', path: `/mod/body/readings/water:${day}`,
        body: { id: `water:${day}`, kind: 'water', date: day, value: v, at: stamp(), updated_at: stamp(), source: 'phone' } });
      if (!r.queued) invalidate('/mod/body/');
      return v;
    } catch (e) { setGlass(null); throw e; }
  }

  /** A plain tick, or its untick. Woke, Book and Journal log through wake(), page() and journalLine() instead, and a tap
   *  on them never takes anything off (their toasts carry Undo). What a tap takes off comes back with an undo. */
  async function toggle(id: TickId, on: boolean): Promise<string | Said | null> {
    switch (id) {
      case 'drink': await putCheck('wake-drink', on); return on ? 'Wake-up drink done' : 'Wake-up drink unticked';
      case 'nosugar': await putCheck('no-sugar', on); tickHabit(/sugar/i, on); return on ? 'No sugar today' : 'No sugar unticked';
      case 'night': await putCheck('night-routine', on); return on ? 'Night routine done' : 'Night routine unticked';
      case 'chess': case 'sudoku': case 'matiks': {
        const name = id === 'chess' ? 'Chess' : id === 'sudoku' ? 'Sudoku' : 'Matiks';
        const sid = `game-${day}-${id}`;
        if (on) { await sessions.put({ id: sid, kind: 'game', date: day, title: name, source: 'capture' } as never); return `${name} logged`; }
        const was = (sessions.items ?? []).find((x) => x.id === sid);
        await sessions.remove(sid);
        return { said: `${name} taken off`, undo: () => sessions.put((was ?? { id: sid, kind: 'game', date: day, title: name, source: 'capture' }) as never) };
      }
      case 'meditate': {
        if (on) { await sits.put({ date: day, at: stamp(), secs: 600, mins: 10, pattern: 'even', source: 'capture' } as never); tickHabit(/meditat/i, true); return 'Meditation, 10 minutes'; }
        // only the sits logged here come off; a real one from Soul stays, and so does the habit's tick
        const all = (sits.items ?? []).filter((x) => x.date === day);
        const mine = all.filter((x) => x.source === 'capture');
        if (!mine.length) throw new Error('Sat in Soul. Change it there.');
        for (const x of mine) await sits.remove(x.id);
        const none = mine.length === all.length;
        if (none) tickHabit(/meditat/i, false);
        return {
          said: none ? 'Meditation taken off' : 'Meditation taken off. Your sit in Soul stays.',
          undo: async () => { for (const x of mine) await sits.put(x as never); if (none) tickHabit(/meditat/i, true); },
        };
      }
      case 'wake': case 'journal': case 'book': return null; // through wake(), journalLine() and page()
      case 'clean': {
        if (!live) {
          // an earlier day: the pledge is made at that evening's time (the PC files it under the day it falls in);
          // taking it back clears that day's row, as the PC's own take-back does for today
          if (on) {
            if (cleanData && !cleanData.setup) throw new Error('Start Clean in Soul first.');
            if (DEMO) await soulDays.put({ ...(dayRow ?? {}), id: day, pledge: stamp() } as never);
            else { await api('/mod/soul/clean/pledge', { method: 'POST', body: { at: new Date(`${day}T21:00:00+05:30`).toISOString() } }); invalidate('/mod/soul/'); void soulDays.refresh(); }
            tickHabit(/clean/i, true);
            return 'Pledged for that day';
          }
          await soulDays.put({ ...(dayRow ?? {}), id: day, pledge: null } as never);
          invalidate('/mod/soul/');
          tickHabit(/clean/i, false);
          return 'Pledge taken back';
        }
        if (!on) {
          if (DEMO) { await fakeWait(300); setDemoClean({ ...demoClean, pledged: false } as CleanNow); return 'Pledge taken back'; }
          await api('/mod/soul/clean/pledge', { method: 'DELETE' });
          invalidate('/mod/soul/clean');
          tickHabit(/clean/i, false);
          return 'Pledge taken back';
        }
        if (cleanData && !cleanData.setup) throw new Error('Start Clean in Soul first.');
        if (DEMO) { await fakeWait(300); setDemoClean({ ...demoClean, pledged: true } as CleanNow); return 'Pledged for today'; }
        await api('/mod/soul/clean/pledge', { method: 'POST', body: {} });
        invalidate('/mod/soul/clean');
        tickHabit(/clean/i, true);
        return 'Pledged for today';
      }
      default: return null;
    }
  }

  /** Cancel the wake-up drink or no sugar for today, or bring it back: its check is written not done and skipped. */
  async function skip(id: 'drink' | 'nosugar', on: boolean) {
    const item = id === 'drink' ? 'wake-drink' : 'no-sugar';
    const was = checked(item);
    await putCheck(item, false, { skipped: on });
    if (id === 'nosugar' && on && was) tickHabit(/sugar/i, false);
  }

  /** A meal by text, for when there is no photo: the same meal record a filed smart photo makes (Body's meals, in the
   *  frame's slot), its numbers estimated on the PC from the words. Resolves with what to say and the undo. */
  async function mealText(f: FrameId, text: string) {
    const name = text.trim().slice(0, 200);
    const slot = MEAL_SLOT[f] ?? 'snack';
    const word = SLOT_WORD[f] ?? 'Meal';
    const id = newId('meal');
    // an earlier day's meal is filed under that day, at its slot's usual hour
    const at = live ? stamp() : new Date(`${day}T${SLOT_HM[slot] ?? '13:00'}:00+05:30`).toISOString();
    if (DEMO) {
      await fakeWait(350);
      setDemoDiet((d) => (d ? { ...d, meals: [...d.meals, { id, name, at, slot, kcal: 380, protein: 18, carbs: null, fat: null, estimate: true, unknown: false, photo: null, source: 'today', items: null }] } : d));
      return { said: `${word} logged, about 18 g protein`, undo: async () => { setDemoDiet((d) => (d ? { ...d, meals: d.meals.filter((m) => m.id !== id) } : d)); } };
    }
    const r = await api<{ item: { protein?: number; unknown?: boolean } }>('/mod/body/meals', { method: 'POST', body: { id, name, slot, at, date: day, source: 'today' } });
    invalidate('/mod/body/');
    return {
      said: r.item.unknown ? `${word} logged. Add its protein in Diet.` : `${word} logged, about ${Math.round(Number(r.item.protein) || 0)} g protein`,
      undo: async () => { await api(`/mod/body/meals/${encodeURIComponent(id)}`, { method: 'DELETE' }); invalidate('/mod/body/'); },
    };
  }

  /** Woke at `hm` ("06:40") today. Resolves with the undo: back to the time it had, or to not logged. */
  async function wake(hm: string) {
    const before = todayChecks.get('wake');
    const at = new Date(`${day}T${hm}:00+05:30`).toISOString();
    await putCheck('wake', true, { at, time: hm });
    return () => (before?.done ? putCheck('wake', true, { at: before.at, time: before.time }) : putCheck('wake', false));
  }

  /** Another line in today's journal. Resolves with the undo: that line goes, and the Journal habit's tick with it when
   *  it was the day's only line. */
  async function journalLine(text: string) {
    const at = stamp();
    const id = newId('jr');
    const date = live ? myDay(at) : day;
    await journal.put({ id, date, at, text: text.trim(), kind: 'typed', by: 'me', source: 'capture' } as never);
    tickHabit(/journal/i, true);
    invalidate('/mod/soul/journal');
    return async () => {
      await journal.remove(id);
      const left = (collection<Entry>('growth', 'journal').get() ?? []).some((x) => x.id !== id && x.date === date && x.text?.trim());
      if (!left) tickHabit(/journal/i, false);
      invalidate('/mod/soul/journal');
    };
  }

  /** A sitting up to page `n` of the book he is reading. Resolves with what to say and the undo: the sitting goes and
   *  the book is back on the page it was on. */
  async function page(n: number): Promise<Said> {
    if (!book) throw new Error('No book open. Pick one in Mind > Read.');
    const said = `${book.title}, page ${n}`;
    if (DEMO) { await fakeWait(400); return { said, undo: () => fakeWait(200) }; }
    const r = await api<{ session: { id: string; from_page?: number | null } }>('/mod/mind/read/sitting', { method: 'POST', body: { book: book.id, to_page: n, date: day } });
    invalidate('/mod/mind/');
    void sessions.refresh();
    const b = book.id;
    return {
      said,
      undo: async () => {
        await sessions.remove(r.session.id);
        if (r.session.from_page != null) await api('/mod/mind/read/edit', { method: 'POST', body: { book: b, page: r.session.from_page } });
        invalidate('/mod/mind/');
      },
    };
  }

  async function task(o: { title: string; aspect: AspectKey | null; today: boolean; tagNora: boolean }) {
    const body: Record<string, unknown> = { title: o.title.trim() };
    if (o.aspect) Object.assign(body, aspectFields(life, o.aspect));
    if (o.today) body.due = today();
    if (DEMO) { await fakeWait(400); return o.tagNora ? 'Task added. Nora has it.' : 'Task added'; }
    const idem = newId('tk'); // the same task if it has to wait on the phone and go twice
    const r = await sendOrKeep<{ id: string; title: string }>({ id: `task-new:${idem}`, method: 'POST', path: '/tasks', body, idem });
    if (r.queued) return o.tagNora ? "Saved on phone. It goes to your PC when it's back; tag Nora then." : "Saved on phone. It goes to your PC when it's back.";
    const t = r.data;
    tasksChanged(); homeTasksChanged();
    if (o.tagNora) {
      const where = o.aspect ? ` (${ASPECT_NAME[o.aspect]})` : '';
      // her chat is the one way in today; she reads it, works the task with her tools and answers in the thread
      await nora.send(`I tagged you on ${t.id}: "${t.title}"${where}. Work on it and add what you find to the task's notes.`).catch(() => {});
    }
    return o.tagNora ? 'Task added. Nora has it.' : 'Task added';
  }

  // ── Clean: a slip, and taking it back ──
  /** Logs a slip now: the run starts again (days kept stay kept). Resolves with the id the undo needs. */
  async function slip() {
    const id = `cap-${Date.now().toString(36)}`;
    if (DEMO) { await fakeWait(300); setDemoClean((c) => ({ ...c, day: 0 } as CleanNow)); return id; }
    const r = await api<{ id: string }>('/mod/soul/clean/slip', { method: 'POST', body: { id, at: stamp() } });
    invalidate('/mod/soul/');
    return r.id ?? id;
  }
  async function unslip(id: string) {
    if (DEMO) { await fakeWait(250); setDemoClean((c) => ({ ...c, day: 12 } as CleanNow)); return; }
    await api(`/mod/soul/clean/slip/${encodeURIComponent(id)}/undo`, { method: 'POST', body: {} });
    invalidate('/mod/soul/');
  }

  // ── the smart photo: one photo, the PC decides where it goes ──
  async function smart(p: Picked, at: FrameId): Promise<SmartItem> {
    const id = `sp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (!DEMO) return (await upload<{ item: SmartItem }>(`/mod/capture/smart-photo?id=${id}`, p.uri, p.type)).item;
    // the demo has no PC: it reads the photo as whatever this hour's frame is
    const f = FRAMES.find((x) => x.id === at)!;
    const item: SmartItem = f.kind === 'meal'
      ? { id, status: 'filed', kind: 'meal', frame: f.id, tick: null, said: `Filed as ${SLOT_WORD[f.id] ?? f.label}, 32 g protein`, canUndo: true, photo: `demo/${id}`, meal: { protein: 32 } }
      : { id, status: 'filed', kind: f.id, frame: f.id, tick: f.id === 'drink' ? 'drink' : null, said: `Filed as ${f.id === 'drink' ? 'Wake-up drink, ticked' : `${f.label}, in the photo vault`}`, canUndo: true, photo: `demo/${id}` };
    demoSmart.set(id, { ...item, status: 'reading' });
    setTimeout(() => demoSmart.set(id, item), 1400);
    return { ...item, status: 'reading' };
  }
  async function smartGet(id: string): Promise<SmartItem> {
    if (DEMO) return demoSmart.get(id) ?? Promise.reject(new Error('Gone.'));
    return (await api<{ item: SmartItem }>(`/mod/capture/smart-photo/${encodeURIComponent(id)}`)).item;
  }
  /** Shows a filed smart photo at once, before the pages' own reads catch up. */
  function smartFiled(it: SmartItem, uri: string | undefined) {
    const frame = it.frame && FRAMES.some((f) => f.id === it.frame) ? (it.frame as FrameId) : null;
    if (frame) {
      const note = it.kind === 'meal' && it.meal ? `${it.meal.protein} g protein` : FRAMES.find((f) => f.id === frame)!.kind === 'vault' ? 'Kept' : 'Filed';
      putShot(frame, { uri, path: it.photo, state: 'sent', filed: note, at: stamp() });
    }
    if (DEMO) {
      if (it.kind === 'meal' && frame) setDemoDiet((d) => (d ? { ...d, meals: [...d.meals, { ...d.meals[0], id: `m_${it.id}`, name: 'Lunch', slot: MEAL_SLOT[frame]!, protein: it.meal?.protein ?? 0, photo: null }] } : d));
      return;
    }
    invalidate('/mod/body/'); invalidate('/mod/soul/'); invalidate('/mod/mind/');
    void checks.refresh(); void sessions.refresh();
  }
  async function smartUndo(it: SmartItem) {
    if (!DEMO) await api(`/mod/capture/smart-photo/${encodeURIComponent(it.id)}/undo`, { method: 'POST', body: {} });
    else await fakeWait(250);
    const frame = it.frame && FRAMES.some((f) => f.id === it.frame) ? (it.frame as FrameId) : null;
    if (frame) putShot(frame, null);
    if (DEMO) { if (it.kind === 'meal') setDemoDiet((d) => (d ? { ...d, meals: d.meals.filter((m) => m.id !== `m_${it.id}`) } : d)); return; }
    invalidate('/mod/body/'); invalidate('/mod/soul/'); invalidate('/mod/mind/');
    void checks.refresh(); void sessions.refresh();
  }

  // ── describe anything: words in, the PC files them where they belong ──
  const [demoDescribed] = useState(() => new Map<string, Described>());
  /** What a filing (or its undo) changed: every page that might show it reads again. */
  const refreshAll = () => {
    tasksChanged(); homeTasksChanged();
    invalidate('/mod/body/'); invalidate('/mod/money/'); invalidate('/mod/growth/'); invalidate('/mod/soul/journal'); invalidate('/ideas');
    void journal.refresh();
  };
  async function describe(text: string): Promise<Described> {
    const id = `ds_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (DEMO) { await fakeWait(500); const it = demoDescribe(id, text.trim()); demoDescribed.set(id, it); return it; }
    const r = await api<{ item: Described }>('/mod/capture/describe', { method: 'POST', body: { id, text: text.trim() } });
    refreshAll();
    return r.item;
  }
  async function describeUndo(it: Described): Promise<Described> {
    if (DEMO) { await fakeWait(250); return { ...it, status: 'undone', said: 'Taken back', canUndo: false }; }
    const r = await api<{ item: Described }>(`/mod/capture/describe/${encodeURIComponent(it.id)}/undo`, { method: 'POST', body: {} });
    refreshAll();
    return r.item;
  }
  async function describeAs(it: Described, kind: DescribeKind): Promise<Described> {
    if (DEMO) { await fakeWait(400); return demoDescribe(it.id, it.text, kind); }
    const r = await api<{ item: Described }>(`/mod/capture/describe/${encodeURIComponent(it.id)}/as`, { method: 'POST', body: { kind } });
    refreshAll();
    return r.item;
  }

  /** The task line's aspect chips: the nine Life aspects, in Life's order. */
  const aspects = ASPECT_KEYS.map((k) => ({ key: k, name: ASPECT_NAME[k] }));

  return {
    // `live`: the day is today's (photos and the smart photo work only then)
    day, live, frames, doneTicks, water, waterTarget,
    /** the day's water has been read: a glass added before then would overwrite the count */
    waterKnown: dietData != null,
    wakeAt: todayChecks.get('wake')?.done ? (todayChecks.get('wake')?.time ?? null) : null,
    cleanDay: cleanData && cleanData.setup ? cleanData.day : null,
    cleanReady: !cleanData || cleanData.setup,
    book: book ? { title: book.title, page: book.page, pages: book.pages } : null,
    aspects,
    photo, addWater, toggle, skip, mealText, wake, journalLine, page, task, describe, describeUndo, describeAs, slip, unslip, smart, smartGet, smartFiled, smartUndo,
    retry: (f: FrameId) => putShot(f, null),
  };
}

/** A path on the PC as an image source with the sign-in it needs (null for the demo's pretend paths). */
function withAuth(path: string | undefined) {
  return path && !path.startsWith('demo/') ? fileSource(path) : null;
}
