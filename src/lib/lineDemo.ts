import type {
  Blocklist, CallsPage, LineAction, LineCall, LineCallSummary, LineCategory, LineFilter, LineStatus, LiveLineCall, QuickReply,
} from './line';

// Dev-only sample data for Nora's line on the web preview (`?demo`): a call log with every category, decisions waiting
// and decided, a blocked spammer, the line's status, quick replies, and one live call that plays out a script and
// answers say / instruct / takeover / release / hangup the way the PC's socket would. Nothing here is anyone's real
// data. `?demo&line=down` shows the line down (PC locked), `?demo&line=quiet` no live call, `?demo&line=empty` no calls.

const param = (k: string) => (typeof location !== 'undefined' ? new URLSearchParams(location.search).get(k) : null);
const mode = () => param('line');
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

const LIVE_ID = 'ln_demo_live';
const wavs = new Map<number, string>();

type Seed = Partial<LineCall> & Pick<LineCall, 'id' | 'number' | 'category' | 'headline'> & { min: number; missed?: boolean };
const make = (x: Seed): LineCall & { missed?: boolean } => {
  const startedAt = ago(x.min);
  const seconds = x.seconds ?? 60;
  return {
    name: null, direction: 'forwarded', phase: 'ended', endedAt: new Date(Date.parse(startedAt) + seconds * 1000).toISOString(),
    needsYou: false, blocked: false, handledBy: 'nora', recording: { status: 'ok', seconds }, summary: '', outcome: '',
    actions: [], transcript: [], noraCallId: null, ...x, startedAt, seconds,
  };
};

