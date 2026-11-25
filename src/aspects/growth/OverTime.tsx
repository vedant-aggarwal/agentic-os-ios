import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Block, Chip, Failed, Group, Item, num, Press, Screen, Skeleton, SP, t, useAspect } from '@/aspects/kit';
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
  // a first visit: no week read and nothing scored, so one card says so instead of nine
  const blank = !!d && d.sections.every((x) => !x.series.some((v) => v != null) && !x.feltHistory.length);

  return (
    <Screen open={open} onClose={sec && !start ? () => setFocus(null) : onClose} title={sec ? sec.name : 'Over time'}>
      {!d ? (
        wheel.error ? <Failed message={wheel.error} onRetry={wheel.refresh} /> : (
          <View style={s.list}>
            <View style={s.centre}><Skeleton height={300} radius={150} width={300} /></View>
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={112} radius={22} />)}
          </View>
        )
      ) : sec ? (
        <Detail sec={sec} d={d} width={width} />
      ) : (
        <View style={s.list}>
          <ThenNow d={d} cmp={cmp} setCmp={setCmp} size={Math.min(a.width - SP[32], 340)} />
          <Block title="Week by week" sub={blank ? undefined : 'Each section on the same 0 to 10 scale. Tap one for its weeks and every score you gave it.'}>
            {blank ? (
              <Group pad>
                <Text style={t.callout}>Nothing here yet</Text>
                <Text style={t.footnote}>Score the wheel and each section fills in week by week. A trend needs six weeks of data.</Text>
              </Group>
            ) : <ChartKey />}
            {blank ? null : d.sections.map((x) => {
              const word = x.note ? 'Not tracked lately' : TREND_WORD[x.trend.state];
              const empty = !x.series.some((v) => v != null);
              return (
                <Press key={x.key} label={`${x.name}, ${word}. Open its weeks`} onPress={() => setFocus(x.key)} scale={0.98}>
                  <Group pad>
                    <View style={s.cardHead}>
                      <Text style={[t.callout, s.flex]}>{x.name}</Text>
                      <Text style={[t.footnote, !x.note && (x.trend.state === 'up' || x.trend.state === 'down') ? { color: C.text } : null]}>{word}</Text>
                    </View>
                    {!empty || x.feltHistory.length ? <Chart series={x.series} weeks={d.weeks} felt={x.feltHistory} width={width} height={56} /> : null}
                    {x.note ? <Text style={t.footnote}>{x.note}</Text> : null}
                    {empty ? (
                      <Text style={t.footnote}>{x.feltHistory.length ? 'No data from this part of your life yet. Only your score shows.' : 'Nothing here yet. Score the wheel and this fills in week by week.'}</Text>
                    ) : null}
                  </Group>
                </Press>
              );
            })}
          </Block>
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
    return (
      <Block title="The wheel then and now">
        <Group pad>
          <Text style={t.callout}>Nothing to compare yet</Text>
          <Text style={t.footnote}>After two scorings the wheel shows how each section moved between them.</Text>
        </Group>
      </Block>
    );
  }
  return (
    <Block title="The wheel then and now" gap={16}>
      <View style={s.centre}><Wheel sections={d.sections} size={size} selected={sel} onSelect={(k) => setSel(sel === k ? null : k)} then={then} showData={false} /></View>
      <WheelKey showData={false} thenLabel={pick ? `Scored ${whenSaid(pick)}` : undefined} />
      {earlier.length > 1 ? (
        <View style={s.chips}>
          {earlier.slice(0, 6).map((x) => (
            <Chip key={x.date} label={whenSaid(x.date).split(', ')[0]} selected={pick === x.date} onPress={() => setCmp(x.date)} />
          ))}
        </View>
      ) : null}
      {!earlier.length ? <Text style={[t.subhead, s.centreText]}>One scoring so far. Score again and the earlier one shows here as an outline.</Text> : null}
      {sel ? <Text style={[t.subhead, s.centreText]}>{changeLine(d.sections.find((x) => x.key === sel)!, then)}</Text> : null}
    </Block>
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
      <Group pad>
        <View style={s.cardHead}>
          <Text accessibilityRole="header" style={[t.title3, s.flex]}>{quiet ? 'Not tracked lately' : TREND_WORD[tr.state]}</Text>
          {!quiet && tr.now != null ? <Text style={[t.subhead, t.num]}>{`${num(tr.now, 1)} lately`}</Text> : null}
        </View>
        <Text style={t.subhead}>
          {quiet ? sec.note : WHY[tr.state]}
          {!quiet && tr.now != null && tr.before != null ? ` On average ${num(tr.now, 1)} lately, against ${num(tr.before, 1)} before.` : ''}
        </Text>
        {nums.length || sec.feltHistory.length ? (
          <>
            <Chart series={sec.series} weeks={d.weeks} felt={sec.feltHistory} width={width} height={160} trend={quiet ? null : tr} axis />
            <ChartKey trend={!quiet && tr.now != null && tr.before != null} />
          </>
        ) : null}
      </Group>

      <Block title="Your score and the data">
        <Group pad>
          <Text style={t.subhead}>{`${f.head} ${f.data}`}</Text>
          {f.verdict ? <Text style={t.callout}>{f.verdict}</Text> : null}
          {sec.evidence.length ? (
            <View style={s.evidence}>
              {sec.evidence.map((e) => (
                <View key={e} style={s.evRow}><View style={s.evBar} /><Text style={[t.footnote, s.flex]}>{e}</Text></View>
              ))}
            </View>
          ) : null}
          {sec.sources.length ? <Text style={t.footnote}>{`Read from ${sec.sources.join(', ').toLowerCase()}.`}</Text> : null}
        </Group>
      </Block>

      {sec.feltHistory.length ? (
        <Block title="Every time you scored it">
          <Group>
            {[...sec.feltHistory].reverse().map((h) => <Item key={h.date} title={whenSaid(h.date)} value={num(h.v, 1)} />)}
          </Group>
        </Block>
      ) : null}
      <Text style={t.footnote}>
        {`Felt scores move a point or two on their own from one scoring to the next, so only a change of ${d.noise.felt} or more gets an arrow on the wheel.`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: SP[24] },
  centre: { alignItems: 'center' },
  centreText: { textAlign: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[8], justifyContent: 'center' },
  evidence: { gap: SP[4] },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  evBar: { width: 2, height: 16, borderRadius: 1, backgroundColor: C.faint },
});
