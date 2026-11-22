import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Failed, Row, Screen, Section, Skeleton, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { cap, count, HORIZON_GOAL, HORIZON_NOW, M, useReadingSync, useSources } from './data';
import { GoalLine } from './Home';
import { useNav } from './nav';
import { Dot, Link, Tag } from './parts';
import type { Ladder as LadderData } from './types';

const FAM = { work: 'Work', health: 'Health', people: 'People' } as const;

/** Every goal on one ladder, far to near: directions, the year, the quarter, the month, the week, then what waits. */
export function Ladder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<LadderData>(open ? `${M}/ladder` : null);
  const l = r.data;
  const goals = useMemo(() => (l ? l.rungs.flatMap((x) => x.goals) : []), [l]);
  const src = useSources(goals);
  useReadingSync(goals, src);
  return (
    <Screen open={open} onClose={onClose} title="All goals">
      {!l && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !l ? (
        <View style={st.gap}><Skeleton height={80} radius={24} /><Skeleton height={120} radius={24} /><Skeleton height={120} radius={24} /></View>
      ) : (
        <>
          {l.stale ? (
            <Card tone={a.color} style={st.stale}>
              <Text style={t.small}>{cap(count(l.stale, 'goal'))} ran past {l.stale === 1 ? 'its end date' : 'their end dates'} and still {l.stale === 1 ? 'waits' : 'wait'} to be closed.</Text>
              <Link label="Close them" onPress={nav.close} />
            </Card>
          ) : null}

          <Section title="Lifetime directions" action="Edit" onAction={nav.purpose}>
            {l.directions.length ? l.directions.map((d) => <Row key={d.id} title={d.title} sub={FAM[d.fam]} />) : (
              <Text style={t.small}>No directions yet. They are the few things every goal below should point toward.</Text>
            )}
            {l.far.map((g) => <Row key={g.id} title={g.title} sub={HORIZON_GOAL[g.horizon]} left={<Dot aspect={g.aspect} />} chevron onPress={() => nav.goal(g.id)} />)}
          </Section>

          {l.rungs.map((rung) => {
            const room = rung.limit != null && rung.goals.length < rung.limit;
            return (
              <Section key={rung.horizon} title={`${HORIZON_NOW[rung.horizon]}, ${rung.label}`} action={room ? 'Add' : undefined}
                onAction={() => nav.add({ horizon: rung.horizon })}>
                <Text style={[t.caption, t.num]}>
                  {rung.limit != null ? `${rung.goals.length} of ${rung.limit}${room ? '' : ', full'}` : count(rung.goals.length, 'goal')}
                </Text>
                {rung.goals.length ? rung.goals.map((g) => (
                  <View key={g.id} style={st.goal}>
                    <GoalLine g={g} s={src} />
                    {g.parent ? <Tag aspect={g.parent.aspect} text={`Serves ${g.parent.title}`} /> : null}
                  </View>
                )) : <Text style={t.small}>Nothing set.</Text>}
              </Section>
            );
          })}

          {l.later.length ? (
            <Section title="Later">
              {l.later.map((g) => <Row key={g.id} title={g.title} sub={`${HORIZON_GOAL[g.horizon]}, ${g.label}`} left={<Dot aspect={g.aspect} />} chevron onPress={() => nav.goal(g.id)} />)}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  stale: { gap: 4 },
  goal: { gap: 4 },
});
