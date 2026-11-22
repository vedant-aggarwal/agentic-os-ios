import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { nora, type NoraIncoming, type NoraMessage, type NoraState } from '@/lib/nora';
import { demoMode, noraDemo } from '@/lib/noraDemo';

// The chat thread while it is open: the last 80 messages, then a long poll that the PC answers as soon as a message
// lands, her status changes ("Checking your calendar") or she starts ringing. A send shows at once and is replaced by
// the PC's copy when the poll brings it back. Closed, nothing polls; reopening loads the thread again.

type Load = { status: 'loading' | 'ready' | 'error'; error: string | null };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function merge(list: NoraMessage[], add: NoraMessage[]) {
  if (!add.length) return list;
  const byId = new Map(list.filter((m) => !m.pending || !add.some((a) => a.role === 'user' && a.text === m.text)).map((m) => [m.id, m]));
  for (const m of add) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.pending ? 1 : 0) - (b.pending ? 1 : 0) || a.id - b.id);
}

export function useThread(open: boolean) {
  const demo = useSyncExternalStore(DEMO ? noraDemo.subscribe : () => () => {}, () => (DEMO ? noraDemo.get() : null), () => null);
  const [messages, setMessages] = useState<NoraMessage[]>([]);
  const [busy, setBusy] = useState<NoraState['busy']>(null);
  const [incoming, setIncoming] = useState<NoraIncoming | null>(null);
  const [name, setName] = useState('Nora');
  const [load, setLoad] = useState<Load>({ status: 'loading', error: null });
  const [round, setRound] = useState(0); // bump to reload from the top
  const last = useRef(0);
  const local = useRef(-1); // ids for messages only this phone has yet
  const running = useRef(false); // a call note is still being written up

  const apply = useCallback((st: NoraState, full: boolean) => {
    setMessages((cur) => (full ? merge(cur.filter((m) => m.pending || m.failed), st.messages) : merge(cur, st.messages)));
    for (const m of st.messages) if (m.id > last.current) last.current = m.id;
    const writing = st.messages.some((m) => m.meta?.writeup === 'running');
    running.current = full ? writing : running.current || writing;
    setBusy(st.busy);
    setIncoming(st.incoming);
    if (st.prefs?.name) setName(st.prefs.name);
  }, []);

  useEffect(() => {
    if (!open || DEMO) return;
    const ctl = new AbortController();
    let alive = true;
    (async () => {
      let full = true, fails = 0;
      while (alive) {
        try {
          const st = full ? await nora.state(ctl.signal) : await nora.poll(last.current, ctl.signal);
          if (!alive) return;
          apply(st, full);
          setLoad({ status: 'ready', error: null });
          // a call note still being written up changes in place; the poll only brings new ids, so read it all again
          full = !full && running.current;
          fails = 0;
        } catch (e) {
          if (!alive || (e instanceof ApiError && e.status === -1)) return;
          fails++;
          setLoad((l) => ({ status: l.status === 'ready' ? 'ready' : 'error', error: errText(e) }));
          if (fails >= 3 && !last.current) return; // give up until Try again
          await new Promise((r) => setTimeout(r, Math.min(15_000, 1500 * fails)));
          full = true;
        }
      }
    })();
    return () => { alive = false; ctl.abort(); };
  }, [open, round, apply]);

  // back from the background: read it all again (the poll may have died with the app)
  useEffect(() => {
    if (!open || DEMO) return;
    const sub = AppState.addEventListener('change', (a) => { if (a === 'active') setRound((r) => r + 1); });
    return () => sub.remove();
  }, [open]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (DEMO) { noraDemo.send(t); return; }
    const id = local.current--;
    setMessages((cur) => [...cur, { id, role: 'user', text: t, at: new Date().toISOString(), pending: true }]);
    try {
      await nora.send(t);
    } catch (e) {
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, failed: errText(e) } : m)));
    }
  }, []);

  const retry = useCallback((m: NoraMessage) => {
    setMessages((cur) => cur.filter((x) => x.id !== m.id));
    void send(m.text);
  }, [send]);

  /** Undo one change she made. Resolves with an error message, or null. */
  const undo = useCallback(async (change: number): Promise<string | null> => {
    if (DEMO) { noraDemo.undo(change); return null; }
    try {
      await nora.undoChange(change);
      setMessages((cur) => cur.map((m) => (m.meta?.changes?.some((c) => c.id === change)
        ? { ...m, meta: { ...m.meta, changes: m.meta.changes!.map((c) => (c.id === change ? { ...c, undone: true } : c)) } } : m)));
      return null;
    } catch (e) { return errText(e); }
  }, []);

  /** Undo something she did in an app (a feed item). */
  const undoDid = useCallback(async (id: string): Promise<string | null> => {
    try {
      if (!DEMO) await nora.undoItem(id);
      setMessages((cur) => cur.map((m) => (m.meta?.did?.some((x) => x.id === id)
        ? { ...m, meta: { ...m.meta, did: m.meta.did!.map((x) => (x.id === id ? { ...x, undone: true, undo: false } : x)) } } : m)));
      return null;
    } catch (e) { return errText(e); }
  }, []);

  const answer = useCallback(async (askId: string, text: string): Promise<string | null> => {
    if (DEMO) { noraDemo.answer(askId, text); return null; }
    try { await nora.answerAsk(askId, text); return null; } catch (e) { return errText(e); }
  }, []);

  const dropIncoming = useCallback(async (how: 'decline' | 'later') => {
    const inc = DEMO ? demo?.incoming : incoming;
    if (!inc) return;
    if (DEMO) { noraDemo.dropIncoming(); return; }
    setIncoming(null);
    try { await (how === 'decline' ? nora.decline(inc.id) : nora.snooze(inc.id)); } catch {}
  }, [demo, incoming]);

  const reload = useCallback(() => { setLoad({ status: 'loading', error: null }); setRound((r) => r + 1); }, []);

  if (DEMO && demoMode() === 'fail') {
    return { messages: [] as NoraMessage[], busy: null, incoming: null, name: 'Nora',
      load: { status: 'error', error: "Can't reach your PC. Check it's on and online." } as Load, send, retry, undo, undoDid, answer, dropIncoming, reload };
  }
  if (DEMO && demo) {
    return { messages: demo.messages, busy: demo.busy, incoming: demo.incoming, name: demo.prefs.name ?? 'Nora',
      load: { status: 'ready', error: null } as Load, send, retry, undo, undoDid, answer, dropIncoming, reload };
  }
  return { messages, busy, incoming, name, load, send, retry, undo, undoDid, answer, dropIncoming, reload };
}
