import type { FeedItem, NoraHome, NoraMessage, NoraState } from './nora';

// Dev-only sample data for `?demo` (the web preview without a PC): a short generic thread and a Home that shows every
// kind of card. Nothing here is anyone's real data. `?demo&nora=` opens a surface in a state: chat, empty, fail, ring,
// home, home-empty, home-fail, call, call-fail.

const param = (k: string) => (typeof location !== 'undefined' ? new URLSearchParams(location.search).get(k) : null);
export const demoMode = () => param('nora');

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const hm = (min: number) => new Date(Date.now() - min * 60_000 + 5.5 * 3600_000).toISOString().slice(11, 16);

let seq = 100;
let state: NoraState = {
  messages: [], busy: null, incoming: null, prefs: { name: 'Nora' }, live: [],
};
const subs = new Set<() => void>();
const emit = () => { state = { ...state }; for (const f of subs) f(); };

function seed() {
  if (state.messages.length || demoMode() === 'empty') return;
  const m = (role: string, text: string, min: number, meta?: NoraMessage['meta']): NoraMessage => ({ id: ++seq, role, text, at: ago(min), meta });
  state.messages = [
    m('call', 'We went over the week. You want mornings kept free for deep work, and the gym moved to evenings.', 1500,
      { callId: 'demo1', seconds: 312, writeup: 'done', actions: ['Moved the gym to 7 pm on weekdays', 'Kept 9 to 12 free every morning'] }),
    m('nora', 'Morning. Two things today: the client call at 4 and reading. Want me to block an hour for the reading after lunch?', 300),
    m('user', 'Yes, 2 to 3', 296),
    m('nora', 'Done. Reading is on your calendar from 2 to 3.', 295,
      { changes: [{ id: 1, label: 'Added reading, 2 to 3 pm', undone: false }], turn: 'demo-t1' }),
    m('nora', 'A build session wants to know which name to use for the new screen. Can you answer it?', 40,
      { ask: 'ask_demo', askState: { id: 'ask_demo', from: 'Build session', urgency: 'normal', status: 'asked', answer: null, kind: 'ask' } }),
  ];
}

const REPLIES = [
  'Okay. I moved it to 7 tonight and kept the rest of the evening clear.',
  'Got it. I added that to today and will remind you at 6.',
  'Noted. Anything else for today?',
];
let reply = 0;

export const noraDemo = {
  subscribe(f: () => void) { seed(); subs.add(f); return () => { subs.delete(f); }; },
  get: () => { seed(); return state; },
  send(text: string) {
    const id = ++seq;
    state.messages = [...state.messages, { id, role: 'user', text, at: new Date().toISOString() }];
    state.busy = { status: 'Thinking', since: Date.now() };
    emit();
    setTimeout(() => { state.busy = { status: 'Checking your calendar', since: Date.now() }; emit(); }, 900);
    setTimeout(() => {
      const text2 = REPLIES[reply++ % REPLIES.length];
      state.messages = [...state.messages, {
        id: ++seq, role: 'nora', text: text2, at: new Date().toISOString(),
        meta: reply === 1 ? { changes: [{ id: 2, label: 'Moved the gym to 7 pm', undone: false }], turn: `demo-t${seq}` } : undefined,
      }];
      state.busy = null;
      emit();
    }, 2200);
    return { id, turn: `demo-${id}` };
  },
  undo(change: number) {
    state.messages = state.messages.map((m) => (m.meta?.changes?.some((c) => c.id === change)
      ? { ...m, meta: { ...m.meta, changes: m.meta.changes!.map((c) => (c.id === change ? { ...c, undone: true } : c)) } } : m));
    emit();
  },
  answer(askId: string, text: string) {
    state.messages = state.messages.map((m) => (m.meta?.askState?.id === askId
      ? { ...m, meta: { ...m.meta, askState: { ...m.meta.askState!, status: 'answered', answer: text } } } : m));
    state.messages = [...state.messages, { id: ++seq, role: 'user', text, at: new Date().toISOString(), meta: { ask: askId } },
      { id: ++seq, role: 'nora', text: 'Passed to the build session.', at: new Date().toISOString() }];
    emit();
  },
  ring(reason: string) { state.incoming = { id: 'in_demo', reason, at: new Date().toISOString(), expires: Date.now() + 60_000 }; emit(); },
  dropIncoming() { state.incoming = null; emit(); },
};

const item = (x: Partial<FeedItem> & Pick<FeedItem, 'id' | 'kind' | 'title'>, min: number): FeedItem => ({
  at: ago(min), time: hm(min), app: null, text: null, source: 'heartbeat', status: 'open', urgency: 50,
  undo: false, undone: false, ask: null, ladder: null, ...x,
});

export function demoHome(): NoraHome {
  const empty = demoMode() === 'home-empty';
  return {
    name: 'Nora', day: new Date().toISOString().slice(0, 10), now: new Date().toISOString(), awake: true, inCall: false,
    busy: empty ? null : { title: 'Client call', until: new Date(Date.now() + 40 * 60_000).toISOString() },
    heartbeat: { on: true, last: { at: ago(12), time: hm(12), kind: 'ok', note: 'All quiet. Nothing new since lunch.' }, next: null, today: 9 },
    mood: { stress: 0.35, energy: 0.6, valence: 0.6, label: 'Steady', line: 'A full afternoon, but the evening is open.', overloaded: false },
    calls: { morning: '07:30', night: empty ? '' : '22:30' },
    asks: empty ? [] : [
      item({
        id: 'ask_demo1', kind: 'ask', app: 'agent', source: 'agent', from: 'Build session', urgency: 85,
        title: 'Which name should the new settings screen use?', text: 'It shows calls, voice and quiet hours. Options so far: Settings, or Nora.',
        ask: { yes: 'Answer', no: 'Not now', question: true, request: 'ask_demo1' },
      }, 25),
      item({
        id: 'f_demo2', kind: 'ask', app: 'money', title: 'Move 2,000 to savings?', text: 'You are under budget this week.',
        ask: { yes: 'Move it', no: 'Not now' },
      }, 70),
    ],
    items: empty ? [] : [
      item({ id: 'c1', kind: 'did', app: 'calendar', source: 'chat', status: 'done', title: 'Added reading, 2 to 3 pm', undo: true }, 295),
      item({ id: 'f3', kind: 'nudge', app: 'body', title: 'Water is behind today', text: 'Three glasses so far. A glass now keeps you on track.', ladder: { rung: 1, ceiling: 3, next: null } }, 50),
      item({ id: 'c2', kind: 'did', app: 'tasks', source: 'call', status: 'undone', title: 'Moved invoice to Friday', undone: true }, 400),
      item({ id: 'f4', kind: 'noticed', app: 'mind', status: 'done', title: 'You read for 25 minutes yesterday' }, 600),
    ],
    older: [],
  };
}
