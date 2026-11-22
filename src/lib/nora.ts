import { API, ApiError, currentToken } from './api';

// Nora on the PC (server/nora.ts, routes under /api/v1/nora). Chat is one long thread:
//   GET  /nora                        -> NoraState, the last 80 messages
//   GET  /nora?after=<id>&wait=<s>    -> NoraState with only newer messages; held open up to 25 s until something changes
//   POST /nora/messages { text }      -> { id, turn }; her reply arrives through the poll, up to three messages
//   POST /nora/undo { change | turn } -> undo what a turn changed
//   POST /nora/asks/<id>/answer       -> answer a question an agent sent through her
// Home (GET /nora/home) is her day: what waits on him (asks), what she did (items, each with Undo), what she noticed,
// her read of his day (mood) and her last check. Feed items answer, undo and snooze under /nora/feed/<id>/.
// Calls: POST /nora/call with a WebRTC offer, or the relay socket /nora/relay that streams 24 kHz PCM;
// GET /nora/call/live follows the call on now, wherever its audio runs.

export type NoraChange = { id: number; label: string; undone: boolean };
export type NoraDid = { id: string; kind: string; app: string | null; title: string; undo: boolean; undone: boolean; status?: string };
export type NoraAskState = { id: string; from: string; urgency: string; status: string; answer: string | null; kind: string };
export type NoraMeta = {
  changes?: NoraChange[]; did?: NoraDid[]; turn?: string; via?: string;
  ask?: string; askState?: NoraAskState;
  // a call's note in the thread: its length, then what was covered once the write up is done
  callId?: string; seconds?: number; actions?: string[]; writeup?: 'running' | 'done' | 'failed'; calling?: boolean;
};
export type NoraMessage = {
  id: number; role: string; text: string; at: string; meta?: NoraMeta;
  /** On this phone only: sent, not yet confirmed by the PC. */
  pending?: boolean;
  /** On this phone only: the send failed with this message. */
  failed?: string;
};
export type NoraIncoming = { id: string; reason: string; at: string; expires: number };
export type NoraState = {
  messages: NoraMessage[]; busy: { status: string; since: number } | null; incoming: NoraIncoming | null;
  prefs: { name?: string }; live: string[];
};

export type FeedKind = 'did' | 'noticed' | 'nudge' | 'ask' | 'alarm' | 'call';
export type FeedItem = {
  id: string; at: string; time: string; kind: FeedKind; app: string | null; title: string; text: string | null;
  source: string; from?: string; status: string; urgency: number; undo: boolean; undone: boolean;
  ask: { yes: string; no: string; question?: boolean; request?: string | null; draft?: string | null } | null;
  ladder: { rung: number; ceiling: number; next: string | null } | null;
};
export type NoraMood = { stress: number; energy: number; valence: number; label: string; line: string; overloaded: boolean };
export type NoraHome = {
  name: string; day: string; now: string; awake: boolean; inCall: boolean;
  busy: { title: string; until: string } | null;
  heartbeat: { on: boolean; last: { at: string; time: string; kind: string; note: string | null } | null; next: string | null; today: number };
  items: FeedItem[]; older: FeedItem[]; asks: FeedItem[];
  mood: NoraMood | null;
  calls: { morning: string; night: string };
};
export type LiveCall = {
  id: string; relay: boolean; connected: boolean; muted: boolean; handoff: boolean; seconds: number;
  transcript: { who: string; text: string; at: string }[];
};
export type VoiceMode = { realtime: boolean; free: boolean; codex: boolean; engine: string };

/** fetch with the sign-in, a time limit and an optional abort from the caller. */
export async function noraReq<T>(path: string, o: { method?: string; body?: unknown; signal?: AbortSignal; timeout?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  o.signal?.addEventListener('abort', stop);
  const t = setTimeout(stop, o.timeout ?? 20_000);
  const token = currentToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: o.method ?? 'GET', signal: ctl.signal,
      headers: {
        'X-Client': 'native',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
  } catch {
    if (o.signal?.aborted) throw new ApiError(-1, 'Stopped.');
    throw new ApiError(0, "Can't reach your PC. Check it's on and online.");
  } finally {
    clearTimeout(t);
    o.signal?.removeEventListener('abort', stop);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Server answered ${res.status}.`);
  return data as T;
}

const post = <T>(path: string, body: unknown = {}, timeout?: number) => noraReq<T>(path, { method: 'POST', body, timeout });
const enc = encodeURIComponent;

export const nora = {
  state: (signal?: AbortSignal) => noraReq<NoraState>('/nora', { signal }),
  poll: (after: number, signal?: AbortSignal) => noraReq<NoraState>(`/nora?after=${after}&wait=25`, { signal, timeout: 40_000 }),
  send: (text: string) => post<{ id: number; turn: string }>('/nora/messages', { text }),
  undoChange: (change: number) => post<{ undone: string[] }>('/nora/undo', { change }),
  answerAsk: (id: string, text: string) => post(`/nora/asks/${enc(id)}/answer`, { text }),
  home: (signal?: AbortSignal) => noraReq<NoraHome>('/nora/home', { signal, timeout: 30_000 }),
  /** A feed ask: yes or no. An agent's question (id ask_...) takes the words as its answer. */
  answerItem: (id: string, b: { choice: 'yes' | 'no'; text?: string }) => post<{ error?: string }>(`/nora/feed/${enc(id)}/answer`, b, 60_000),
  undoItem: (id: string) => post(`/nora/feed/${enc(id)}/undo`),
  snoozeItem: (id: string, minutes = 10) => post(`/nora/feed/${enc(id)}/snooze`, { minutes }),
  voiceMode: () => noraReq<VoiceMode>('/nora/voice-mode', { timeout: 8000 }),
  startCall: (b: { sdp: string; incomingId?: string | null; reason?: string; engine?: string }) =>
    post<{ callId: string; sdp: string }>('/nora/call', b, 90_000),
  callReady: (id: string) => post(`/nora/call/${enc(id)}/ready`),
  endCall: (id: string) => post(`/nora/call/${enc(id)}/end`),
  muteCall: (id: string, muted: boolean) => post(`/nora/call/${enc(id)}/mute`, { muted }),
  liveCall: (signal?: AbortSignal) => noraReq<{ call: LiveCall | null }>('/nora/call/live', { signal, timeout: 5000 }),
  decline: (incomingId: string) => post(`/nora/incoming/${enc(incomingId)}/decline`),
  snooze: (incomingId: string, minutes?: number) => post(`/nora/incoming/${enc(incomingId)}/snooze`, { minutes }),
};

/** "calendar" -> "Calendar". */
export const appName = (app: string | null | undefined) => (app ? app.charAt(0).toUpperCase() + app.slice(1) : 'Nora');

/** Seconds as 1:05 or 1:02:05. */
export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** A call's length in words: "2 min", "under a minute". */
export function callLength(sec: number | undefined) {
  if (!sec || sec < 60) return 'under a minute';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
