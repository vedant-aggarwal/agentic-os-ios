// Sample records for the `?demo` preview of the Romance page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data with generic first names, nobody's real life. Taps change an in-memory copy, so the preview
// can be used: going out, counting, a debrief read back, a message or ideas suggested, plans and ideas.
// `?demo&aspect=romance&fresh` starts from nothing (every empty state). The phone never loads this file.
import { collection, demoSource, type Doc } from '@/lib/mod';
import { addDays, today } from '@/aspects/kit/time';
import type { Debrief, Follow, IdeaRec, Moment, Outing, Person, Place, Pref, Primer, Review, SharedPlan } from '@/aspects/romance/types';

const R = '/mod/romance';
const day = today();
const d = (n: number) => addDays(day, n);
const at = (dd: string, hm: string) => new Date(`${dd}T${hm}:00+05:30`).toISOString();
const FRESH = typeof location !== 'undefined' && /[?&]fresh(?:[&=]|$)/.test(location.search);

/** The live records of a collection; the preview loads one at once when asked. */
function live<T extends Doc>(mod: string, coll: string): T[] {
  const c = collection<T>(mod, coll);
  if (!c.get()) void c.refresh();
  return (c.get() ?? []).filter((x) => !x.deleted_at);
}

// ── the coaching bank (the same plain lines the PC's bank holds) ──
const PLACE: Record<Place, string> = { cowork: 'Coworking', cafe: 'Cafe', college: 'College', other: 'Elsewhere' };
const OPENERS: Record<Place, { id: string; line: string; when: string }[]> = {
  cowork: [
    { id: 'cw-quiet', line: "Do you know if there's a quieter spot here for calls?", when: 'Someone near the door or the coffee machine.' },
    { id: 'cw-long', line: 'Have you been working out of here long?', when: "When they're taking a break." },
    { id: 'cw-what', line: 'What are you working on today?', when: "When they've looked up from their screen." },
    { id: 'cw-coffee', line: 'Is the coffee here any good, or should I go out?', when: 'At the coffee machine or the kitchen.' },
  ],
  cafe: [
    { id: 'cf-rec', line: 'What would you recommend here?', when: 'In the queue or at the counter.' },
    { id: 'cf-worth', line: "Is that worth ordering? I can't decide.", when: 'When their order arrives near you.' },
    { id: 'cf-book', line: 'Is that book any good?', when: 'Someone reading, between pages.' },
  ],
  college: [
    { id: 'cl-class', line: 'What did you make of that class?', when: 'Walking out of a lecture.' },
    { id: 'cl-assign', line: 'Did you get what they wanted for the assignment?', when: 'After class or in the corridor.' },
    { id: 'cl-society', line: "Are you in any societies? I'm trying to find a good one.", when: 'At an event or in the canteen.' },
  ],
  other: [
    { id: 'ot-first', line: 'Have you been here before?', when: 'Anywhere new to both of you.' },
    { id: 'ot-event', line: 'How are you finding this so far?', when: 'At an event, a workshop or a meetup.' },
    { id: 'ot-food', line: 'Do you know a good place to eat around here?', when: 'Someone who looks like they know the area.' },
  ],
};
const LADDER = [
  { at: 0, text: "When you sit down, say hello to one person near you. That's the whole step." },
  { at: 1, text: 'When someone looks free, ask them one small question about the place.' },
  { at: 3, text: 'When they answer, ask one follow up question about what they said.' },
  { at: 6, text: 'When it starts to feel easy, stay a minute longer, then wrap up kindly.' },
];
const RESPECT = ['Headphones on or deep in work: let it be.', 'Short answers or looking away mean wrap up kindly and go.', 'A no is a full answer. Thank them and move on.'];
const WELL_SAID: Record<string, string> = {
  started: "You started a conversation. That's the rep that counts.", question: 'You asked a question instead of waiting for one.',
  followup: 'You followed up on what they said, which is what keeps a conversation going.', stayed: 'You stayed past the first reply, the hardest part.',
  shared: "You shared something about yourself, so it wasn't an interview.", asked: 'You asked to stay in touch. Asking is the win, whatever the answer.',
  ended: 'You ended it kindly, which leaves the door open.',
};
const TRY_FOR: Record<string, string> = {
  froze: 'When you notice someone free, count down from three and say hello before you start thinking.',
  blank: 'When you run out of things to say, ask about something they just told you.',
  early: 'When it feels like time to leave, ask one more question first.',
  busy: 'Pick moments when people look up or take a break, and let busy people be.',
  noask: "When it's going well, say \"I've enjoyed this. Want to swap numbers?\"",
  talked: 'After you share something, hand it back with a question about them.',
};
const IDEAS = {
  free: [
    { title: 'A walk somewhere green', why: 'Walking side by side makes talking easier than sitting face to face.', cost: 'Free', steps: ['Pick a park you both can reach', 'Suggest a day and a time', 'Have one thing nearby for after, like chai'] },
    { title: 'A bookshop wander', why: 'Books give you both easy things to talk about.', cost: 'Free', steps: ['Pick a bookshop with space to browse', 'Each find one book for the other', 'Keep it to an hour'] },
    { title: 'An open event', why: 'A free talk, market or exhibition gives you something shared to react to.', cost: 'Free', steps: ['Look for something this week', 'Send the link with a day', 'Plan a short stop after to talk'] },
  ],
  low: [
    { title: 'Coffee at a cafe you like', why: 'Short, easy to say yes to, easy to extend if it goes well.', cost: 'About ₹300 each', steps: ["Pick a cafe that's quiet enough to talk", 'Suggest two times', 'Keep the first one under an hour'] },
    { title: 'Street food, two stops', why: 'Moving between stops keeps it light.', cost: 'About ₹200 each', steps: ['Pick two places close together', 'Ask what they like first', 'Go early in the evening'] },
    { title: 'Chai and a walk', why: 'Low pressure and it can end naturally anywhere.', cost: 'Under ₹100', steps: ['Pick a stall near somewhere to walk', 'Suggest a time after class or work', "Let it run as long as it's good"] },
  ],
  mid: [
    { title: 'Lunch somewhere new to both', why: 'Trying something new together gives you a shared first.', cost: 'About ₹600 each', steps: ['Pick a place neither of you has tried', 'Check it takes your budget', 'Suggest a weekend lunch slot'] },
    { title: 'A comedy open mic', why: "Laughing together breaks the ice, and there's lots to talk about after.", cost: 'About ₹400 each', steps: ['Find a show this week', 'Ask before you book', 'Plan a coffee after'] },
    { title: 'An exhibition, then coffee', why: 'Something to look at first, something to talk about after.', cost: 'About ₹500 each', steps: ['Find a current exhibition', 'Suggest a day', 'Pick a cafe nearby for after'] },
  ],
} as const;
const LINES = [
  'Hey, it was really nice talking the other day. Would you like to get a coffee this week?',
  'Hi! I enjoyed our chat the other day. Are you free for a chai sometime this week?',
  "Good to meet you. I'd like to keep the conversation going. Coffee sometime?",
];

