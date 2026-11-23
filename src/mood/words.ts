// The mood grid's words and colours. Across: how pleasant (-1 awful, 1 great). Up: energy (-1 drained, 1 wired).
// Four corners, four colours, sixteen words; the reasons he can tap depend on the corner he is in.

/** Corner colours: top left tense red, top right bright gold, bottom left heavy blue, bottom right calm green. */
export const CORNER = { tl: [255, 93, 108], tr: [255, 196, 61], bl: [91, 140, 255], br: [61, 220, 151] } as const;

/** The colour at a point of the grid (p across, e up, both -1..1), blended from the four corners. */
export function moodRgb(p: number, e: number): [number, number, number] {
  'worklet';
  const x = Math.min(1, Math.max(0, (p + 1) / 2)), y = Math.min(1, Math.max(0, (1 - e) / 2));
  const c = (i: number) => (CORNER.tl[i] * (1 - x) + CORNER.tr[i] * x) * (1 - y) + (CORNER.bl[i] * (1 - x) + CORNER.br[i] * x) * y;
  return [c(0), c(1), c(2)];
}
export function moodColor(p: number, e: number, a = 1) {
  'worklet';
  const [r, g, b] = moodRgb(p, e);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

// rows from high energy to low, columns from unpleasant to pleasant
const WORDS = [
  ['Furious', 'Stressed', 'Excited', 'Thrilled'],
  ['Irritated', 'Tense', 'Upbeat', 'Happy'],
  ['Sad', 'Low', 'Chill', 'Content'],
  ['Empty', 'Tired', 'Relaxed', 'Peaceful'],
];
export function moodWord(p: number, e: number) {
  'worklet';
  const col = Math.min(3, Math.max(0, Math.floor((p + 1) * 2)));
  const row = Math.min(3, Math.max(0, Math.floor((1 - e) * 2)));
  return WORDS[row][col];
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const cornerOf = (p: number, e: number): Corner => (e >= 0 ? (p >= 0 ? 'tr' : 'tl') : p >= 0 ? 'br' : 'bl');

// what usually sits behind each corner first, then the parts of his life any mood can come from
const BY_CORNER: Record<Corner, string[]> = {
  tr: ['A win', 'Good news', 'Progress', 'Someone I like', 'Fun plans', 'Good workout'],
  br: ['Rested', 'Quiet time', 'Nothing pending', 'Good food', 'Nature', 'Music'],
  tl: ['Deadline', 'Too much to do', 'Argument', 'Running late', 'Someone annoyed me', 'Overthinking'],
  bl: ['Bad sleep', 'Lonely', 'Nothing got done', 'Missing someone', 'Feeling sick', 'Bored'],
};
const LIFE = ['Sleep', 'College', 'Norrita', 'Clients', 'Family', 'Friends', 'Gym', 'Body', 'Money', 'Phone', 'Alone time', 'Weather', 'Love'];

export function reasonsFor(c: Corner) { return [...BY_CORNER[c], ...LIFE]; }

/** Is this reason a good thing (the pet beams) or a hard one (it leans in, worried)? */
export function reasonTone(r: string): 'good' | 'hard' | 'neutral' {
  if (BY_CORNER.tr.includes(r) || BY_CORNER.br.includes(r)) return 'good';
  if (BY_CORNER.tl.includes(r) || BY_CORNER.bl.includes(r)) return 'hard';
  return 'neutral';
}

/** What he typed, read for the pet's face: a hard day, a good one, or nothing it can tell. */
export function noteTone(text: string): 'good' | 'hard' | 'neutral' {
  const s = ` ${text.toLowerCase()} `;
  const hard = /\b(exam|deadline|tired|sick|ill|fight|argu|alone|lonely|sad|stress|anxious|angry|late|fail|lost|hurt|cry|broke|pain|bad|worst|nahi|thak)/;
  const good = /\b(won|win|got|shipped|done|love|great|happy|fun|good|best|amazing|proud|finally|closed|yay|mast|accha)/;
  const h = hard.test(s), g = good.test(s);
  return h && !g ? 'hard' : g && !h ? 'good' : 'neutral';
}