let calls: (LineCall & { missed?: boolean })[] = [
  make({
    id: 'ln_demo_1', min: 38, number: '+919812345678', name: 'Raju from Blue Dart', category: 'delivery', seconds: 102,
    headline: 'Blue Dart delivery: parcel at 6 pm, asked for a landmark', needsYou: true,
    summary: 'Raju from Blue Dart has a parcel for you and will come by around 6 pm. He could not find the building and asked for a landmark. Nora gave him the gate number and asked him to call this line again from the gate.',
    outcome: 'Nora told him to come at 6 and call from the gate. She did not promise anyone would be home.',
    actions: [{ id: 'a1', text: 'Where should he leave the parcel if nobody answers?', options: [
      { id: 'gate', label: 'Leave at the gate' }, { id: 'guard', label: 'With the guard' }, { id: 'call', label: 'Call him back' },
    ] }],
    transcript: [
      { who: 'caller', text: 'Hello, is this the number for flat 4B? I have a Blue Dart parcel.', at: ago(38) },
      { who: 'nora', text: "Hi, I'm Nora, his assistant. He can't take the call right now. Is it prepaid?", at: ago(38) },
      { who: 'caller', text: 'Prepaid, yes. I will come around six. I could not find the building, what is near it?', at: ago(37) },
      { who: 'nora', text: 'It is the one behind the pharmacy, gate number two. Please call this number again from the gate.', at: ago(37) },
      { who: 'caller', text: 'Okay, gate two, six o clock. Thank you madam.', at: ago(37) },
    ],
  }),
  make({
    id: 'ln_demo_2', min: 95, number: '+919876500011', name: 'Rohan', category: 'personal', seconds: 214, handledBy: 'both',
    headline: 'Your cousin Rohan: wants to plan Sunday lunch, asked you to call back', needsYou: true,
    summary: 'Rohan called about lunch on Sunday with the family. Nora put him through to you; you talked for a minute and handed the call back so she could note the time and place.',
    outcome: 'Sunday 1 pm at home, he will confirm by message. Nora said you would call back tonight.',
    actions: [{ id: 'a1', text: 'Rohan asked you to call back tonight about Sunday.', options: [
      { id: 'call', label: 'Call back now' }, { id: 'remind', label: 'Remind me at 8' }, { id: 'msg', label: 'Message him' },
    ] }],
    transcript: [
      { who: 'caller', text: 'Hey, is Vedant there? It is Rohan.', at: ago(95) },
      { who: 'nora', text: 'Hi Rohan, one second, let me see if he can talk.', at: ago(95) },
      { who: 'you', text: 'Rohan! Tell me.', at: ago(94) },
      { who: 'caller', text: 'Sunday lunch at our place, one o clock?', at: ago(94) },
      { who: 'you', text: 'Done. Nora will note it, I will call you tonight.', at: ago(93) },
    ],
  }),
  make({
    id: 'ln_demo_3', min: 160, number: '+919990011223', name: 'Cab driver', category: 'cab', seconds: 48,
    headline: 'Cab driver at the main road, could not find the lane', outcome: 'Nora gave him the turn after the pharmacy.',
    summary: 'The driver of a cab you booked was at the main road and could not find the lane. Nora guided him to the turn after the pharmacy.',
    transcript: [{ who: 'caller', text: 'Sir, I am at the main road, which lane?', at: ago(160) }, { who: 'nora', text: 'Take the turn right after the pharmacy, it is the second building.', at: ago(160) }],
  }),
  make({
    id: 'ln_demo_4', min: 60 * 20, number: '+912261606161', name: null, category: 'bank', seconds: 71,
    headline: 'Credit card upgrade offer. Nora said not interested', outcome: 'Not interested, asked them not to call again.',
    summary: 'A bank called to offer a credit card upgrade. Nora said you are not interested and asked them to take the number off their list.',
    actions: [{ id: 'a1', text: 'Block this number?', options: [{ id: 'block', label: 'Block' }, { id: 'keep', label: 'Keep' }],
      decided: { optionId: 'keep', label: 'Keep', at: ago(60 * 19) } }],
  }),
  make({
    id: 'ln_demo_5', min: 60 * 22, number: '+911404123456', name: null, category: 'spam', seconds: 6, blocked: true,
    headline: 'Recorded loan offer, Nora hung up', outcome: 'Hung up on a recording.', summary: 'A recorded voice offered a personal loan. Nora hung up after a few seconds.',
    recording: { status: 'compressed', seconds: 6 },
  }),
  make({
    id: 'ln_demo_6', min: 60 * 26, number: '+919711122334', name: 'Supplier, Surat', category: 'business', seconds: 133,
    headline: 'Supplier asked when the next payment will be made', needsYou: false,
    summary: 'A fabric supplier from Surat asked when the next payment for last month will be made. Nora said you would confirm the date by Friday.',
    outcome: 'You will confirm the payment date by Friday.',
    actions: [{ id: 'a1', text: 'Confirm the payment date by Friday?', options: [{ id: 'remind', label: 'Remind me Friday' }, { id: 'done', label: 'Already paid' }],
      decided: { optionId: 'remind', label: 'Remind me Friday', at: ago(60 * 25) } }],
  }),
  make({
    id: 'ln_demo_7', min: 60 * 30, number: '+918800112233', name: 'Plot booking, Sonipat', category: 'sales', seconds: 39,
    headline: 'Real estate pitch for plots in Sonipat. Declined', outcome: 'Not interested.', summary: 'A sales caller pitched plots in Sonipat. Nora said you are not interested.',
  }),
  make({
    id: 'ln_demo_8', min: 60 * 50, number: '+919555544433', name: null, category: 'unknown', seconds: 0, missed: true,
    headline: 'Hung up before Nora could answer', recording: { status: 'none', seconds: 0 },
  }),
];

const live: LiveLineCall = {
  id: LIVE_ID, number: '+919833344455', name: 'Courier, Delhivery', direction: 'forwarded', category: 'delivery', phase: 'ringing',
  startedAt: new Date().toISOString(), endedAt: null, seconds: 0, headline: '', needsYou: false, blocked: false,
  handledBy: 'nora', recording: { status: 'recording', seconds: 0 }, action: 'Answering', listeners: 1, takenOverBy: null,
};
let liveOn = mode() !== 'quiet' && mode() !== 'empty';
let liveStarted = Date.now();

const summaryOf = (c: LineCall): LineCallSummary => {
  const { summary: _s, outcome: _o, actions: _a, transcript: _t, noraCallId: _n, ...rest } = c;
  return rest;
};

function filtered(filter: LineFilter) {
  if (mode() === 'empty') return [];
  return calls.filter((c) => filter === 'all' || (filter === 'needs-you' && c.needsYou) || (filter === 'spam' && c.category === 'spam')
    || (filter === 'missed' && c.missed));
}