/** A plain reading of tapped chips, the way the PC reads one without Nora. */
function readChips(chips: Debrief['chips'], reps: number): Review {
  const well = (chips?.well ?? []).filter((k) => k in WELL_SAID).slice(0, 2).map((k) => WELL_SAID[k]);
  if (!well.length) well.push(reps ? 'You went out and started a conversation. That counts.' : 'You took the time to look back on it, which is how this gets easier.');
  const stuck = (chips?.stuck ?? []).find((k) => k in TRY_FOR);
  return { well, try: { text: stuck ? TRY_FOR[stuck] : LADDER[1].text, why: null }, pattern: null, openers: null, by: 'rules', v: 'sample', at: new Date().toISOString() };
}

// ── the sample week, people, plans and ideas ──
const rep = (dd: string, hm: string, depth: Outing['reps'][number]['depth'] = null) => ({ at: at(dd, hm), depth });
const outings: Outing[] = [
  { id: 'out-s1', day: d(-9), start: at(d(-9), '16:10'), end: at(d(-9), '17:20'), place: 'cafe', primer: { try: LADDER[1].text, opener: 'cf-rec', expect: 'few' }, reps: [rep(d(-9), '16:30', 'hello'), rep(d(-9), '16:55', 'talked')] },
  { id: 'out-s2', day: d(-6), start: at(d(-6), '11:00'), end: at(d(-6), '13:30'), place: 'cowork', primer: { try: TRY_FOR.blank, opener: 'cw-coffee', expect: 'half' }, reps: [rep(d(-6), '11:20', 'hello'), rep(d(-6), '12:05', 'talked'), rep(d(-6), '12:50', 'contact')] },
  { id: 'out-s3', day: d(-2), start: at(d(-2), '10:00'), end: at(d(-2), '12:00'), place: 'college', primer: { try: LADDER[3].text, opener: 'cl-class', expect: null }, reps: [rep(d(-2), '10:40', 'talked'), rep(d(-2), '11:30', 'exit')] },
  { id: `day:${d(-1)}`, day: d(-1), start: null, end: null, place: 'logged', primer: null, reps: [rep(d(-1), '19:15')] },
];
const debriefs: Debrief[] = [
  { id: 'db-s1', day: d(-9), at: at(d(-9), '17:40'), session: 'out-s1', kind: 'chips', chips: { well: ['started', 'question'], stuck: ['blank'], feel: 'nervous' }, text: null, tried: null,
    status: 'reviewed', review: { ...readChips({ well: ['started', 'question'], stuck: ['blank'] }, 2), at: at(d(-9), '17:41') } },
  { id: 'db-s2', day: d(-6), at: at(d(-6), '14:00'), session: 'out-s2', kind: 'voice', chips: null, secs: 64, tried: { answer: 'yes', try: TRY_FOR.blank }, status: 'reviewed',
    transcript: 'Sample transcript. I said hello to two people near the kitchen and asked one of them about her work. It went on for a while and we swapped numbers.',
    review: { well: ['You asked a follow up about their work instead of waiting for one.', 'You asked to stay in touch, and it worked out.'],
      try: { text: LADDER[3].text, why: 'You tried the last two, so this is one step up.' }, pattern: null, openers: null, by: 'ai', v: 'sample', at: at(d(-6), '14:01') } },
  { id: 'db-s3', day: d(-2), at: at(d(-2), '12:20'), session: 'out-s3', kind: 'chips', chips: { well: ['followup', 'ended'], stuck: ['early'], feel: 'calm' }, text: null,
    tried: { answer: 'partly', try: LADDER[3].text }, status: 'reviewed', review: { ...readChips({ well: ['followup', 'ended'], stuck: ['early'] }, 2), at: at(d(-2), '12:21') } },
];
const persons: Person[] = [
  { id: 'rom-riya', name: 'Riya', aspect: 'romance', rel: null, where: 'Coworking', added: d(-6), created_at: at(d(-6), '14:05') },
  { id: 'rom-tara', name: 'Tara', aspect: 'romance', rel: null, where: 'Cafe', added: d(-9), created_at: at(d(-9), '17:45') },
  { id: 'rom-neha', name: 'Neha', aspect: 'romance', rel: null, where: 'College', added: d(-12), created_at: at(d(-12), '18:00') },
  { id: 'rom-anya', name: 'Anya', aspect: 'romance', rel: null, where: 'Coworking', added: d(-1), created_at: at(d(-1), '20:00') },
  { id: 'rom-isha', name: 'Isha', aspect: 'romance', rel: null, where: 'Elsewhere', added: d(-40), created_at: at(d(-40), '18:00') },
];
const follows: Follow[] = [
  { id: 'rom-riya', person: 'rom-riya', met: { day: d(-6), place: 'cowork', session: 'out-s2' }, talked: 'Sample note: a book she was reading, and the playlist at the space.',
    next: { what: 'Suggest a coffee', due: day }, done: [{ what: 'Send a message', at: at(d(-4), '20:10') }],
    line: { options: LINES, by: 'rules', v: 'sample', at: at(d(-4), '20:00') }, ideas: { budget: 'low', items: IDEAS.low.map((x) => ({ ...x, steps: [...x.steps] })), by: 'rules', v: 'sample', at: at(d(-4), '20:00') }, archived: false },
  { id: 'rom-tara', person: 'rom-tara', met: { day: d(-9), place: 'cafe', session: 'out-s1' }, talked: 'Sample note: her course, and a cafe she likes near college.', next: null,
    done: [{ what: 'Send a message', at: at(d(-7), '19:00') }, { what: 'Suggest a coffee', at: at(d(-4), '18:30') }],
    plan: { title: 'Chai and a walk', steps: [{ text: 'Pick a stall near somewhere to walk', done: true }, { text: 'Suggest a time after class', done: true }, { text: "Let it run as long as it's good", done: false }], date: d(3) }, archived: false },
  { id: 'rom-neha', person: 'rom-neha', met: { day: d(-12), place: 'college', session: null }, talked: 'Sample note: a society she runs, and old bookshops.', next: null,
    done: [{ what: 'Send a message', at: at(d(-10), '21:00') }],
    plan: { title: 'A bookshop wander', steps: [{ text: 'Pick a bookshop with space to browse', done: true }, { text: 'Each find one book for the other', done: true }, { text: 'Keep it to an hour', done: true }], date: d(-1) }, archived: false },
  { id: 'rom-isha', person: 'rom-isha', met: { day: d(-40), place: 'other', session: null }, talked: null, next: null, done: [], archived: true },
];
const moments: Moment[] = [
  { id: 'mo-rom-s1', date: d(-2), at: '21:10', people: ['rom-riya'], aspect: 'romance', kind: 'chat', title: 'Sample chat' },
  { id: 'mo-rom-s2', date: d(-3), at: '18:00', people: ['rom-tara'], aspect: 'romance', kind: 'call', title: 'Sample call' },
];
const shared: SharedPlan[] = [
  { id: 'pl-rom-s1', title: 'Open mic night', people: ['rom-riya'], aspect: 'romance', date: d(6), slot: 'evening', state: 'tentative' },
];
const ideas: IdeaRec[] = [
  { id: 'id-rom-s1', person: null, aspect: 'romance', kind: 'plan', title: 'The new bookshop cafe near the metro', from: null, done: false, by: 'you', created_at: at(d(-3), '22:00') },
  { id: 'id-rom-s2', person: 'rom-riya', aspect: 'romance', kind: 'plan', title: 'Ask about the book she was reading', from: 'Sample: she was halfway through a novel', done: false, by: 'you', created_at: at(d(-5), '22:00') },
  { id: 'id-rom-s3', person: null, aspect: 'romance', kind: 'plan', title: 'A free gallery walk on a weekend', from: null, done: false, by: 'you', created_at: at(d(-8), '22:00') },
  { id: 'id-rom-s4', person: 'rom-tara', aspect: 'romance', kind: 'plan', title: 'Street food, two stops', from: null, done: true, done_on: d(-6), by: 'you', created_at: at(d(-14), '22:00') },
];
const prefs: Pref[] = [
  { id: 'target', per_week: 4 },
  { id: 'looking', text: 'Sample note: someone easy to talk to, who likes long walks and books.' },
];

