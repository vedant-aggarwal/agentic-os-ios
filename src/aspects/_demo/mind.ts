// Sample records for the `?demo` preview of the Mind page (dev web only; see src/lib/mod.ts demoSource).
// Invented sample data: made up books and authors, a made up course, generic speaking topics and takes. Nobody's real
// reading. Taps change an in-memory copy (and the mind/sessions and mind/highlights collections), so it can be used.
import { collection, demoSource, newId, type Doc } from '@/lib/mod';
import { addDays, myDay, weekStart } from '@/aspects/kit/time';
import type {
  Book, CourseView, DimKey, Drill, HomeView, Learned, Lesson, Pace, ReadView, Review, Shelf, SpeakView, Take, TakeLite, Topic, TopicKind,
} from '@/aspects/mind/types';

const day = myDay();
const mon = weekStart(day);
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00+05:30`).toISOString();
const between = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const fail = (msg: string) => { throw new Error(msg); };

// ── books, sittings and the lines that stuck ──
type BookRec = Omit<Book, 'takeaways'> & { gone?: boolean };
const books: BookRec[] = [
  { id: 'mb-1', title: 'The Long Game of Small Things', author: 'Mara Ellison', pages: 312, page: 148, status: 'reading', cover: null, started: addDays(day, -19), finished: null, sitting_since: null, summary: null },
  { id: 'mb-2', title: 'A Field Guide to Attention', author: 'Lena Okafor', pages: 240, page: 61, status: 'paused', cover: null, started: addDays(day, -44), finished: null, sitting_since: null, summary: null },
  { id: 'mb-3', title: 'Thinking in Drafts', author: 'Owen Hart', pages: 198, page: 0, status: 'next', cover: null, started: null, finished: null, sitting_since: null, summary: null },
  { id: 'mb-4', title: 'How Ideas Travel', author: 'Sam Reyes', pages: 276, page: 0, status: 'next', cover: null, started: null, finished: null, sitting_since: null, summary: null },
  { id: 'mb-5', title: 'Notes on Craft', author: 'Ruth Calder', pages: 220, page: 220, status: 'done', cover: null, started: addDays(day, -62), finished: addDays(day, -24),
    sitting_since: null, summary: { text: 'Good work comes from many small drafts, each judged against a standard written down first. Show work early, and cut whatever does not serve the reader.', v: '1', at: at(addDays(day, -23), '21:10'), from: 2 } },
  { id: 'mb-6', title: 'The Clear Speaker', author: 'Jo Banner', pages: 184, page: 184, status: 'done', cover: null, started: addDays(day, -96), finished: addDays(day, -66), sitting_since: null, summary: null },
];
const bookOf = (id: string) => books.find((b) => b.id === id && !b.gone) ?? fail('No such book.');

type Session = Doc & { kind: 'reading' | 'lesson'; book?: string | null; lesson?: string | null; date: string; minutes: number; from_page?: number | null; to_page?: number | null };
const read1 = (n: number, date: string, minutes: number, from: number, to: number, book = 'mb-1'): Session =>
  ({ id: `ms-${n}`, kind: 'reading', book, date, minutes, from_page: from, to_page: to, created_at: at(date, '22:00'), updated_at: at(date, '22:00') });
const sessionSeed: Session[] = [
  read1(1, addDays(day, -15), 20, 52, 66), read1(2, addDays(day, -13), 25, 66, 84), read1(3, addDays(day, -11), 30, 84, 102),
  read1(4, addDays(day, -8), 15, 102, 110), read1(5, addDays(day, -6), 28, 110, 124), read1(6, addDays(day, -4), 18, 124, 131),
  read1(7, addDays(mon, 0) < day ? mon : addDays(day, -3), 22, 131, 140), read1(8, addDays(day, -1), 26, 140, 148),
];
// Today (the app's home) opens mind/sessions before this file loads, so the samples may need adding to it.
const seeded = collection<Session>('mind', 'sessions');
if (seeded.get() && !seeded.get()!.some((x) => x.id === 'ms-1')) for (const x of sessionSeed) void seeded.put(x);
const sessions = () => {
  const c = collection<Session>('mind', 'sessions');
  void c.refresh();
  return c.get() ?? [];
};

type Highlight = Doc & { book: string; kind: string; text: string; page: number | null; day: string };
const hl = (id: string, book: string, text: string, page: number, d: string): Highlight =>
  ({ id, book, kind: 'takeaway', text, page, day: d, created_at: at(d, '22:05'), updated_at: at(d, '22:05') });
const highlightSeed: Highlight[] = [
  hl('hl-1', 'mb-1', 'Make the first step so small it feels silly to skip. Grow it only once showing up is automatic.', 146, addDays(day, -1)),
  hl('hl-2', 'mb-1', 'A plan you can keep on a bad day beats a perfect plan you keep on good days.', 118, addDays(day, -6)),
  hl('hl-3', 'mb-2', 'Attention is trained by coming back, not by never drifting.', 44, addDays(day, -31)),
  hl('hl-4', 'mb-5', 'Write the standard down before you judge a draft.', 88, addDays(day, -40)),
];
const takeaways = () => {
  const c = collection<Highlight>('mind', 'highlights');
  void c.refresh();
  return (c.get() ?? []).filter((h) => h.kind === 'takeaway').sort((x, y) => String(y.day).localeCompare(String(x.day)) || String(y.created_at).localeCompare(String(x.created_at)));
};

type Q = { id: string; q: string; book: string; step: number; expected: string; due: string; takeaway: string | null };
const recall: Q[] = [
  { id: 'rc-1', q: 'Why should the first step of a new habit feel almost too small?', book: 'mb-1', step: 1, due: day, takeaway: 'hl-1',
    expected: 'Because starting is the hard part. A tiny step gets you showing up every day, and you grow it once showing up is automatic.' },
  { id: 'rc-2', q: 'What makes a plan worth keeping, by the measure in this book?', book: 'mb-1', step: 0, due: day, takeaway: 'hl-2',
    expected: 'That you can still keep it on a bad day. A modest plan kept every day beats a perfect one kept only on good days.' },
  { id: 'rc-3', q: 'What trains attention, according to the field guide?', book: 'mb-2', step: 2, due: day, takeaway: 'hl-3',
    expected: 'Noticing the drift and coming back without blame. Each return makes the next one quicker.' },
  { id: 'rc-4', q: 'When should the standard for a draft be written down?', book: 'mb-5', step: 3, due: addDays(day, 4), takeaway: 'hl-4',
    expected: 'Before judging the draft, so the judgement is against the standard and not against a mood.' },
];
const STEPS = [2, 4, 8, 16, 32];

function paceOf(b: BookRec): Pace {
  const mine = sessions().filter((s) => s.kind === 'reading' && s.book === b.id).sort((x, y) => x.date.localeCompare(y.date));
  const recent = mine.filter((s) => s.date >= addDays(day, -13));
  const pages = recent.reduce((n, s) => n + Math.max(0, (s.to_page ?? 0) - (s.from_page ?? 0)), 0);
  const minutes = recent.reduce((n, s) => n + s.minutes, 0);
  const last = mine.at(-1)?.date ?? null;
  const idle = last ? between(last, day) : null;
  const ppd = Math.round((pages / 14) * 10) / 10;
  const left = b.pages ? Math.max(0, b.pages - b.page) : null;
  const finish = left != null && ppd > 0 && recent.length >= 2 ? addDays(day, Math.ceil(left / ppd)) : null;
  const why = finish ? null : recent.length < 2 ? 'A finish date shows after two sittings.' : null;
  return { sittings: mine.length, recent: recent.length, pages, minutes, ppd, left, last, idle, finish, why };
}

function readView(): ReadView {
  const tk = takeaways();
  const live = books.filter((b) => !b.gone);
  const titleOf = new Map(live.map((b) => [b.id, b.title]));
  const plain = (b: BookRec): Book => ({ ...b, takeaways: tk.filter((h) => h.book === b.id).length });
  const due = recall.filter((q) => q.due <= day && titleOf.has(q.book));
  const waiting = recall.filter((q) => q.due > day).map((q) => q.due).sort();
  return {
    day,
    reading: live.filter((b) => b.status === 'reading').map((b) => ({ ...plain(b), pace: paceOf(b) })),
    paused: live.filter((b) => b.status === 'paused').map(plain),
    next: live.filter((b) => b.status === 'next').map(plain),
    done: live.filter((b) => b.status === 'done').sort((x, y) => String(y.finished).localeCompare(String(x.finished))).map(plain),
    takeaways: tk.slice(0, 12).map((h) => ({ id: h.id, book: h.book, title: titleOf.get(h.book) ?? null, text: h.text, page: h.page ?? null, day: h.day })),
    recall: { due: due.map((q) => ({ id: q.id, q: q.q, book: q.book, title: titleOf.get(q.book) ?? null, step: q.step, expected: q.expected })), total: recall.length, next: waiting[0] ?? null },
    total: live.length,
  };
}

// ── the course ──
type LessonRec = Lesson & { course: string };
const LESSONS: [string, string, string | null, string | null][] = [
  ['Why structure beats charisma', '9:40', 'A clear order makes an average speaker easy to follow.', null],
  ['One point, said plainly', '11:15', null, null],
  ['Point, reason, example, point', '12:30', null, null],
  ['Openings that earn attention', '10:05', null, null],
  ['Pausing instead of filler words', '8:50', 'Silence reads as confidence; a filler word reads as searching.', 'Record one minute on any topic and count your fillers, then do it again pausing instead.'],
  ['Landing the ending', '9:20', null, null],
  ['Telling a short story', '14:10', null, null],
  ['Answering on the spot', '12:00', null, null],
  ['Speaking from notes, not a script', '10:40', null, null],
  ['Handling a hard question', '11:30', null, null],
  ['Pace, volume and emphasis', '9:55', null, null],
  ['A five minute talk, start to finish', '16:20', null, null],
];
const lessons: LessonRec[] = LESSONS.map(([title, duration, why, practice], n) => ({
  id: `ml-${n + 1}`, course: 'mc-1', n, title, duration, url: null, why, watch: n === 4 ? 'How long the speaker waits before a key line, and where the pauses fall.' : null,
  practice, done_when: n === 4 ? 'You can say a minute with two fillers or fewer.' : null,
  status: n < 4 ? 'done' : 'todo', done_at: n < 4 ? at(addDays(day, [-20, -13, -9, -3][n]), '20:30') : null, made: null,
}));
const shelves: (Shelf & { started_at?: string | null })[] = [
  { id: 'mc-1', title: 'Public speaking basics', kind: 'course', status: 'active', lessons: 12, done: 4, parked_at: null, park_reason: null, rank: 1, from: null, started_at: addDays(day, -21) },
  { id: 'mc-2', title: 'Writing for the web', kind: 'course', status: 'parked', lessons: 9, done: 3, parked_at: addDays(day, -30), park_reason: 'Wanted to finish speaking first', rank: 2, from: null },
  { id: 'mc-3', title: 'Intro to statistics', kind: 'course', status: 'parked', lessons: 16, done: 0, parked_at: addDays(day, -12), park_reason: null, rank: 3, from: null },
  { id: 'mc-4', title: 'Design talks', kind: 'library', status: 'library', lessons: 24, done: 6, parked_at: null, park_reason: null, rank: null, from: null },
  { id: 'mc-5', title: 'Spreadsheet skills', kind: 'course', status: 'done', lessons: 8, done: 8, parked_at: null, park_reason: null, rank: null, from: null },
];
const counted = (c: Shelf): Shelf => {
  const ls = lessons.filter((l) => l.course === c.id);
  return ls.length ? { ...c, lessons: ls.length, done: ls.filter((l) => l.status === 'done').length } : c;
};
const secsOf = (d: string | null) => { if (!d) return 0; const [m, s] = d.split(':').map(Number); return m * 60 + (s || 0); };

function courseView(): CourseView {
  const act = shelves.find((c) => c.status === 'active') ?? null;
  let active: CourseView['active'] = null;
  if (act) {
    const ls = lessons.filter((l) => l.course === act.id).sort((x, y) => x.n - y.n);
    const left = ls.filter((l) => l.status !== 'done');
    const done = ls.filter((l) => l.status === 'done');
    const recent = done.filter((l) => l.done_at && myDay(l.done_at) >= addDays(day, -28));
    const first = recent.map((l) => myDay(l.done_at!)).sort()[0] ?? null;
    const span = first ? Math.max(7, between(first, day) + 1) : 0;
    const perWeek = span ? Math.round((recent.length / span) * 70) / 10 : 0;
    const last = done.map((l) => l.done_at).filter(Boolean).sort().at(-1) ?? null;
    const idle = last ? between(myDay(last), day) : null;
    const finish = left.length && recent.length >= 2 && perWeek > 0 ? addDays(day, Math.ceil((left.length / perWeek) * 7)) : null;
    const plainLesson = ({ course: _c, ...l }: LessonRec): Lesson => l;
    active = {
      ...counted(act), started_at: act.started_at ?? null, practice: null, next: left[0] ? plainLesson(left[0]) : null, list: ls.map(plainLesson), left: left.length,
      minutes_left: Math.round(left.reduce((n, l) => n + secsOf(l.duration), 0) / 60), minutes_known: left.every((l) => !!l.duration),
      pace: { per_week: perWeek, recent: recent.length, last, idle }, finish, why: left.length ? (finish ? null : 'A finish date shows after two lessons.') : 'Every lesson is done.',
      today: done.filter((l) => l.done_at && myDay(l.done_at) === day).map((l) => l.id),
    };
  }
  return {
    day, active,
    parked: shelves.filter((c) => c.status === 'parked').map(counted),
    libraries: shelves.filter((c) => c.kind === 'library').map(counted),
    done: shelves.filter((c) => c.status === 'done').map(counted),
    total: shelves.length, lessons: lessons.length,
  };
}

// ── speaking: topics, drills, takes ──
const LABEL: Record<TopicKind, string> = { opinion: 'Take a side', explain: 'Explain it simply', story: 'Tell a story', persuade: 'Persuade', think: 'Think on your feet' };
const TOPICS: Omit<Topic, 'label'>[] = [
  { id: 'ai-1', kind: 'explain', text: 'Explain why small steps done daily beat big pushes done rarely.', by: 'ai', from: { kind: 'takeaway', id: 'hl-2', title: 'The Long Game of Small Things' } },
  { id: 'o1', kind: 'opinion', text: 'Is it better to be early or to be right?', by: 'bank', from: null },
  { id: 's1', kind: 'story', text: 'A plan that fell apart, and what you did next.', by: 'bank', from: null },
  { id: 'p1', kind: 'persuade', text: 'Persuade a friend to read for ten minutes every night.', by: 'bank', from: null },
  { id: 't1', kind: 'think', text: 'If you could teach everyone one skill, which would it be?', by: 'bank', from: null },
];
const topicAt = (i: number): Topic => { const x = TOPICS[i % TOPICS.length]; return { ...x, label: LABEL[x.kind] }; };

const DRILLS: Omit<Drill, 'done' | 'prompt'>[] = [
  { id: 'prep', name: 'Point, reason, example, point', steps: ['Point', 'Reason', 'Example', 'Point'],
    lines: ['Say your point in one sentence, then why you think so.', 'Give one real example, then land the point again in new words.'],
    prompts: ['Should meetings have a time limit?', 'Is it worth learning to type fast?', 'Is it better to rent or to buy where you live?'] },
  { id: 'wsn', name: 'What, so what, now what', steps: ['What', 'So what', 'Now what'],
    lines: ['Say what happened or what the thing is, plainly.', 'Say why it matters, then what should happen next.'],
    prompts: ['A tool you use every day just got twice as expensive.', 'Half your class failed the last test.'] },
  { id: 'sar', name: 'Situation, action, result', steps: ['Situation', 'Action', 'Result'],
    lines: ['Set the scene in two sentences: where, who, what was at stake.', 'Say what you did, step by step, then what changed because of it.'],
    prompts: ['A time you fixed something nobody asked you to fix.', 'A time you had to learn something in one day.'] },
  { id: 'beginner', name: 'Explain it to a beginner', steps: ['Picture', 'Example', 'Check'],
    lines: ['Start with one picture they already know.', 'Give one example, then check it with one question to them.'],
    prompts: ['What a website domain is.', 'Why we have time zones.'] },
];
const DIMS: { key: DimKey; name: string; weight: number; ask: string }[] = [
  { key: 'structure', name: 'Structure', weight: 0.25, ask: 'Does it open with a point, back it up, and land it?' },
  { key: 'clarity', name: 'Clarity', weight: 0.25, ask: 'Could a listener repeat the main point after one hearing?' },
  { key: 'focus', name: 'On topic', weight: 0.15, ask: 'Does every part serve the prompt?' },
  { key: 'words', name: 'Word choice', weight: 0.15, ask: 'Precise, varied, concrete words?' },
  { key: 'economy', name: 'Economy', weight: 0.1, ask: 'Is the length right for the point made?' },
  { key: 'fillers', name: 'Fillers', weight: 0.1, ask: 'How few filler words?' },
];

type TakeRec = Take & { gone?: boolean; made_at?: number };
const review = (overall: number, fpm: number, s: number[], extra: Partial<Review> = {}): Review => ({
  rubric: 'speak-1', v: '1', model: 'sample', at: new Date().toISOString(), overall,
  scores: { structure: s[0], clarity: s[1], focus: s[2], words: s[3], economy: s[4], fillers: s[5] },
  notes: {
    structure: 'You opened with the point and came back to it at the end.', clarity: 'The main idea was easy to repeat after one listen.',
    focus: 'Stayed on the question nearly the whole way.', words: 'A few vague words, like thing and stuff, carried some sentences.',
    economy: 'One restart in the middle; otherwise every sentence added something.', fillers: 'Fillers clustered where you were looking for the example.',
  },
  fillers: [{ word: 'um', count: Math.max(1, Math.round(fpm)) }, { word: 'like', count: Math.max(0, Math.round(fpm / 2)) }].filter((f) => f.count > 0),
  fillers_total: Math.round(fpm * 1.2), fpm,
  strongest: 'If it only works on a good day, it is not a plan, it is a hope.',
  fix: 'Pause for a breath before your example instead of filling the gap.',
  rewrite: 'Small steps win because you can take them on a bad day. A big push needs energy you will not always have. So pick a step small enough to keep, and let the days add up.',
  grasp: null, pattern: null, ...extra,
});
const take = (n: number, d: string, topic: Topic, overall: number, fpm: number, s: number[], secs: number): TakeRec => ({
  id: `mt-${n}`, day: d, at: at(d, '19:40'), kind: 'impromptu', topic: topic.text, topic_label: topic.label, status: 'reviewed', failed_step: null, error: null,
  secs, overall, source: null, drill: null, updated_at: at(d, '19:42'),
  transcript: 'So I think the answer is that being right matters more, but only if you are not so late that nobody is listening any more. Um, for example, at school the person who answered first got the credit even when the second answer was better. So my point is, be right, but be right on time.',
  review: review(overall, fpm, s), file: null, mime: null, bytes: 0, words: Math.round(secs * 2.3), topic_kind: topic.kind,
});
const takes: TakeRec[] = [
  take(1, addDays(day, -13), topicAt(1), 58, 6.2, [55, 60, 66, 54, 52, 48], 71),
  take(2, addDays(day, -11), topicAt(2), 61, 5.6, [60, 62, 68, 55, 56, 52], 84),
  take(3, addDays(day, -9), topicAt(3), 60, 5.8, [58, 63, 64, 56, 55, 50], 66),
  take(4, addDays(day, -6), topicAt(4), 66, 4.4, [66, 68, 70, 60, 61, 60], 92),
  take(5, addDays(day, -4), topicAt(1), 69, 3.9, [70, 71, 72, 63, 64, 64], 78),
  take(6, mon < day ? mon : addDays(day, -2), topicAt(2), 72, 3.1, [74, 73, 76, 66, 66, 70], 88),
];
const lite = (t: TakeRec): TakeLite => ({
  id: t.id, day: t.day, at: t.at, kind: t.kind, topic: t.topic, topic_label: t.topic_label, status: t.status, failed_step: t.failed_step, error: t.error,
  secs: t.secs, overall: t.review?.overall ?? null, source: t.source, drill: t.drill, updated_at: t.updated_at,
});
// a take sent in the preview: written down after three seconds, reviewed after eight
function settle(t: TakeRec) {
  if (!t.made_at || t.status === 'reviewed') return t;
  const s = (Date.now() - t.made_at) / 1000;
  if (s > 8) {
    const r = review(74, 2.6, [76, 75, 78, 68, 70, 72], t.kind === 'learned' ? { grasp: { score: 78, note: 'You explained the idea in your own words and gave a fair example.' } } : {});
    Object.assign(t, { status: 'reviewed', review: r, overall: r.overall, transcript: 'A take recorded in the sample preview. Nothing was sent anywhere.', updated_at: new Date().toISOString() });
  } else if (s > 3) Object.assign(t, { status: 'reviewing', transcript: 'A take recorded in the sample preview. Nothing was sent anywhere.' });
  return t;
}
const liveTakes = () => takes.filter((t) => !t.gone).map(settle).sort((x, y) => y.at.localeCompare(x.at));
const st = { topic: 0 };

function weekInputs() {
  const tk = takeaways().filter((h) => h.day >= mon && h.day <= day).map((h) => ({ kind: 'takeaway' as const, id: h.id, title: bookOf(h.book).title, text: h.text, day: h.day }));
  const ls = lessons.filter((l) => l.done_at && myDay(l.done_at) >= mon).map((l) => ({ kind: 'lesson' as const, id: l.id, title: l.title, text: null, day: myDay(l.done_at!) }));
  return [...tk, ...ls].sort((x, y) => y.day.localeCompare(x.day));
}
function learnedPrompts(): Learned[] {
  const spoken = new Set(takes.filter((t) => !t.gone && t.source?.id).map((t) => t.source!.id));
  return weekInputs().filter((x) => !spoken.has(x.id)).slice(0, 2).map((x) => ({
    text: x.kind === 'lesson' ? `Explain the lesson “${x.title}” to a friend who hasn't seen it.` : `Say more about what stuck from ${x.title}.`,
    line: x.kind === 'takeaway' ? x.text : null, source: { kind: x.kind, id: x.id, title: x.title }, day: x.day,
  }));
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null);

