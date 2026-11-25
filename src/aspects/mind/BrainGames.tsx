import { StyleSheet, Text, View } from 'react-native';
import { Block, CheckRing, Glyph, Group, Press, R, SURF, Skeleton, WeekStrip, dayLabel, lastDays, t, tint, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import { GAMES, openGame, useGames, type GameId } from './games';
import { G } from './ui';

/**
 * Brain game: Chess, Sudoku or Maths. Any one keeps the day; once one is played the other two read as extras he can
 * still tick. The run of days and this week sit under the three tiles.
 */
export function BrainGames() {
  const a = useAspect();
  const g = useGames();
  if (g.loading) return g.error ? null : <Skeleton height={196} radius={22} />;
  const { run, today } = g.streak;
  const line = today
    ? (run === 1 ? 'Kept today. Tomorrow makes it two in a row.' : `Kept today, ${run} days in a row.`)
    : run ? `${run === 1 ? 'Yesterday counts' : `${run} days in a row`}. One game today keeps it going.` : 'One game today starts a run.';
  const week = lastDays(7, g.day);
  return (
    <Block title="Brain game" sub="Any one of the three keeps the day.">
      <View style={s.tiles}>
        {GAMES.map((x) => (
          <Tile key={x.id} id={x.id} name={x.name} app={x.app} done={g.played.has(x.id)} extra={g.kept && !g.played.has(x.id)}
            onTick={() => { g.toggle(x.id).catch((e) => a.notice((e as Error).message)); }} />
        ))}
      </View>
      <Group pad>
        <Text style={[t.subhead, t.num]}>{line}</Text>
        <WeekStrip size={32} days={week.map((d) => ({
          day: d, today: d === g.day, mark: g.days.has(d) ? 'done' : 'none',
          label: `${dayLabel(d, g.day)}, ${g.days.has(d) ? 'played' : d === g.day ? 'not yet' : 'no game'}`,
        }))} />
      </Group>
    </Block>
  );
}

function Tile({ id, name, app, done, extra, onTick }: { id: GameId; name: string; app: string; done: boolean; extra: boolean; onTick: () => void }) {
  const a = useAspect();
  return (
    <View style={[s.tile, done && { backgroundColor: tint(a.color, 0.12), borderColor: tint(a.color, 0.3) }]}>
      <View style={s.top}>
        <Text numberOfLines={1} style={[t.callout, s.name]}>{name}</Text>
        <Press label={done ? `${name} played today. Take it off` : extra ? `${name}, an extra today. Tick it` : `${name} played today`}
          role="checkbox" state={{ checked: done }} onPress={onTick} feel={done ? 'light' : 'medium'} hitSlop={10} scale={0.9}>
          <CheckRing done={done} size={24} />
        </Press>
      </View>
      <Press label={`Open ${name === 'Maths' ? 'Matiks' : name}`} onPress={() => openGame(id)} role="link" hitSlop={8} feel="light" scale={0.96} style={s.open}>
        <Text numberOfLines={1} style={[t.footnote, extra && !done && { color: C.faint }]}>{extra && !done ? 'Extra' : app}</Text>
        <Glyph sf={G.open[0]} d={G.open[1]} size={12} color={C.faint} />
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, minWidth: 0, minHeight: 88, padding: 12, gap: 8, justifyContent: 'space-between', borderRadius: R.tile, borderCurve: 'continuous',
    backgroundColor: SURF.group, borderWidth: StyleSheet.hairlineWidth, borderColor: SURF.hair,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  name: { flexShrink: 1 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
});
