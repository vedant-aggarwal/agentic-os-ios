// Sample records for the `?demo` preview of the Body page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data, nobody's real numbers. Taps change an in-memory copy, so the preview can be used.
import { collection, demoSource, newId } from '@/lib/mod';
import { addDays, myDay } from '@/aspects/kit/time';
import type { Diet, Face, FullSession, Gym, Home, HistoryRow, LibItem, MealRow, Prev, ScanSummary, SessionDetail, Voice } from '@/aspects/body/api';
import type { WorkoutDoc } from '@/aspects/body/gym/workout';

const B = '/mod/body';
const day = myDay();
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+05:30`).toISOString();
const IMG = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

type Ex = { ex: string; name: string; kind: 'weight' | 'bw' | 'time' | 'cardio'; equip: string; step: number; bar: number | null; p: string[]; s: string[]; img: string | null;
  how: string[]; cue: string };
const EX: Record<string, Ex> = {
  pulldown: { ex: 'pulldown', name: 'Lat pulldown', kind: 'weight', equip: 'Cable', step: 2.5, bar: null, p: ['upperback'], s: ['biceps'], img: 'Wide-Grip_Lat_Pulldown/0.jpg',
    how: ['Sit with your thighs under the pad and grip the bar a little wider than your shoulders.', 'Lean back slightly and pull the bar to your upper chest.', 'Squeeze your shoulder blades down and together.', 'Let the bar rise slowly until your arms are straight.'], cue: 'Pull with your elbows, not your hands.' },
  'cable-row': { ex: 'cable-row', name: 'Seated cable row', kind: 'weight', equip: 'Cable', step: 2.5, bar: null, p: ['upperback'], s: ['biceps', 'lowerback'], img: 'Seated_Cable_Rows/0.jpg',
    how: ['Sit tall with your feet on the plate and knees soft.', 'Pull the handle to your stomach, elbows close.', 'Pause with your chest up.', 'Reach forward slowly without rounding your back.'], cue: 'Chest proud the whole time.' },
  'face-pull': { ex: 'face-pull', name: 'Face pull', kind: 'weight', equip: 'Cable', step: 2.5, bar: null, p: ['shoulders'], s: ['traps', 'upperback'], img: 'Face_Pull/0.jpg',
    how: ['Set the rope at head height.', 'Pull it toward your face, hands ending beside your ears.', 'Hold for a second.', 'Return slowly.'], cue: 'Thumbs back, elbows high.' },
  curl: { ex: 'curl', name: 'Barbell curl', kind: 'weight', equip: 'Barbell', step: 2.5, bar: 20, p: ['biceps'], s: ['forearms'], img: 'Barbell_Curl/0.jpg',
    how: ['Stand tall with the bar at your thighs, palms forward.', 'Curl it up without moving your elbows.', 'Squeeze at the top.', 'Lower for two seconds.'], cue: 'No swinging. Elbows stay pinned.' },
  hammer: { ex: 'hammer', name: 'Hammer curl', kind: 'weight', equip: 'Dumbbells', step: 2, bar: null, p: ['biceps'], s: ['forearms'], img: 'Hammer_Curls/0.jpg',
    how: ['Hold a dumbbell in each hand, palms facing in.', 'Curl one or both up, keeping the palms in.', 'Squeeze at the top.', 'Lower slowly.'], cue: 'Weight is per dumbbell.' },
  'dead-hang': { ex: 'dead-hang', name: 'Dead hang', kind: 'time', equip: 'Bar', step: 5, bar: null, p: ['forearms'], s: ['upperback'], img: null,
    how: ['Grip a bar shoulder width apart.', 'Hang with straight arms and relaxed shoulders.', 'Breathe slowly.', 'Drop when your grip goes.'], cue: 'Shoulders away from the ears.' },
  bench: { ex: 'bench', name: 'Bench press', kind: 'weight', equip: 'Barbell', step: 2.5, bar: 20, p: ['chest'], s: ['shoulders', 'triceps'], img: 'Barbell_Bench_Press_-_Medium_Grip/0.jpg',
    how: ['Lie with your eyes under the bar.', 'Grip a little wider than your shoulders.', 'Lower to the middle of your chest.', 'Press up and slightly back.'], cue: 'Touch the same spot every rep.' },
  squat: { ex: 'squat', name: 'Back squat', kind: 'weight', equip: 'Barbell', step: 2.5, bar: 20, p: ['quads'], s: ['glutes', 'hamstrings'], img: 'Barbell_Full_Squat/0.jpg',
    how: ['Bar on your upper back, feet shoulder width.', 'Sit down between your heels.', 'Keep your chest up.', 'Drive up through the whole foot.'], cue: 'Knees track over the toes.' },
  ohp: { ex: 'ohp', name: 'Overhead press', kind: 'weight', equip: 'Barbell', step: 2.5, bar: 20, p: ['shoulders'], s: ['triceps'], img: 'Standing_Military_Press/0.jpg',
    how: ['Bar on your front shoulders.', 'Brace your stomach.', 'Press straight up.', 'Lock out over your mid foot.'], cue: 'Ribs down.' },
  rdl: { ex: 'rdl', name: 'Romanian deadlift', kind: 'weight', equip: 'Barbell', step: 2.5, bar: 20, p: ['hamstrings'], s: ['glutes', 'lowerback'], img: 'Romanian_Deadlift/0.jpg',
    how: ['Hold the bar at your hips.', 'Push your hips back, bar close to your legs.', 'Stop when your hamstrings pull.', 'Stand up by pushing the hips forward.'], cue: 'Flat back, soft knees.' },
};
const exOf = (id: string): Ex => EX[id] ?? { ex: id, name: id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()), kind: 'weight', equip: 'Machine', step: 2.5, bar: null, p: [], s: [], img: null, how: [], cue: '' };

// ── history: the last few weeks of training, invented ──
type Past = { id: string; date: string; name: string; split: string; items: { ex: string; sets: { w: number | null; r: number | null; t?: number | null }[] }[]; minutes: number; quick?: string };
const set = (w: number | null, r: number | null, n = 3) => Array.from({ length: n }, () => ({ w, r }));
const past: Past[] = [
  { id: 'w-s1', date: addDays(day, -2), name: 'Push', split: 'push', minutes: 58, items: [{ ex: 'bench', sets: set(60, 6, 4) }, { ex: 'ohp', sets: set(35, 8) }] },
  { id: 'w-s2', date: addDays(day, -4), name: 'Boxing', split: 'quick', minutes: 45, quick: 'boxing', items: [] },
  { id: 'w-s3', date: addDays(day, -5), name: 'Legs and speed', split: 'legs', minutes: 64, items: [{ ex: 'squat', sets: set(70, 6, 4) }, { ex: 'rdl', sets: set(60, 8) }] },
  { id: 'w-s4', date: addDays(day, -7), name: 'Pull', split: 'pull', minutes: 52, items: [{ ex: 'pulldown', sets: set(45, 8) }, { ex: 'cable-row', sets: set(40, 10) }, { ex: 'curl', sets: set(25, 10) }] },
  { id: 'w-s5', date: addDays(day, -9), name: 'Push', split: 'push', minutes: 55, items: [{ ex: 'bench', sets: set(57.5, 6, 4) }, { ex: 'ohp', sets: set(32.5, 8) }] },
  { id: 'w-s6', date: addDays(day, -11), name: 'Run', split: 'quick', minutes: 30, quick: 'run', items: [] },
  { id: 'w-s7', date: addDays(day, -12), name: 'Legs and speed', split: 'legs', minutes: 61, items: [{ ex: 'squat', sets: set(67.5, 6, 4) }, { ex: 'rdl', sets: set(57.5, 8) }] },
  { id: 'w-s8', date: addDays(day, -14), name: 'Pull', split: 'pull', minutes: 50, items: [{ ex: 'pulldown', sets: set(42.5, 8) }, { ex: 'cable-row', sets: set(37.5, 10) }, { ex: 'curl', sets: set(22.5, 10) }] },
];
const PAST_IDS = new Set(past.map((p) => p.id));
/** The same sessions as workout records, so the week strips (which read the records) agree with the history. */
const pastDocs = (): WorkoutDoc[] => past.map((p) => {
  const start = Date.parse(`${p.date}T12:30:00.000Z`);
  return {
    id: p.id, date: p.date, status: 'done', name: p.name, split: p.split, source: p.quick ? 'quick' : 'app',
    started_at: new Date(start).toISOString(), ended_at: new Date(start + p.minutes * 60000).toISOString(),
    items: p.items.map((it) => ({
      ex: it.ex, name: exOf(it.ex).name, kind: exOf(it.ex).kind,
      sets: it.sets.map((x) => ({ w: x.w, r: x.r, t: x.t ?? null, min: null, km: null, done: true, at: null })),
    })),
  };
});
const volumeOf = (p: Past) => Math.round(p.items.reduce((v, it) => v + it.sets.reduce((a, x) => a + (x.w ?? 0) * (x.r ?? 0), 0), 0));
const setsOf = (p: Past) => p.items.reduce((n, it) => n + it.sets.length, 0);
const lastOf = (ex: string) => past.find((p) => p.items.some((i) => i.ex === ex));

// ── what a tap changes ──
const st = {
  water: 3, meals: [] as MealRow[], checks: new Set<string>(['am-1', 'am-2']), weights: [] as { date: string; v: number }[], quick: [] as HistoryRow[],
  targets: { protein: 140, kcal: 2300, water: 8, days: 4 },
  measures: [
    { date: addDays(day, -42), waist: 88, chest: 98, arm: 33 },
    { date: addDays(day, -28), waist: 87, chest: 98.5, arm: 33.5 },
    { date: addDays(day, -12), waist: 86, chest: 99, arm: 34 },
  ] as { date: string; waist: number | null; chest: number | null; arm: number | null }[],
  scan: null as ScanSummary | null, // the face scan in progress
};
st.meals = [
  { id: 'meal-1', name: 'Poha and chai', at: at(day, '08:40'), slot: 'breakfast', kcal: 380, protein: 9, carbs: 62, fat: 9, estimate: true, unknown: false, photo: null, source: 'app', items: null },
  { id: 'meal-2', name: '3 roti, dal, curd', at: at(day, '13:20'), slot: 'lunch', kcal: 640, protein: 27, carbs: 92, fat: 16, estimate: true, unknown: false, photo: null, source: 'app', items: null },
  { id: 'meal-3', name: 'Whey shake with milk', at: at(day, '17:05'), slot: 'snack', kcal: 260, protein: 32, carbs: 14, fat: 6, estimate: false, unknown: false, photo: null, source: 'app', items: null },
];
// a weigh in every few days for two months, drifting down
for (let i = 60; i >= 3; i -= 4) st.weights.push({ date: addDays(day, -i), v: Math.round((84.6 - (60 - i) * 0.045 + (i % 8 ? 0.3 : -0.2)) * 10) / 10 });

const protein = () => st.meals.reduce((a, m) => a + m.protein, 0);
const kcal = () => st.meals.reduce((a, m) => a + m.kcal, 0);
const lastWeight = () => st.weights.at(-1) ?? null;
const daysSince = (d: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5);

const PLAN_ITEMS: [string, number, number | null, number | null][] = [['pulldown', 3, 47.5, 8], ['cable-row', 3, 42.5, 10], ['face-pull', 3, 15, 15], ['curl', 3, 25, 10], ['hammer', 2, 12, 12], ['dead-hang', 3, null, null]];
const plan = () => ({
  id: `plan-${day}`, date: day, name: 'Pull', at: null, plan_by: 'rules',
  why: 'Back and biceps are fully recovered and Pull is next in your rotation.',
  reasons: ['Back recovered: 100%, last trained 7 days ago', 'Pull last time: lat pulldown 45 kg for 3 sets of 8, all done', 'Up 2.5 kg on the pulldown and the row', 'About 50 minutes'],
  items: PLAN_ITEMS.map(([ex, sets, w, r]) => ({ ex, name: exOf(ex).name, sets, target: exOf(ex).kind === 'time' ? { t: 45 } : { w, r }, note: ex === 'face-pull' ? 'Light and slow: shoulder health, not load.' : '' })),
});
const session = (): FullSession => ({
  id: `plan-${day}`, date: day, status: 'planned', name: 'Pull', split: 'pull', why: plan().why, reasons: plan().reasons, plan_by: 'rules', started_at: null, dur: null,
  items: PLAN_ITEMS.map(([ex, sets, w, r]) => {
    const e = exOf(ex); const prev = lastOf(ex);
    const target = e.kind === 'time' ? { t: 45 } : { w, r };
    return { ex, name: e.name, kind: e.kind, equip: e.equip, step: e.step, bar: e.bar, p: e.p, note: '', target,
      sets: Array.from({ length: sets }, () => ({ w: e.kind === 'time' ? null : w, r: e.kind === 'time' ? null : r, t: e.kind === 'time' ? 45 : null, min: null, km: null, done: false })),
      prev: prev ? { date: prev.date, sets: prev.items.find((i) => i.ex === ex)!.sets.map((x) => ({ ...x, t: null, min: null })) } : null };
  }),
});
// what comes after today in the sample: the next split in the rotation
const tomorrowPlan = () => ({
  id: `plan-${addDays(day, 1)}`, date: addDays(day, 1), name: 'Legs and speed', at: null, plan_by: 'rules', why: 'Legs are recovered and they come next.', reasons: [],
  items: ([['squat', 4, 72.5, 6], ['rdl', 3, 62.5, 8]] as const).map(([ex, sets, w, r]) => ({ ex, name: exOf(ex).name, sets, target: { w, r }, note: '' })),
});
// today's training in the sample, worked out from the workout records the way the PC does (body.ts gymToday): a live
// record is live, anything done today (a quick log too) is done, else today's plan waits
const workouts = () => collection<WorkoutDoc>('body', 'workouts').get() ?? [];
const liveDoc = () => workouts().find((w) => w.status === 'live') ?? null;
const trainedToday = () => history().filter((h) => h.date === day).map((h) => ({ id: h.id, name: h.name, sets: h.sets, volume: h.volume, minutes: h.minutes, quick: h.quick }));
const gymToday = () => {
  const live = liveDoc();
  const trained = trainedToday();
  const state = live ? 'live' as const : trained.length ? 'done' as const : 'planned' as const;
  return { live, trained, state, next: state === 'planned' ? plan() : tomorrowPlan(), week: { days: weekDays().filter((d) => d.trained).length, target: st.targets.days, streak: 3 } };
};
const liveSession = (w: WorkoutDoc): FullSession => ({
  id: w.id, date: w.date, status: 'live', name: w.name, split: w.split ?? null, why: w.why ?? '', reasons: w.reasons ?? [], plan_by: w.plan_by ?? 'rules', started_at: w.started_at ?? null, dur: null,
  items: w.items.map((it) => ({ ex: it.ex, name: it.name, kind: it.kind, equip: it.equip ?? exOf(it.ex).equip, step: it.step ?? exOf(it.ex).step, bar: exOf(it.ex).bar, p: exOf(it.ex).p,
    note: it.note ?? '', target: it.target ?? null, sets: it.sets, prev: null })),
});
const MUSCLES: [string, string, number][] = [
  ['chest', 'Chest', 64], ['shoulders', 'Shoulders', 71], ['triceps', 'Triceps', 68], ['quads', 'Quads', 82], ['glutes', 'Glutes', 85], ['hamstrings', 'Hamstrings', 79],
  ['biceps', 'Biceps', 100], ['forearms', 'Forearms', 96], ['upperback', 'Upper back', 100], ['lowerback', 'Lower back', 92], ['traps', 'Traps', 98], ['abs', 'Abs', 90],
  ['obliques', 'Obliques', 94], ['calves', 'Calves', 88], ['adductors', 'Adductors', 91], ['neck', 'Neck', 100],
];
const history = (): HistoryRow[] => [
  ...st.quick,
  ...(collection<WorkoutDoc>('body', 'workouts').get() ?? []).filter((w) => w.status === 'done' && !PAST_IDS.has(w.id)).map((w) => ({
    id: w.id, date: w.date, name: w.name, status: 'done', split: w.split ?? null, quick: null, records: 0, minutes: w.started_at && w.ended_at ? Math.max(1, Math.round((Date.parse(w.ended_at) - Date.parse(w.started_at)) / 60000)) : null,
    sets: w.items.reduce((n, it) => n + it.sets.filter((x) => x.done).length, 0),
    volume: Math.round(w.items.reduce((v, it) => v + it.sets.filter((x) => x.done).reduce((a, x) => a + (x.w ?? 0) * (x.r ?? 0), 0), 0)),
  })),
  ...past.filter((p) => { const all = collection<WorkoutDoc>('body', 'workouts').get(); return !all || all.some((w) => w.id === p.id); }).map((p) => ({ id: p.id, date: p.date, name: p.name, status: 'done', split: p.split, sets: setsOf(p), volume: volumeOf(p), minutes: p.minutes, records: p.id === 'w-s1' ? 1 : 0, quick: p.quick ?? null })),
];
const weekDays = () => {
  const mon = addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
  const h = history();
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(mon, i);
    const names = h.filter((x) => x.date === d).map((x) => x.name);
    return { d, trained: names.length > 0, names, planned: d === day && !names.length, missed: false, today: d === day, past: d < day };
  });
};
const weight = () => {
  const w = lastWeight();
  return { now: w?.v ?? null, date: w?.date ?? null, days: w ? daysSince(w.date) : null, goal: { goal: 78, by: null }, trail: st.weights.map((x) => ({ date: x.date, v: x.v })) };
};
const quick = () => (['boxing', 'run', 'walk', 'cycle'] as const).map((kind) => {
  const name = { boxing: 'Boxing', run: 'Run', walk: 'Walk', cycle: 'Cycle' }[kind];
  const mine = history().filter((h) => h.quick === kind);
  return { kind, name, min: { boxing: 45, run: 30, walk: 30, cycle: 30 }[kind], last: mine[0]?.date ?? null, week: mine.filter((h) => daysSince(h.date) < 7).length, month: mine.length };
});
const e1 = (w: number, r: number) => Math.round(w * (1 + r / 30) * 2) / 2;
const lifts = () => ['bench', 'squat', 'pulldown', 'rdl', 'ohp', 'cable-row', 'curl'].map((ex) => {
  const rows = past.filter((p) => p.items.some((i) => i.ex === ex)).reverse();
  const best = rows.at(-1)!.items.find((i) => i.ex === ex)!.sets[0];
  return { ex, name: exOf(ex).name, kind: 'weight', date: rows.at(-1)!.date, set: { w: best.w, r: best.r, t: null }, est: e1(best.w ?? 0, best.r ?? 0), sessions: rows.length + 3,
    trend: [...[0.86, 0.9, 0.93].map((f) => Math.round(e1(best.w ?? 0, best.r ?? 0) * f * 2) / 2), ...rows.map((p) => { const x = p.items.find((i) => i.ex === ex)!.sets[0]; return e1(x.w ?? 0, x.r ?? 0); })] };
});

const routine = () => {
  const row = (id: string, text: string, when: 'am' | 'pm', proto: string | null, minutes: number, steps: { text: string; sec?: number }[]) =>
    ({ id, text, half: when, when, proto, minutes, evidence: proto ? 'some' as const : null, steps, done: st.checks.has(id) });
  const am = [row('am-1', 'Cleanser', 'am', 'skin-am', 1, [{ text: 'Rinse with lukewarm water', sec: 20 }, { text: 'Massage the cleanser in', sec: 40 }]),
    row('am-2', 'Moisturiser', 'am', 'skin-am', 1, [{ text: 'A pea sized amount, face and neck', sec: 30 }]),
    row('am-3', 'Sunscreen', 'am', 'skin-am', 1, [{ text: 'Two finger lengths, every exposed part', sec: 45 }])];
  const pm = [row('pm-1', 'Cleanser', 'pm', 'skin-pm', 1, [{ text: 'Rinse and massage in', sec: 60 }]),
    row('pm-2', 'Gua sha', 'pm', 'gua-sha', 4, [{ text: 'Neck, downward strokes', sec: 40 }, { text: 'Jawline, chin to ear', sec: 60 }, { text: 'Cheeks, nose to ear', sec: 60 }, { text: 'Under the eyes, gently', sec: 40 }]),
    row('pm-3', 'Moisturiser', 'pm', 'skin-pm', 1, [{ text: 'A pea sized amount', sec: 30 }]),
    row('pm-4', 'Chin tucks', 'pm', 'posture', 2, [{ text: 'Ten slow tucks, hold each for five', sec: 90 }])];
  return { am, pm, day: [], total: am.length + pm.length, done: [...am, ...pm].filter((x) => x.done).length };
};

const FEATURES: [string, string, 'yes' | 'part' | 'no', number, string][] = [
  ['skin', 'Skin', 'yes', 58, 'Some uneven tone on the cheeks and a few marks on the forehead.'],
  ['leanness', 'Facial leanness', 'yes', 52, 'Soft fullness under the jaw and in the lower cheeks.'],
  ['jaw', 'Jaw and chin', 'part', 61, 'Jaw line visible from the front, softer in profile.'],
  ['hair', 'Hair and hairline', 'yes', 74, 'Full hairline, the cut has grown out at the sides.'],
  ['brows', 'Brows', 'yes', 66, 'Even shape, a few stray hairs between them.'],
  ['eyes', 'Eye area', 'part', 63, 'Mild puffiness under both eyes.'],
  ['posture', 'Neck and head posture', 'yes', 55, 'Head sits forward of the shoulders in profile.'],
  ['beard', 'Facial hair', 'yes', 70, 'Patchy at the cheeks, tidy at the chin.'],
  ['smile', 'Teeth and smile', 'part', 60, 'Even smile; some crowding on the lower front teeth.'],
  ['cheeks', 'Cheeks and midface', 'no', 64, 'Balanced midface.'],
  ['nose', 'Nose', 'no', 68, 'Straight from the front.'],
  ['lips', 'Lips', 'no', 69, 'Even, well defined.'],
  ['symmetry', 'Symmetry', 'no', 72, 'Close to even on both sides.'],
];
const PROTOCOLS = [
  { id: 'skin-am', name: 'Morning skin routine', kind: 'routine', features: ['skin'], evidence: 'strong', does: 'Cleanser, moisturiser and sunscreen. Sunscreen is the step that moves skin most over months.', minutes: 3, freq: 'daily', slot: 'am', steps: [{ text: 'Cleanser' }, { text: 'Moisturiser' }, { text: 'Sunscreen' }], cautions: ['Add any active one at a time, two weeks apart.'] },
  { id: 'gua-sha', name: 'Gua sha', kind: 'routine', features: ['leanness', 'eyes'], evidence: 'weak', does: 'Less puffiness for some hours. It does not change bone or fat.', minutes: 4, freq: 'daily', slot: 'pm', steps: [{ text: 'Neck' }, { text: 'Jawline' }, { text: 'Cheeks' }], cautions: ['Light pressure. Stop on broken skin.'] },
  { id: 'posture', name: 'Chin tucks and neck posture', kind: 'routine', features: ['posture', 'jaw'], evidence: 'some', does: 'Brings the head back over the shoulders, which shows the jaw line in profile.', minutes: 2, freq: 'daily', slot: 'pm', steps: [{ text: 'Ten slow tucks' }] },
  { id: 'fat-loss', name: 'Lose fat through Gym and Diet', kind: 'link', features: ['leanness', 'jaw'], evidence: 'strong', does: 'Changes the face more than any face exercise.', minutes: 0, freq: 'daily', steps: [] },
  { id: 'haircut', name: 'Haircut shape', kind: 'presentation', features: ['hair'], evidence: 'some', does: 'Shorter at the sides with some height suits a rounder lower face.', minutes: 0, freq: 'once', steps: [] },
];

demoSource({
  collections: {
    'body/workouts': pastDocs(),
  },
  gets: {
    [`${B}/home`]: (): Home => {
      const g = gymToday();
      const lead = g.state === 'done' ? 'diet' : 'gym';
      return {
      today: day, now: '17:40', lead, order: (['gym', 'diet', 'face', 'voice'] as const).filter((k) => k !== lead),
      gym: { state: g.state, session: g.live ? { id: g.live.id, name: g.live.name, sets: g.live.items.reduce((n, it) => n + it.sets.filter((x) => x.done).length, 0),
        items: g.live.items.map((it) => ({ ex: it.ex, name: it.name, sets: it.sets.length, target: it.target ?? null, note: it.note ?? '' })) } : null,
        plan: g.state === 'planned' ? plan() : null, trained: g.trained, next: g.next, week: g.week, quick: quick() },
      diet: { protein: protein(), protein_target: st.targets.protein, kcal: kcal(), kcal_target: st.targets.kcal, meals: st.meals.length, water: st.water, water_target: st.targets.water, behind: false },
      face: { am: { done: routine().am.filter((x) => x.done).length, total: 3 }, pm: { done: routine().pm.filter((x) => x.done).length, total: 4 }, half: 'pm', total: 7, done: routine().done, scanned: addDays(day, -9), open: null, due: { date: addDays(day, 5), days: 5 } },
      voice: { minutes: 4, done: 1, total: 3, focus: 'pitch', sampled: addDays(day, -6), open: null },
      proof: {
        weight: weight(),
        face: { v: 64, margin: 4, date: addDays(day, -9), days: 9, delta: 3, trend: [58, 61, 64], measured: 13, of: 13, partial: false },
        voice: { v: 71, date: addDays(day, -6), days: 6, delta: 5, trend: [62, 66, 71], measured: 6, of: 6 },
      },
      };
    },
    [`${B}/gym`]: (): Gym => {
      const g = gymToday();
      return {
      today: day, state: g.state,
      readiness: { score: 78, word: 'Ready', partial: false, parts: [{ k: 'sleep', name: 'Sleep', v: '7 h 10 min', word: 'Good', note: '' }, { k: 'load', name: 'Recent load', v: 'Moderate', word: 'Fine', note: '' }] },
      // the rules plan moves to tomorrow once anything is done today, as on the PC
      session: g.live ? liveSession(g.live) : g.trained.length ? null : session(), sessionSource: g.live ? 'live' : g.trained.length ? null : 'auto', next: g.next, trained: g.trained,
      week: { days: weekDays(), count: g.week.days, target: g.week.target, streak: g.week.streak },
      recovery: MUSCLES.map(([m, name, pct]) => ({ m, name, pct, ready_in: pct < 70 ? Math.round((70 - pct) * 1.6) + 6 : 0 })).sort((a, b) => a.pct - b.pct),
      weight: weight(), lifts: lifts(), history: history(), quick: quick(),
      };
    },
    [`${B}/session/*`]: (path: string): SessionDetail => {
      const id = decodeURIComponent(path.split('/').pop() ?? '');
      const live = (collection<WorkoutDoc>('body', 'workouts').get() ?? []).find((w) => w.id === id);
      if (live) {
        const items = live.items.map((it) => ({ ex: it.ex, name: it.name, kind: it.kind, sets: it.sets.filter((x) => x.done).map((x, i) => ({ ...x, pr: it.ex === 'pulldown' && i === 0 && (x.w ?? 0) > 45 })) })).filter((it) => it.sets.length);
        const vol = Math.round(items.reduce((v, it) => v + it.sets.reduce((a, x) => a + (x.w ?? 0) * (x.r ?? 0), 0), 0));
        const pd = items.find((it) => it.ex === 'pulldown')?.sets[0];
        return { id, date: live.date, name: live.name, status: live.status, split: live.split ?? null, started_at: live.started_at ?? null, ended_at: live.ended_at ?? null,
          minutes: live.started_at && live.ended_at ? Math.max(1, Math.round((Date.parse(live.ended_at) - Date.parse(live.started_at)) / 60000)) : null,
          sets: items.reduce((n, it) => n + it.sets.length, 0), volume: vol, note: null, items,
          records: pd && (pd.w ?? 0) > 45 ? [{ ex: 'pulldown', name: 'Lat pulldown', set: { w: pd.w, r: pd.r }, was: { w: 45, r: 8 } }] : [] };
      }
      const p = past.find((x) => x.id === id) ?? past[0];
      return { id: p.id, date: p.date, name: p.name, status: 'done', split: p.split, started_at: at(p.date, '07:00'), ended_at: at(p.date, '07:58'), minutes: p.minutes, sets: setsOf(p), volume: volumeOf(p), note: null,
        items: p.items.map((it) => ({ ex: it.ex, name: exOf(it.ex).name, kind: 'weight', sets: it.sets.map((x, i) => ({ w: x.w, r: x.r, t: null, min: null, km: null, done: true, pr: p.id === 'w-s1' && it.ex === 'bench' && i === 0 })) })),
        records: p.id === 'w-s1' ? [{ ex: 'bench', name: 'Bench press', set: { w: 60, r: 6 }, was: { w: 57.5, r: 6 } }] : [] };
    },
    [`${B}/prev`]: (_p: string, q: URLSearchParams): Prev => {
      const e = exOf(q.get('ex') ?? '');
      const last = lastOf(e.ex);
      const swaps = Object.values(EX).filter((x) => x.ex !== e.ex && x.p.some((m) => e.p.includes(m))).map((x) => ({ ex: x.ex, name: x.name, equip: x.equip }));
      return { ex: e.ex, name: e.name, kind: e.kind, equip: e.equip, step: e.step, bar: e.bar, p: e.p, s: e.s, how: e.how, cue: e.cue,
        prev: last ? { date: last.date, sets: last.items.find((i) => i.ex === e.ex)!.sets } : null, target: e.kind === 'time' ? { t: 45 } : { w: null, r: Number(q.get('reps')) || 10 }, note: '', swaps };
    },
    [`${B}/library`]: () => ({
      count: 876, img: IMG,
      items: [
        ...Object.values(EX).map((e): LibItem => ({ id: e.ex, name: e.name, kind: e.kind, equip: e.equip, level: 'beginner', p: e.p, s: e.s, img: e.img, cat: 'strength' })),
        ...([['Dumbbell_Bench_Press', 'Dumbbell bench press', 'Dumbbells', ['chest']], ['Pullups', 'Pull up', 'Body only', ['upperback']], ['Leg_Press', 'Leg press', 'Machine', ['quads']],
          ['Dumbbell_Lunges', 'Dumbbell lunge', 'Dumbbells', ['quads']], ['Seated_Calf_Raise', 'Seated calf raise', 'Machine', ['calves']], ['Plank', 'Plank', 'Body only', ['abs']],
          ['Triceps_Pushdown', 'Triceps pushdown', 'Cable', ['triceps']], ['Side_Lateral_Raise', 'Lateral raise', 'Dumbbells', ['shoulders']],
          ['Bent_Over_Barbell_Row', 'Bent over row', 'Barbell', ['upperback']], ['Incline_Dumbbell_Press', 'Incline dumbbell press', 'Dumbbells', ['chest']]] as const)
          .map(([id, name, equip, p]): LibItem => ({ id, name, kind: id === 'Plank' ? 'time' : 'weight', equip, level: 'beginner', p: [...p], s: [], img: `${id}/0.jpg`, cat: 'strength' })),
      ],
    }),
    [`${B}/diet`]: (): Diet => ({
      day, today: day, totals: { kcal: kcal(), protein: protein(), carbs: st.meals.reduce((a, m) => a + (m.carbs ?? 0), 0), fat: st.meals.reduce((a, m) => a + (m.fat ?? 0), 0), n: st.meals.length },
      water: st.water,
      targets: { protein: { v: st.targets.protein, set: true, from: 'Set by you' }, kcal: { v: st.targets.kcal, set: true, from: 'Set by you' }, water: { v: st.targets.water, set: false, from: 'Default' } },
      meals: st.meals,
      week: [96, 128, 141, 88, 132, 119].map((p, i) => ({ date: addDays(day, i - 6), protein: p, kcal: 1900 + p * 3, meals: 4 })).concat([{ date: day, protein: protein(), kcal: kcal(), meals: st.meals.length }]),
      recent: [
        { name: 'Whey shake with milk', count: 18, last: addDays(day, -1), kcal: 260, protein: 32, carbs: 14, fat: 6, slot: 'snack', items: null },
        { name: '3 roti, dal, curd', count: 12, last: day, kcal: 640, protein: 27, carbs: 92, fat: 16, slot: 'lunch', items: null },
        { name: '4 egg omelette', count: 9, last: addDays(day, -2), kcal: 320, protein: 25, carbs: 2, fat: 22, slot: 'breakfast', items: null },
        { name: 'Paneer bhurji and 2 roti', count: 7, last: addDays(day, -3), kcal: 610, protein: 31, carbs: 48, fat: 30, slot: 'dinner', items: null },
        { name: 'Chicken rice bowl', count: 5, last: addDays(day, -4), kcal: 690, protein: 42, carbs: 80, fat: 18, slot: 'lunch', items: null },
        { name: 'Poha and chai', count: 5, last: day, kcal: 380, protein: 9, carbs: 62, fat: 9, slot: 'breakfast', items: null },
      ],
      photos: [],
    }),
    [`${B}/today`]: () => ({ today: day, food: { protein: protein(), protein_target: st.targets.protein }, weight: { now: lastWeight()?.v ?? null, date: lastWeight()?.date ?? null } }),
    [`${B}/face`]: (): Face => ({
      rubric: 'face-3',
      latest: { id: 'scan-3', date: addDays(day, -9), status: 'done', overall: 64, margin: 4, rubric: 'face-3', photos: {}, delta: 3, compared: 13, read_at: at(addDays(day, -9), '10:00'), prompt: 'face-3',
        checks: [], scope: { measured: 13, of: 13, shots: ['front', 'smile', 'left', 'right', 'three', 'skin'], retake: [], partial: false } },
      first: { id: 'scan-1', date: addDays(day, -37), status: 'done', overall: 58, margin: 4, rubric: 'face-3', photos: {} },
      features: FEATURES.map(([id, name, change, v, evidence], i) => ({ id, name, change, v, margin: 4, unsure: false, evidence, delta: change === 'no' ? 0 : [3, 4, 2, 1, 0, 2, 5, 0, 1][i] ?? 0,
        trend: [{ date: addDays(day, -37), v: v - 5 }, { date: addDays(day, -23), v: v - 2 }, { date: addDays(day, -9), v }] })),
      plan: { summary: 'Skin and leanness move the score most. Start with the morning routine and posture; the rest follows the fat loss in Gym and Diet.', by: 'Nora', at: at(addDays(day, -9), '10:05'), prompt: 'plan-2',
        picks: PROTOCOLS.filter((p) => p.kind !== 'presentation').map((p) => ({ id: p.id, feature: p.features[0], why: p.does, protocol: p as never })),
        presentation: PROTOCOLS.filter((p) => p.kind === 'presentation').map((p) => ({ id: p.id, feature: p.features[0], why: p.does, protocol: p as never })) },
      scans: [{ id: 'scan-3', date: addDays(day, -9), status: 'done', overall: 64, margin: 4, rubric: 'face-3', photos: {} }, { id: 'scan-2', date: addDays(day, -23), status: 'done', overall: 61, margin: 4, rubric: 'face-3', photos: {} }, { id: 'scan-1', date: addDays(day, -37), status: 'done', overall: 58, margin: 4, rubric: 'face-3', photos: {} }],
      open: null, routine: routine(), due: { date: addDays(day, 5), days: 5 },
    }),
    [`${B}/face/protocols`]: () => ({ items: PROTOCOLS, never: [{ name: 'Bone smashing', why: 'No evidence, real risk of injury.' }, { name: 'Hard chewing gum for the jaw', why: 'Strains the jaw joint, and not with braces.' }] }),
    [`${B}/face/rubric`]: () => ({ version: 'face-3', margin: 4, rescanDays: 14, light: 'Face a window in daylight, no overhead light.',
      shots: [{ id: 'front', name: 'Front', guide: 'Look straight at the camera, face relaxed.' }, { id: 'smile', name: 'Smile', guide: 'Same spot, a natural smile.' }, { id: 'left', name: 'Left profile', guide: 'Turn to your right until only your left side shows.' }, { id: 'right', name: 'Right profile', guide: 'Turn to your left.' }, { id: 'three', name: 'Three quarter', guide: 'Halfway between front and profile.' }, { id: 'skin', name: 'Skin close up', guide: 'Cheek, an arm length away.' }],
      features: FEATURES.map(([id, name, change]) => ({ id, name, change, can: '', fixed: '', shots: ['front'], anchors: [] })) }),
    [`${B}/measures`]: () => ({ items: [...st.measures].sort((a, b) => a.date.localeCompare(b.date)) }),
    [`${B}/program`]: () => {
      const order = [
        { key: 'push', name: 'Push', muscles: ['chest', 'shoulders', 'triceps'] }, { key: 'pull', name: 'Pull', muscles: ['upperback', 'biceps'] },
        { key: 'legs', name: 'Legs and speed', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] }, { key: 'upper', name: 'Upper', muscles: ['chest', 'upperback', 'shoulders'] },
        { key: 'lower', name: 'Lower', muscles: ['quads', 'hamstrings', 'glutes'] }, { key: 'arms', name: 'Arms and core', muscles: ['biceps', 'triceps', 'abs'] },
      ];
      // today's Pull, once done, moves the rotation on to legs (as Train's Next line says)
      const pulled = trainedToday().some((h) => h.name === 'Pull');
      return { split: 'six day', next: pulled ? 'legs' : 'pull', days: order.map((o) => {
        if (pulled && o.key === 'pull') return { ...o, last: day, days: 0 };
        const p = past.find((x) => x.split === o.key); return { ...o, last: p?.date ?? null, days: p ? daysSince(p.date) : null };
      }) };
    },
    [`${B}/voice`]: (): Voice => {
      const dims = [
        { id: 'pace' as const, name: 'Pace', target: '130 to 160 words a minute', v: 76, value: '168 words a minute', why: 'A little fast in the free part.' },
        { id: 'pitch' as const, name: 'Pitch variation', target: 'Lively, not flat', v: 58, value: 'Range 4 semitones', why: 'Flat across most sentences.' },
        { id: 'loudness' as const, name: 'Steady loudness', target: 'Even from start to end', v: 74, value: 'Drops 6 dB at the ends', why: 'Fades at sentence ends.' },
        { id: 'pauses' as const, name: 'Pauses', target: 'Short pauses at full stops', v: 70, value: '11% of the time', why: 'Few pauses between ideas.' },
        { id: 'clarity' as const, name: 'Clarity', target: 'Under 5% words missed', v: 82, value: '4% missed', why: 'Clear on the read passage.' },
        { id: 'fillers' as const, name: 'Fewer fillers', target: 'Under 3 a minute', v: 66, value: '5 a minute', why: 'Mostly "like" and "basically".' },
      ];
      const drills = [
        { id: 'pitch-slides', name: 'Pitch slides', dims: ['pitch' as const], minutes: 1, measure: null, does: 'Slide from your lowest to your highest note on "ng".', steps: [{ text: 'Slide up on ng', sec: 20 }, { text: 'Slide down', sec: 20 }, { text: 'Up and down, slower', sec: 20 }], done: true, take: null },
        { id: 'read-stress', name: 'Read with stress', dims: ['pitch' as const], minutes: 2, measure: 'wpm' as const, does: 'Read a short paragraph and lift one word in each sentence.', steps: [{ text: 'Read it once, slowly', sec: 60 }, { text: 'Read again, lifting one word per sentence', sec: 60 }], done: false, take: null },
        { id: 'lip-trills', name: 'Lip trills', dims: ['loudness' as const], minutes: 1, measure: null, does: 'Steady air on a lip trill, gliding through your range.', steps: [{ text: 'Trill on one note', sec: 20 }, { text: 'Glide up and down', sec: 40 }], done: false, take: null },
      ];
      return {
        passage: 'Sample passage.', prompt: 'Talk about your week for thirty seconds.', dims: dims.map(({ id, name, target }) => ({ id, name, target })), realChange: 5, measure: 'ffmpeg',
        latest: { id: 'smp-2', date: addDays(day, -6), status: 'done', overall: 71, explain: { text: 'Clear and well paced on the read. In free talk the pitch flattens and the pace rises; that is where to work.' }, error: null, measured_at: at(addDays(day, -6), '19:00'),
          scores: null, parts: { read: { file: 'f1', seconds: 41, transcript: null, textError: null }, free: { file: 'f2', seconds: 31, transcript: null, textError: null } },
          delta: 5, compared: 6, measured: 6, of: 6, dims: dims.map((d) => ({ ...d, delta: d.id === 'pitch' ? 6 : d.id === 'pace' ? -2 : 3 })) },
        open: null,
        trend: [{ id: 'overall', points: [{ date: addDays(day, -20), v: 62 }, { date: addDays(day, -13), v: 66 }, { date: addDays(day, -6), v: 71 }] }],
        samples: [{ id: 'smp-2', date: addDays(day, -6), overall: 71 }, { id: 'smp-1', date: addDays(day, -13), overall: 66 }, { id: 'smp-0', date: addDays(day, -20), overall: 62 }],
        today: { focus: 'pitch', minutes: 4, drills, done: drills.filter((d) => d.done).length },
        due: { date: addDays(day, 1), days: 1 }, library: drills,
      };
    },
  },
  calls: {
    [`${B}/checks/*`]: (body: { item: string; done: boolean }) => { if (body.done) st.checks.add(body.item); else st.checks.delete(body.item); return { item: body }; },
    [`${B}/readings/*`]: (body: { kind: string; value: number; date: string }) => {
      if (body.kind === 'water') st.water = body.value;
      if (body.kind === 'weight') { st.weights = st.weights.filter((w) => w.date !== body.date).concat([{ date: body.date, v: body.value }]); }
      return { item: body };
    },
    [`${B}/meals`]: (body: Partial<MealRow> & { name: string }) => {
      const m: MealRow = { id: body.id ?? newId('meal'), name: body.name, at: body.at ?? new Date().toISOString(), slot: body.slot ?? 'snack', kcal: body.kcal ?? 420, protein: body.protein ?? 22,
        carbs: body.carbs ?? null, fat: body.fat ?? null, estimate: body.kcal == null, unknown: false, photo: null, source: 'app', items: null };
      st.meals = [...st.meals.filter((x) => x.id !== m.id), m];
      return { item: m };
    },
    [`${B}/meals/*`]: (body: Partial<MealRow>, info) => {
      const id = decodeURIComponent(info.path.split('/').pop() ?? '');
      if (info.method === 'DELETE') st.meals = st.meals.filter((m) => m.id !== id);
      else st.meals = st.meals.map((m) => (m.id === id ? { ...m, ...body } : m));
      return { item: { id } };
    },
    [`${B}/estimate`]: (body: { text: string }) => {
      const text = body.text.toLowerCase();
      const n = Number(text.match(/\d+/)?.[0] ?? 1);
      if (text.includes('egg')) return { name: body.text, kcal: 78 * n, protein: 6 * n, carbs: 1, fat: 5 * n, items: [{ name: 'Egg', portion: `${n}`, kcal: 78 * n, protein: 6 * n }] };
      if (text.includes('roti')) return { name: body.text, kcal: 120 * n + 180, protein: 3 * n + 9, carbs: 20 * n, fat: 6, items: [{ name: 'Roti', portion: `${n}`, kcal: 120 * n, protein: 3 * n }, { name: 'Dal', portion: '1 katori', kcal: 180, protein: 9 }] };
      return { name: body.text, kcal: 450, protein: 18, carbs: 55, fat: 14, items: [{ name: body.text, portion: '1 plate', kcal: 450, protein: 18 }] };
    },
    [`${B}/quick`]: (body: { kind: string; min: number; date: string }) => {
      const id = newId('q');
      st.quick.unshift({ id, date: body.date, name: body.kind[0].toUpperCase() + body.kind.slice(1), status: 'done', split: 'quick', sets: 0, volume: 0, minutes: body.min, records: 0, quick: body.kind });
      return { item: { id } };
    },
    [`${B}/workouts/*`]: (_b, info) => { const id = decodeURIComponent(info.path.split('/').pop() ?? ''); st.quick = st.quick.filter((q) => q.id !== id); return { item: { id } }; },
    [`${B}/targets`]: (body: Partial<typeof st.targets>) => { Object.assign(st.targets, body); return { ok: true }; },
    [`${B}/plan`]: () => ({ by: 'rules', plan: plan() }),
    // the guided face scan: start or find one, a photo per slot (or taken back), read it, throw it away
    [`${B}/face/scans`]: () => ({ scan: (st.scan ??= { id: newId('scan'), date: day, status: 'open', overall: null, margin: null, rubric: 'face-3', photos: {} }) }),
    [`${B}/face/scans/*`]: (_b, info) => {
      const scan = st.scan;
      if (!scan) throw new Error('No scan in progress.');
      const tail = info.path.split('/').pop();
      if (tail === 'photo') {
        const slot = info.query.get('slot') ?? 'front';
        const photos = { ...scan.photos };
        if (info.method === 'DELETE') delete photos[slot]; else photos[slot] = `demo/face-${slot}`;
        st.scan = { ...scan, photos };
        return { ok: true, scan: st.scan };
      }
      if (tail === 'read') { st.scan = null; return { scan: { ...scan, status: 'reading' }, started: true }; }
      if (info.method === 'DELETE') st.scan = null;
      return { ok: true };
    },
    [`${B}/measures`]: (body: { date: string; waist: number | null; chest: number | null; arm: number | null }) => {
      st.measures = [...st.measures.filter((m) => m.date !== body.date), body];
      return { ok: true };
    },
    [`${B}/measures/*`]: (_b, info) => { const d = info.path.split('/').pop() ?? ''; st.measures = st.measures.filter((m) => m.date !== d); return { ok: true }; },
    [`${B}/meal-photo`]: () => { throw new Error('Photos are read on the PC; the sample preview has none.'); },
  },
});