function speakView(): SpeakView {
  const all = liveTakes();
  const done = all.filter((t) => t.status === 'reviewed' && t.review).reverse();
  const last = done.slice(-5), before = done.slice(-10, -5);
  return {
    day, topic: topicAt(st.topic), learned: learnedPrompts(),
    drills: DRILLS.map((d) => { const n = all.filter((t) => t.drill === d.id).length; return { ...d, done: n, prompt: d.prompts[n % d.prompts.length] }; }),
    progress: {
      rubric: 'speak-1', takes: all.length, reviewed: done.length, days_this_week: new Set(all.filter((t) => t.day >= mon && t.day <= day).map((t) => t.day)).size,
      dims: DIMS.map((d) => ({ key: d.key, name: d.name, now: avg(last.map((t) => t.review!.scores[d.key])), before: avg(before.map((t) => t.review!.scores[d.key])) })),
      trend: done.slice(-12).map((t) => ({ id: t.id, day: t.day, overall: t.review!.overall, fpm: t.review!.fpm })),
    },
    takes: all.slice(0, 40).map(lite),
    pending: all.filter((t) => t.status === 'transcribing' || t.status === 'reviewing').map(lite),
    rubric: { v: 'speak-1', dims: DIMS },
  };
}

function homeView(): HomeView {
  const sp = speakView();
  const cv = courseView();
  const rv = readView();
  const ses = sessions();
  const all = liveTakes();
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map((d) => {
    const s = ses.filter((x) => x.date === d);
    const lessonsDone = lessons.filter((l) => l.done_at && myDay(l.done_at) === d).length;
    const said = all.filter((t) => t.day === d).length;
    const read = Math.round(s.filter((x) => x.kind === 'reading').reduce((n, x) => n + x.minutes, 0));
    return { date: d, future: d > day, read, lessons: lessonsDone, learned: read > 0 || lessonsDone > 0, said };
  });
  const a = cv.active;
  const b = rv.reading[0] ?? null;
  const todayIn = days.find((d) => d.date === day)!;
  const lastTake = all.find((t) => t.status === 'reviewed') ?? null;
  return {
    day,
    learn: {
      course: a ? { id: a.id, title: a.title, lessons: a.lessons, done: a.done, next: a.next ? { id: a.next.id, title: a.next.title, n: a.lessons - a.left + 1, duration: a.next.duration, url: a.next.url } : null, today: a.today } : null,
      book: b ? { id: b.id, title: b.title, author: b.author, page: b.page, pages: b.pages, cover: b.cover, sitting_since: b.sitting_since, last: b.pace.last, idle: b.pace.idle } : null,
      today: { read: todayIn.read, lessons: todayIn.lessons, ticked: false }, courses: cv.total, books: rv.total,
    },
    say: { topic: sp.topic, learned: sp.learned[0] ?? null, today: all.filter((t) => t.day === day).map(lite), ticked: false },
    week: { from: mon, days, learned: days.filter((d) => d.learned).length, said: days.filter((d) => d.said > 0).length, both: days.filter((d) => d.learned && d.said > 0).length },
    sharper: { trend: sp.progress.trend, reviewed: sp.progress.reviewed, takes: sp.progress.takes, last: lastTake ? lite(lastTake) : null },
    recall: { due: rv.recall.due.length },
    pending: sp.pending,
  };
}

