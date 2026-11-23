import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { makeMutable, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { DEMO } from '@/lib/demo';
import { useGet } from '@/lib/mod';

// The mood pet: a small golden furball drawn live in 3D (pet-scene/, shown by components/Smiley). Rub it (a finger
// moving over the mood button) and it shuts its eyes, leans into the finger and purrs, hearts float up, and it stays
// happy for about a minute after. Leave the mood unlogged and it gets sadder by the hour: ears down, heavy lids, a
// wobbly frown, then tears. Logging a mood is what cheers it for good. This file is its shared state: the values
// below, and the events (rubs, reactions, hearts) the views that draw it listen to.

/** Live pet state the smiley draws from. rub: a finger is rubbing it now (0..1). joy: happiness left from a rub. */
export const pet = {
  rub: makeMutable(0),
  joy: makeMutable(0),
  fx: makeMutable(0), // where the finger is over it, -1 (left) to 1
  fy: makeMutable(0),
  // The mood logger drives the face while it is open (drive 0..1): val is how pleasant (-1..1), nrg how much energy
  // (-1 drained, 1 wired), worry and anger lift or knit the brows, think looks up while it waits for an answer.
  drive: makeMutable(0),
  val: makeMutable(0),
  nrg: makeMutable(0),
  worry: makeMutable(0),
  anger: makeMutable(0),
  think: makeMutable(0),
};

export type PetFace = 'happy' | 'excited' | 'calm' | 'proud' | 'concerned' | 'sad' | 'tired' | 'angry';

/** What happens to the pet, for the views that draw it: a finger rubbing it (fx, fy -1..1 over it, dx the move in
 *  pt), the finger lifting (strong: it was a proper rub), a passing reaction. Hearts go through onHeart. */
export type PetEvent =
  | { t: 'rub'; on: true; fx: number; fy: number; dx: number }
  | { t: 'rub'; on: false; strong: boolean }
  | { t: 'react'; face: PetFace };
const events = new Set<(e: PetEvent) => void>();
export function onPetEvent(fn: (e: PetEvent) => void) { events.add(fn); return () => { events.delete(fn); }; }
const emit = (e: PetEvent) => { for (const fn of events) fn(e); };

/** A few hearts in a row, as if it can't contain itself. */
export function heartBurst(n = 4, gap = 180) {
  for (let i = 0; i < n; i++) setTimeout(() => { for (const fn of hearts) fn(); }, i * gap);
}

/** A passing expression on top of where the logger has it: a beam, a worried look, a frown, a yawn. The scene plays
 *  the reaction itself (a hop, a sigh, a huff); the pulses here colour the mood under it for a moment. */
export function petReact(face: PetFace) {
  emit({ t: 'react', face });
  const pulse = (v: typeof pet.joy, to: number, hold = 1800) => v.set(withSequence(withTiming(to, { duration: 220 }), withDelay(hold, withTiming(0, { duration: 900 }))));
  if (face === 'happy' || face === 'proud') { pulse(pet.joy, 1); heartBurst(face === 'proud' ? 2 : 3); buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); }
  else if (face === 'excited') { pulse(pet.joy, 1, 2400); heartBurst(5, 140); buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }
  else if (face === 'concerned' || face === 'sad') { pulse(pet.worry, face === 'sad' ? 1 : 0.8, 2600); buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)); }
  else if (face === 'angry') { pulse(pet.anger, 0.9, 1600); buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)); }
  // calm and tired: the sigh and the yawn are the whole reaction
}

/** Hand the face to the mood logger (on) or give it back to his real mood (off). */
export function petDrive(on: boolean) {
  pet.drive.set(withTiming(on ? 1 : 0, { duration: on ? 500 : 700 }));
  if (!on) { pet.think.set(withTiming(0, { duration: 300 })); pet.worry.set(withTiming(0, { duration: 300 })); pet.anger.set(withTiming(0, { duration: 300 })); }
}

const BUTTON = 52; // the round mood button the finger rubs
let energy = 0, lastMove = 0, lastRubEnd = 0, purrAt = 0, purr: ReturnType<typeof setInterval> | null = null;
const hearts = new Set<() => void>();
let heartTimer: ReturnType<typeof setInterval> | null = null;
const buzz = (f: () => Promise<void>) => { if (Platform.OS !== 'web') f().catch(() => {}); };

