import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { type Finger, useOwnTouches } from '@/lib/touch';

// A scroll wheel to the left of the trackpad (multi-touch, like the pad): a ridged knob seen edge-on. Drag it to scroll the PC; flick it and it keeps
// spinning and slows down like a real wheel. The ridges roll round a cylinder (bunching and fading toward the top
// and bottom edges), and every ridge that passes the middle is a notch: one haptic tick.
const NOTCH = 14; // pt between ridges
const RIDGES = 22;
const WHEEL_PER_PT = 4; // wheel units per point (120 is one mouse-wheel notch)
const FRICTION = 0.94; // per frame, after a flick
const TICK_GAP = 22; // ms: no more haptic ticks than this, so a fast spin still buzzes like a wheel

function Ridge({ i, offset, height }: { i: number; offset: SharedValue<number>; height: SharedValue<number> }) {
  const st = useAnimatedStyle(() => {
    const h = height.value, span = RIDGES * NOTCH;
    // this ridge's place on the unrolled strip, wrapped so the wheel never ends
    const y = ((((i * NOTCH + offset.value) % span) + span) % span) - (span - h) / 2;
    const t = Math.max(-1, Math.min(1, (y - h / 2) / (h / 2))); // -1 top edge .. 1 bottom edge
    const shown = h / 2 + Math.sin((t * Math.PI) / 2) * (h / 2 - 4); // on the cylinder
    const face = Math.cos((t * Math.PI) / 2); // 1 facing you, 0 at the edges
    return { transform: [{ translateY: shown - 1 }, { scaleY: 0.4 + 0.6 * face }], opacity: Math.abs(t) >= 1 ? 0 : 0.15 + 0.75 * face };
  });
  return <Animated.View style={[s.ridge, st]} />;
}

export function ScrollWheel({ onScroll }: { onScroll: (dy: number) => void }) {
  const offset = useSharedValue(0);
  const height = useSharedValue(300);
  const [ridges] = useState(() => Array.from({ length: RIDGES }, (_, i) => i));
  const g = useRef({ y: 0, t: 0, v: 0, notch: 0, lastTick: 0, frame: null as number | null });

  const spin = (dy: number) => {
    const st = g.current;
    offset.set(offset.get() + dy);
    onScroll(dy * WHEEL_PER_PT);
    const notch = Math.floor(offset.get() / NOTCH);
    if (notch !== st.notch) {
      st.notch = notch;
      const now = Date.now();
      if (now - st.lastTick > TICK_GAP && Platform.OS !== 'web') { st.lastTick = now; Haptics.selectionAsync().catch(() => {}); }
    }
  };
  const stopCoast = () => { const st = g.current; if (st.frame !== null) cancelAnimationFrame(st.frame); st.frame = null; };
  useEffect(() => stopCoast, []);

  const grant = (f: Finger) => {
    stopCoast();
    const st = g.current;
    st.y = f.y; st.t = Date.now(); st.v = 0;
  };
  const move = (f: Finger) => {
    const st = g.current, y = f.y, now = Date.now();
    const dy = y - st.y;
    st.v = st.v * 0.5 + (dy / Math.max(now - st.t, 8)) * 16 * 0.5; // pt per frame, smoothed
    st.y = y; st.t = now;
    if (dy) spin(dy);
  };
  const release = () => {
    const st = g.current;
    if (Date.now() - st.t > 80) st.v = 0; // it was held still before letting go: no flick
    const coast = () => {
      st.v *= FRICTION;
      if (Math.abs(st.v) < 0.3) { st.frame = null; return; }
      spin(st.v);
      st.frame = requestAnimationFrame(coast);
    };
    if (Math.abs(st.v) >= 0.3) st.frame = requestAnimationFrame(coast);
  };

  // the first finger on the wheel turns it
  const first = useRef(-1);
  const touches = useOwnTouches({
    start: (f) => { if (first.current === -1) { first.current = f.id; grant(f); } },
    move: (mine) => { const f = mine.find((m) => m.id === first.current); if (f) move(f); },
    end: (f) => { if (f.id === first.current) { first.current = -1; release(); } },
  });

  return (
    <View style={s.wheel} onLayout={(e) => height.set(e.nativeEvent.layout.height)} {...touches}
      accessibilityRole="adjustable" accessibilityLabel="Scroll wheel"
      onAccessibilityAction={(e) => onScroll(e.nativeEvent.actionName === 'increment' ? 120 : -120)}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {ridges.map((i) => <Ridge key={i} i={i} offset={offset} height={height} />)}
      </View>
      <View pointerEvents="none" style={s.shine} />
    </View>
  );
}

const s = StyleSheet.create({
  wheel: {
    width: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  ridge: { position: 'absolute', left: 9, right: 9, top: 0, height: 2, borderRadius: 1, backgroundColor: '#E5E7EB' },
  // a soft highlight down the middle, like light on a rounded knob
  shine: { position: 'absolute', top: '30%', bottom: '30%', left: 4, right: 4, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.04)' },
});