// ── a made up catalogue for Add a book ──
const CATALOGUE = [
  { title: 'The Patient Builder', author: 'Iris Moreau', pages: 264, year: 2019 },
  { title: 'Small Rooms, Big Ideas', author: 'Theo Lindqvist', pages: 212, year: 2021 },
  { title: 'The Habit Ledger', author: 'Nadia Brook', pages: 288, year: 2018 },
  { title: 'Speaking Without Notes', author: 'Carl Avery', pages: 176, year: 2022 },
  { title: 'A Short Course in Thinking', author: 'Hana Ito', pages: 230, year: 2017 },
];

// overlap between his answer and the expected one, as the preview's stand in for the check on the PC
function verdictOf(answer: string, expected: string): 'got' | 'partly' | 'missed' {
  const words = (x: string) => new Set(x.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const e = words(expected), got = [...words(answer)].filter((w) => e.has(w)).length;
  const share = e.size ? got / e.size : 0;
  return share >= 0.3 ? 'got' : share >= 0.12 ? 'partly' : 'missed';
}
const NOTE = { got: 'You had the main idea and said why it works.', partly: 'You had the idea but not why it works.', missed: 'That one slipped. Read the answer once, it comes back in two days.' };

demoSource({
  collections: { 'mind/sessions': sessionSeed, 'mind/highlights': highlightSeed },
  gets: {
    '/mod/mind/home': () => homeView(),
    '/mod/mind/read': () => readView(),
    '/mod/mind/course': () => courseView(),
    '/mod/mind/speak': () => speakView(),
    '/mod/mind/takes/*': (path: string) => {
      const id = path.split('?')[0].split('/')[4];
      const t = takes.find((x) => x.id === id && !x.gone) ?? fail('No such take.');
      return { item: settle(t) };
    },
    '/mod/mind/book-search': (_p: string, q: URLSearchParams) => {
      const s = (q.get('q') ?? '').toLowerCase();
      const hits = CATALOGUE.filter((b) => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s));
      return { items: hits.map((b) => ({ ...b, cover: null, isbn: null })) };
    },
  },
  calls: {
    '/mod/mind/read/*': (body: Record<string, unknown>, info) => {
      const what = info.path.split('/').at(-1);
      if (what === 'add') {
        const title = String(body.title ?? '').trim() || fail('A book needs a title.');
        const already = books.find((b) => !b.gone && b.title.toLowerCase() === title.toLowerCase());
        if (already) return { book: already, already: true };
        const status = (['reading', 'next', 'paused'].includes(String(body.status)) ? body.status : 'next') as Book['status'];
        const b: BookRec = { id: newId('mb'), title, author: (body.author as string) ?? null, pages: Number(body.pages) > 0 ? Number(body.pages) : null, page: 0, status,
          cover: null, started: status === 'reading' ? day : null, finished: null, sitting_since: null, summary: null };
        books.push(b);
        return { book: b, already: false };
      }
      const b = bookOf(String(body.book ?? ''));
      if (what === 'start') { Object.assign(b, { sitting_since: b.sitting_since ?? new Date(Date.now() - 60000 * 21).toISOString(), status: b.status === 'done' ? 'done' : 'reading', started: b.started ?? day }); return { book: b }; }
      if (what === 'cancel') { b.sitting_since = null; return { book: b }; }
      if (what === 'finish') { Object.assign(b, { status: 'done', finished: b.finished ?? day, page: b.pages ?? b.page, sitting_since: null }); return { book: b }; }
      if (what === 'remove') { b.gone = true; return { book: b }; }
      if (what === 'restore') { const g = books.find((x) => x.id === body.book); if (g) g.gone = false; return { book: g }; }
      if (what === 'summary') {
        const lines = takeaways().filter((h) => h.book === b.id);
        if (!lines.length) fail('Save a line or two from this book first.');
        b.summary = { text: lines.map((h) => h.text).join(' '), v: '1', at: new Date().toISOString(), from: lines.length };
        return { book: b };
      }
      if (what === 'edit') {
        if (body.pages != null) b.pages = Number(body.pages) > 0 ? Math.round(Number(body.pages)) : null;
        if (body.page != null) b.page = Math.max(0, Math.round(Number(body.page)));
        if (body.status != null) {
          const s = String(body.status);
          if (!['reading', 'paused', 'next'].includes(s)) fail('status is reading, paused or next; finishing has its own route.');
          b.status = s as Book['status'];
          if (s === 'reading') b.started = b.started ?? day;
        }
        return { book: b };
      }
      if (what === 'sitting') {
        const timed = b.sitting_since ? Math.max(1, Math.round((Date.now() - Date.parse(b.sitting_since)) / 60000)) : null;
        const minutes = Number(body.minutes) > 0 ? Math.round(Number(body.minutes)) : timed ?? 0;
        const to = body.to_page != null ? Math.max(0, Math.round(Number(body.to_page))) : b.page;
        const session: Session = { id: newId('ms'), kind: 'reading', book: b.id, date: day, minutes, from_page: b.page, to_page: to };
        void collection<Session>('mind', 'sessions').put(session);
        b.page = b.pages ? Math.min(b.pages, to) : to;
        b.sitting_since = null;
        const text = String(body.takeaway ?? '').trim();
        let takeaway: Highlight | null = null;
        if (text) {
          takeaway = { id: newId('hl'), book: b.id, kind: 'takeaway', text, page: to, day };
          void collection<Highlight>('mind', 'highlights').put(takeaway);
        }
        return { session, book: b, takeaway };
      }
      return fail('Not in the sample preview.');
    },
    '/mod/mind/recall/prepare': () => ({ made: 0 }),
    '/mod/mind/recall/*': (body: Record<string, unknown>, info) => {
      const [, , , , id, what] = info.path.split('/');
      const q = recall.find((x) => x.id === id) ?? fail('No such question.');
      const answer = String(body.answer ?? '').trim();
      const move = (v: 'got' | 'partly' | 'missed') => {
        q.step = v === 'got' ? Math.min(STEPS.length - 1, q.step + 1) : v === 'missed' ? 0 : q.step;
        q.due = addDays(day, v === 'missed' ? 2 : STEPS[q.step]);
      };
      if (what === 'mark') { move(body.verdict as 'got'); return { question: q, expected: q.expected }; }
      if (!answer) fail('Type or say an answer first.');
      const verdict = verdictOf(answer, q.expected);
      move(verdict);
      return { checked: true, verdict, note: NOTE[verdict], expected: q.expected, question: q };
    },
    '/mod/mind/lesson/*': (body: Record<string, unknown>, info) => {
      const [, , , , id, what] = info.path.split('/');
      const l = lessons.find((x) => x.id === id) ?? fail('No such lesson.');
      if (what === 'undo') { Object.assign(l, { status: 'todo', done_at: null, made: null }); return { lesson: l }; }
      const already = l.status === 'done';
      Object.assign(l, { status: 'done', done_at: l.done_at ?? new Date().toISOString(), made: (body.made as string) ?? l.made });
      return { lesson: l, already };
    },
    '/mod/mind/course/*': (body: Record<string, unknown>, info) => {
      const what = info.path.split('/').at(-1);
      if (what === 'switch') {
        const to = shelves.find((c) => c.id === body.to) ?? fail('No such course.');
        const was = shelves.find((c) => c.status === 'active');
        if (was) Object.assign(was, { status: 'parked', parked_at: day, park_reason: (body.reason as string) ?? null });
        Object.assign(to, { status: 'active', parked_at: null, park_reason: null, started_at: day });
        return { course: to, parked: was ?? null };
      }
      if (what === 'split') {
        const rows = String(body.text ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
        if (!rows.length) fail('Paste the lesson list first.');
        return { lessons: rows.map((r) => { const m = /(\d{1,2}:\d{2})/.exec(r); return { title: r.replace(/^\d+[.)]\s*/, '').replace(/\s*\(?\d{1,2}:\d{2}\)?\s*$/, '') || r, duration: m ? m[1] : null }; }), by: 'plain' };
      }
      if (what === 'add') {
        const title = String(body.title ?? '').trim() || fail('A course needs a title.');
        const id = newId('mc');
        const list = Array.isArray(body.lessons) ? (body.lessons as { title: string; duration: string | null }[]) : [];
        const active = !shelves.some((c) => c.status === 'active');
        shelves.push({ id, title, kind: 'course', status: active ? 'active' : 'parked', lessons: list.length, done: 0, parked_at: active ? null : day, park_reason: null, rank: null, from: null, started_at: active ? day : null });
        list.forEach((x, n) => lessons.push({ id: newId('ml'), course: id, n, title: x.title, duration: x.duration ?? null, url: (body.url as string) ?? null, why: null, watch: null, practice: null, done_when: null, status: 'todo', done_at: null, made: null }));
        return { course: { title, status: active ? 'active' : 'parked' } };
      }
      return fail('Not in the sample preview.');
    },
    '/mod/mind/topics/next': () => { st.topic += 1; return { topic: topicAt(st.topic) }; },
    '/mod/mind/speak/take': (_file: unknown, info) => {
      const q = info.query;
      const kind = (q.get('kind') ?? 'impromptu') as Take['kind'];
      const tk = (q.get('topic_kind') ?? 'opinion') as TopicKind;
      const now = new Date().toISOString();
      const t: TakeRec = {
        id: q.get('id') ?? newId('mt'), day, at: now, kind, topic: q.get('topic') ?? 'A sample topic', topic_label: kind === 'learned' ? 'Say what you learned' : kind === 'drill' ? 'Drill' : LABEL[tk] ?? 'Impromptu',
        status: 'transcribing', failed_step: null, error: null, secs: Number(q.get('secs')) || 64, overall: null,
        source: q.get('src_id') ? { kind: (q.get('src_kind') ?? 'takeaway') as 'takeaway', id: q.get('src_id')!, title: '' } : null, drill: q.get('drill'), updated_at: now,
        transcript: null, review: null, file: null, mime: null, bytes: 0, topic_kind: kind === 'impromptu' ? tk : null, made_at: Date.now(),
      };
      takes.push(t);
      return { take: lite(t) };
    },
    '/mod/mind/takes/*': (_body: unknown, info) => {
      const [, , , , id, what] = info.path.split('/');
      const t = takes.find((x) => x.id === id) ?? fail('No such take.');
      if (info.method === 'DELETE') { t.gone = true; return { ok: true }; }
      if (what === 'restore') { t.gone = false; return { take: lite(t) }; }
      if (what === 'retry') { t.made_at = Date.now() - 4000; Object.assign(t, { status: 'reviewing', error: null, failed_step: null }); return { take: lite(t) }; }
      return fail('Not in the sample preview.');
    },
    '/mod/mind/transcribe': () => ({ text: 'Words said in the sample preview land here.' }),
  },
});
