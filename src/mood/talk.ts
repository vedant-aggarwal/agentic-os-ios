import { call, collection, invalidate, newId } from '@/lib/mod';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { myDay } from '@/aspects/kit/time';
import type { PetFace } from '@/lib/pet';

// The mood logger's server half: the AI's next round (POST /mod/soul/mood/ask) and saving the mood in Soul's moods,
// where every other screen (and the pet's sadness) reads it. The sample preview answers with canned rounds.

export type Round = { q: string; options: string[]; picked: string[]; text: string };
export type Ask = { q: string; options: string[]; say: string; face: PetFace; done: boolean; line: string };
export type MoodDraft = { energy: number; pleasant: number; word: string; tags: string[]; note: string };

const SAMPLE: Ask[] = [
  { q: 'What about college drained you most today?', options: ['Long lectures', 'The commute', 'People', 'Nothing specific', 'Assignments'], say: "Come here. Let's figure it out.", face: 'concerned', done: false, line: '' },
  { q: 'What would help you feel a bit better tonight?', options: ['Early sleep', 'A walk', 'Talk to someone', 'Music', 'Gym'], say: 'That commute sounds rough.', face: 'sad', done: false, line: '' },
  { q: '', options: [], say: "Got it. Early night, then. I'm proud of you for checking in.", face: 'proud', done: true, line: 'Tired and low after a long college day; the commute wore me out, an early night will help.' },
];

export async function askNext(d: MoodDraft, rounds: Round[]): Promise<Ask> {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 1100));
    return SAMPLE[Math.min(rounds.length, SAMPLE.length - 1)];
  }
  try {
    return await call<Ask>('/mod/soul/mood/ask', { ...d, rounds: rounds.map(({ q, picked, text }) => ({ q, picked, text })) });
  } catch (e) {
    // the PC can't ask Claude right now (route not live yet, usage limit, offline): the pet asks its own two rounds
    const status = e instanceof ApiError ? e.status : 0;
    if (status === 404 || status === 503 || status === 0 || status === 502) return localRound(d, rounds);
    throw e;
  }
}

// Two plain rounds without the AI: what is behind it, then what would help. The line is put together from his taps.
function localRound(d: MoodDraft, rounds: Round[]): Ask {
  const good = d.pleasant >= 0, wired = d.energy >= 0;
  const about = d.tags[0]?.toLowerCase();
  if (rounds.length === 0) {
    return good
      ? { q: about ? `What about ${about} made it good?` : 'What made today good?', options: ['Got something done', 'Good people', 'Felt healthy', 'Had fun', 'Just a good day'], say: 'Ooh, I love this.', face: 'happy', done: false, line: '' }
      : { q: about ? `What about ${about} is weighing on you?` : 'What is weighing on you most?', options: wired ? ['Too much to do', 'Someone upset me', 'Running behind', 'Worried about something', 'Not sure'] : ['Tired body', 'Feeling alone', 'Nothing went right', 'Missing someone', 'Not sure'], say: "I'm here. Tell me.", face: 'concerned', done: false, line: '' };
  }
  if (rounds.length === 1) {
    return good
      ? { q: 'How do you want to use this energy?', options: ['Keep working', 'See people', 'Gym', 'Rest and enjoy it', 'Plan tomorrow'], say: 'Nice.', face: 'excited', done: false, line: '' }
      : { q: 'What would help a little right now?', options: ['Sleep', 'A walk', 'Talk to someone', 'Music', 'Eat something', 'Be alone'], say: 'That makes sense.', face: 'sad', done: false, line: '' };
  }
  const picks = rounds.flatMap((r) => [...r.picked, r.text].filter(Boolean)).map((x) => x.toLowerCase());
  const line = `${d.word}${d.tags.length ? `, mostly ${d.tags.slice(0, 2).join(' and ').toLowerCase()}` : ''}${picks.length ? `; ${picks.slice(0, 3).join(', ')}` : ''}.`;
  return { q: '', options: [], say: good ? 'Logged. Keep it going.' : 'Logged. Be gentle with yourself tonight.', face: good ? 'proud' : 'calm', done: true, line };
}

/** The 1-5 score the rest of the app reads, from how pleasant. */
export const moodV = (pleasant: number) => Math.max(1, Math.min(5, Math.round(3 + pleasant * 2)));

/** Save (or update) this check-in. The same id each time, so finishing after a quick save just fills it in. */
export async function saveMood(id: string, d: MoodDraft, rounds: Round[], line: string) {
  const now = new Date();
  const doc = {
    id, date: myDay(now), at: now.toISOString(), // his day: a mood at 01:30 is the evening's
    v: moodV(d.pleasant), energy: Math.round(d.energy * 100) / 100, pleasant: Math.round(d.pleasant * 100) / 100,
    word: d.word, tags: d.tags, note: d.note.trim(), rounds: rounds.filter((r) => r.picked.length || r.text).map(({ q, picked, text }) => ({ q, picked, text })),
    line, source: 'logger',
  };
  await collection<{ id: string; created_at: string; updated_at: string; rev: number }>('soul', 'moods').put(doc as never);
  invalidate('/mod/soul/moods');
}

export const newMoodId = () => newId('md');
