import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Failed, haptic, Screen, Skeleton, SP, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import type { AspectKey } from '@/theme';
import { HOME, saveScores } from './data';
import { Scorer } from './Score';
import type { Home } from './types';
import { whenSaid } from './ui';

// Scoring on its own, between reviews: nine tracks starting where he left them, one save.

export function ScoreScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const home = useGet<Home>(open ? HOME : null);
  const sections = home.data?.wheel.sections ?? null;
  const [values, setValues] = useState<Partial<Record<AspectKey, number>> | null>(null);
  const [busy, setBusy] = useState(false);
  const start = () => Object.fromEntries((sections ?? []).filter((x) => x.felt != null).map((x) => [x.key, x.felt!])) as Partial<Record<AspectKey, number>>;
  const v = values ?? start();
  const set = Object.keys(v).length;
  const last = home.data?.wheel.scoring.last ?? null;

  const save = async () => {
    setBusy(true);
    try {
      await saveScores(v);
      haptic.success();
      a.notice('Wheel scored');
      setValues(null);
      onClose();
    } catch (e) {
      a.notice((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Screen open={open} onClose={() => { setValues(null); onClose(); }} title="Score your wheel" immersive>
      {!sections ? (
        home.error ? <Failed message={home.error} onRetry={home.refresh} /> : (
          <View style={s.list}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={64} />)}</View>
        )
      ) : (
        <View style={s.list}>
          <Text style={t.body}>
            How each part of your life feels right now, from 0 to 10.
            {last ? ` Each starts at your last score from ${whenSaid(last)}; move only what changed.` : ' Drag or tap each track.'}
          </Text>
          <Scorer sections={sections} values={v} onChange={(k, n) => setValues({ ...v, [k]: n })} />
          <Text style={t.caption}>The white mark is what your data reads. Scoring away from it is fine; it shows up as a gap on the wheel.</Text>
          <Button label={set === 9 ? 'Save scores' : `Save ${set} of 9`} onPress={save} busy={busy} disabled={!set} />
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  list: { gap: SP[24] },
});
