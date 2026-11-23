import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { DEMO, demoData } from '@/lib/demo';
import { fileSource, invalidate, upload, useCollection, useGet, type Doc } from '@/lib/mod';
import { nora } from '@/lib/nora';
import type { Area, LifePayload } from '@/lib/today';
import { kv } from '@/work/kv';
import { dayOf, today } from '@/aspects/kit/time';
import type { Diet } from '@/aspects/body/api';
import type { Picked } from '@/aspects/body/pick';
import type { ReadView } from '@/aspects/mind/types';
import type { CleanNow } from '@/aspects/soul/data';
import type { AspectKey } from '@/theme';
import { FRAMES, MEAL_SLOT, type Frame, type FrameId, type TickId } from './moments';

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
//   task           POST /tasks { title, area, due }; "Tag Nora" also sends her the task in chat
// A Soul habit whose title matches (journal, meditat, clean, sugar) is ticked as well, so the core habits stay in step.

export type BodyCheck = Doc & { date: string; item: string; done: boolean; at: string; time?: string; photo?: string; by?: string; source?: string };
type Session = Doc & { kind?: string; date: string; book?: string | null; title?: string | null };
type Sit = Doc & { date: string; secs: number; source?: string };
type Entry = Doc & { date: string; text: string };
type Habit = Doc & { title: string; archived?: boolean };

// ── the photos taken here today, kept on the device so the roll survives closing the app ────────────────────────────
export type Shot = { id?: string; path?: string; uri?: string; state: 'sending' | 'sent' | 'failed'; error?: string; at: string;
  /** filed by the smart photo: what the frame says under its label until the page's own read shows it */ filed?: string };
