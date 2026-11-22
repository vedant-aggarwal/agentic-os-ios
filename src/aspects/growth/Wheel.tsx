import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, MOTION, num, Press, SURF, t, tint, useAspect } from '@/aspects/kit';
import { C } from '@/theme';
import type { AspectKey } from '@/theme';
import type { Section } from './types';

// The centrepiece: nine wedges. His own score fills each wedge in Growth's colour; what the data shows is a thin
// white arc across the same wedge. Where the fill and the arc part is the story. Tap a wedge or its label to pick it.

const APath = Animated.createAnimatedComponent(Path);
const STEP = (2 * Math.PI) / 9;
const START = -Math.PI / 2 - STEP / 2; // the first section sits at the top
const GAP = 0.035; // radians between wedges

function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  'worklet';
  const r = Math.max(r1, r0 + 0.01);
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r0 * Math.cos(a1), y2 = cy + r0 * Math.sin(a1);
  const x3 = cx + r0 * Math.cos(a0), y3 = cy + r0 * Math.sin(a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${r0} ${r0} 0 0 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  'worklet';
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

type Geo = { cx: number; cy: number; r0: number; R: number };
const radius = (g: Geo, v: number) => g.r0 + ((g.R - g.r0) * Math.min(Math.max(v, 0), 10)) / 10;

function Wedge({ i, felt, measured, then, geo, grow, tone, dim, on, showData, onPress }: {
  i: number; felt: number | null; measured: number | null; then: number | null; geo: Geo; grow: SharedValue<number>;
  tone: string; dim: boolean; on: boolean; showData: boolean; onPress: () => void;
}) {
  const a0 = START + i * STEP + GAP, a1 = START + (i + 1) * STEP - GAP;
  const { cx, cy, r0, R } = geo;
  const fill = useAnimatedProps(() => ({ d: sector(cx, cy, r0, r0 + ((felt ?? 0) / 10) * (R - r0) * grow.value, a0, a1) }));
  const data = useAnimatedProps(() => ({
    d: arc(cx, cy, r0 + ((measured ?? 0) / 10) * (R - r0) * grow.value, a0 + 0.06, a1 - 0.06),
    strokeOpacity: grow.value > 0.05 ? 0.92 : 0,
  }));
  return (
    <>
      <Path d={sector(cx, cy, r0, R, a0, a1)} fill={on ? SURF.raised : SURF.row} onPress={onPress} />
      {felt != null && felt > 0 ? (
        <APath animatedProps={fill} fill={tint(tone, on ? 0.9 : dim ? 0.28 : 0.55)} stroke={tone} strokeOpacity={dim ? 0.4 : 1} strokeWidth={1.5} onPress={onPress} />
      ) : null}
      {then != null ? (
        <Path d={arc(cx, cy, radius(geo, then), a0 + 0.02, a1 - 0.02)} stroke={C.text} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="3 4" fill="none" />
      ) : null}
      {showData && measured != null ? (
        <APath animatedProps={data} stroke={C.text} strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={dim ? 0.45 : 1} />
      ) : null}
    </>
  );
}

/**
 * The wheel. `then` draws an earlier scoring as a dashed arc (the wheel then and now). `showData` draws the
 * measured arc. Labels sit around it as 44 pt targets that read the section to VoiceOver.
 */
export function Wheel({ sections, size, selected, onSelect, then = null, showData = true }: {
  sections: Section[]; size: number; selected: AspectKey | null; onSelect: (key: AspectKey) => void;
  then?: Partial<Record<AspectKey, number>> | null; showData?: boolean;
}) {
  const { color } = useAspect();
  const grow = useSharedValue(0);
  useEffect(() => { grow.set(withSpring(1, MOTION.slow)); }, [grow]);
  const label = 40; // room for the labels around the wheel
  const geo: Geo = { cx: size / 2, cy: size / 2, r0: size * 0.07, R: size / 2 - label };
  const lr = geo.R + label / 2 + 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={geo.cx} cy={geo.cy} r={radius(geo, 5)} stroke={SURF.line} strokeWidth={1} strokeDasharray="2 5" fill="none" />
        {sections.map((sec, i) => (
          <Wedge key={sec.key} i={i} felt={sec.felt} measured={sec.measured} then={then?.[sec.key] ?? null} geo={geo} grow={grow}
            tone={color} on={selected === sec.key} dim={!!selected && selected !== sec.key} showData={showData}
            onPress={() => onSelect(sec.key)} />
        ))}
      </Svg>
      {sections.map((sec, i) => {
        const a = START + (i + 0.5) * STEP;
        const x = geo.cx + lr * Math.cos(a), y = geo.cy + lr * Math.sin(a);
        const on = selected === sec.key;
        const words = [
          sec.name,
          sec.felt != null ? `you scored ${num(sec.felt, 1)}` : 'not scored',
          sec.measured != null ? `the data reads ${num(sec.measured, 1)}` : 'no data yet',
          sec.moved && sec.change != null ? `${sec.change > 0 ? 'up' : 'down'} ${Math.abs(sec.change)} since the scoring before` : '',
        ].filter(Boolean).join(', ');
        return (
          <Press key={sec.key} label={words} onPress={() => onSelect(sec.key)} feel="tick" state={{ selected: on }}
            wrap={[s.label, { left: x - 36, top: y - 22 }]} style={s.labelIn}>
            <Text numberOfLines={1} style={[t.caption, on && { color: C.text }]}>{sec.name}</Text>
            <View style={s.valueRow}>
              <Text style={[t.label, t.num, { color: sec.felt == null ? C.faint : on ? color : C.text }]}>{sec.felt != null ? num(sec.felt, 1) : 'None'}</Text>
              {sec.moved && sec.change != null ? <Icon name={sec.change > 0 ? 'arrowUp' : 'arrowDown'} size={12} color={C.muted} /> : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/** The two marks the wheel uses, named once under it. */
export function WheelKey({ showData = true, thenLabel }: { showData?: boolean; thenLabel?: string }) {
  const { color } = useAspect();
  return (
    <View style={s.key}>
      <View style={s.keyItem}>
        <View style={[s.swatch, { backgroundColor: tint(color, 0.55), borderColor: color }]} />
        <Text style={t.caption}>{thenLabel ? 'Latest score' : 'Your score'}</Text>
      </View>
      {showData ? (
        <View style={s.keyItem}>
          <View style={s.line} />
          <Text style={t.caption}>What the data shows</Text>
        </View>
      ) : null}
      {thenLabel ? (
        <View style={s.keyItem}>
          <View style={s.dash} />
          <Text style={t.caption}>{thenLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { position: 'absolute', width: 72, height: 44 },
  labelIn: { width: 72, height: 44, alignItems: 'center', justifyContent: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  key: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 16, rowGap: 4 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  line: { width: 14, height: 2.5, borderRadius: 2, backgroundColor: C.text },
  dash: { width: 14, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(243,244,246,0.6)' },
});
