import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API, api, ApiError, currentToken, onAuth, WEB } from './api';
import { DEMO } from './demo';
import { lineDemo } from './lineDemo';
import { lineNative } from './lineNative';

// Nora's phone line: calls forwarded from his iPhone (declined, missed, unreachable, and every unknown number) that
// Nora answers on her own SIM. The records, endpoints, live socket and pushes are fixed by the contract in
// nora-line/docs/line-calls-v2-contract.md; every type below is copied from it. All of it lives under /api/v1/nora/line
// on the same server and sign-in as the rest of the app.
//   GET  /nora/line/calls?filter=&before=&limit=   the call log, newest first, with the needs-you count
//   GET  /nora/line/calls/:id                      one call: summary, outcome, decisions, transcript
//   GET  /nora/line/calls/:id/recording            its recording (?token= for players that can't send headers)
//   POST /nora/line/calls/:id/actions/:actionId    his choice on a decision
//   POST /nora/line/calls/:id/block                block or unblock the number
//   GET  /nora/line/blocklist                      what the Call Directory extension blocks and names
//   GET  /nora/line/status                         is the line up, and the call on now
//   GET  /nora/line/quick-replies                  the chips the live screen offers
// `?demo` on the web preview answers all of it from src/lib/lineDemo.ts instead.

export type LineCategory = 'personal' | 'business' | 'delivery' | 'cab' | 'bank' | 'sales' | 'spam' | 'unknown';
export type LineDirection = 'forwarded' | 'direct' | 'owner' | 'outgoing' | 'third-party' | 'callback';
export type LinePhase = 'ringing' | 'nora' | 'you' | 'ended';
export type LineOption = { id: string; label: string };
export type LineAction = {
  id: string;
  text: string;
  options: LineOption[];
  decided?: { optionId: string; label: string; at: string; note?: string } | null;
};
export type LineRecording = { status: 'recording' | 'encoding' | 'ok' | 'compressed' | 'failed' | 'none'; seconds: number };
export type LineCallSummary = {
  id: string;
  number: string;
  name: string | null;
  direction: LineDirection;
  category: LineCategory;
  phase: LinePhase;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
  headline: string;
  needsYou: boolean;
  blocked: boolean;
  handledBy: 'nora' | 'you' | 'both';
  recording: LineRecording;
};
export type LineTranscriptLine = { who: 'caller' | 'nora' | 'you'; text: string; at: string };
export type LineCall = LineCallSummary & {
  summary: string;
  outcome: string;
  actions: LineAction[];
  transcript: LineTranscriptLine[];
  noraCallId: string | null;
};
export type LiveLineCall = LineCallSummary & { action: string; listeners: number; takenOverBy: 'app' | null };
export type LineFilter = 'all' | 'needs-you' | 'spam' | 'missed';
export type LineDown = 'pc-locked' | 'hands-free-down' | 'voice-down';
export type LineStatus = {
  up: boolean;
  why: LineDown | null;
  live: LineCallSummary | null;
  forwarding: { lastForwardedAt: string | null };
};
export type QuickReply = { id: string; label: string; say: string; categories: LineCategory[] };
export type Blocklist = {
  version: number;
  blocked: { number: string; label: string }[];
  labels: { number: string; label: string }[];
};
export type CallsPage = { calls: LineCallSummary[]; counts: { needsYou: number } };

const enc = encodeURIComponent;

