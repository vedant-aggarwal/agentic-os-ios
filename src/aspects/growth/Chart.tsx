import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { addDays, SP, t, useAspect } from '@/aspects/kit';
import { C } from '@/theme';

// A section over weeks on a fixed 0 to 10 scale, so a small wobble looks small. White is what the data shows each
// week; the colour steps are his own scores, held until the next scoring. `trend` draws the two four-week averages
// the trend rule compares.

type Week = { key: string; label: string; from: string; partial: boolean };

export function Chart({ series, weeks, felt, width, height = 120, trend, axis = false }: {
  series: (number | null)[]; weeks: Week[]; felt: { date: string; v: number }[]; width: number; height?: number;
  trend?: { now: number | null; before: number | null } | null; axis?: boolean;
}) {
  const { color } = useAspect();
  const n = weeks.length;
  if (width <= 0 || !n) return <View style={{ width, height }} />;
  const padX = 6, padY = 6;
  const w = width - padX * 2, h = height - padY * 2;
  const x = (i: number) => padX + (n > 1 ? (i / (n - 1)) * w : w / 2);
  const y = (v: number) => padY + (1 - Math.min(Math.max(v, 0), 10) / 10) * h;

  let d = '', pen = false;
  series.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
  });
  const dots = series.map((v, i) => (v == null ? null : { cx: x(i), cy: y(v), last: i === n - 1, partial: weeks[i]?.partial }));

  // his scores as steps across the weeks they held for
  const at = (day: string) => weeks.findIndex((wk) => day >= wk.from && day < addDays(wk.from, 7));
  const steps: { i0: number; i1: number; v: number }[] = [];
  const sorted = [...felt].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((f, k) => {
    let i0 = at(f.date);
    if (i0 < 0) i0 = f.date < weeks[0].from ? 0 : -1;
    if (i0 < 0) return;
    const nextAt = sorted[k + 1] ? at(sorted[k + 1].date) : -1;
    const i1 = nextAt > i0 ? nextAt : n - 1;
    steps.push({ i0, i1, v: f.v });
  });
  const half = Math.max(0, n - 4);
  const before = Math.max(0, n - 8);
  return (
    <View>
      <Svg width={width} height={height}>
        {[0, 5, 10].map((g) => (
          <Line key={g} x1={padX} x2={width - padX} y1={y(g)} y2={y(g)} stroke={C.faint} strokeOpacity={g === 5 ? 0.35 : 0.2} strokeWidth={1} strokeDasharray={g === 5 ? '2 5' : undefined} />
        ))}
        {steps.map((st) => (
          <Path key={`${st.i0}-${st.v}`} d={`M${x(st.i0).toFixed(1)} ${y(st.v).toFixed(1)} L${x(st.i1).toFixed(1)} ${y(st.v).toFixed(1)}`}
            stroke={color} strokeWidth={3} strokeOpacity={0.75} strokeLinecap="round" />
        ))}
        {steps.map((st) => <Circle key={`c${st.i0}`} cx={x(st.i0)} cy={y(st.v)} r={4} fill={color} />)}
        {trend && trend.before != null && n >= 8 ? (
          <Line x1={x(before)} x2={x(half - 1)} y1={y(trend.before)} y2={y(trend.before)} stroke={C.text} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="4 3" />
        ) : null}
        {trend && trend.now != null && n >= 4 ? (
          <Line x1={x(half)} x2={x(n - 1)} y1={y(trend.now)} y2={y(trend.now)} stroke={C.text} strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="4 3" />
        ) : null}
        <Path d={d} stroke={C.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {dots.map((p, i) => p ? (
          <Circle key={i} cx={p.cx} cy={p.cy} r={p.last ? 3.5 : 2} fill={p.partial ? C.scene : C.text} stroke={C.text} strokeWidth={p.partial ? 1.5 : 0} />
        ) : null)}
      </Svg>
      {axis ? (
        <View style={s.axis}>
          <Text style={t.caption}>{weeks[0]?.label.replace(/\s*[–—-].*$/, '')}</Text>
          <Text style={t.caption}>{weeks[n - 1]?.partial ? 'This week' : weeks[n - 1]?.label.replace(/\s*[–—-].*$/, '')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The chart's three marks, named once. */
export function ChartKey({ trend = false }: { trend?: boolean }) {
  const { color } = useAspect();
  return (
    <View style={s.key}>
      <View style={s.keyItem}><View style={[s.swatch, { backgroundColor: color }]} /><Text style={t.caption}>Your score</Text></View>
      <View style={s.keyItem}><View style={[s.swatch, { backgroundColor: C.text }]} /><Text style={t.caption}>What the data shows</Text></View>
      {trend ? <View style={s.keyItem}><View style={s.dash} /><Text style={t.caption}>Four week averages</Text></View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SP[4] },
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: SP[16], rowGap: SP[4] },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: SP[8] },
  swatch: { width: 14, height: 3, borderRadius: 2 },
  dash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(243,244,246,0.5)' },
});
