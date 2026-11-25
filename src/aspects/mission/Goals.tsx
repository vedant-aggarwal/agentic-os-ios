import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Failed, Group, Icon, Item, Lead, Skeleton, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C } from '@/theme';
import { cap, count, HORIZON_GOAL, HORIZON_NOW, M, NUMBER_WORDS, useReadingSync, useSources } from './data';
import { useNav } from './nav';
import { Disc, Dot, GoalRow } from './parts';
import type { Ladder as LadderData } from './types';

export const LADDER = `${M}/ladder`;
const FAM = { work: 'Work', health: 'Health', people: 'People' } as const;
/** A direction's dot: work in Mission's colour, health in Body's, people in Family's. */
const FAM_ASPECT = { work: 'mission', health: 'body', people: 'family' } as const;

/**
 * Goals: every goal on one ladder, far to near. Life (the directions and life goals), the year, the quarter, the
 * month and the week, each with its bars and how full it is, then what waits for a later period.
 */
export function GoalsTab({ active }: { active: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<LadderData>(a.open && active ? LADDER : null);
  const l = r.data;
  const goals = useMemo(() => (l ? [...l.far, ...l.rungs.flatMap((x) => x.goals), ...l.later] : []), [l]);
  const src = useSources(goals);
  useReadingSync(goals, src);

  if (!l && r.error) return <Failed message={r.error} onRetry={r.refresh} />;
  if (!l) {
    return (
      <View style={st.gap20} accessibilityLabel="Loading goals">
        <Skeleton height={18} width="35%" /><Skeleton height={120} radius={22} /><Skeleton height={18} width="35%" /><Skeleton height={200} radius={22} />
      </View>
    );
  }
  const set = l.rungs.reduce((n, x) => n + x.goals.length, 0) + l.far.length;
  return (
    <>
      {l.stale ? (
        <Lead>
          <View style={st.gap4}>
            <Text style={[t.footnote, { color: a.color }]}>To close</Text>
            <Text style={t.title3}>{`${cap(count(l.stale, 'goal'))} ran past ${l.stale === 1 ? 'its end date' : 'their end dates'}`}</Text>
            <Text style={t.subhead}>Say what happened to each: done, missed, carried on or let go. It all stays on your record.</Text>
          </View>
          <Button label="Close them" kind="accent" onPress={nav.close} />
        </Lead>
      ) : !set ? (
        <Lead>
          <View style={st.gap4}>
            <Text style={t.title3}>No goals yet</Text>
            <Text style={t.subhead}>Start near: up to three things this week has to move. Bigger goals can come once the weeks are moving.</Text>
          </View>
          <Button label="Add a goal" kind="accent" onPress={() => nav.add({ horizon: 'week' })} icon={<Icon name="plus" size={18} color="#14161C" />} />
        </Lead>
      ) : null}

      <Block title="Life" sub="The directions every goal below points toward" action={l.directions.length ? 'Edit' : undefined} onAction={() => nav.openTab('purpose')}>
        <Group inset={36}>
          {l.directions.map((d) => <Item key={d.id} title={d.title} sub={FAM[d.fam]} left={<Dot aspect={FAM_ASPECT[d.fam]} />} />)}
          {l.far.map((g) => (
            <Item key={g.id} title={g.title} sub={HORIZON_GOAL[g.horizon]} left={<Dot aspect={g.aspect} />} chevron onPress={() => nav.goal(g.id)} />
          ))}
          {!l.directions.length && !l.far.length ? (
            <Item title="No directions yet" sub="A few lines that hold for life" left={<Dot aspect={null} />}
              action={<Button label="Write them" kind="soft" small onPress={() => nav.openTab('purpose')} />} />
          ) : null}
        </Group>
      </Block>

      {l.rungs.map((rung) => {
        const room = rung.limit != null && rung.goals.length < rung.limit;
        const name = rung.horizon === 'week' && rung.start > l.today ? 'Next week' : HORIZON_NOW[rung.horizon];
        return (
          <Block key={rung.horizon} title={name} sub={rung.limit != null ? `${rung.label}, ${rung.goals.length} of ${rung.limit}` : rung.label}
            action={room && rung.goals.length ? 'Add' : undefined} onAction={() => nav.add({ horizon: rung.horizon, start: rung.horizon === 'week' ? rung.start : null })}>
            <Group>
              {rung.goals.map((g) => <GoalRow key={g.id} g={g} src={src} serves />)}
              {!rung.goals.length ? (
                <Item title="Nothing set yet" sub={rung.limit != null ? `Room for ${NUMBER_WORDS[rung.limit] ?? rung.limit}` : null}
                  left={<Disc><Icon name="plus" size={16} color={C.textSoft} /></Disc>}
                  onPress={() => nav.add({ horizon: rung.horizon, start: rung.horizon === 'week' ? rung.start : null })} />
              ) : null}
            </Group>
            {rung.goals.length > 0 && !room ? <Text style={[t.footnote, st.note]}>{`Full. A new ${rung.horizon} goal replaces one of these.`}</Text> : null}
          </Block>
        );
      })}

      {l.later.length ? (
        <Block title="Later" sub="Set for a period that has not started">
          <Group inset={36}>
            {l.later.map((g) => <Item key={g.id} title={g.title} sub={`${HORIZON_GOAL[g.horizon]}, ${g.label}`} left={<Dot aspect={g.aspect} />} chevron onPress={() => nav.goal(g.id)} />)}
          </Group>
        </Block>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  gap4: { gap: 4 },
  gap20: { gap: 20 },
  note: { paddingHorizontal: 4 },
});
