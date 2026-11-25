import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';
import { SURF, t, tint, useAspect } from '@/aspects/kit';
import type { Muscle } from '../api';

// Recovery on a figure, front and back: each muscle filled with the page's colour by how recently and how hard it
// worked. Fully recovered muscles sit in the plain surface colour. The shapes are a plain mannequin of rounded parts,
// drawn on a 120 by 240 grid.

type Shape = { m: string; kind: 'rect'; x: number; y: number; w: number; h: number; r: number } | { m: string; kind: 'ell'; cx: number; cy: number; rx: number; ry: number };
const R = (m: string, x: number, y: number, w: number, h: number, r = Math.min(w, h) / 2): Shape => ({ m, kind: 'rect', x, y, w, h, r });
const E = (m: string, cx: number, cy: number, rx: number, ry: number): Shape => ({ m, kind: 'ell', cx, cy, rx, ry });
const mirror = (sh: Shape): Shape => (sh.kind === 'rect' ? { ...sh, x: 120 - sh.x - sh.w } : { ...sh, cx: 120 - sh.cx });
const pair = (sh: Shape) => [sh, mirror(sh)];

const FRONT: Shape[] = [
  R('neck', 54, 31, 12, 9, 4),
  ...pair(E('shoulders', 36, 50, 11, 10)),
  ...pair(R('chest', 44, 42, 15, 23, 8)),
  R('abs', 49, 68, 22, 42, 9),
  ...pair(R('obliques', 40, 70, 8, 34)),
  ...pair(R('biceps', 23, 60, 10, 30)),
  ...pair(R('forearms', 18, 94, 10, 34)),
  ...pair(R('quads', 42, 116, 16, 60, 8)),
  ...pair(R('adductors', 55.5, 118, 4.5, 30, 2.25)),
  ...pair(R('calves', 44, 182, 13, 44, 6.5)),
];
const BACK: Shape[] = [
  R('neck', 54, 31, 12, 9, 4),
  R('traps', 45, 36, 30, 16, 8),
  ...pair(E('shoulders', 36, 50, 11, 10)),
  ...pair(R('upperback', 42, 54, 17, 34, 8)),
  R('lowerback', 48, 90, 24, 20, 8),
  ...pair(R('triceps', 23, 60, 10, 30)),
  ...pair(R('forearms', 18, 94, 10, 34)),
  ...pair(E('glutes', 51, 122, 10, 10)),
  ...pair(R('hamstrings', 42, 134, 16, 42, 8)),
  ...pair(R('calves', 43, 182, 14, 42, 7)),
];

export function BodyMap({ muscles, height = 220 }: { muscles: Muscle[]; height?: number }) {
  const a = useAspect();
  const pct = new Map(muscles.map((m) => [m.m, m.pct]));
  const fill = (m: string) => {
    const p = pct.get(m);
    if (p == null || p >= 96) return SURF.raised;
    const worked = Math.min(1, (100 - p) / 50); // 50% recovered or less reads as fully worked
    return tint(a.color, 0.28 + 0.72 * worked);
  };
  const width = height / 2;
  const draw = (shapes: Shape[]) => (
    <Svg width={width} height={height} viewBox="0 0 120 240">
      <Circle cx={60} cy={18} r={12} fill={SURF.card} />
      {shapes.map((sh, i) => (sh.kind === 'rect'
        ? <Rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={sh.r} fill={fill(sh.m)} />
        : <Ellipse key={i} cx={sh.cx} cy={sh.cy} rx={sh.rx} ry={sh.ry} fill={fill(sh.m)} />))}
    </Svg>
  );
  const tired = muscles.filter((m) => m.pct < 96).map((m) => `${m.name} ${m.pct}%`).join(', ');
  return (
    <View style={s.wrap} accessible accessibilityLabel={tired ? `Still recovering: ${tired}` : 'Every muscle recovered'}>
      <View style={s.fig}>{draw(FRONT)}<Text style={t.micro}>Front</Text></View>
      <View style={s.fig}>{draw(BACK)}<Text style={t.micro}>Back</Text></View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  fig: { alignItems: 'center', gap: 8 },
});
