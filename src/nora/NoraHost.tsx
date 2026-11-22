import { useEffect } from 'react';
import { DEMO } from '@/lib/demo';
import { onLink } from '@/lib/links';
import { demoMode, noraDemo } from '@/lib/noraDemo';
import { NoraCall } from './NoraCall';
import { NoraChat } from './NoraChat';
import { NoraHome } from './NoraHome';
import { noraUi } from './state';

// Nora's surfaces, mounted by the dock (src/components/Dock.tsx): Home under the dock, chat and calls over it.
// Links: agenticos://nora and nora/chat open chat (?mic=1 to talk), nora/home opens Home, nora/call rings her, and
// nora/call?id=<incoming id> joins the ring he just answered on the system call screen (lib/calls.ts).

type P = { x: number; y: number };

function useNoraLinks() {
  useEffect(() => onLink('nora', (l) => {
    const part = (l.parts[0] ?? 'chat').toLowerCase();
    if (part === 'call') noraUi.call({ incomingId: l.query.id ?? null, reason: l.query.reason });
    else if (part === 'home') noraUi.openHome();
    else noraUi.openChat({ mic: l.query.mic === '1' });
  }), []);
  // dev-only preview: ?demo&nora=chat|home|call|call-fail|ring opens that surface on load
  useEffect(() => {
    if (!DEMO) return;
    const m = demoMode();
    const id = setTimeout(() => {
      if (m === 'chat' || m === 'empty' || m === 'fail') noraUi.openChat();
      else if (m === 'home' || m === 'home-empty' || m === 'home-fail') noraUi.openHome();
      else if (m === 'call' || m === 'call-fail') noraUi.call();
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
  return (
    <>
      <NoraChat origin={chat} />
      <NoraCall origin={orb} />
    </>
  );
}