/** The smiley listens for a heart to float up while it is being rubbed. */
export function onHeart(fn: () => void) { hearts.add(fn); return () => { hearts.delete(fn); }; }

export function rubStart() {
  energy = 0; lastMove = purrAt = Date.now();
  pet.rub.set(withTiming(1, { duration: 160 }));
  emit({ t: 'rub', on: true, fx: pet.fx.get(), fy: pet.fy.get(), dx: 0 });
  // a purr: rrrr... rrrr..., a burst of soft ticks on each breath, while the finger keeps at it
  purr = setInterval(() => {
    const now = Date.now();
    if (now - lastMove > 400) return;
    if (((now - purrAt) % 1100) / 1100 < 0.55) buzz(() => Haptics.selectionAsync());
  }, 75);
  heartTimer = setInterval(() => { if (Date.now() - lastMove < 260) for (const fn of hearts) fn(); }, 340);
  for (const fn of hearts) fn();
}

/** A finger move over the button: dx, dy since the last one, x, y inside the button (pt). */
export function rubMove(dx: number, dy: number, x: number, y: number) {
  const d = Math.abs(dx) + Math.abs(dy);
  if (d < 0.5) return;
  lastMove = Date.now();
  energy += d;
  const fx = Math.max(-1, Math.min(1, (x - BUTTON / 2) / (BUTTON / 2)));
  const fy = Math.max(-1, Math.min(1, (y - BUTTON / 2) / (BUTTON / 2)));
  pet.fx.set(fx); pet.fy.set(fy);
  pet.joy.set(Math.min(1, pet.joy.get() + d / 240));
  emit({ t: 'rub', on: true, fx, fy, dx });
}

export function rubEnd() {
  if (!purr && !heartTimer) return;
  if (purr) clearInterval(purr);
  if (heartTimer) clearInterval(heartTimer);
  purr = heartTimer = null;
  lastRubEnd = Date.now();
  emit({ t: 'rub', on: false, strong: energy > 40 });
  pet.rub.set(withTiming(0, { duration: 320 }));
  pet.fx.set(withTiming(0, { duration: 400 })); pet.fy.set(withTiming(0, { duration: 400 }));
  if (energy > 40) {
    // a proper rub: a happy little hop, and the good mood lingers, fading over about a minute
    buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    pet.joy.set(withSequence(withTiming(1, { duration: 180 }), withDelay(15000, withTiming(0, { duration: 45000 }))));
  } else {
    pet.joy.set(withDelay(1500, withTiming(0, { duration: 2500 })));
  }
}

/** True for a moment after a rub, so the lift of the finger doesn't also count as a tap. */
export const justRubbed = () => Date.now() - lastRubEnd < 450;

type MoodRow = { date?: string; at?: string; v?: number };

/** When he last logged a mood, in ms, from Soul's moods; null if he never has, undefined while unknown. */
export function lastMoodAt(items: MoodRow[] | undefined | null): number | null | undefined {
  if (!items) return undefined;
  let best: number | null = null;
  for (const m of items) {
    const t = m.at ? Date.parse(m.at) : m.date ? Date.parse(`${m.date}T20:00:00+05:30`) : NaN;
    if (Number.isFinite(t) && (best === null || t > best)) best = t;
  }
  return best;
}

/** How sad it is (0..1) after this many hours without a mood: fine for 6 h, low by a day, sad by 3, miserable by 7. */
export function sadnessAfter(hours: number): number {
  const seg = (h0: number, h1: number, a: number, b: number) => a + (b - a) * Math.min(1, Math.max(0, (hours - h0) / (h1 - h0)));
  if (hours < 6) return 0;
  if (hours < 24) return seg(6, 24, 0, 0.3);
  if (hours < 72) return seg(24, 72, 0.3, 0.75);
  return seg(72, 168, 0.75, 1);
}

/** The pet's sadness now, from his last logged mood; 0 while it can't tell (offline, sample mode). */
export function useSadness(): number {
  const moods = useGet<{ items: MoodRow[] }>('/mod/soul/moods');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5 * 60_000); return () => clearInterval(t); }, []);
  // dev, web sample mode only: `?demo&sad=0.8` to see a mood
  if (DEMO) { const q = Number(new URLSearchParams(location.search).get('sad')); return Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0; }
  const last = lastMoodAt(moods.data?.items);
  if (last === undefined) return 0;
  if (last === null) return 1;
  return sadnessAfter((now - last) / 3_600_000);
}