const COLLECTIONS: Record<string, Doc[]> = FRESH ? {} : {
  'romance/sessions': outings, 'romance/debriefs': debriefs, 'romance/follow': follows, 'romance/prefs': prefs,
  'people/persons': persons, 'people/moments': moments, 'people/plans': shared, 'people/ideas': ideas,
};
// The app warms these at start (src/aspects/warm.ts), before this file runs: those collections are already loaded,
// empty, so the samples go into them directly.
for (const [key, docs] of Object.entries(COLLECTIONS)) {
  const [mod, coll] = key.split('/');
  const c = collection<Doc>(mod, coll);
  const have = c.get();
  if (have) for (const x of docs) if (!have.some((y) => y.id === x.id)) void c.put(x);
}

// ── what the PC works out ──
function primer(): Primer {
  const outs = live<Outing>('romance', 'sessions');
  const total = outs.reduce((n, o) => n + (o.reps?.length ?? 0), 0);
  const read = live<Debrief>('romance', 'debriefs').filter((x) => x.review).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
  let step = 0;
  LADDER.forEach((s, k) => { if (total >= s.at) step = k; });
  const lastPlace = outs.filter((o) => o.place !== 'logged').sort((a, b) => String(b.start).localeCompare(String(a.start)))[0]?.place;
  const turn = Number(day.replaceAll('-', ''));
  const openers = Object.fromEntries((Object.keys(OPENERS) as Place[]).map((p) => {
    const bank = OPENERS[p];
    const k = turn % bank.length;
    return [p, [...bank.slice(k), ...bank.slice(0, k)].map((o) => ({ ...o, by: 'bank' as const }))];
  })) as Primer['openers'];
  return {
    day, total,
    try: read?.review ? { text: read.review.try.text, why: read.review.try.why, from: 'debrief', debrief: read.id, day: read.day, by: read.review.by }
      : { text: LADDER[step].text, why: null, from: 'ladder', step, of: LADDER.length },
    openers, places: (Object.keys(PLACE) as Place[]).map((k) => ({ key: k, label: PLACE[k] })),
    last_place: lastPlace && lastPlace !== 'logged' ? lastPlace : null, respect: RESPECT,
  };
}

