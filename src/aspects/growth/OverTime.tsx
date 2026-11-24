import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Chip, Empty, Failed, num, Screen, Section, Skeleton, SP, t, useAspect } from '@/aspects/kit';
import { useGet } from '@/lib/mod';
import { C, type AspectKey } from '@/theme';
import { Chart, ChartKey } from './Chart';
import { WHEEL } from './data';
import type { Section as Sec, WheelData } from './types';
import { feltLine, TREND_WORD, whenSaid } from './ui';
import { Wheel, WheelKey } from './Wheel';

// Each section across weeks. A section only reads as rising or sliding when the last four weeks sit at least a
// point and clearly beyond the week to week noise away from the four before; anything less is steady.

const WHY: Record<Sec['trend']['state'], string> = {
  up: 'The last four weeks sit clearly above the four before.',
  down: 'The last four weeks sit clearly below the four before.',
  steady: 'Any change is within the usual week to week wobble.',
  early: 'Needs six weeks of data before it can say.',
};

export function OverTime({ open, start, onClose }: { open: boolean; start: AspectKey | null; onClose: () => void }) {
  const a = useAspect();
  const wheel = useGet<WheelData>(open ? WHEEL : null);
  const [focus, setFocus] = useState<AspectKey | null>(start);
  const [cmp, setCmp] = useState<string | null>(null);
  const [was, setWas] = useState(open);
  if (open !== was) { setWas(open); if (open) setFocus(start); }
  const d = wheel.data;
  const width = a.width - SP[32] - SP[32];
  const sec = focus && d ? d.sections.find((x) => x.key === focus) ?? null : null;

  return (
    <Screen open={open} onClose={sec && !start ? () => setFocus(null) : onClose} title={sec ? sec.name : 'Over time'}>
      {!d ? (
        wheel.error ? <Failed message={wheel.error} onRetry={wheel.refresh} /> : (
          <View style={s.list}>
            <Skeleton height={300} radius={150} width={300} />
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={96} />)}
          </View>
        )
      ) : sec ? (
        <Detail sec={sec} d={d} width={width} />
      ) : (
        <View style={s.list}>
          <ThenNow d={d} cmp={cmp} setCmp={setCmp} size={Math.min(a.width - SP[32], 340)} />
          <Section title="Week by week">
            <ChartKey />
            {d.sections.map((x) => (
              <Card key={x.key} onPress={() => setFocus(x.key)} label={`${x.name}, ${x.note ? 'not tracked yet' : TREND_WORD[x.trend.state]}`} style={s.card}>
                <View style={s.cardHead}>
                  <Text style={[t.strong, s.flex]}>{x.name}</Text>
                  <Text style={[t.label, !x.note && (x.trend.state === 'up' || x.trend.state === 'down') ? { color: C.text } : null]}>{x.note ? 'Not tracked yet' : TREND_WORD[x.trend.state]}</Text>
                </View>
                {x.series.some((v) => v != null) || x.feltHistory.length ? (
                  <Chart series={x.series} weeks={d.weeks} felt={x.feltHistory} width={width} height={56} />
                ) : null}
                {x.note ? <Text style={t.caption}>{x.note}</Text> : null}
                {!x.series.some((v) => v != null) ? <Text style={t.caption}>{x.feltHistory.length ? 'No data from this part of your life yet. Only your score shows.' : 'Nothing here yet. Score the wheel and this fills in week by week.'}</Text> : null}
              </Card>
            ))}
          </Section>
        </View>
      )}
    </Screen>
  );
}

