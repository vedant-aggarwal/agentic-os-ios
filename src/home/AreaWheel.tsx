import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle, Path } from 'react-native-svg';
import { haptic, tint } from '@/aspects/kit/tokens';
import { C, F } from '@/theme';

// The create sheet's area picker: one arc per area round a ring, in its aspect colour, "No area" at the top.
// Tap an arc or run a finger round the ring; each change ticks. The middle names the chosen area.

export type WheelItem = { key: string | null; name: string; color: string };

export const WHEEL = 128;
const THIN = 8, THICK = 16;
const R = WHEEL / 2 - THICK / 2 - 1; // the ring's centre line
const GAP = 4; // points of dark between two arcs
const DEG = Math.PI / 180;

/** An arc on the ring from a0 to a1 degrees, 0 at the top, clockwise. */
function arc(a0: number, a1: number) {
  const c = WHEEL / 2;
  const x0 = c + R * Math.sin(a0 * DEG), y0 = c - R * Math.cos(a0 * DEG);
  const x1 = c + R * Math.sin(a1 * DEG), y1 = c - R * Math.cos(a1 * DEG);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function AreaWheel({ items, value, onChange }: { items: WheelItem[]; value: string | null; onChange: (key: string | null) => void }) {
  const n = Math.max(items.length, 1);
  const seg = 360 / n;
  const gap = n > 1 ? (GAP / R) / DEG : 0;
  const at = Math.max(0, items.findIndex((x) => x.key === value));
  const chosen = items[at];
  const cur = useRef<number>(at);

  const choose = (i: number) => {
    if (i === cur.current || !items[i]) return;
    cur.current = i;
    haptic.tick();
    onChange(items[i].key);
  };
  const pick = (x: number, y: number) => {
    const dx = x - WHEEL / 2, dy = y - WHEEL / 2;
    if (Math.hypot(dx, dy) < R - THICK - 4) return; // the middle is a label, not a target
    let a = Math.atan2(dx, -dy) / DEG;
    if (a < 0) a += 360;
    choose(Math.round(a / seg) % n);
  };
  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => { cur.current = at; pick(e.x, e.y); },
    onUpdate: (e) => pick(e.x, e.y),
  });

  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} style={st.wrap} accessible accessibilityRole="adjustable" accessibilityLabel="Area"
        accessibilityValue={{ text: chosen?.name ?? 'No area' }} accessibilityHint="Swipe up or down to change the area"
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => { cur.current = at; choose((at + (e.nativeEvent.actionName === 'increment' ? 1 : n - 1)) % n); }}>
        <Svg width={WHEEL} height={WHEEL}>
          {n === 1 && chosen ? <Circle cx={WHEEL / 2} cy={WHEEL / 2} r={R} stroke={chosen.color} strokeWidth={THICK} fill="none" /> : null}
          {n > 1 ? items.map((it, i) => {
            const on = i === at;
            return (
              <Path key={it.key ?? '-'} d={arc(i * seg - seg / 2 + gap / 2, i * seg + seg / 2 - gap / 2)} fill="none"
                stroke={on ? it.color : tint(it.color, 0.42)} strokeWidth={on ? THICK : THIN} />
            );
          }) : null}
        </Svg>
        <View pointerEvents="none" style={st.middle}>
          <View style={[st.dot, { backgroundColor: chosen?.color ?? C.muted }]} />
          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={st.name}>{chosen?.name ?? 'No area'}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const st = StyleSheet.create({
  wrap: { width: WHEEL, height: WHEEL },
  middle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: THICK + 8, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  name: { fontFamily: F.medium, fontSize: 13, lineHeight: 16, color: C.text, textAlign: 'center' },
});
