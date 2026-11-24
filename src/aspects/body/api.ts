import { useEffect } from 'react';
import { call, invalidate, newId, useGet } from '@/lib/mod';
import { addDays, dayOf, myDay, useAspect } from '@/aspects/kit';

// What the PC's body module answers (server/modules/body.ts, body-face.ts, body-voice.ts) and the writes this page
// makes. One GET per screen; after any write the cached reads under /mod/body/ are refetched.

export const B = '/mod/body';
export type Part = 'gym' | 'diet' | 'face' | 'voice';
export const PART_NAME: Record<Part, string> = { gym: 'Gym', diet: 'Diet', face: 'Face', voice: 'Voice' };

// ── shared shapes ──
export type Due = { date: string; days: number } | null;
export type Target = { w?: number | null; r?: number | null; t?: number | null; min?: number | null; km?: number | null } | null;
export type ShortPlan = { id: string; date: string; name: string; at: string | null; why: string; reasons: string[]; plan_by: string;
  items: { ex: string; name: string; sets: number | null; target: Target; note: string }[] };
export type Quick = { kind: string; name: string; min: number; last: string | null; week: number; month: number };
export type Weight = { now: number | null; date: string | null; days: number | null; goal: { goal: number; by: string | null } | number | null; trail: { date: string; v: number }[] };
export const goalOf = (w: Weight | null | undefined) => (w?.goal == null ? null : typeof w.goal === 'number' ? w.goal : w.goal.goal ?? null);

// ── home ──
export type Home = {
  today: string; now: string; lead: Part | 'done'; order: Part[];
  gym: { state: 'live' | 'done' | 'planned' | 'rest'; session: { id: string; name: string; sets: number } | null; plan: ShortPlan | null;
    trained: { id: string; name: string; sets: number; volume: number }[]; next: ShortPlan | null; week: { days: number; target: number; streak: number }; quick: Quick[] };
  diet: { protein: number; protein_target: number; kcal: number; kcal_target: number; meals: number; water: number; water_target: number; behind: boolean };
  face: { am: { done: number; total: number }; pm: { done: number; total: number }; half: 'am' | 'pm'; total: number; done: number; scanned: string | null;
    open: { id: string; status: string } | null; due: Due };
  voice: { minutes: number; done: number; total: number; focus: string | null; sampled: string | null; open: { id: string; status: string } | null };
  // measured / of: how many features (face) or measures (voice) the overall rests on; partial: a face angle couldn't be read
  proof: { weight: Weight; face: { v: number; margin: number | null; date: string; days: number; delta: number | null; trend: number[]; measured?: number; of?: number; partial?: boolean; shots?: string[] } | null;
    voice: { v: number; date: string; days: number; delta: number | null; trend: number[]; measured?: number; of?: number } | null };
};

// ── gym ──
export type SetRow = { w: number | null; r: number | null; t: number | null; min: number | null; km: number | null; done: boolean; at?: string | null };
export type SessionItem = { ex: string; name: string; kind: 'weight' | 'bw' | 'time' | 'cardio'; equip: string; step: number; bar: number | null; p: string[]; note: string;
  target: Target; sets: SetRow[]; prev: { date: string; sets: Partial<SetRow>[] } | null };
export type FullSession = { id: string; date: string; status: string; name: string; split: string | null; why: string; reasons: string[]; plan_by: string;
  started_at: string | null; dur: number | null; items: SessionItem[] };