const REPLIES: QuickReply[] = [
  { id: 'busy', label: 'He is busy', say: "He's busy right now. Can I take a message?", categories: ['personal', 'business', 'unknown'] },
  { id: 'later', label: 'Call back later', say: 'He will call you back later today.', categories: ['personal', 'business', 'unknown', 'delivery'] },
  { id: 'gate', label: 'Leave at the gate', say: 'Please leave it at the gate, thank you.', categories: ['delivery'] },
  { id: 'guard', label: 'Give it to the guard', say: 'Please give it to the guard at the gate.', categories: ['delivery'] },
  { id: 'otp', label: 'Ask for the OTP', say: 'He will send the OTP by message in a minute.', categories: ['delivery', 'cab'] },
  { id: 'wait', label: 'Wait 5 min', say: 'Please wait five minutes, he is coming down.', categories: ['delivery', 'cab'] },
  { id: 'no', label: 'Not interested', say: "He's not interested, thank you. Please don't call again.", categories: ['sales', 'bank', 'spam'] },
  { id: 'email', label: 'Send it by email', say: 'Please send the details by email and he will look at it.', categories: ['business', 'bank', 'sales'] },
];

export const lineDemo = {
  async calls(filter: LineFilter, before?: string | null, limit = 50): Promise<CallsPage> {
    await wait();
    if (mode() === 'fail') throw new Error("Can't reach your PC. Check it's on and online.");
    const all = filtered(filter).filter((c) => !before || c.startedAt < before).slice(0, limit).map(summaryOf);
    const head = liveOn && filter === 'all' && !before ? [{ ...live, seconds: Math.round((Date.now() - liveStarted) / 1000) }] : [];
    return { calls: [...head.map(({ action: _a, listeners: _l, takenOverBy: _t, ...x }) => x), ...all], counts: { needsYou: calls.filter((c) => c.needsYou).length } };
  },
  async call(id: string): Promise<LineCall> {
    await wait();
    if (id === LIVE_ID) {
      const { action: _a, listeners: _l, takenOverBy: _t, ...x } = live;
      return { ...x, phase: liveOn ? x.phase : 'ended', summary: '', outcome: '', actions: [], noraCallId: null,
        transcript: liveOn ? [] : script.slice(0, 4).map(([, who, text]) => ({ who, text, at: x.startedAt })) };
    }
    const c = calls.find((x) => x.id === id);
    if (!c) throw new Error('That call is gone.');
    return c;
  },
  async decide(id: string, actionId: string, optionId: string): Promise<{ ok: boolean; action: LineAction }> {
    await wait(500);
    const c = calls.find((x) => x.id === id);
    const a = c?.actions.find((x) => x.id === actionId);
    const o = a ? [...a.options, { id: 'task-me', label: 'Add to my tasks' }, { id: 'task-nora', label: 'Give to Nora' }].find((x) => x.id === optionId) : undefined;
    if (!c || !a || !o) throw new Error('That choice is no longer open.');
    const action: LineAction = { ...a, decided: { optionId, label: o.label, at: new Date().toISOString() } };
    calls = calls.map((x) => (x.id !== id ? x : {
      ...x, actions: x.actions.map((y) => (y.id === actionId ? action : y)),
      needsYou: x.actions.some((y) => y.id !== actionId && !y.decided),
    }));
    return { ok: true, action };
  },
  async block(id: string, block: boolean) {
    await wait();
    const c = calls.find((x) => x.id === id);
    calls = calls.map((x) => (x.number === c?.number ? { ...x, blocked: block } : x));
    return { ok: true, blocked: block };
  },
  async blocklist(): Promise<Blocklist> {
    await wait();
    const nums = (b: boolean) => calls.filter((c) => c.blocked === b).map((c) => ({ number: c.number.replace(/\D/g, ''), label: c.name ?? c.headline.slice(0, 30) }));
    return { version: 3, blocked: nums(true), labels: nums(false) };
  },
  async status(): Promise<LineStatus> {
    await wait(200);
    const down = mode() === 'down';
    return {
      up: !down, why: down ? 'pc-locked' : null,
      live: liveOn && !down ? (({ action: _a, listeners: _l, takenOverBy: _t, ...x }) => x)({ ...live, seconds: Math.round((Date.now() - liveStarted) / 1000) }) : null,
      forwarding: { lastForwardedAt: ago(38) },
    };
  },
  async quickReplies() { await wait(200); return { replies: REPLIES }; },
  /** The live socket: `emit` gets what the PC would send; returns the closer. */
  openLive(emit: (m: unknown) => void) { return openDemoLive(emit); },
  sendLive(m: { type: string; text?: string; on?: boolean }) { demoSend?.(m); },
  /** A silent WAV the length of the call, so the recording player can be tried (web only). */
  recording(seconds: number): { uri: string } | null {
    if (typeof URL === 'undefined' || typeof Blob === 'undefined' || !URL.createObjectURL || seconds <= 0) return null;
    let uri = wavs.get(seconds);
    if (!uri) {
      const rate = 8000, n = rate * Math.round(seconds);
      const buf = new ArrayBuffer(44 + n);
      const v = new DataView(buf);
      const str = (o: number, x: string) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
      v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
      new Uint8Array(buf, 44).fill(128); // 8-bit silence
      uri = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      wavs.set(seconds, uri);
    }
    return { uri };
  },
  /** A category's quick replies, as the live screen filters them. */
  repliesFor: (c: LineCategory) => REPLIES.filter((r) => r.categories.includes(c)),
};

