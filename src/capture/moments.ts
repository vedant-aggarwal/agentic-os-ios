import type { AspectKey } from '@/theme';

// Everything quick capture can log, and when each one matters. Windows are minutes into his day; the small hours
// (00:00 to 03:59) count as the end of the evening before, so journaling at 00:30 is still "tonight". The windows are
// only for ordering: they decide which actions come up under "Now", never whether an action can be used.

/** Minutes into his day, with 00:00..03:59 counted as 24:00..27:59. */
export function dayMinute(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  return m < 4 * 60 ? m + 24 * 60 : m;
}
const H = (h: number, m = 0) => h * 60 + m;

// ── photos: the day's roll, in the order the day runs ──────────────────────────────────────────────────────────────
export type FrameId = 'drink' | 'body' | 'face' | 'breakfast' | 'salad' | 'lunch' | 'snack' | 'dinner';
export type Frame = {
  id: FrameId; label: string; /** said in full where there is room (Now, the notice) */ long: string;
  /** meal: read by the PC's meal-photo flow and confirmed in Diet. vault: kept as a progress photo. */
  kind: 'meal' | 'vault'; win: [number, number][];
};
export const FRAMES: Frame[] = [
  { id: 'drink', label: 'Drink', long: 'Wake-up drink', kind: 'vault', win: [[H(5), H(10, 30)]] },
  { id: 'body', label: 'Body', long: 'Body, after the shower', kind: 'vault', win: [[H(7), H(12)]] },
  { id: 'face', label: 'Face', long: 'Face, after skincare', kind: 'vault', win: [[H(7), H(12, 30)]] },
  { id: 'breakfast', label: 'Breakfast', long: 'Breakfast', kind: 'meal', win: [[H(7), H(11)]] },
  { id: 'salad', label: 'Salad', long: 'Salad', kind: 'meal', win: [[H(11, 30), H(13, 30)]] },
  { id: 'lunch', label: 'Lunch', long: 'Lunch', kind: 'meal', win: [[H(12, 30), H(15, 30)]] },
  { id: 'snack', label: 'Snack', long: 'Evening snack', kind: 'meal', win: [[H(16, 30), H(19)]] },
  { id: 'dinner', label: 'Dinner', long: 'Dinner', kind: 'meal', win: [[H(19, 30), H(22, 30)]] },
];
/** The Body module's meal slot for a meal frame (the server knows breakfast, lunch, snack, dinner). */
export const MEAL_SLOT: Partial<Record<FrameId, string>> = { breakfast: 'breakfast', salad: 'salad', lunch: 'lunch', snack: 'snack', dinner: 'dinner' };

// ── ticks: the Self family, side by side ──────────────────────────────────────────────────────────────────────────
export type TickId = 'wake' | 'drink' | 'nosugar' | 'night' | 'chess' | 'sudoku' | 'matiks' | 'book' | 'journal' | 'meditate' | 'clean';
export type Tick = {
  id: TickId; label: string; aspect: AspectKey;
  /** tick: one tap. time: logs now, then can be moved. page: asks for a page. line: asks for a line of text. */
  kind: 'tick' | 'time' | 'page' | 'line';
  /** said under Now */ verb: string; win: [number, number][];
  /** pulls it up under Now: the core habits Nora wants done before the day ends */ weight?: number;
};
export const TICKS: Tick[] = [
  { id: 'wake', label: 'Woke', aspect: 'body', kind: 'time', verb: 'Log the time', win: [[H(4), H(10)]] },
  { id: 'drink', label: 'Drink', aspect: 'body', kind: 'tick', verb: 'Wake-up drink', win: [[H(5), H(10, 30)]] },
  { id: 'nosugar', label: 'No sugar', aspect: 'body', kind: 'tick', verb: 'Held today', win: [[H(20), H(26)]] },
  { id: 'night', label: 'Night', aspect: 'body', kind: 'tick', verb: 'Routine done', win: [[H(21, 30), H(26)]] },
  { id: 'chess', label: 'Chess', aspect: 'mind', kind: 'tick', verb: 'Game done', win: [[H(15), H(23)]] },
  { id: 'sudoku', label: 'Sudoku', aspect: 'mind', kind: 'tick', verb: 'Game done', win: [[H(15), H(23)]] },
  { id: 'matiks', label: 'Matiks', aspect: 'mind', kind: 'tick', verb: 'Game done', win: [[H(15), H(23)]] },
  { id: 'book', label: 'Book', aspect: 'mind', kind: 'page', verb: 'Log the page', win: [[H(20, 30), H(25)]] },
  { id: 'journal', label: 'Journal', aspect: 'soul', kind: 'line', verb: 'Write a line', win: [[H(21), H(26)]], weight: 0.35 },
  { id: 'meditate', label: 'Meditate', aspect: 'soul', kind: 'tick', verb: '10 minutes', win: [[H(5), H(9)], [H(21), H(24)]], weight: 0.3 },
  { id: 'clean', label: 'Clean', aspect: 'soul', kind: 'tick', verb: 'Pledge today', win: [[H(5), H(12)]], weight: 0.3 },
];
export const COLUMNS: { aspect: AspectKey; label: string; ticks: TickId[] }[] = [
  { aspect: 'body', label: 'Body', ticks: ['wake', 'drink', 'nosugar', 'night'] },
  { aspect: 'mind', label: 'Mind', ticks: ['chess', 'sudoku', 'matiks', 'book'] },
  { aspect: 'soul', label: 'Soul', ticks: ['journal', 'meditate', 'clean'] },
];
export const tickOf = (id: TickId) => TICKS.find((t) => t.id === id)!;
const GAMES: TickId[] = ['chess', 'sudoku', 'matiks'];
export const frameOf = (id: FrameId) => FRAMES.find((f) => f.id === id)!;