export type Muscle = { m: string; name: string; pct: number; ready_in: number };
export type Lift = { ex: string; name: string; kind: string; date: string; set: { w: number | null; r: number | null; t: number | null }; est: number | null; sessions: number; trend: number[] };
export type HistoryRow = { id: string; date: string; name: string; status: string; split: string | null; sets: number; volume: number; minutes: number | null; records: number; quick: string | null };
export type Gym = {
  today: string; readiness: { score: number | null; word: string; partial: boolean; parts: { k: string; name: string; v: string; word: string; note: string }[] };
  session: FullSession | null; sessionSource: 'live' | 'planned' | 'auto' | null; next: ShortPlan | null; trained: { id: string; name: string; sets: number; volume: number }[];
  week: { days: { d: string; trained: boolean; names: string[]; planned: boolean; missed: boolean; today: boolean; past: boolean }[]; count: number; target: number };
  recovery: Muscle[]; weight: Weight; lifts: Lift[]; history: HistoryRow[]; quick: Quick[];
};
export type SessionDetail = { id: string; date: string; name: string; status: string; split: string | null; started_at: string | null; ended_at: string | null;
  minutes: number | null; sets: number; volume: number; note: string | null;
  items: { ex: string; name: string; kind: string; sets: (SetRow & { pr: boolean })[] }[];
  records: { ex: string; name: string; set: Partial<SetRow>; was: Partial<SetRow> | null }[] };
export type Prev = { ex: string; name: string; kind: SessionItem['kind']; equip: string; step: number; bar: number | null; p: string[]; s: string[]; how: string[]; cue: string;
  prev: { date: string; sets: Partial<SetRow>[] } | null; target: Target; note: string; swaps: { ex: string; name: string; equip: string }[] };
export type LibItem = { id: string; name: string; kind: SessionItem['kind']; equip: string; level: string; p: string[]; s: string[]; img: string | null; cat: string };

// ── diet ──
export type MealRow = { id: string; name: string; at: string; slot: string | null; kcal: number; protein: number; carbs: number | null; fat: number | null;
  estimate: boolean; unknown: boolean; photo: string | null; source: string | null; items: { name: string; portion?: string; kcal: number; protein: number }[] | null };
export type Recent = { name: string; count: number; last: string; kcal: number; protein: number; carbs: number | null; fat: number | null; slot: string | null; items: MealRow['items'] };
export type MealPhoto = { id: string; day: string; status: 'reading' | 'done' | 'failed'; error: string | null; at: string | null; prompt: string | null;
  estimate: { name: string; note: string; kcal: number; protein: number; carbs: number; fat: number; items: { name: string; portion: string; kcal: number; protein: number }[] } | null };
export type TargetInfo = { v: number; set: boolean; from: string };
export type Diet = { day: string; today: string; totals: { kcal: number; protein: number; carbs: number; fat: number; n: number }; water: number;
  targets: { protein: TargetInfo; kcal: TargetInfo; water: TargetInfo }; meals: MealRow[]; week: { date: string; protein: number; kcal: number; meals: number }[];
  recent: Recent[]; photos: MealPhoto[] };
export type Estimate = { name?: string; kcal: number; protein: number; carbs?: number; fat?: number; items?: { name: string; kcal: number; protein: number; portion?: string }[]; unknown?: string[] };

// ── face ──
export type Change = 'yes' | 'part' | 'no';
export type Evidence = 'strong' | 'some' | 'weak' | 'none';
export type Step = { text: string; sec?: number };
export type Protocol = { id: string; name: string; kind: 'routine' | 'habit' | 'presentation' | 'link' | 'refer'; features: string[]; evidence: Evidence; does: string;
  minutes: number; freq: 'daily' | '3x' | '2x' | 'weekly' | 'once'; slot?: 'am' | 'pm' | 'day'; steps: Step[]; cautions?: string[]; link?: string };