// ── the live call ────────────────────────────────────────────────────────────────────────────────────────────────

type Who = 'caller' | 'nora' | 'you';
const script: [number, Who, string, string?][] = [
  [1600, 'caller', 'Hello? I have a Delhivery parcel for this number.', 'Asking who is calling'],
  [3200, 'nora', "Hi, I'm Nora, his assistant. He can't come to the phone right now. Is it prepaid or cash on delivery?", 'Asking about the parcel'],
  [5600, 'caller', 'Cash on delivery, eight hundred and forty rupees. Is anyone at home?', 'Checking who is home'],
  [7800, 'nora', 'Let me check for you. Can you hold for a moment?', 'Checking where to leave it'],
  [10200, 'caller', 'Okay, but I need someone to pay and sign.', 'Waiting for you'],
];

let demoSend: ((m: { type: string; text?: string; on?: boolean }) => void) | null = null;

function openDemoLive(emit: (m: unknown) => void) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, f: () => void) => { timers.push(setTimeout(f, ms)); };
  let n = 0;
  const say = (who: Who, text: string, delay = 0) => {
    const id = `l${++n}`, words = text.split(' ');
    words.forEach((_, i) => at(delay + i * 110, () => emit({ type: 'line', callId: LIVE_ID, line: { id, who, text: words.slice(0, i + 1).join(' '), final: false, at: new Date().toISOString() } })));
    at(delay + words.length * 110 + 250, () => emit({ type: 'line', callId: LIVE_ID, line: { id, who, text, final: true, at: new Date().toISOString() } }));
  };
  const state = () => emit({ type: 'state', call: liveOn ? { ...live, seconds: Math.round((Date.now() - liveStarted) / 1000) } : null });
  const step = (text: string) => { live.action = text; emit({ type: 'action', callId: LIVE_ID, text }); };

  if (!liveOn) { state(); return () => {}; }
  // a fresh run of the script each time the screen opens
  liveStarted = Date.now();
  Object.assign(live, { phase: 'ringing', action: 'Answering', takenOverBy: null, needsYou: false, startedAt: new Date().toISOString() });
  state();
  at(1000, () => { live.phase = 'nora'; live.action = 'Asking who is calling'; state(); });
  for (const [ms, who, text, next] of script) { say(who, text, ms); if (next) at(ms + 1400, () => step(next)); }
  at(12000, () => {
    if (live.phase !== 'nora') return;
    live.needsYou = true;
    state();
    emit({ type: 'transfer', callId: LIVE_ID, reason: 'Cash on delivery, 840 rupees. He needs someone to pay and sign.' });
  });

  demoSend = (m) => {
    if (!liveOn) return;
    if (m.type === 'say' && m.text) { step('Saying your reply'); say('nora', m.text, 500); }
    else if (m.type === 'instruct' && m.text) { step('Following your note'); say('nora', 'Sure. One moment, let me sort that out for you.', 1400); }
    else if (m.type === 'takeover') { Object.assign(live, { phase: 'you', takenOverBy: 'app', needsYou: false, handledBy: 'both', action: 'Listening while you talk' }); state(); }
    else if (m.type === 'release') { Object.assign(live, { phase: 'nora', takenOverBy: null, action: 'Taking it from here' }); state(); say('nora', "Thanks, I'm back. Anything else I can help with?", 800); }
    else if (m.type === 'hangup') { liveOn = false; Object.assign(live, { phase: 'ended', endedAt: new Date().toISOString() }); emit({ type: 'ended', callId: LIVE_ID }); state(); }
  };
  return () => { timers.forEach(clearTimeout); demoSend = null; };
}
