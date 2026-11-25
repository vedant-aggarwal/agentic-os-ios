import { StyleSheet, Text, View } from 'react-native';
import { Block, dayOf, Empty, Failed, Group, Item, Metric, Metrics, Screen, shortDay, Skeleton, t, tint, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { cap, count, M, OUTCOME_WORD } from './data';
import { useNav } from './nav';
import { Dot } from './parts';
import type { RecordView } from './types';

/** What was set and what happened to it, week by week, month by month. Every closed goal keeps its outcome. */
export function RecordScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const a = useAspect();
  const nav = useNav();
  const r = useGet<RecordView>(open ? `${M}/record` : null);
  const d = r.data;
  // closings written here, plus goals marked done straight in the core store (Growth's review does this), newest first
  const closed = d ? [...d.closed, ...d.done].sort((x, y) => String(y.at).localeCompare(String(x.at))) : [];
  const top = d ? Math.max(3, ...d.weeks.map((x) => x.set)) : 3;
  return (
    <Screen open={open} onClose={onClose} title="The record">
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !d ? (
        <View style={st.gap16}><Skeleton height={88} radius={22} /><Skeleton height={180} radius={22} /><Skeleton height={120} radius={22} /></View>
      ) : !d.totals.set && !closed.length ? (
        <Empty title="Nothing on the record yet" body="Goals you set and close show here, week by week, with what happened to each." />
      ) : (
        <>
          <Group pad>
            <Metrics>
              <Metric size="m" label="Set" value={String(d.totals.set)} />
              <Metric size="m" label="Done" value={String(d.totals.done)} color={d.totals.done ? a.color : undefined} />
              <Metric size="m" label="Carried" value={String(d.totals.carried)} />
              <Metric size="m" label="Missed" value={String(d.totals.missed + d.totals.dropped)} sub="or let go" />
            </Metrics>
            {d.since ? <Text style={t.footnote}>{`Since ${shortDay(d.since)}, when the first goal was set.`}</Text> : null}
          </Group>

          <Block title="Weeks" sub="Set against done. Each column is a week, dated by its Monday.">
            <Group pad>
              <View style={st.chart} accessible accessibilityLabel={d.weeks.map((w) => `Week of ${w.label}: ${w.done} of ${w.set} done`).join(', ')}>
                {d.weeks.map((w) => (
                  <View key={w.key} style={st.col}>
                    <View style={st.colTrack}>
                      <View style={[st.colSet, { height: `${Math.max(3, (w.set / top) * 100)}%` }]}>
                        <View style={{ height: w.set ? `${(w.done / w.set) * 100}%` : 0, backgroundColor: w.now ? a.color : tint(a.color, 0.6), borderRadius: 4 }} />
                      </View>
                    </View>
                    <Text style={[t.micro, t.num, w.now && st.now]}>{Number(w.start.slice(8))}</Text>
                  </View>
                ))}
              </View>
            </Group>
          </Block>

          <Block title="Months and quarters">
            <Group>
              {[...d.months, ...d.quarters].filter((m) => m.set || m.now).map((m) => (
                <Item key={m.key} title={cap(m.label)} sub={m.now ? 'Now' : null} value={m.set ? `${m.done} of ${m.set}` : 'None set'} />
              ))}
            </Group>
          </Block>

          {closed.length ? (
            <Block title="Closed" sub={cap(count(closed.length, 'goal'))}>
              <Group inset={36}>
                {closed.map((c) => (
                  <Item key={c.id} title={c.title} left={<Dot aspect={c.aspect} />} onPress={() => nav.goal(c.goal)} chevron value={OUTCOME_WORD[c.outcome]}
                    sub={[`${c.horizon === 'week' ? `Week of ${c.label}` : c.label}, closed ${shortDay(dayOf(c.at))}`, c.why, c.by === 'growth' ? 'From your weekly review' : null].filter(Boolean).join('. ')} />
                ))}
              </Group>
            </Block>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  gap16: { gap: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  colTrack: { height: 96, alignSelf: 'stretch', justifyContent: 'flex-end' },
  colSet: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  now: { color: '#FFFFFF' },
});
