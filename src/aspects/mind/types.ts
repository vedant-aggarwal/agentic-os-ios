// What the Mind routes answer (server/modules/mind*.ts). Only the fields the page reads.

export type TopicKind = 'opinion' | 'explain' | 'story' | 'persuade' | 'think' | 'talk';
export type Source = { kind: 'lesson' | 'takeaway'; id: string; title: string };
export type Topic = { id: string; text: string; kind: TopicKind; label: string; by: 'bank' | 'ai'; from: Source | null };
export type Learned = { text: string; line: string | null; source: Source; day: string };

export type TakeStatus = 'saving' | 'transcribing' | 'reviewing' | 'reviewed' | 'short' | 'failed';
export type TakeKind = 'impromptu' | 'drill' | 'learned';
export type TakeLite = {
  id: string; day: string; at: string; kind: TakeKind; topic: string; topic_label: string; status: TakeStatus;
  failed_step: 'save' | 'transcribe' | 'review' | null; error: string | null; secs: number | null; overall: number | null;
  source: Source | null; drill: string | null; updated_at: string;
  /** a Stage take: filmed on the camera (mind-stage.ts) */
  video?: boolean;
};
export type DimKey = 'structure' | 'clarity' | 'focus' | 'words' | 'economy' | 'fillers';
export type Check = { score: number; note: string };
export type Review = {
  rubric: string; v: string; model: string; at: string; overall: number; scores: Record<DimKey, number>; notes: Record<DimKey, string>;
  fillers: { word: string; count: number }[]; fillers_total: number; fpm: number; strongest: string; fix: string; rewrite: string;
  grasp: Check | null; pattern: Check | null;
};
export type Take = TakeLite & {
  transcript: string | null; review: Review | null; file: string | null; mime: string | null; bytes: number;
  words?: number; secs_estimated?: boolean; topic_kind: TopicKind | null;
  mode?: StageMode; thumb?: string | null; notes?: string; presence?: Presence | null; delivery?: Delivery | null;
};

// ── Stage: impromptu speaking on camera ──
export type StageMode = 'topic' | 'talk' | 'none' | 'own';
export type Moment = { at: number; note: string };
/** Claude Opus on frames from the video. */
export type Presence = {
  state: 'running' | 'done' | 'failed'; error?: string; confidence?: number; summary?: string;
  eyes?: string; posture?: string; hands?: string; face?: string; stuck?: Moment[]; fix?: string;
};
/** Gemini on the audio, when a key is saved. */
export type Delivery = {
  state: 'off' | 'running' | 'done' | 'failed'; error?: string; energy?: number; variety?: number; clarity?: number;
  pace?: 'slow' | 'steady' | 'fast' | 'uneven'; wpm?: number | null; tone?: string; pitch?: string; pace_note?: string; pauses?: string; stuck?: Moment[]; fix?: string; model?: string;
};
export type VideoLite = TakeLite & {
  video: true; mode: StageMode; thumb: boolean; notes: string | null;
  look: Presence['state'] | null; confidence: number | null; voice: Delivery['state'] | null; energy: number | null;
};
/** A recording that never finished: the PC has what was sent before the app closed. */
export type OpenRec = {
  id: string; at: string; topic: string; mode: StageMode; topic_kind: TopicKind | null; topic_id: string | null; label: string;
  secs: number; bytes: number; parts: number; next: number; updated_at: string;
};
export type GeminiState = { set: boolean; from: 'app' | 'config' | null; model: string | null; tail: string | null };
export type StageView = { day: string; open: OpenRec[]; videos: VideoLite[]; total: number; gemini: GeminiState; limit: number; prep: number };
export type Rolled = { id: string; text: string; kind: TopicKind; label: string; die: 'topic' | 'talk' };
/** What a Stage recording is about when it starts; `resume` picks up an unfinished one. */
export type StageSpec = { mode: StageMode; topic: string; label: string; topicKind?: TopicKind | null; topicId?: string | null; resume?: OpenRec };

export type Drill = { id: string; name: string; lines: [string, string]; steps: string[]; done: number; prompt: string; prompts: string[] };
export type Progress = {
  rubric: string; takes: number; reviewed: number; days_this_week: number;
  dims: { key: DimKey; name: string; now: number | null; before: number | null }[];
  trend: { id: string; day: string; overall: number; fpm: number }[];
};
export type SpeakView = {
  day: string; topic: Topic; learned: Learned[]; drills: Drill[]; progress: Progress; takes: TakeLite[]; pending: TakeLite[];
  rubric: { v: string; dims: { key: DimKey; name: string; weight: number; ask: string }[] };
};

export type Pace = { sittings: number; recent: number; pages: number; minutes: number; ppd: number; left: number | null; last: string | null; idle: number | null; finish: string | null; why: string | null };
export type Book = {
  id: string; title: string; author: string | null; pages: number | null; page: number; status: 'reading' | 'paused' | 'next' | 'done';
  cover: string | null; started: string | null; finished: string | null; sitting_since: string | null; takeaways: number;
  summary: { text: string; v: string; at: string; from: number } | null;
};
export type ReadView = {
  day: string; reading: (Book & { pace: Pace })[]; paused: Book[]; next: Book[]; done: Book[];
  takeaways: { id: string; book: string; title: string | null; text: string; page: number | null; day: string }[];
  recall: { due: { id: string; q: string; book: string; title: string | null; step: number; expected: string | null }[]; total: number; next: string | null };
  total: number;
};
export type Found = { title: string; author: string | null; pages: number | null; year: number | null; cover: string | null; isbn: string | null };

export type Lesson = {
  id: string; n: number; title: string; duration: string | null; url: string | null; why: string | null; watch: string | null;
  practice: string | null; done_when: string | null; status: 'todo' | 'done'; done_at: string | null; made: string | null;
};
export type Shelf = { id: string; title: string; kind: 'course' | 'library'; status: string; lessons: number; done: number; parked_at: string | null; park_reason: string | null; rank: number | null; from: string | null };
export type CourseView = {
  day: string;
  active: (Shelf & {
    started_at: string | null; practice: string | null; next: Lesson | null; list: Lesson[]; left: number; minutes_left: number; minutes_known: boolean;
    pace: { per_week: number; recent: number; last: string | null; idle: number | null }; finish: string | null; why: string | null; today: string[];
  }) | null;
  parked: Shelf[]; libraries: Shelf[]; done: Shelf[]; total: number; lessons: number;
};

export type Day = { date: string; future: boolean; read: number; lessons: number; learned: boolean; said: number };
export type HomeView = {
  day: string;
  learn: {
    course: { id: string; title: string; lessons: number; done: number; next: { id: string; title: string; n: number; duration: string | null; url: string | null } | null; today: string[] } | null;
    book: { id: string; title: string; author: string | null; page: number; pages: number | null; cover: string | null; sitting_since: string | null; last: string | null; idle: number | null } | null;
    today: { read: number; lessons: number; ticked?: boolean }; courses: number; books: number;
  };
  say: { topic: Topic; learned: Learned | null; today: TakeLite[]; ticked?: boolean };
  week: { from: string; days: Day[]; learned: number; said: number; both: number };
  sharper: { trend: Progress['trend']; reviewed: number; takes: number; last: TakeLite | null };
  recall: { due: number };
  pending: TakeLite[];
};

/** What a take is about when it starts: everything the upload needs to say. */
export type TakeSpec = {
  kind: TakeKind; topic: string; label: string; topicId?: string; topicKind?: TopicKind; drill?: string; source?: Source;
};
