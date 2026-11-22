import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { addDays, Button, Card, haptic, Screen, Section, t, today, useAspect } from '@/aspects/kit';
import { api } from '@/lib/api';
import { newId } from '@/lib/mod';
import { cancel, errText, refreshClean, send, type CleanNow } from './data';
import { Choice, Fig, pct, plural } from './parts';
import { BEFORE, CHANGES, FEELINGS } from './words';

type On = Extract<CleanNow, { setup: true }>;
const WHEN = ['Just now', 'Earlier today', 'Last night'] as const;

/** An instant for one of the When choices. Last night is 23:00 IST yesterday. */
function atFor(w: string) {
  if (w === 'Earlier today') return new Date(Date.now() - 3 * 3600_000).toISOString();
  if (w === 'Last night') return new Date(`${addDays(today(), -1)}T23:00:00+05:30`).toISOString();
  return new Date().toISOString();
}

/**
 * After a slip: three taps of context and one change for next time, then a quiet screen that shows what stays
 * (days kept, the last 30, the longest run) and the change for tomorrow. Undo is there for a wrong tap.
 */
export function Slip({ open, onClose, state, from }: {
  open: boolean; onClose: () => void; state: On | null; from: { key: string; steps: string[] } | null;
}) {
  const { color, notice } = useAspect();
  const [phase, setPhase] = useState<'ask' | 'after'>('ask');
  const [when, setWhen] = useState<string[]>(['Just now']);
  const [before, setBefore] = useState<string[]>([]);
  const [feel, setFeel] = useState<string[]>([]);
  const [change, setChange] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const key = useRef('');
  const [snap, setSnap] = useState<On | null>(null); // the numbers as they were, so the screen doesn't jump when the PC answers

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      key.current = from?.key ?? newId('slp');
      setPhase('ask'); setWhen(['Just now']); setBefore([]); setFeel([]); setChange([]);
    }
    wasOpen.current = open;
  }, [open, from]);

  const log = async () => {
    setBusy(true);
    setSnap(state);
    const body = { id: key.current, at: atFor(when[0] ?? 'Just now'), before, feel, change: change[0] ?? null, source: from ? 'moment' : 'slip' };
    const r = await send({ id: `slip:${key.current}`, method: 'POST', path: '/mod/soul/clean/slip', body });
    setBusy(false);
    haptic.light();
    setPhase('after');
    if (r === 'queued') notice('Saved on this phone. It goes to the PC when it can.');
  };
  const undo = async () => {
    setBusy(true);
    try {
      if (!cancel(`slip:${key.current}`)) await api(`/mod/soul/clean/slip/${key.current}/undo`, { method: 'POST' });
      refreshClean();
      notice('Taken back.');
      onClose();
    } catch (e) {
      notice(errText(e));
    } finally { setBusy(false); }
  };

  const n = snap ?? state;
  return (
    <Screen open={open} onClose={onClose} title="" immersive>
      {phase === 'ask' ? (
        <>
          <View style={s.head}>
            <Text style={t.title2}>Log it, then let it go.</Text>
            <Text style={t.body}>A few taps help you see the pattern later. Skip any of them.</Text>
          </View>
          <Section title="When">
            <Choice options={WHEN} value={when} onChange={(v) => setWhen(v.length ? v : ['Just now'])} />
          </Section>
          <Section title="What came before">
            <Choice options={BEFORE} value={before} onChange={setBefore} multi max={2} />
          </Section>
          <Section title="How you felt">
            <Choice options={FEELINGS} value={feel} onChange={setFeel} multi max={2} />
          </Section>
          <Section title="One change for next time">
            <Choice options={CHANGES} value={change} onChange={setChange} />
          </Section>
          <Button label="Log it" onPress={log} busy={busy} />
          <View style={s.tail} />
        </>
      ) : (
        <>
          <View style={s.head}>
            <Text style={t.title2}>Logged.</Text>
            <Text style={t.body}>Your record still holds every day you kept. The count starts again from there.</Text>
          </View>
          {n ? (
            <Card>
              <View style={s.figs}>
                <Fig value={`${n.kept.kept}`} label={`of ${plural(n.kept.of, 'day')} kept`} color={color} />
                <Fig value={pct(n.last30)} label="last 30 days" />
                <Fig value={`${n.best}`} label="longest run" />
              </View>
            </Card>
          ) : null}
          {change[0] ? (
            <Card tone={color}>
              <Text style={t.caption}>For tomorrow</Text>
              <Text style={[t.lead, s.gap]}>{change[0]}</Text>
            </Card>
          ) : null}
          <Text style={t.small}>Tomorrow is the one to watch. The rough moment is one tap from Soul whenever you need it.</Text>
          <View style={s.actions}>
            <Button label="Done" onPress={onClose} />
            <Button label="Undo, that was a wrong tap" kind="quiet" small onPress={undo} busy={busy} />
          </View>
          <View style={s.tail} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { gap: 8, paddingTop: 8 },
  figs: { flexDirection: 'row', gap: 12 },
  gap: { marginTop: 4 },
  actions: { gap: 12 },
  tail: { height: 48 },
});
