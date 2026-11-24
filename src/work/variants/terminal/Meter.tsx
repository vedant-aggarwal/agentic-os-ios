import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { alpha, P } from './palette';

// A segmented block meter: a row of cells lit up to the used %. Every cell keeps its zone's colour, green under 70 %,
// amber to 90 %, red above, so the warning and danger marks show before usage gets there. On first show the lit
// cells step in left to right, one a frame; a later change steps from the old count to the new. UI thread only: one
// clip whose width moves in whole cells.

export const CELLS = 30;
const STEP_MS = 16;
const EMPTY = 'rgba(255,255,255,0.06)';

const zone = (i: number, cells: number) => {
  const mid = ((i + 0.5) * 100) / cells;
  return mid >= 90 ? P.red : mid >= 70 ? P.amber : P.green;
};

/** Cells lit for a %: the cell the value falls in lights, and anything from 70 or 90 lights the first warning or
 *  danger cell, so the cells agree with the readout's colour. */
export function litCells(pct: number, cells: number) {
  if (!(pct > 0)) return 0;
  let n = Math.ceil((pct * cells) / 100 - 1e-9);
  if (pct >= 90) n = Math.max(n, Math.floor((90 * cells) / 100) + 1);
  else if (pct >= 70) n = Math.max(n, Math.floor((70 * cells) / 100) + 1);
  return Math.min(cells, n);
}

function Cells({ cells, gap, lit, empty = false, width, litOnly = false }: {
  cells: number; gap: number; lit: number; empty?: boolean; width?: number; litOnly?: boolean;
}) {
  return (
    <View style={[s.row, { gap }, width ? { width } : s.full]}>
      {Array.from({ length: cells }, (_, i) => {
        const c = zone(i, cells);
        const bg = i < lit ? c : litOnly ? 'transparent' : empty ? EMPTY : alpha(c, c === P.green ? 0.11 : 0.17);
        return <View key={i} style={[s.cell, { backgroundColor: bg }]} />;
      })}
    </View>
  );
}

/** `pct` null: no reading (plain cells, no zones). `delay` holds the first sweep, so meters can follow one another. */
export function Meter({ pct, height, cells = CELLS, gap = 2, delay = 0 }: {
  pct: number | null; height: number; cells?: number; gap?: number; delay?: number;
}) {
  const reduce = useReducedMotion();
  const lit = pct == null ? 0 : litCells(pct, cells);
  const [w, setW] = useState(0);
  const shown = useSharedValue(0);
  const booted = useRef(false);

  useEffect(() => {
    if (!w || reduce) return;
    const wait = booted.current ? 0 : delay;
    booted.current = true;
    const n = Math.abs(lit - shown.get());
    if (!n) return;
    shown.set(withDelay(wait, withTiming(lit, { duration: n * STEP_MS, easing: Easing.steps(n), reduceMotion: ReduceMotion.Never })));
  }, [w, lit, reduce, delay, shown]);

  const pitch = (w + gap) / cells; // one cell and its gap
  const clip = useAnimatedStyle(() => ({ width: shown.value * pitch }));

  if (reduce) {
    return <View style={{ height }}><Cells cells={cells} gap={gap} lit={lit} empty={pct == null} /></View>;
  }
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Cells cells={cells} gap={gap} lit={0} empty={pct == null} />
      {w && lit ? (
        <Animated.View style={[s.clip, clip]}>
          <Cells cells={cells} gap={gap} lit={lit} width={w} litOnly />
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row' },
  full: { right: 0 },
  cell: { flex: 1, borderRadius: 1 },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
});
