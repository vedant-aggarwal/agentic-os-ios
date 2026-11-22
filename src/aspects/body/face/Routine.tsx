import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Empty, Failed, haptic, Screen, Skeleton, t, useAspect } from '@/aspects/kit';
import { tick, useFace, type RoutineRow } from '../api';
import { Guide } from '../guide';
import { s as u, useSeen } from '../ui';
import { WHEN } from './Face';

/** The routine, guided: one step at a time with its timer. Finishing a row ticks it for today. */
export function RoutinePlayer({ open, when, onClose }: { open: boolean; when: 'am' | 'pm' | 'day'; onClose: () => void }) {
  const face = useFace(useSeen(open));
  const r = face.data?.routine ?? null;
  const [queue, setQueue] = useState<RoutineRow[] | null>(null);
  // the rows are fixed when the player opens, so ticking one doesn't reshuffle the list under the thumb
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setQueue(r ? r[when].filter((x) => !x.done) : null); }
  if (open && r && queue == null) setQueue(r[when].filter((x) => !x.done));

  return (
    <Screen open={open} onClose={onClose} title={WHEN[when]} immersive>
      {face.error && !r ? <Failed message={face.error} onRetry={() => { void face.refresh(); }} /> : null}
      {!face.error && !queue ? <View style={u.gap12}><Skeleton height={300} radius={24} /><Skeleton height={52} radius={24} /></View> : null}
      {queue && !queue.length ? <Empty title="All done here" body="Nothing left in this part of the day." action="Back" onAction={onClose} /> : null}
      {queue && queue.length ? <Player key={queue.map((x) => x.id).join()} rows={queue} onClose={onClose} /> : null}
    </Screen>
  );
}

function Player({ rows, onClose }: { rows: RoutineRow[]; onClose: () => void }) {
  const a = useAspect();
  const [row, setRow] = useState(0);
  const [finished, setFinished] = useState(false);
  const cur = rows[row];

  const done = () => {
    void tick(cur.id, true).catch((e: Error) => a.notice(e.message));
    haptic.medium();
    if (row < rows.length - 1) { setRow(row + 1); return; }
    setFinished(true);
    haptic.success();
  };

  if (finished) {
    return (
      <Card style={u.gap12}>
        <Text style={t.title2}>Done for now</Text>
        <Text style={t.body}>{`${rows.length} ${rows.length === 1 ? 'step' : 'steps'} ticked for today.`}</Text>
        <Button label="Back" kind="accent" onPress={onClose} />
      </Card>
    );
  }
  return (
    <>
      <Text style={[t.small, t.num]}>{`${row + 1} of ${rows.length}`}</Text>
      <Guide key={cur.id} title={cur.text} steps={cur.steps.length ? cur.steps : [{ text: cur.text }]} onFinish={done} finish={row < rows.length - 1 ? 'Done, next' : 'Done'} />
      {row < rows.length - 1 ? <Text style={t.small}>{`Then: ${rows[row + 1].text}`}</Text> : null}
    </>
  );
}
