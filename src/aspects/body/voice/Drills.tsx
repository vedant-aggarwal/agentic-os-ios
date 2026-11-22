import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { invalidate, upload } from '@/lib/mod';
import { Button, Card, Empty, Failed, haptic, Loading, Screen, Skeleton, t, useAspect } from '@/aspects/kit';
import { B, tick, usePoll, useVoice, type Drill, type Take } from '../api';
import { Guide } from '../guide';
import { s as u, useSeen } from '../ui';
import { RecordButton } from './Rec';
import type { Recorded } from './recorder';

type Today = Drill & { done: boolean; take: Take | null };

/** Today's drills, one after another. Drills that are recorded get a score for the one thing they train. */
export function DrillPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const voice = useVoice(useSeen(open));
  const drills = voice.data?.today.drills ?? null;
  const [queue, setQueue] = useState<string[] | null>(null);
  // fixed when the player opens; ticking a drill doesn't move the list
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setQueue(drills ? drills.filter((d) => !d.done).map((d) => d.id) : null); }
  if (open && drills && queue == null) setQueue(drills.filter((d) => !d.done).map((d) => d.id));

  return (
    <Screen open={open} onClose={onClose} title="Drills" immersive>
      {voice.error && !drills ? <Failed message={voice.error} onRetry={() => { void voice.refresh(); }} /> : null}
      {!voice.error && !queue ? <View style={u.gap12}><Skeleton height={300} radius={24} /><Skeleton height={52} radius={24} /></View> : null}
      {queue && !queue.length && drills ? <Empty title="Today's drills are done" body="Doing them again is fine; they only count once." action="Do them again" onAction={() => setQueue(drills.map((d) => d.id))} /> : null}
      {queue && queue.length && drills ? <Run key={queue.join()} ids={queue} drills={drills} prompt={voice.data?.prompt ?? ''} onClose={onClose} /> : null}
    </Screen>
  );
}

function Run({ ids, drills, prompt, onClose }: { ids: string[]; drills: Today[]; prompt: string; onClose: () => void }) {
  const a = useAspect();
  const [i, setI] = useState(0);
  const [finished, setFinished] = useState(false);
  const d = drills.find((x) => x.id === ids[i]);

  const next = () => {
    if (!d) return;
    void tick(`voice-${d.id}`, true).catch((e: Error) => a.notice(e.message));
    haptic.medium();
    if (i < ids.length - 1) { setI(i + 1); return; }
    setFinished(true);
    haptic.success();
  };

  if (finished) {
    return (
      <Card style={u.gap12}>
        <Text style={t.title2}>Drills done</Text>
        <Text style={t.body}>{`${ids.length} ${ids.length === 1 ? 'drill' : 'drills'} ticked for today. The weekly sample shows whether they are working.`}</Text>
        <Button label="Back" kind="accent" onPress={onClose} />
      </Card>
    );
  }
  if (!d) return null;
  const head = (
    <View style={u.gap4}>
      <Text style={[t.small, t.num]}>{`${i + 1} of ${ids.length}, about ${d.minutes} min`}</Text>
      <Text style={t.title2}>{d.name}</Text>
      <Text style={t.small}>{d.does}</Text>
    </View>
  );
  const words = d.id === 'one-breath' ? prompt : d.text;
  const textCard = words ? (
    <Card style={u.gap8}>
      <Text style={t.label}>{d.id === 'one-breath' ? 'Answer this' : 'Say this'}</Text>
      <Text style={[t.lead, { lineHeight: 30 }]}>{words}</Text>
    </Card>
  ) : null;
  return (
    <>
      {head}
      {d.measure ? (
        <TakeDrill key={d.id} d={d} text={textCard} last={i === ids.length - 1} onNext={next} />
      ) : (
        <Guide key={d.id} title={d.name} steps={d.steps} onFinish={next} finish={i < ids.length - 1 ? 'Done, next drill' : 'Done'}>{textCard}</Guide>
      )}
    </>
  );
}

/** A drill that is recorded and scored. */
function TakeDrill({ d, text, last, onNext }: { d: Today; text: ReactNode; last: boolean; onNext: () => void }) {
  const a = useAspect();
  const voice = useVoice();
  const [sent, setSent] = useState<Take | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = voice.data?.today.drills.find((x) => x.id === d.id)?.take;
  const take = sent && fresh?.id === sent.id ? fresh : sent;
  usePoll(voice.refresh, take?.status === 'measuring', 2500);

  const send = async (r: Recorded) => {
    setBusy(true);
    try {
      const res = await upload<{ take: Take }>(`${B}/voice/takes?drill=${encodeURIComponent(d.id)}`, r.uri, r.type);
      setSent(res.take);
      invalidate(`${B}/`);
    } catch (e) { a.notice((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      {text}
      <Card style={u.gap4}>
        <Text style={t.body}>{d.steps[0]?.text ?? 'Record it.'}</Text>
      </Card>
      {!take || take.status === 'failed' ? (
        <>
          {take?.status === 'failed' ? <Text style={t.small}>{take.error ?? "The PC couldn't measure that take. Record it again."}</Text> : null}
          <RecordButton label="Record a take" min={3} max={90} busy={busy} onDone={(r) => { void send(r); }} />
          <Button label={last ? 'Skip recording, done' : 'Skip recording, next'} kind="quiet" onPress={onNext} />
        </>
      ) : take.status === 'measuring' ? (
        <Card><Loading label="Measuring the take on your PC" /></Card>
      ) : (
        <>
          <Card tone={a.color} style={u.gap8}>
            <Text style={t.label}>This take</Text>
            <View style={u.between}>
              <Text style={[t.display, t.num]}>{take.score ?? 'Not scored'}</Text>
              {take.value ? <Text style={[t.small, t.num, u.flex, { textAlign: 'right' }]}>{take.value}</Text> : null}
            </View>
            {take.why ? <Text style={t.small}>{take.why}</Text> : null}
          </Card>
          <View style={u.row}>
            <Button label={last ? 'Done' : 'Next drill'} kind="accent" onPress={onNext} wrap={u.flex} />
            <Button label="Try again" kind="quiet" onPress={() => setSent(null)} />
          </View>
        </>
      )}
    </>
  );
}