export const line = {
  calls(filter: LineFilter, before?: string | null, limit = 50): Promise<CallsPage> {
    if (DEMO) return lineDemo.calls(filter, before, limit);
    return api(`/nora/line/calls?filter=${filter}&limit=${limit}${before ? `&before=${enc(before)}` : ''}`);
  },
  call(id: string): Promise<LineCall> {
    return DEMO ? lineDemo.call(id) : api(`/nora/line/calls/${enc(id)}`);
  },
  async decide(id: string, actionId: string, optionId: string, note?: string): Promise<LineAction> {
    const r = DEMO ? await lineDemo.decide(id, actionId, optionId)
      : await api<{ ok: boolean; action: LineAction }>(`/nora/line/calls/${enc(id)}/actions/${enc(actionId)}`, {
        method: 'POST', body: note ? { optionId, note } : { optionId },
      });
    refreshLineCounts();
    return r.action;
  },
  async block(id: string, block: boolean): Promise<boolean> {
    const r = DEMO ? await lineDemo.block(id, block)
      : await api<{ ok: boolean; blocked: boolean }>(`/nora/line/calls/${enc(id)}/block`, { method: 'POST', body: { block } });
    syncBlocklist(true); // the phone's own blocking follows at once
    return r.blocked;
  },
  blocklist(): Promise<Blocklist> {
    return DEMO ? lineDemo.blocklist() : api('/nora/line/blocklist');
  },
  status(): Promise<LineStatus> {
    return DEMO ? lineDemo.status() : api('/nora/line/status');
  },
  async quickReplies(): Promise<QuickReply[]> {
    const r = DEMO ? await lineDemo.quickReplies() : await api<{ replies: QuickReply[] }>('/nora/line/quick-replies');
    return Array.isArray(r.replies) ? r.replies : [];
  },
  /** The recording as an audio player source. The web build's session cookie goes with it; the phone adds ?token=.
   *  `format=m4a` asks for the MP4 copy: iOS can't play the Ogg file the contract names (App deviations there). */
  recording(id: string, seconds = 0): { uri: string } | null {
    if (DEMO) return lineDemo.recording(seconds);
    const t = currentToken();
    return { uri: `${API}/nora/line/calls/${enc(id)}/recording?format=m4a${t ? `&token=${enc(t)}` : ''}` };
  },
};

/** The line isn't on this PC's server yet (it answers 404 to the whole family of routes). */
export const notSetUp = (e: unknown) => e instanceof ApiError && e.status === 404;

// ── how a call reads ─────────────────────────────────────────────────────────────────────────────────────────────

