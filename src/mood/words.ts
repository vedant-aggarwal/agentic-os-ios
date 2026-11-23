// The words of the mood logger. Across the pool: how pleasant (-1 bad, 1 good). Up: energy (-1 drained, 1 wired).
// Sixteen mood words, the light each corner of the pool takes on, what usually sits behind each corner, and the
// pet's own short lines.

export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const cornerOf = (p: number, e: number): Corner => (e >= 0 ? (p >= 0 ? 'tr' : 'tl') : p >= 0 ? 'br' : 'bl');

// rows from high energy to low, columns from bad to good
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

/**
 * The key light of each corner of the pool (mood-scene/scene.js PRESET.*.light; keep the two in step): an ember
 * red in the storm, white-gold sun, cold moonlight, a low amber. Used for what the app draws in that light.
 */
const LIGHT: Record<Corner, [number, number, number]> = { tl: [255, 104, 62], tr: [255, 232, 184], bl: [112, 146, 255], br: [255, 186, 112] };
/** The corner light lifted toward warm white by `k` (0..1), so it reads as text over the dark cave. */
export function moodInk(p: number, e: number, k = 0.4, a = 1) {
  'worklet';
  const x = Math.min(1, Math.max(0, (p + 1) / 2)), y = Math.min(1, Math.max(0, (e + 1) / 2));
  const sx = x * x * (3 - 2 * x), sy = y * y * (3 - 2 * y);
  const W = [246, 241, 233];
  const c = (i: number) => {
    const v = (LIGHT.bl[i] * (1 - sx) + LIGHT.br[i] * sx) * (1 - sy) + (LIGHT.tl[i] * (1 - sx) + LIGHT.tr[i] * sx) * sy;
    return Math.round(v * (1 - k) + W[i] * k);
  };
  return `rgba(${c(0)},${c(1)},${c(2)},${a})`;
}

// (after moodInk: a worklet takes what it calls when it is made)
export function moodLight(p: number, e: number, a = 1) {
  'worklet';
  return moodInk(p, e, 0, a);
}

// what usually sits behind each corner, then the parts of his life any mood can come from
const BY_CORNER: Record<Corner, string[]> = {
  tr: ['A win', 'Good news', 'Progress', 'Someone I like', 'Fun plans', 'Good workout'],
  br: ['Rested', 'Quiet time', 'Nothing pending', 'Good food', 'Outside', 'Music'],
  tl: ['Deadline', 'Too much to do', 'Argument', 'Running late', 'Someone annoyed me', 'Overthinking'],
  bl: ['Bad sleep', 'Lonely', 'Nothing got done', 'Missing someone', 'Feeling sick', 'Bored'],
};
const LIFE = ['Sleep', 'College', 'Norrita', 'Family', 'Friends', 'Gym', 'Money', 'Love'];

/** The words that float up for what is behind it: the corner's own, woven with the parts of his life. */
export function reasonsFor(c: Corner) {
  const a = BY_CORNER[c], out: string[] = [];
  for (let i = 0; i < Math.max(a.length, LIFE.length); i++) {
    if (a[i]) out.push(a[i]);
    if (LIFE[i]) out.push(LIFE[i]);
  }
  return out;
}

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

/** The pet's hello, before he touches the water. */
export function greeting(sad: number, hour = new Date().getHours()) {
  if (sad >= 0.6) return 'Missed you. How are you, really?';
  if (hour >= 5 && hour < 12) return 'Morning. How are you feeling?';
  if (hour >= 12 && hour < 17) return 'Hey. How is today going?';
  if (hour >= 17 && hour < 23) return 'Evening. How was today?';
  return 'Still up? How are you?';
}

/** What the pet says when he lets go on a word. */
const QUIP: Record<string, string> = {
  Furious: 'Okay. Who do I fight?',
  Stressed: "Breathe. I'm right here.",
  Excited: 'Ooh. What happened?',
  Thrilled: 'Yes! Tell me everything.',
  Irritated: 'Ugh. One of those days.',
  Tense: 'Drop your shoulders a bit.',
  Upbeat: 'I like this energy.',
  Happy: 'Love that for you.',
  Sad: 'Aw. Come here.',
  Low: "I've got you.",
  Chill: 'Nice and easy.',
  Content: 'Mm. Cosy.',
  Empty: "Let's sit with it a minute.",
  Tired: 'Long day, huh.',
  Relaxed: 'Slow and soft. Good.',
  Peaceful: 'Stay here a while.',
};
export const quip = (word: string) => QUIP[word] ?? 'Okay.';

/** The question the water asks about what is behind it. */
export function behindQuestion(p: number) {
  if (p > 0.15) return 'What made it good?';
  if (p < -0.15) return "What's weighing on you?";
  return "What's behind it?";
}

/** The pet's face for where he let go. */
export function faceFor(p: number, e: number): 'happy' | 'excited' | 'calm' | 'concerned' | 'sad' | 'angry' | 'tired' {
  if (p > 0.25) return e > 0.35 ? 'excited' : e < -0.35 ? 'calm' : 'happy';
  if (p < -0.25) return e > 0.35 ? 'angry' : e < -0.35 ? 'sad' : 'concerned';
  return e < -0.5 ? 'tired' : 'calm';
}

let turn = 0;
/** A short reaction when he taps a reason. */
export function reactTo(word: string): string {
  const tone = reasonTone(word), w = word.toLowerCase();
  const pick = (a: string[]) => a[turn++ % a.length];
  if (tone === 'good') return pick([`${word}. Love that.`, `Ooh, ${w}.`, `${word}! Nice.`]);
  if (tone === 'hard') return pick([`${word}. Oof.`, `Ah, ${w}.`, `${word}. That's heavy.`]);
  return pick([`${word}, got it.`, `${word}. Okay.`, `Mm, ${w}.`]);
}