export type Pick = { id: string; feature: string; why: string; protocol: Protocol };
export type RoutineRow = { id: string; text: string; half: string; when: 'am' | 'pm' | 'day'; proto: string | null; minutes: number | null; evidence: Evidence | null; steps: Step[]; done: boolean };
export type Routine = { am: RoutineRow[]; pm: RoutineRow[]; day: RoutineRow[]; total: number; done: number };
export type ScanSummary = { id: string; date: string; status: string; overall: number | null; margin: number | null; rubric: string | null; photos: Record<string, string> };
export type FaceFeature = { id: string; name: string; change: Change; v: number | null; margin: number | null; unsure: boolean; evidence: string; delta: number | null; trend: { date: string; v: number | null }[] };
/** How much a scan measured: features scored of all, the angles that read fine, the ones to retake. Partial when an angle is missing. */
export type Scope = { measured: number; of: number; shots: string[]; retake: string[]; partial: boolean };
export type Face = {
  rubric: string;
  // delta compares only the features measured in both scans (`compared` of them)
  latest: (ScanSummary & { delta: number | null; compared?: number; scope?: Scope; read_at: string | null; prompt: string | null; checks: { shot: string; ok: boolean; issue: string }[] }) | null;
  first: ScanSummary | null; features: FaceFeature[];
  plan: { summary: string; by: string; at: string; prompt: string; picks: Pick[]; presentation: Pick[] } | null;
  scans: ScanSummary[];
  open: (ScanSummary & { quality: Record<string, { w: number; h: number; brightness: number; sharpness: number }>; refuse: string | null; error: string | null;
    checks: { shot: string; ok: boolean; issue: string }[]; started: string | null }) | null;
  routine: Routine; due: Due;
};
export type Shot = { id: string; name: string; guide: string };
export type RubricFeature = { id: string; name: string; change: Change; can: string; fixed: string; shots: string[]; anchors: string[] };
export type Rubric = { version: string; margin: number; rescanDays: number; light: string; shots: Shot[]; features: RubricFeature[] };
export type Library = { items: Protocol[]; never: { name: string; why: string }[] };

// ── voice ──
export type DimId = 'pace' | 'pitch' | 'loudness' | 'pauses' | 'clarity' | 'fillers';
export type Dim = { id: DimId; name: string; target: string; what?: string; needs?: string };
export type Drill = { id: string; name: string; dims: DimId[]; minutes: number; measure: 'wer' | 'wpm' | 'pauses' | 'fillers' | null; does: string; steps: Step[]; text?: string };
export type Take = { id: string; drill: string; status: 'measuring' | 'done' | 'failed'; score: number | null; value: string | null; why: string | null; error?: string | null; transcript?: string | null };
export type Sample = { id: string; date: string; status: string; overall: number | null; explain: { text: string } | null; error: string | null; measured_at: string | null;
  scores: Record<DimId, { v: number | null; value: string | null; why: string | null }> | null;
  parts: { read: { file: string; seconds: number | null; transcript: string | null; textError: string | null } | null; free: { file: string; seconds: number | null; transcript: string | null; textError: string | null } | null } };
export type Voice = {
  passage: string; prompt: string; dims: Dim[]; realChange: number; measure: string;
  latest: (Sample & { delta: number | null; compared?: number; measured?: number; of?: number; dims: (Dim & { v: number | null; value: string | null; why: string | null; delta: number | null })[] }) | null;
  open: Sample | null; trend: { id: DimId | 'overall'; points: { date: string; v: number | null }[] }[];
  samples: { id: string; date: string; overall: number | null }[];
  today: { focus: DimId | null; minutes: number; drills: (Drill & { done: boolean; take: Take | null })[]; done: number };
  due: Due; library: Drill[];
};

// ── reads ──
export const useHome = () => useGet<Home>(`${B}/home`);
export const useGym = (on = true) => useGet<Gym>(on ? `${B}/gym` : null);
export const useDiet = (day?: string, on = true) => useGet<Diet>(on ? `${B}/diet${day ? `?day=${day}` : ''}` : null);
export const useFace = (on = true) => useGet<Face>(on ? `${B}/face` : null);
export const useVoice = (on = true) => useGet<Voice>(on ? `${B}/voice` : null);
export const useRubric = (on = true) => useGet<Rubric>(on ? `${B}/face/rubric` : null);
export const useProtocols = () => useGet<Library>(`${B}/face/protocols`);
export const useSession = (id: string | null) => useGet<SessionDetail>(id ? `${B}/session/${encodeURIComponent(id)}` : null);
export const usePrev = (ex: string | null, reps = 10) => useGet<Prev>(ex ? `${B}/prev?ex=${encodeURIComponent(ex)}&reps=${reps}` : null);
export const useLibrary = (on: boolean) => useGet<{ count: number; img: string; items: LibItem[] }>(on ? `${B}/library?lite=1` : null);

