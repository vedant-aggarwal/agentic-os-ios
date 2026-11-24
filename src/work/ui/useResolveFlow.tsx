import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { tap } from '@/components/Glass';
import { openSheet } from '../bus';
import { type ResolveHint, work } from '../store';
import { Confirm } from '../thread/Overlay';
import { copyText } from '../thread/ui';
import type { ResolvedItem } from '../types';
import { openResolved } from './nav';
import { ResolvedMenu, type ResolvedMenuAt } from './resolved';
import { useShellInsets } from './Shell';

// Resolving from a hub page: a finished row goes at once; one still working asks first ("Resolve anyway" stops it).
// Holding a resolved row opens its menu; "Continue working on this" opens the job sheet with the chat handed over.
// A page spreads the two handlers into its ListHandlers and puts the overlay in its Shell.

type Ask = { kind: 'job' | 'orca'; id: string; hint: ResolveHint; busy: boolean };

export function useResolveFlow() {
  const pad = useShellInsets(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [menu, setMenu] = useState<ResolvedMenuAt | null>(null);

  const onResolve = useCallback((kind: 'job' | 'orca', id: string, hint: ResolveHint, working: boolean) => {
    if (working) { setAsk({ kind, id, hint, busy: false }); return; }
    work.resolve(kind, id, hint).then((r) => { if (r === 'working') setAsk({ kind, id, hint, busy: false }); });
  }, []);
  const onResolvedHold = useCallback((item: ResolvedItem, e: GestureResponderEvent) => {
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    setMenu({ item, y: e.nativeEvent?.pageY ?? 200 });
  }, []);

  const confirm = async () => {
    if (!ask) return;
    setAsk({ ...ask, busy: true });
    await work.resolve(ask.kind, ask.id, ask.hint, true);
    setAsk(null);
  };

  const overlay = menu ? (
    <ResolvedMenu at={menu} top={pad.safeTop + 16} bottom={pad.bottom} onClose={() => setMenu(null)}
      onContinue={() => { continueResolved(menu.item); setMenu(null); }}
      onOpen={() => { openResolved(menu.item.id); setMenu(null); }}
      onCopy={menu.item.sessionId ? () => {
        const sid = menu.item.sessionId!;
        copyText(sid).then((ok) => work.notify(ok ? 'Session ID copied.' : `This build can’t copy. Session ID: ${sid}`));
        setMenu(null);
      } : null} />
  ) : ask ? (
    <Confirm title="It’s still working. Resolve it?"
      body={ask.kind === 'orca'
        ? 'Resolving stops it and closes its tab in Orca. Its chat is saved first, so you can carry it on later.'
        : 'Resolving stops it. Its chat is saved first, so you can carry it on later.'}
      action="Resolve anyway" danger working={ask.busy ? 'Saving its chat…' : undefined}
      onCancel={() => setAsk(null)} onConfirm={() => { void confirm(); }} />
  ) : null;

  return { onResolve, onResolvedHold, overlay };
}

/** Opens the job sheet that carries a resolved session on: the chat goes along as the continue-resolved skill. */
export function continueResolved(item: ResolvedItem) {
  openSheet({ kind: 'job', project: item.project, resume: item });
}
