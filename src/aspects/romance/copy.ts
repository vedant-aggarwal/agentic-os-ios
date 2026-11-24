import type { Budget, Depth, Expect, Place, TriedAnswer } from './types';

// Words the page shows. Discreet on purpose: nothing here gives away what the page is about at a glance.
// The chip ids match the server's bank (server/modules/romance-bank.ts), which turns them into a plain review.

export const PLACE: Record<Place, string> = { cowork: 'Coworking', cafe: 'Cafe', college: 'College', other: 'Elsewhere' };
export const PLACES = Object.keys(PLACE) as Place[];

export const DEPTH: Record<Depth, string> = { hello: 'Said hello', talked: 'Talked a while', contact: 'Swapped contacts', exit: 'Left it kindly' };
export const DEPTHS = Object.keys(DEPTH) as Depth[];

export const EXPECT: Record<Expect, string> = { most: 'Most', half: 'About half', few: 'Few' };

export const WELL: Record<string, string> = {
  started: 'I started one', question: 'I asked a question', followup: 'I asked a follow up', stayed: 'I stayed past the first reply',
  shared: 'I shared something about me', asked: 'I asked to stay in touch', ended: 'I ended it kindly',
};
export const STUCK: Record<string, string> = {
  froze: 'I froze before starting', blank: 'I ran out of things to say', early: 'I left too soon', busy: 'They seemed busy',
  noask: "I didn't ask to stay in touch", talked: 'I talked more than I listened',
};
export const FEEL: Record<string, string> = { calm: 'Calm', nervous: 'Nervous', good: 'Good', flat: 'Flat' };

/** The first question of every debrief: did he try the last thing to try. */
export const TRIED: Record<TriedAnswer, string> = { yes: 'Tried it', partly: 'Partly', no: 'Not this time' };

/** What to say in a debrief, one at a time under the mic. Concrete, never "why am I like this". */
export const PROMPTS = ['What happened, from the start?', 'What is one thing that went well?', 'Where did it stall?', 'What would you try next time?'];

export const BUDGET: Record<Budget, string> = { free: 'Free', low: 'Under ₹500', mid: 'Under ₹1,500' };

export const NEXT_STEPS = ['Send a message', 'Suggest a coffee', 'Say hi next time', 'Wait for a reply'];

/** Respect lines for when the PC has never answered (the server's bank sends its own). */
export const RESPECT_FALLBACK = [
  'Headphones on or deep in work: let it be.',
  'Short answers or looking away mean wrap up kindly and go.',
  'A no is a full answer. Thank them and move on.',
];