/** Refetch a read every `ms` while `active` and the page is open (an AI read in the background). */
export function usePoll(refresh: () => Promise<void>, active: boolean, ms = 4000) {
  const { open } = useAspect();
  useEffect(() => {
    if (!active || !open) return;
    const id = setInterval(() => { void refresh(); }, ms);
    return () => clearInterval(id);
  }, [active, open, ms, refresh]);
}

// ── writes ──
// A tick, a log or a meal counts for his day (`myDay`: before 04:00 IST it is still yesterday), as the PC counts it.
const stamp = () => new Date().toISOString();
const done = <T,>(p: Promise<T>) => p.then((r) => { invalidate(`${B}/`); return r; });

/** A record in one of the module's collections (the whole record is replaced). */
export const putDoc = <T,>(coll: string, id: string, doc: Record<string, unknown>) =>
  done(call<{ item: T }>(`${B}/${coll}/${encodeURIComponent(id)}`, { ...doc, id, updated_at: stamp() }, 'PUT'));
export const removeDoc = (coll: string, id: string) => done(call(`${B}/${coll}/${encodeURIComponent(id)}`, {}, 'DELETE'));

/** Tick a routine step or a voice drill for a day. */
export const tick = (item: string, on: boolean, day = myDay()) => putDoc('checks', `${day}:${item}`, { date: day, item, done: on, at: stamp() });
export const logWeight = (value: number, day = myDay()) => putDoc('readings', `weight:${day}`, { kind: 'weight', date: day, value, at: stamp() });
export const logWater = (value: number, day = myDay()) => putDoc('readings', `water:${day}`, { kind: 'water', date: day, value, at: stamp() });
export const quickLog = (kind: string, min: number, date?: string) => done(call<{ item: { id: string } }>(`${B}/quick`, { kind, min, date: date ?? myDay() }));
export const planAgain = (o: { ai?: boolean; minutes?: number; focus?: string } = {}) => done(call<{ by: string; plan: ShortPlan; note?: string }>(`${B}/plan`, o));
export const setTargets = (t: Partial<Record<'protein' | 'kcal' | 'water' | 'days', number>> & { weight?: { goal: number; by: string | null } }) => done(call(`${B}/targets`, t));
export const estimate = (text: string) => call<Estimate>(`${B}/estimate`, { text });

/** Log a meal. A meal with only a name gets its numbers estimated on the PC. */
export function addMeal(m: { name: string; kcal?: number; protein?: number; carbs?: number | null; fat?: number | null; items?: unknown; photo?: string; at?: string; day?: string }) {
  const day = m.day ?? myDay(m.at);
  const at = m.at ?? (day !== myDay() ? `${day}T07:30:00.000Z` : stamp());
  const { day: _d, ...rest } = m;
  return done(call<{ item: MealRow }>(`${B}/meals`, { id: newId('meal'), ...rest, at, date: day, source: 'app' }));
}
export const dismissPhoto = (id: string) => done(call(`${B}/meal-photo/${id}/dismiss`));

/** Find the scan in progress, or start one. `keep`: a retake that starts with that scan's photos that read fine. */
export const startScan = (keep?: string) => done(call<{ scan: ScanSummary }>(`${B}/face/scans`, keep ? { keep } : {}));
export const readScan = (id: string) => done(call<{ scan: ScanSummary; started: boolean }>(`${B}/face/scans/${id}/read`));
export const dropScan = (id: string) => done(call(`${B}/face/scans/${id}`, {}, 'DELETE'));
export const startSample = () => done(call<{ sample: Sample }>(`${B}/voice/samples`));
export const measureSample = (id: string) => done(call<{ sample: Sample; started: boolean }>(`${B}/voice/samples/${id}/measure`));

/** A file the PC keeps (a photo thumbnail, a recording). */
export const filePath = (id: string, thumb = false) => `${B}/files/${encodeURIComponent(id)}${thumb ? '?thumb=1' : ''}`;

// ── words ──
/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function agoDays(days: number | null | undefined) {
  if (days == null) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const y = Math.round(days / 365);
  return `${y} year${y > 1 ? 's' : ''} ago`;
}
export const inDays = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
/** Yesterday's date for logging something late. */
export const yesterday = () => addDays(myDay(), -1);
export const nowDay = () => dayOf();