export const CATEGORY: Record<LineCategory, { label: string; sf: string; d: string }> = {
  delivery: { label: 'Delivery', sf: 'shippingbox.fill', d: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8' },
  cab: { label: 'Cab', sf: 'car.fill', d: 'M4 15.5V12l2-5h12l2 5v3.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 12h16M7 16.5V19M17 16.5V19' },
  bank: { label: 'Bank', sf: 'building.columns.fill', d: 'M4 9.5L12 5l8 4.5M5.5 10v7M9.8 10v7M14.2 10v7M18.5 10v7M4 19h16' },
  sales: { label: 'Sales', sf: 'megaphone.fill', d: 'M4 10v4h3l7 4V6l-7 4zM17 9.5a3 3 0 0 1 0 5' },
  spam: { label: 'Spam', sf: 'exclamationmark.shield.fill', d: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6zM12 8v5M12 16h.01' },
  personal: { label: 'Personal', sf: 'person.fill', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0' },
  business: { label: 'Business', sf: 'briefcase.fill', d: 'M4 8h16v11H4zM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 13h16' },
  unknown: { label: 'Unknown', sf: 'phone.fill', d: 'M6.5 3.5h3l1.5 4.5-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 5 5a1.5 1.5 0 0 1 1.5-1.5z' },
};
export const categoryOf = (c: string): (typeof CATEGORY)[LineCategory] => CATEGORY[c as LineCategory] ?? CATEGORY.unknown;

/** "+91 98123 45678" for an Indian mobile, "+91 22 6160 6161" for a landline, the number as sent otherwise. */
export function formatNumber(n: string) {
  const d = n.replace(/[^\d+]/g, '');
  const m = /^(?:\+91|91)?(\d{10})$/.exec(d);
  if (!m || (d.length !== 10 && !d.startsWith('+91') && !d.startsWith('91'))) return n;
  const x = m[1];
  if (/^[6-9]/.test(x)) return `+91 ${x.slice(0, 5)} ${x.slice(5)}`; // mobile
  if (/^(11|20|22|33|40|44|79|80)/.test(x)) return `+91 ${x.slice(0, 2)} ${x.slice(2, 6)} ${x.slice(6)}`; // a metro's landline
  if (/^[1-5]/.test(x)) return `+91 ${x.slice(0, 3)} ${x.slice(3, 6)} ${x.slice(6)}`; // other landlines and the 140 sales series
  return n;
}

/** Who called: the name Nora heard or knows, else the number. */
export const callerOf = (c: Pick<LineCallSummary, 'name' | 'number'>) => c.name?.trim() || formatNumber(c.number) || 'Unknown caller';

const DIRECTION: Record<LineDirection, string> = {
  forwarded: 'Forwarded from your phone',
  direct: "Called Nora's number",
  owner: 'You called Nora',
  outgoing: 'Nora called them',
  'third-party': 'Nora called for you',
  callback: 'Nora called back',
};
export const directionOf = (d: string) => DIRECTION[d as LineDirection] ?? '';

export const PHASE: Record<LinePhase, string> = {
  ringing: 'Ringing Nora',
  nora: 'Nora is on the call',
  you: 'You are on the call',
  ended: 'Call ended',
};

export const DOWN: Record<LineDown, string> = {
  'pc-locked': 'Your PC is locked. Unlock it so Nora can answer.',
  'hands-free-down': "Nora's phone isn't connected to your PC over Bluetooth.",
  'voice-down': "Nora's voice isn't running on your PC.",
};
export const downText = (why: string | null) => (why && DOWN[why as LineDown]) || "Nora can't answer calls right now.";

// ── the needs-you count and the call on now, for Home and the dock ──────────────────────────────────────────────

type Counts = { needsYou: number | null; status: LineStatus | null; at: number; missing: boolean };
let counts: Counts = { needsYou: null, status: null, at: 0, missing: false };
const countSubs = new Set<() => void>();
const setCounts = (p: Partial<Counts>) => { counts = { ...counts, ...p }; for (const f of countSubs) f(); };

/** How many calls wait on a decision, the line's status (with the call on now), and whether the line exists at all. */
export const useLineCounts = () => useSyncExternalStore((f) => { countSubs.add(f); return () => { countSubs.delete(f); }; }, () => counts, () => counts);

/** A call list that loaded brings its count along. */
export function noteNeedsYou(n: number) { if (n !== counts.needsYou) setCounts({ needsYou: n, missing: false }); }

let countsBusy = false;
/** Asks the PC again (status and the count). Quiet on failure; a 404 means the line isn't on this PC. */
export async function refreshLineCounts() {
  if (countsBusy || (!DEMO && !currentToken() && !WEB)) return;
  countsBusy = true;
  try {
    const [page, status] = await Promise.all([line.calls('needs-you', null, 1), line.status().catch(() => null)]);
    setCounts({ needsYou: page.counts?.needsYou ?? page.calls.filter((c) => c.needsYou).length, status, at: Date.now(), missing: false });
  } catch (e) {
    if (notSetUp(e)) setCounts({ needsYou: null, status: null, missing: true, at: Date.now() });
  } finally { countsBusy = false; }
}

// ── the Call Directory extension's list ──────────────────────────────────────────────────────────────────────────

let syncedAt = 0;
let syncedVersion: number | null = null;
/** Fetches the blocklist and hands it to the Call Directory extension, which iOS then reloads. `force` skips the
 *  ten minute spacing (after a block or unblock). The whole list every time: `since` is left unused. */
export async function syncBlocklist(force = false): Promise<boolean> {
  if (!lineNative.available || DEMO) return false;
  if (!force && Date.now() - syncedAt < 10 * 60_000) return false;
  syncedAt = Date.now();
  try {
    const list = await line.blocklist();
    if (!force && list.version === syncedVersion) return true;
    const ok = await lineNative.saveBlocklist(list);
    if (ok) syncedVersion = list.version;
    return ok;
  } catch { return false; }
}

/** Mounted once by the root layout: the count on foreground and every two minutes, the blocklist, the Live
 *  Activity tokens after sign-in, and the links native code hands over (a notification's Take over, the Live
 *  Activity's buttons). Returns the cleanup. */
export function startLine(): () => void {
  const wake = () => { void refreshLineCounts(); void syncBlocklist(); lineNative.repostTokens(); };
  wake();
  const app = AppState.addEventListener('change', (s) => { if (s === 'active') wake(); });
  const auth = onAuth((ok) => { syncedAt = 0; if (ok) wake(); else setCounts({ needsYou: null, status: null }); });
  const poll = setInterval(() => { if (AppState.currentState === 'active' && !counts.missing) void refreshLineCounts(); }, 120_000);
  const links = lineNative.startLinks();
  return () => { app.remove(); auth(); clearInterval(poll); links(); };
}