/** What the PC made of a smart photo (server: modules/capture.ts). */
export type SmartItem = {
  id: string; status: 'reading' | 'filed' | 'unsure' | 'failed' | 'undone'; kind: string | null;
  frame: FrameId | 'salad' | null; tick: TickId | null; said: string | null; canUndo: boolean; photo: string;
  meal?: { protein: number } | null; page?: number | null;
};
type Roll = { day: string; shots: Partial<Record<FrameId, Shot>> };
const KEY = 'capture:v1:roll';
let roll: Roll = { day: today(), shots: {} };
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
  if (roll.day !== today()) roll = { day: today(), shots: {} };
  return roll.shots;
}
function putShot(id: FrameId, s: Shot | null) {
  const shots = { ...shotsToday() };
  if (s) shots[id] = s; else delete shots[id];
  setRoll({ day: today(), shots });
}
function useRoll() {
  useEffect(() => {
    if (loaded || DEMO) return;
    loaded = true;
    void kv.get(KEY).then((raw) => {
      if (!raw) return;
      try {
        const r = JSON.parse(raw) as Roll;
        if (r.day === today() && !Object.keys(roll.shots).length) { roll = r; for (const f of subs) f(); }
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
};

// ── demo: sample data for the web preview (?demo), nobody's real numbers ───────────────────────────────────────────
function demoDiet(): Diet {
  const d = today();
  return {
    day: d, today: d, totals: { kcal: 640, protein: 42, carbs: 70, fat: 18, n: 1 }, water: 5,
    targets: { protein: { v: 140, set: true, from: 'you' }, kcal: { v: 2400, set: true, from: 'you' }, water: { v: 20, set: true, from: 'you' } },
    meals: [{ id: 'm1', name: 'Protein oats, banana, milk', at: `${d}T03:30:00.000Z`, slot: 'breakfast', kcal: 640, protein: 42, carbs: 70, fat: 18, estimate: false, unknown: false, photo: null, source: 'app', items: null }],
    week: [], recent: [], photos: [],
  };
}
const DEMO_CLEAN = { setup: true, day: 12, pledged: false } as unknown as CleanNow;
const SLOT_WORD: Record<string, string> = { breakfast: 'Breakfast', salad: 'Salad', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const DEMO_READ = { reading: [{ id: 'b1', title: 'Deep Work', author: 'Cal Newport', pages: 296, page: 118, status: 'reading' }] } as unknown as ReadView;

const fakeWait = (ms = 700) => new Promise((r) => setTimeout(r, ms));

/** Everything the capture surface reads, and every write it makes. */
export function useCapture() {
  const day = today();
  const diet = useGet<Diet>(DEMO ? null : '/mod/body/diet');
  const clean = useGet<CleanNow>(DEMO ? null : '/mod/soul/clean/now');
  const read = useGet<ReadView>(DEMO ? null : '/mod/mind/read');
  const areasRead = useGet<{ areas: Area[] }>(DEMO ? null : '/areas');
  const lifeRead = useGet<LifePayload>(DEMO ? null : '/life');
  const checks = useCollection<BodyCheck>('body', 'checks');
  const sessions = useCollection<Session>('mind', 'sessions');
  const sits = useCollection<Sit>('soul', 'sits');
  const journal = useCollection<Entry>('growth', 'journal');
  const habits = useCollection<Habit>('soul', 'habits');
  const shots = useRoll();

  const [demoDietState, setDemoDiet] = useState<Diet | null>(() => (DEMO ? demoDiet() : null));
  const [demoClean, setDemoClean] = useState(DEMO_CLEAN);
  const [demoSmart] = useState(() => new Map<string, SmartItem>());
  const dietData = DEMO ? demoDietState : diet.data;
  const cleanData = DEMO ? demoClean : clean.data;
  const book = (DEMO ? DEMO_READ : read.data)?.reading?.[0] ?? null;
  const demo = useMemo(() => (DEMO ? demoData() : null), []);
  const areas = useMemo(() => (DEMO ? demo?.areas : areasRead.data?.areas) ?? [], [demo, areasRead.data]);
  const areaAspects = useMemo(() => (DEMO ? demo?.life.areaAspects : lifeRead.data?.areaAspects) ?? {}, [demo, lifeRead.data]);
  // a glass shows at once, until the read comes back with it
  const [glass, setGlass] = useState<{ base: number; v: number } | null>(null);
  const baseWater = dietData?.water ?? 0;
  const water = glass && glass.base === baseWater ? glass.v : baseWater;
  const waterTarget = dietData?.targets.water.v ?? 20;

  const todayChecks = useMemo(() => new Map((checks.items ?? []).filter((c) => c.date === day).map((c) => [c.item, c])), [checks.items, day]);
  const checked = (item: string) => !!todayChecks.get(item)?.done;

  // ── done today ──
  const doneTicks = useMemo(() => {
    const s = new Set<TickId>();
    if (checked('wake')) s.add('wake');
    if (checked('wake-drink')) s.add('drink');
    if (checked('no-sugar')) s.add('nosugar');
    if (checked('night-routine')) s.add('night');
    for (const g of ['chess', 'sudoku', 'matiks'] as const) if ((sessions.items ?? []).some((x) => x.id === `game-${day}-${g}`)) s.add(g);
    if ((sessions.items ?? []).some((x) => x.date === day && x.kind === 'reading')) s.add('book');
    if ((journal.items ?? []).some((x) => x.date === day && x.text?.trim())) s.add('journal');
    if ((sits.items ?? []).some((x) => x.date === day)) s.add('meditate');
    if (cleanData && cleanData.setup && cleanData.pledged) s.add('clean');
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayChecks, sessions.items, journal.items, sits.items, cleanData, day]);

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
    void api(`/mod/soul/checks/${encodeURIComponent(`${h.id}:${day}`)}`, {
      method: 'PUT', body: { id: `${h.id}:${day}`, habit: h.id, date: day, at: stamp(), updated_at: stamp(), done, source: 'capture' },
    }).then(() => invalidate('/mod/soul/')).catch(() => {});
  };

  async function photo(f: Frame, p: Picked, uri: string | undefined) {
    putShot(f.id, { uri, state: 'sending', at: stamp() });
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

  async function addWater(delta = 1) {
    const v = Math.max(0, water + delta);
    setGlass({ base: baseWater, v });
    if (DEMO) { setDemoDiet((d) => (d ? { ...d, water: v } : d)); setGlass(null); return v; }
    try {
      await api(`/mod/body/readings/water:${day}`, { method: 'PUT', body: { id: `water:${day}`, kind: 'water', date: day, value: v, at: stamp(), updated_at: stamp(), source: 'phone' } });
      invalidate('/mod/body/');
      return v;
    } catch (e) { setGlass(null); throw e; }
  }

  async function toggle(id: TickId, on: boolean) {
    switch (id) {
      case 'drink': await putCheck('wake-drink', on); return on ? 'Wake-up drink done' : 'Wake-up drink unticked';
      case 'nosugar': await putCheck('no-sugar', on); tickHabit(/sugar/i, on); return on ? 'No sugar today' : 'No sugar unticked';
      case 'night': await putCheck('night-routine', on); return on ? 'Night routine done' : 'Night routine unticked';
      case 'chess': case 'sudoku': case 'matiks': {
        const name = id === 'chess' ? 'Chess' : id === 'sudoku' ? 'Sudoku' : 'Matiks';
        const sid = `game-${day}-${id}`;
        if (on) await sessions.put({ id: sid, kind: 'game', date: day, title: name, source: 'capture' } as never);
        else await sessions.remove(sid);
        return on ? `${name} logged` : `${name} taken off`;
      }
      case 'meditate': {
        if (on) { await sits.put({ date: day, at: stamp(), secs: 600, mins: 10, pattern: 'even', source: 'capture' } as never); tickHabit(/meditat/i, true); return 'Meditation, 10 minutes'; }
        const mine = (sits.items ?? []).filter((x) => x.date === day && x.source === 'capture');
        for (const x of mine) await sits.remove(x.id);
        tickHabit(/meditat/i, false);
        return 'Meditation taken off';
      }
      case 'wake': {
        if (on) return null; // logging goes through wake(), with its time
        await putCheck('wake', false);
        return 'Wake-up taken off';
      }
      case 'journal': {
        if (on) return null; // writing goes through journalLine()
        const all = (journal.items ?? []).filter((x) => x.date === day && x.text?.trim());
        const mine = all.filter((x) => (x as { source?: string }).source === 'capture');
        if (!mine.length) throw new Error('Written in Growth. Change it there.');
        for (const x of mine) await journal.remove(x.id);
        if (mine.length === all.length) tickHabit(/journal/i, false);
        invalidate('/mod/soul/journal');
        return 'Journal line taken off';
      }
      case 'book': {
        if (on) return null; // logging goes through page()
        for (const x of (sessions.items ?? []).filter((x) => x.date === day && x.kind === 'reading')) await sessions.remove(x.id);
        invalidate('/mod/mind/');
        return 'Reading taken off';
      }
      case 'clean': {
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

  /** Woke at `hm` ("06:40") today. */
  async function wake(hm: string) {
    const at = new Date(`${day}T${hm}:00+05:30`).toISOString();
    await putCheck('wake', true, { at, time: hm });
  }

  async function journalLine(text: string) {
    const at = stamp();
    await journal.put({ date: dayOf(at), at, text: text.trim(), kind: 'typed', by: 'me', source: 'capture' } as never);
    tickHabit(/journal/i, true);
    invalidate('/mod/soul/journal');
  }

  async function page(n: number) {
    if (!book) throw new Error('No book open. Pick one in Mind > Read.');
    if (DEMO) { await fakeWait(400); return `${book.title}, page ${n}`; }
    await api('/mod/mind/read/sitting', { method: 'POST', body: { book: book.id, to_page: n } });
    invalidate('/mod/mind/');
    void sessions.refresh();
    return `${book.title}, page ${n}`;
  }

  async function task(o: { title: string; area: string | null; today: boolean; tagNora: boolean }) {
    const body: Record<string, unknown> = { title: o.title.trim() };
    if (o.area) body.area = o.area;
    if (o.today) body.due = day;
    if (DEMO) { await fakeWait(400); return o.tagNora ? 'Task added. Nora has it.' : 'Task added'; }
    const t = await api<{ id: string; title: string }>('/tasks', { method: 'POST', body });
    if (o.tagNora) {
      const where = o.area ? ` (${areas.find((a) => a.slug === o.area)?.name ?? o.area})` : '';
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

  const areaOptions = useMemo(() => areas.map((a) => ({ ...a, aspect: (areaAspects[a.slug]?.[0] ?? null) as AspectKey | null })), [areas, areaAspects]);

  return {
    day, frames, doneTicks, water, waterTarget,
    wakeAt: todayChecks.get('wake')?.done ? (todayChecks.get('wake')?.time ?? null) : null,
    cleanDay: cleanData && cleanData.setup ? cleanData.day : null,
    cleanReady: !cleanData || cleanData.setup,
    book: book ? { title: book.title, page: book.page, pages: book.pages } : null,
    areas: areaOptions,
    photo, addWater, toggle, wake, journalLine, page, task, slip, unslip, smart, smartGet, smartFiled, smartUndo,
    retry: (f: FrameId) => putShot(f, null),
  };
}

/** A path on the PC as an image source with the sign-in it needs (null for the demo's pretend paths). */
function withAuth(path: string | undefined) {
  return path && !path.startsWith('demo/') ? fileSource(path) : null;
}
