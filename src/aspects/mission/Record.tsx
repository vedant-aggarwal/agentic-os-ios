import { StyleSheet, Text, View } from 'react-native';
import { Card, Empty, Failed, Row, Screen, Section, shortDay, Skeleton, Stat, SURF, t, tint, useAspect } from '@/aspects/kit';
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
  return (
    <Screen open={open} onClose={onClose} title="The record">
      {!d && r.error ? <Failed message={r.error} onRetry={r.refresh} /> : !d ? (
        <View style={st.gap}><Skeleton height={72} /><Skeleton height={140} radius={24} /><Skeleton height={56} /></View>
      ) : !d.totals.set && !d.closed.length ? (
        <Empty title="Nothing on the record yet" body="Goals you set and close show here, week by week, with what happened to each." />
      ) : (
        <>
          <View style={st.stats}>
            <Stat value={String(d.totals.set)} label="Set" />
            <Stat value={String(d.totals.done)} label="Done" color={a.color} />
            <Stat value={String(d.totals.carried)} label="Carried" />
            <Stat value={String(d.totals.missed + d.totals.dropped)} label="Missed or let go" />
          </View>
          <Card style={st.card}>
            <Text style={t.label}>Weeks, set against done</Text>
            <View style={st.chart} accessible accessibilityLabel={d.weeks.map((w) => `${w.label}: ${w.done} of ${w.set}`).join(', ')}>
              {d.weeks.map((w) => {
                const top = Math.max(3, ...d.weeks.map((x) => x.set));
                return (
                  <View key={w.key} style={st.col}>
                    <View style={st.colTrack}>
                      <View style={[st.colSet, { height: `${(w.set / top) * 100}%` }]}>
                        <View style={{ height: w.set ? `${(w.done / w.set) * 100}%` : 0, backgroundColor: w.now ? a.color : tint(a.color, 0.6), borderRadius: 4 }} />
                      </View>
                    </View>
                    <Text style={[t.caption, t.num]}>{Number(w.start.slice(8))}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={t.caption}>Each column is a week, dated by its Monday. The fill is what got done.</Text>
          </Card>
          <Section title="Months">
            {d.months.map((m) => <Row key={m.key} title={cap(m.label)} right={m.set ? `${m.done} of ${m.set}` : 'None set'} />)}
          </Section>
          <Section title="Quarters">
            {d.quarters.map((q) => <Row key={q.key} title={q.label} right={q.set ? `${q.done} of ${q.set}` : 'None set'} />)}
          </Section>
          {d.closed.length ? (
            <Section title={`Closed, ${count(d.closed.length, 'goal')}`}>
              {d.closed.map((c) => (
                <Row key={c.id} title={c.title} left={<Dot aspect={c.aspect} />} onPress={() => nav.goal(c.goal)} chevron
                  sub={[`${OUTCOME_WORD[c.outcome]}, ${c.horizon === 'week' ? `week of ${c.label}` : c.label}`, c.why, c.by === 'growth' ? 'From your weekly review' : null, shortDay(c.at.slice(0, 10))].filter(Boolean).join('. ')} />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  gap: { gap: 16 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  card: { gap: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 112 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  colTrack: { height: 88, alignSelf: 'stretch', justifyContent: 'flex-end' },
  colSet: { backgroundColor: SURF.raised, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden', minHeight: 2 },
});
