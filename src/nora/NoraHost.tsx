import { useEffect } from 'react';
import { DEMO } from '@/lib/demo';
import { onLink } from '@/lib/links';
import { nora } from '@/lib/nora';
import { demoMode, noraDemo } from '@/lib/noraDemo';
import { LiveCallCard } from './call/LiveTranscript';
import { demoLiveText, useLiveTextSocket } from './call/liveText';
import { NoraCall } from './NoraCall';
import { NoraChat } from './NoraChat';
import { NoraHome } from './NoraHome';
import { noraUi } from './state';

// Nora's surfaces, mounted by the dock (src/components/Dock.tsx): Home under the dock, chat and calls over it.
// Links: agenticos://nora and nora/chat open chat (?mic=1 to talk), nora/home opens Home (?create=1: on the create
// sheet, the My tasks widget's plus), nora/call rings her, and
// nora/call?id=<incoming id> joins the ring he just answered on the system call screen (lib/calls.ts).
// A push about one thing opens where that thing is: nora/chat?ask=ask_<id> (an agent's question, asked in chat)
// opens chat answering it; nora/chat?feed=<id> or ?ask=f_<id> (one of her feed items) opens her page with it first.
// Either way the PC hears he has seen it, so it stops climbing toward an alarm or a call.

type P = { x: number; y: number };

function useNoraLinks() {
  useEffect(() => onLink('nora', (l) => {
    const part = (l.parts[0] ?? 'chat').toLowerCase();
    if (part === 'call') noraUi.call({ incomingId: l.query.id ?? null, reason: l.query.reason });
    else if (part === 'home') { if (l.query.create === '1') noraUi.openCreate(); else noraUi.openHome(); }
    else {
      const ask = l.query.ask, item = l.query.feed ?? ask;
      if (item && !DEMO) nora.seen([item]).catch(() => {});
      if (ask && /^ask_/.test(ask)) noraUi.openChat({ replyTo: { id: ask, from: '' } });
      else if (item) noraUi.openItem(item);
      else noraUi.openChat({ mic: l.query.mic === '1' });
    }
  }), []);
  // agenticos://tasks (a dictated "add these tasks" that made more than one): his task list on Home
  useEffect(() => onLink('tasks', () => noraUi.openHome()), []);
  // dev-only preview: ?demo&nora=chat|home|call|call-fail|ring opens that surface on load
  useEffect(() => {
    if (!DEMO) return;
    const m = demoMode();
    const id = setTimeout(() => {
      if (m === 'chat' || m === 'empty' || m === 'fail') noraUi.openChat();
      else if (m === 'home' || m === 'home-empty' || m === 'home-fail') noraUi.openHome();
      else if (m === 'call' || m === 'call-fail') { noraUi.call(); if (m === 'call') demoLiveText(); }
      else if (m === 'live') demoLiveText(); // the live card over Today, as when a SIM-line call is on
      else if (m === 'ring') { noraDemo.ring('Your client call is in 15 minutes'); noraUi.openChat(); }
    }, 600);
    return () => clearTimeout(id);
  }, []);
}

/** Home, drawn before the dock so the dock stays on top of it. */
export function NoraUnder({ home }: { home: P }) {
  useNoraLinks();
  return <NoraHome origin={home} />;
}

/** Chat and calls, drawn after the dock, over everything. */
export function NoraOver({ chat, orb }: { chat: P; orb: P }) {
  useLiveTextSocket(); // both sides' words while a call runs (call/liveText.ts)
  return (
    <>
      <LiveCallCard />
      <NoraChat origin={chat} />
      <NoraCall origin={orb} />
    </>
  );
}
