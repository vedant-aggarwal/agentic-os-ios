import { StyleSheet, Text, View } from 'react-native';
import { Block, Button, Group, Icon, IconButton, Item, num, shortDay, Spark, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import { useNav } from './nav';
import type { Home, Section } from './types';
import { feltLine, TREND_WORD, whenSaid } from './ui';
import { Wheel, WheelKey } from './Wheel';

/**
 * The wheel: his own score for each of the nine sections against what the data shows, read honestly. A tap on a
 * section opens its card; under it, each section week by week, and the wheel then and now.
 */
export function WheelTab({ home }: { home: Home }) {
  const a = useAspect();
  const nav = useNav();
  const w = home.wheel, sc = w.scoring;
  const size = Math.min(a.width - 32, 360);
  const sec = nav.pick ? w.sections.find((x) => x.key === nav.pick) ?? null : null;
  return (
    <>
      <View style={s.centre}>
        <Wheel sections={w.sections} size={size} selected={nav.pick} onSelect={(k) => nav.setPick(nav.pick === k ? null : k)} />
      </View>
      <WheelKey />
      {sec ? <SectionCard sec={sec} /> : <Summary home={home} />}
      <Button label={sc.due ? 'Score the wheel' : 'Score it again'} kind={sc.due ? 'accent' : 'quiet'} onPress={() => nav.openFlow({ kind: 'score' })} />

      <Block title="Week by week" sub="White is what the data shows each week, on the same 0 to 10 scale. Tap one for its weeks and your scores.">
        <Group>
          {w.sections.map((x) => (
            <Item key={x.key} title={x.name} sub={trendSub(x)} onPress={() => nav.openFlow({ kind: 'time', section: x.key })} chevron
              right={x.series.some((v) => v != null) && !x.note ? <Spark values={x.series} width={80} height={36} range={[0, 10]} color={C.text} stroke={1.5} /> : undefined}
              label={`${x.name}, ${trendSub(x)}. Open its weeks`} />
          ))}
        </Group>
      </Block>

      <Block title="Then and now">
        <Group>
          <Item title="Compare two scorings" onPress={() => nav.openFlow({ kind: 'time', section: null })} chevron
            sub={w.snapshots.length > 1 ? `Your scores now against ${shortDay(w.snapshots.at(-2)!.date)}, or any scoring before` : 'After two scorings this shows how each section moved'} />
        </Group>
      </Block>
    </>
  );
}

function trendSub(x: Section) {
  if (x.note) return 'Not tracked lately';
  if (x.trend.state === 'early') return x.trend.now != null ? `Too early to tell, ${num(x.trend.now, 1)} lately` : 'No data yet';
  return x.trend.now != null ? `${TREND_WORD[x.trend.state]}, ${num(x.trend.now, 1)} lately` : TREND_WORD[x.trend.state];
}

/** Under the wheel when nothing is picked: how old the scores are, what moved, where score and data part most. */
function Summary({ home }: { home: Home }) {
  const nav = useNav();
  const w = home.wheel, sc = w.scoring;
  const moved = w.sections.filter((x) => x.moved && x.change != null);
  const line1 = sc.scored && sc.last ? `Scored ${whenSaid(sc.last)}.` : 'Not scored yet.';
  const line2 = !sc.scored ? 'Score it once and the wheel fills in.'
    : !sc.previous ? 'One scoring so far. The next shows what moved.'
    : moved.length ? `Since ${shortDay(sc.previous)}: ${moved.map((x) => `${x.name} ${x.change! > 0 ? 'up' : 'down'} ${Math.abs(x.change!)}`).join(', ')}.`
    : 'Nothing moved more than a point since the scoring before.';
  const gaps = w.sections.filter((x) => x.agree && x.agree !== 'agree' && x.felt != null && x.measured != null)
    .sort((x, y) => Math.abs(y.felt! - y.measured!) - Math.abs(x.felt! - x.measured!));
  const g = gaps[0];
  return (
    <>
      <Text style={[t.subhead, s.centreText]}>{`${line1} ${line2}`}</Text>
      {g ? (
        <Group>
          <Item title={`${g.name}: you scored ${num(g.felt!, 1)}, the data reads ${num(g.measured!, 1)}`} sub="Where your score and the data part most"
            onPress={() => nav.setPick(g.key)} chevron />
        </Group>
      ) : null}
    </>
  );
}

/** One section, picked on the wheel: his score, what the data reads, the evidence, and where to go next. */
function SectionCard({ sec }: { sec: Section }) {
  const a = useAspect();
  const nav = useNav();
  const f = feltLine(sec);
  const old = sec.feltDate ? whenSaid(sec.feltDate) : null;
  return (
    <Group pad>
      <View style={s.head}>
        <Text accessibilityRole="header" style={[t.title3, s.fill]}>{sec.name}</Text>
        <IconButton label={`Close ${sec.name}`} size={36} plain onPress={() => nav.setPick(null)}><Icon name="close" size={16} /></IconButton>
      </View>
      <Text style={t.subhead}>{`${f.head} ${f.data}`}</Text>
      {old && /months/.test(old) ? <Text style={t.footnote}>{`That score is ${old.split(', ')[1]} old now.`}</Text> : null}
      {f.verdict ? <Text style={t.callout}>{f.verdict}</Text> : null}
      {sec.evidence.length ? (
        <View style={s.evidence}>
          {sec.evidence.map((e) => (
            <View key={e} style={s.evRow}><View style={s.evBar} /><Text style={[t.footnote, s.fill]}>{e}</Text></View>
          ))}
        </View>
      ) : null}
      {sec.note ? null : <Text style={t.footnote}>{sec.trend.state === 'early' ? 'Too early to call a trend.' : `Over the last month: ${TREND_WORD[sec.trend.state].toLowerCase()}.`}</Text>}
      <View style={s.actions}>
        <Button label={`Open ${sec.name}`} kind="soft" small onPress={() => a.openAspect(sec.key)} />
        <Button label="Its weeks" kind="quiet" small onPress={() => nav.openFlow({ kind: 'time', section: sec.key })} />
      </View>
    </Group>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  centre: { alignItems: 'center' },
  centreText: { textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evidence: { gap: 4 },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  evBar: { width: 2, height: 16, borderRadius: 1, backgroundColor: C.faint },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
});
