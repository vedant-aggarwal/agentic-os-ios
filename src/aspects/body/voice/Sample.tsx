import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { invalidate, upload } from '@/lib/mod';
import { Button, Card, CheckRing, Failed, Screen, Skeleton, t, useAspect } from '@/aspects/kit';
import { B, measureSample, startSample, useVoice, type Sample } from '../api';
import { s as u, useSeen } from '../ui';
import { RecordButton } from './Rec';
import type { Recorded } from './recorder';

type Part = 'read' | 'free';

/**
 * The weekly sample: the same passage read aloud, then about 30 seconds of free talk on a prompt. Both go to the
 * PC, which measures them with ffmpeg and its own code; nothing leaves the PC except the transcription it already makes.
 */
export function SampleFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const voice = useVoice(useSeen(open));
  const [sample, setSample] = useState<Sample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [redo, setRedo] = useState<Part | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    startSample().then((r) => { if (!gone) { setSample(r.sample); setError(null); } }, (e: Error) => { if (!gone) setError(e.message); });
    return () => { gone = true; };
  }, [open, attempt]);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) { setRedo(null); setBusy(false); } }

  const hasRead = !!sample?.parts.read;
  const hasFree = !!sample?.parts.free;
  const part: Part = redo ?? (hasRead ? 'free' : 'read');

  const send = async (r: Recorded) => {
    if (!sample) return;
    setBusy(true);
    try {
      const res = await upload<{ sample: Sample; started: boolean }>(`${B}/voice/samples/${sample.id}/audio?part=${part}`, r.uri, r.type);
      setSample(res.sample);
      setRedo(null);
      invalidate(`${B}/`);
      if (res.started) { a.notice('Measuring on your PC. The scores land in Voice in about a minute.'); onClose(); }
    } catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };
  const measure = async () => {
    if (!sample) return;
    setBusy(true);
    try { await measureSample(sample.id); a.notice('Measuring again.'); onClose(); } catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };

  const v = voice.data;
  const loading = !error && (!sample || !v);
  return (
    <Screen open={open} onClose={onClose} title="Voice sample" immersive>
      {error ? <Failed message={error} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} /> : null}
      {!error && voice.error && !v ? <Failed message={voice.error} onRetry={() => { void voice.refresh(); }} /> : null}
      {loading && !voice.error ? <View style={u.gap12}><Skeleton height={56} radius={24} /><Skeleton height={260} radius={24} /><Skeleton height={140} radius={24} /></View> : null}
      {!loading && sample && v ? (
        <>
          <View style={u.row}>
            <PartPill n={1} name="Read aloud" done={hasRead} on={part === 'read'} onPress={hasRead ? () => setRedo(redo === 'read' ? null : 'read') : undefined} />
            <PartPill n={2} name="Talk freely" done={hasFree} on={part === 'free'} onPress={hasFree ? () => setRedo(redo === 'free' ? null : 'free') : undefined} />
          </View>
          {sample.status === 'failed' && hasRead && hasFree && !redo ? (
            <Card style={u.gap12}>
              <Text style={t.strong}>The measuring stopped</Text>
              <Text style={t.small}>{sample.error ?? 'Try measuring again, or record a part again.'}</Text>
              <Button label="Measure again" kind="accent" busy={busy} onPress={() => { void measure(); }} />
            </Card>
          ) : part === 'read' ? (
            <>
              <Card style={u.gap8}>
                <Text style={t.label}>Read this aloud at your normal pace</Text>
                <Text style={[t.body, { lineHeight: 26 }]}>{v.passage}</Text>
              </Card>
              <RecordButton key="read" label="Record the passage" min={10} max={120} busy={busy} onDone={(r) => { void send(r); }} />
            </>
          ) : (
            <>
              <Card style={u.gap8}>
                <Text style={t.label}>Talk for about 30 seconds</Text>
                <Text style={t.title2}>{v.prompt}</Text>
                <Text style={t.small}>Speak as you would to a friend. Pauses are fine; the PC counts fillers and pace.</Text>
              </Card>
              <RecordButton key="free" label="Record your answer" min={20} max={60} busy={busy} onDone={(r) => { void send(r); }} />
            </>
          )}
          <Text style={[t.caption, { textAlign: 'center' }]}>Same quiet room and phone distance each week, so the samples compare.</Text>
        </>
      ) : null}
    </Screen>
  );
}

function PartPill({ n, name, done, on, onPress }: { n: number; name: string; done: boolean; on: boolean; onPress?: () => void }) {
  const a = useAspect();
  return (
    <Card wrap={u.flex} tone={on ? a.color : undefined} onPress={onPress} label={`${name}${done ? ', recorded. Record again' : ''}`} style={[u.row, { paddingVertical: 12 }]}>
      {done ? <CheckRing done size={22} /> : <Text style={[t.label, t.num, { width: 22, textAlign: 'center' }]}>{n}</Text>}
      <Text numberOfLines={1} style={[t.strong, u.flex]}>{name}</Text>
    </Card>
  );
}