/** A debrief saved on the PC: tapped ones are read back in a moment, recorded ones written down first. */
function land(x: Debrief) {
  const c = collection<Debrief>('romance', 'debriefs');
  void c.put(x);
  if (x.review || x.status === 'failed') return;
  const reps = live<Outing>('romance', 'sessions').find((o) => o.id === x.session)?.reps.length ?? 0;
  if (x.kind === 'voice') {
    setTimeout(() => { void c.put({ ...x, status: 'reviewing', transcript: 'Sample transcript. I said hello to one person and asked about the place. I left a bit early.' }); }, 1400);
    setTimeout(() => { void c.put({ ...x, status: 'reviewed', transcript: 'Sample transcript. I said hello to one person and asked about the place. I left a bit early.', review: readChips({ stuck: ['early'] }, reps) }); }, 2800);
    return;
  }
  setTimeout(() => { void c.put({ ...x, status: 'reviewed', review: readChips(x.chips, reps) }); }, 1600);
}

demoSource({
  collections: COLLECTIONS,
  gets: {
    [`${R}/primer`]: () => primer(),
  },
  calls: {
    // the phone's outbox: outings and debriefs, sent as whole records
    [`${R}/sessions/*`]: (body: Outing, info) => {
      const c = collection<Outing>('romance', 'sessions');
      const id = decodeURIComponent(info.path.split('/').pop() ?? '');
      if (info.method === 'DELETE') { void c.remove(id); return { item: { id } }; }
      void c.put(body);
      return { item: body };
    },
    [`${R}/debriefs/*`]: (body: unknown, info) => {
      const c = collection<Debrief>('romance', 'debriefs');
      const parts = info.path.split('/');
      if (info.method === 'UPLOAD') { // a recording: /debriefs/audio?id=&secs=&day=&at=&session=&tried=
        const q = info.query;
        const x: Debrief = { id: q.get('id') ?? `db_${Date.now()}`, day: q.get('day') ?? day, at: q.get('at') ?? new Date().toISOString(), session: q.get('session'),
          kind: 'voice', chips: null, secs: Number(q.get('secs')) || null, status: 'transcribing',
          tried: q.get('tried') ? { answer: q.get('tried') as 'yes', try: q.get('tried_try') } : null };
        land(x);
        return { item: x };
      }
      if (parts.at(-1) === 'review') { // try a failed one again
        const x = c.get()?.find((y) => y.id === decodeURIComponent(parts.at(-2) ?? ''));
        if (x) land({ ...x, status: 'saved', review: null, failed_step: null, error: null });
        return { ok: true };
      }
      const id = decodeURIComponent(parts.at(-1) ?? '');
      if (info.method === 'DELETE') { void c.remove(id); return { item: { id } }; }
      land(body as Debrief);
      return { item: body };
    },
    // a message he could send, and ideas to meet up, written onto the person's record
    [`${R}/follow/*`]: (body: { budget?: keyof typeof IDEAS }, info) => {
      const parts = info.path.split('/');
      const kind = parts.at(-1);
      const id = decodeURIComponent(parts.at(-2) ?? '');
      const c = collection<Follow>('romance', 'follow');
      const cur = c.get()?.find((f) => f.id === id) ?? { id, person: id, done: [], archived: false };
      const stamp = new Date().toISOString();
      const next: Follow = kind === 'line'
        ? { ...cur, line: { options: [...LINES].sort(() => Math.random() - 0.5), by: 'rules', v: 'sample', at: stamp } }
        : { ...cur, ideas: { budget: body.budget ?? 'low', items: IDEAS[body.budget ?? 'low'].map((x) => ({ ...x, steps: [...x.steps] })), by: 'rules', v: 'sample', at: stamp } };
      void c.put(next);
      return { follow: next };
    },
  },
});
