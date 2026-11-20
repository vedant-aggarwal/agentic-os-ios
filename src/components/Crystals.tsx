import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring, ReduceMotion } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { Family } from '@/lib/today';
import { ASPECT_COLOR, C, F, FAMILY_ASPECTS, FAMILY_LABEL, SPRING, type FamilyKey } from '@/theme';

const ARect = Animated.createAnimatedComponent(Rect);
type P = [number, number];

function rot([x, y]: P, [cx, cy]: P, deg: number): P {
  const a = (deg * Math.PI) / 180, dx = x - cx, dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}
function mix(hex: string, to: string, k: number) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// Quartz point, front view: three faces, one per aspect of the family.
const SHAPES: Record<FamilyKey, { cx: number; by: number; w: number; sy: number; ty: number; deg: number }> = {
  work: { cx: 76, by: 207, w: 22, sy: 120, ty: 70, deg: -15 },
  people: { cx: 186, by: 207, w: 20, sy: 130, ty: 84, deg: 17 },
  self: { cx: 130, by: 209, w: 30, sy: 76, ty: 14, deg: 0 },
};
function faces(k: FamilyKey) {
  const { cx, by, w, sy, ty, deg } = SHAPES[k];
  const L: P = [cx - w, sy + 7], ML: P = [cx - w / 2, sy], MR: P = [cx + w / 2, sy], R: P = [cx + w, sy + 7], T: P = [cx + w * 0.08, ty];
  const f: P[][] = [
    [[cx - w, by], L, T, ML, [cx - w / 2, by + 3]],
    [[cx - w / 2, by + 3], ML, T, MR, [cx + w / 2, by + 3]],
    [[cx + w / 2, by + 3], MR, T, R, [cx + w, by]],
  ];
  const out = f.map((face) => face.map((p) => rot(p, [cx, by], deg)));
  const ys = out.flat().map((p) => p[1]);
  return { faces: out, top: Math.min(...ys), bottom: Math.max(...ys) };
}
const GEOM = { work: faces('work'), people: faces('people'), self: faces('self') };
const pts = (f: P[]) => f.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function Crystal({ k, share }: { k: FamilyKey; share: number }) {
  const g = GEOM[k];
  const span = g.bottom - g.top;
  const level = useSharedValue(g.bottom + 2);
  useEffect(() => {
    level.value = withSpring(g.bottom - span * share, { ...SPRING, reduceMotion: ReduceMotion.System });
  }, [share, g.bottom, span, level]);
  const liquid = useAnimatedProps(() => ({ y: level.value, height: Math.max(0, g.bottom + 8 - level.value) }));
  const surface = useAnimatedProps(() => ({ y: level.value, opacity: share > 0 ? 0.75 : 0 }));
  const glass = ['url(#gL)', 'url(#gC)', 'url(#gR)'];

  return (
    <G>
      <Defs>
        {g.faces.map((f, i) => (
          <ClipPath key={i} id={`c-${k}-${i}`}><Polygon points={pts(f)} /></ClipPath>
        ))}
        {FAMILY_ASPECTS[k].map((a, i) => {
          const c = ASPECT_COLOR[a], shade = [0, 0.18, 0.38][i];
          return (
            <LinearGradient key={a} id={`l-${k}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={mix(mix(c, '#ffffff', 0.3), '#000000', shade)} />
              <Stop offset="0.5" stopColor={mix(c, '#000000', shade)} />
              <Stop offset="1" stopColor={mix(c, '#000000', 0.55 + shade / 2)} />
            </LinearGradient>
          );
        })}
      </Defs>
      {g.faces.map((f, i) => (
        <G key={i}>
          <Polygon points={pts(f)} fill={glass[i]} />
          <G clipPath={`url(#c-${k}-${i})`}>
            <ARect x={0} width={300} fill={`url(#l-${k}-${i})`} opacity={0.86} animatedProps={liquid} />
            <ARect x={0} width={300} height={1.4} fill="#ffffff" animatedProps={surface} />
            <Polygon points={pts(f)} fill="url(#sheen)" />
          </G>
          <Polygon points={pts(f)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.9} strokeLinejoin="round" />
        </G>
      ))}
    </G>
  );
}

/** Today as three crystals on a stone: Self, Work, People. Liquid = share done. */
export function Crystals({ families }: { families: Family[] }) {
  const by = Object.fromEntries(families.map((f) => [f.key, f])) as Record<FamilyKey, Family>;
  const share = (k: FamilyKey) => (by[k]?.total ? by[k].done / by[k].total : 0);
  const label = families.map((f) => `${FAMILY_LABEL[f.key]} ${f.done} of ${f.total} done`).join(', ');
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Today as three crystals. ${label}.`} style={s.wrap}>
      <Svg width={194} height={186} viewBox="0 0 260 250">
        <Defs>
          <LinearGradient id="gL" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#3A4250" /><Stop offset="1" stopColor="#141820" /></LinearGradient>
          <LinearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2B323D" /><Stop offset="1" stopColor="#0F1218" /></LinearGradient>
          <LinearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#1E242D" /><Stop offset="1" stopColor="#0A0D12" /></LinearGradient>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.28} /><Stop offset="0.38" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="0.8" stopColor="#ffffff" stopOpacity={0} /><Stop offset="1" stopColor="#ffffff" stopOpacity={0.08} />
          </LinearGradient>
          <LinearGradient id="plTop" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#2A2E35" /><Stop offset="1" stopColor="#1A1D22" /></LinearGradient>
          <LinearGradient id="plSide" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#16181C" /><Stop offset="1" stopColor="#0C0D10" /></LinearGradient>
          <RadialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#DCE6FF" stopOpacity={0.22} /><Stop offset="1" stopColor="#DCE6FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d="M38 206 L38 236 Q130 258 222 236 L222 206 Z" fill="url(#plSide)" />
        <Ellipse cx={130} cy={206} rx={92} ry={15} fill="url(#plTop)" />
        <Ellipse cx={130} cy={206} rx={92} ry={15} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        <Ellipse cx={128} cy={204} rx={70} ry={10} fill="url(#pool)" />
        <Crystal k="work" share={share('work')} />
        <Crystal k="people" share={share('people')} />
        <Crystal k="self" share={share('self')} />
      </Svg>
      <Text style={[s.label, { left: 30 }]}>Work</Text>
      <Text style={[s.label, { left: 75 }]}>Self</Text>
      <Text style={[s.label, { left: 121 }]}>People</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: 194, height: 186 },
  label: { position: 'absolute', top: 166, width: 44, textAlign: 'center', fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
});