// ── Now: up to three actions that fit this hour, nearest the thumb ──────────────────────────────────────────────────
export type NowItem = { kind: 'frame'; id: FrameId } | { kind: 'tick'; id: TickId } | { kind: 'water' };

/** How well `now` sits in the windows: higher nearer the middle, null outside them all. */
function fit(win: [number, number][], now: number) {
  let best: number | null = null;
  for (const [a, b] of win) {
    if (now < a || now >= b) continue;
    const mid = (a + b) / 2, half = (b - a) / 2;
    const v = 1 - Math.abs(now - mid) / half; // 1 in the middle, 0 at the edges
    if (best == null || v > best) best = v;
  }
  return best;
}

/**
 * The actions for this moment, best first: whatever's window holds `now` and isn't done yet. Photos win a tie
 * (they are the ones that can't be done later). Water comes in when he is behind the day's pace.
 */
export function nowItems(o: { now: number; doneFrames: Set<FrameId>; doneTicks: Set<TickId>; waterBehind: boolean }, max = 3): NowItem[] {
  const scored: { item: NowItem; v: number }[] = [];
  for (const f of FRAMES) {
    if (o.doneFrames.has(f.id)) continue;
    const v = fit(f.win, o.now);
    if (v != null) scored.push({ item: { kind: 'frame', id: f.id }, v: v + 0.15 });
  }
  const drinkPhoto = scored.some((x) => x.item.kind === 'frame' && x.item.id === 'drink');
  // one brain game keeps the day: once one is played, the other two are extras, not something left to do
  const gamePlayed = GAMES.some((g) => o.doneTicks.has(g));
  for (const t of TICKS) {
    if (o.doneTicks.has(t.id)) continue;
    if (gamePlayed && GAMES.includes(t.id)) continue;
    if (t.id === 'drink' && drinkPhoto) continue; // the drink's photo ticks it too: one card, not two
    const v = fit(t.win, o.now);
    if (v != null) scored.push({ item: { kind: 'tick', id: t.id }, v: v + (t.weight ?? 0) });
  }
  scored.sort((a, b) => b.v - a.v);
  const out = scored.slice(0, max).map((s) => s.item);
  if (o.waterBehind && out.length < max) out.push({ kind: 'water' });
  return out;
}

/** The frame the roll opens on: the one whose window holds now, else the next one ahead, else the last. */
export function focusFrame(now: number): FrameId {
  const inside = FRAMES.filter((f) => fit(f.win, now) != null);
  if (inside.length) return inside[inside.length - 1].id;
  const ahead = FRAMES.find((f) => f.win[0][0] > now);
  return (ahead ?? FRAMES[FRAMES.length - 1]).id;
}

/** Water is behind when the glasses so far trail a straight line from 07:00 to 22:00. */
export function waterBehind(glasses: number, target: number, now: number) {
  if (!target || glasses >= target) return false;
  const p = Math.min(Math.max((now - H(7)) / (H(22) - H(7)), 0), 1);
  return glasses < Math.floor(target * p);
}