/** The wheel now against an earlier scoring, as a dashed outline. */
function ThenNow({ d, cmp, setCmp, size }: { d: WheelData; cmp: string | null; setCmp: (v: string | null) => void; size: number }) {
  const earlier = d.snapshots.slice(0, -1).reverse();
  const pick = cmp ?? earlier[0]?.date ?? null;
  const then = pick ? d.snapshots.find((x) => x.date === pick)?.scores ?? null : null;
  const [sel, setSel] = useState<AspectKey | null>(null);
  if (!d.snapshots.length) {
    return <Card><Empty title="The wheel then and now" body="After two scorings the wheel shows how each section moved between them." /></Card>;
  }
  return (
    <Section title="The wheel then and now">
      <View style={s.centre}><Wheel sections={d.sections} size={size} selected={sel} onSelect={(k) => setSel(sel === k ? null : k)} then={then} showData={false} /></View>
      <WheelKey showData={false} thenLabel={pick ? `Scored ${whenSaid(pick)}` : undefined} />
      {earlier.length > 1 ? (
        <View style={s.chips}>
          {earlier.slice(0, 6).map((x) => (
            <Chip key={x.date} label={whenSaid(x.date).split(', ')[0]} selected={pick === x.date} onPress={() => setCmp(x.date)} />
          ))}
        </View>
      ) : null}
      {!earlier.length ? <Text style={[t.small, s.centreText]}>One scoring so far. Score again and the earlier one shows here as an outline.</Text> : null}
      {sel ? <Text style={[t.small, s.centreText]}>{changeLine(d.sections.find((x) => x.key === sel)!, then)}</Text> : null}
    </Section>
  );
}

function changeLine(sec: Sec, then: Partial<Record<AspectKey, number>> | null) {
  const was = then?.[sec.key];
  if (sec.felt == null) return `${sec.name} isn't scored yet.`;
  if (was == null) return `${sec.name}: ${num(sec.felt, 1)} now, not scored then.`;
  const dv = sec.felt - was;
  if (Math.abs(dv) < 2) return `${sec.name}: ${num(was, 1)} then, ${num(sec.felt, 1)} now. Within the usual wobble of a felt score.`;
  return `${sec.name}: ${num(was, 1)} then, ${num(sec.felt, 1)} now, ${dv > 0 ? 'up' : 'down'} ${num(Math.abs(dv), 1)}.`;
}

function Detail({ sec, d, width }: { sec: Sec; d: WheelData; width: number }) {
  const f = feltLine(sec);
  const tr = sec.trend;
  const nums = sec.series.filter((v): v is number => v != null);
  const quiet = !!sec.note; // nothing logged lately: no number, no average, the note says why
  return (
    <View style={s.list}>
      <Card style={s.card}>
        <View style={s.cardHead}>
          <Text style={[t.title2, s.flex]}>{quiet ? 'Not tracked yet' : TREND_WORD[tr.state]}</Text>
          {!quiet && tr.now != null ? <Text style={[t.label, t.num]}>{num(tr.now, 1)} lately</Text> : null}
        </View>
        <Text style={t.small}>
          {quiet ? sec.note : WHY[tr.state]}
          {!quiet && tr.now != null && tr.before != null ? ` Last four weeks average ${num(tr.now, 1)}, the four before ${num(tr.before, 1)}.` : ''}
        </Text>
        {nums.length || sec.feltHistory.length ? (
          <Chart series={sec.series} weeks={d.weeks} felt={sec.feltHistory} width={width} height={160} trend={quiet ? null : tr} axis />
        ) : null}
        <ChartKey trend={!quiet && tr.now != null && tr.before != null} />
      </Card>

      <Section title="Your score and the data">
        <Text style={t.body}>{f.head} {f.data}</Text>
        {f.verdict ? <Text style={t.strong}>{f.verdict}</Text> : null}
        {sec.evidence.map((e) => <Text key={e} style={t.small}>{e}</Text>)}
        {sec.sources.length ? <Text style={t.caption}>Read from: {sec.sources.join(', ').toLowerCase()}.</Text> : null}
      </Section>

      {sec.feltHistory.length ? (
        <Section title="Every time you scored it">
          {[...sec.feltHistory].reverse().map((h) => (
            <View key={h.date} style={s.histRow}>
              <Text style={[t.body, s.flex]}>{whenSaid(h.date)}</Text>
              <Text style={[t.strong, t.num]}>{num(h.v, 1)}</Text>
            </View>
          ))}
        </Section>
      ) : null}
      <Text style={t.caption}>
        Felt scores move a point or two on their own from one scoring to the next, so only a change of {d.noise.felt} or more gets an arrow on the wheel.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: SP[24] },
  centre: { alignItems: 'center' },
  centreText: { textAlign: 'center' },
  card: { gap: SP[8] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8], justifyContent: 'center' },
  histRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: SP[12] },
});
