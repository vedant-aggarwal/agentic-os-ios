import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DEMO } from '@/lib/demo';
import { C, F } from '@/theme';
import { workApi } from '../api';
import { work } from '../store';
import type { NeedItem, PermOption } from '../types';
import { ago } from './format';
import { LiveDot } from './LiveDot';
import { openJob } from './nav';
import { Press } from './Press';
import { FAILED, NEEDS, T } from './tokens';

const KIND: Record<NeedItem['kind'], string> = {
  permission: 'Asks permission', review: 'Ready to review', question: 'Has a question', failed: 'Failed',
};

/**
 * Cards answered from here leave the list at once and stay gone until the next refresh drops them for real
 * (optimistic, speed rule 3). One per screen.
 */
export function useAnswered() {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = useCallback((id: string) => setHidden((h) => new Set(h).add(id)), []);
  const unhide = useCallback((id: string) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; }), []);
  return { hidden, hide, unhide };
}

const isAllow = (o: PermOption) => o.kind.startsWith('allow');

/**
 * One thing waiting on him. A permission is answered right on the card; a review, question or failure opens
 * the job. `heading` is the project name on the hub; inside a project it says what kind of wait this is.
 */
export function NeedCard({ need, heading, onHide, onUndo, onSent }: {
  need: NeedItem; heading?: string | null;
  /** Answered: take the card out of the list now. */
  onHide: (id: string) => void;
  /** The answer didn't reach the PC: bring the card back. */
  onUndo: (id: string) => void;
  /** The PC took the answer: refresh the lists. */
  onSent: () => void;
}) {
  const failed = need.kind === 'failed';
  const options = need.kind === 'permission' && need.requestId ? need.options ?? [] : [];
  const primary = options.find(isAllow)?.optionId ?? options[0]?.optionId;

  // Optimistic: the card goes at once; a failed send brings it back with the reason.
  function answer(o: PermOption) {
    onHide(need.id);
    if (DEMO) { work.notify('Demo: nothing was sent to the PC.'); return; }
    workApi.permission(need.jobId, need.requestId!, o.optionId)
      .then(onSent)
      .catch((e: Error) => { onUndo(need.id); work.notify(e.message); });
  }

  const action = need.kind === 'review' ? 'Review changes' : need.kind === 'question' ? 'Answer' : 'Open job';
  return (
    <View style={[s.card, failed && s.cardFailed]}>
      {/* the text opens the job; the buttons below stay their own targets (and their own VoiceOver stops) */}
      <Press onPress={() => openJob(need.jobId)} accessibilityHint="Opens the job" style={s.body}
        accessibilityLabel={`${heading ? `${heading}. ` : ''}${KIND[need.kind]}: ${need.title}${need.detail ? `. ${need.detail}` : ''}`}>
        <View style={s.top}>
          <LiveDot tone={failed ? 'failed' : 'needs'} />
          <Text numberOfLines={1} style={[s.heading, { color: failed ? FAILED : NEEDS }]}>{heading ?? KIND[need.kind]}</Text>
          <Text style={T.meta}>{ago(need.at)}</Text>
        </View>
        <Text numberOfLines={3} style={s.title}>{need.title}</Text>
        {need.detail ? <Text numberOfLines={3} style={s.detail}>{need.detail}</Text> : null}
      </Press>
      <View style={s.actions}>
        {options.length ? options.map((o) => (
          <Button key={o.optionId} label={o.name} primary={o.optionId === primary} grow={options.length <= 2} onPress={() => answer(o)} />
        )) : (
          <Button label={action} primary={!failed} grow onPress={() => openJob(need.jobId)} />
        )}
      </View>
    </View>
  );
}

function Button({ label, primary, grow, onPress }: { label: string; primary?: boolean; grow?: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} haptic style={[s.btn, grow && s.grow, primary ? s.btnPrimary : s.btnSecondary]}>
      <Text numberOfLines={1} style={[T.button, primary && { color: C.scene }]}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  // a warm hairline: this card is the one thing on the page that waits on him
  card: {
    borderRadius: 28, padding: 16, gap: 16, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,161,92,0.36)',
  },
  cardFailed: { borderColor: 'rgba(248,113,113,0.32)' },
  body: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, fontFamily: F.semibold, fontSize: 14, lineHeight: 20 },
  title: { fontFamily: F.semibold, fontSize: 18, lineHeight: 24, color: C.text },
  detail: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 12 pt corners inside the card's 28 at a 16 pt gap: concentric
  btn: { height: 44, minWidth: 96, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  btnPrimary: { backgroundColor: C.text },
  btnSecondary: { backgroundColor: 'rgba(255,255,255,0.1)' },
});
