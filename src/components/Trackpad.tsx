import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { type GestureResponderEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScale } from '@/components/Glass';
import { usePointer } from '@/lib/pointer';
import { C, F } from '@/theme';

// A trackpad for the PC. One finger moves the cursor; two fingers scroll (natural direction, like a Mac);
// a quick tap clicks, a two-finger tap right-clicks. The two buttons below press and hold like real ones,
// so holding Left while moving drags. No labels: left is left.
// PC pixels per finger point, before Windows' own acceleration: slow strokes stay precise, quick ones travel.
const GAIN_SLOW = 1.2;
const GAIN_FAST = 2.4;
const FAST = 1.2; // pt per ms at which the gain is fully fast
const SCROLL = 5; // wheel units per point (120 is one notch)
const TAP_MS = 220;
const TAP_PT = 8;

const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
const thud = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

function centroid(e: GestureResponderEvent) {
  const t = e.nativeEvent.touches;
  if (!t.length) return { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, n: 0 };
  let x = 0, y = 0;
  for (const p of t) { x += p.pageX; y += p.pageY; }
  return { x: x / t.length, y: y / t.length, n: t.length };
}

function ClickButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  const p = useScale(0.96);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }}
      onPressIn={() => { p.set(p.to); thud(); onDown(); }} onPressOut={() => { p.set(1); onUp(); }}>
      {({ pressed }) => (
        <Animated.View style={[s.click, p.style, pressed && s.clickPressed]} />
      )}
    </Pressable>
  );
}

export function Trackpad({ active }: { active: boolean }) {
  const pc = usePointer(active);
  const g = useRef({ x: 0, y: 0, n: 0, maxN: 0, t0: 0, travel: 0, t: 0, speed: 0 });

  const grant = (e: GestureResponderEvent) => {
    const c = centroid(e);
    g.current = { x: c.x, y: c.y, n: c.n, maxN: c.n, t0: Date.now(), travel: 0, t: Date.now(), speed: 0 };
  };
  const move = (e: GestureResponderEvent) => {
    const st = g.current, c = centroid(e);
    if (c.n !== st.n) { st.x = c.x; st.y = c.y; st.n = c.n; st.maxN = Math.max(st.maxN, c.n); return; } // a finger landed or lifted: no jump
    const dx = c.x - st.x, dy = c.y - st.y, now = Date.now(), d = Math.hypot(dx, dy);
    // finger speed, smoothed so one uneven touch sample doesn't jerk the gain
    st.speed = st.speed * 0.6 + (d / Math.max(now - st.t, 4)) * 0.4;
    st.x = c.x; st.y = c.y; st.t = now; st.travel += d;
    if (c.n >= 2) { pc.scroll(-dx * SCROLL, dy * SCROLL); return; }
    const gain = GAIN_SLOW + (GAIN_FAST - GAIN_SLOW) * Math.min(st.speed / FAST, 1);
    pc.move(dx * gain, dy * gain);
  };
  const release = () => {
    const st = g.current;
    if (Date.now() - st.t0 < TAP_MS && st.travel < TAP_PT) { pc.button('c', st.maxN >= 2 ? 'r' : 'l'); tick(); }
  };

  return (
    <View style={s.wrap}>
      <View style={s.pad}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={grant}
        onResponderMove={move}
        onResponderRelease={release}
        onResponderStart={(e) => { const st = g.current; st.maxN = Math.max(st.maxN, e.nativeEvent.touches.length); }}>
        <View pointerEvents="none" style={s.status}>
          <View style={[s.dot, { backgroundColor: pc.connected ? '#3DDC97' : C.faint }]} />
          {pc.connected ? null : <Text style={s.statusText}>Connecting</Text>}
        </View>
      </View>
      <View style={s.buttons}>
        <ClickButton label="Left" onDown={() => pc.button('d', 'l')} onUp={() => pc.button('u', 'l')} />
        <ClickButton label="Right" onDown={() => pc.button('d', 'r')} onUp={() => pc.button('u', 'r')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, gap: 8 },
  pad: {
    flex: 1, borderRadius: 24, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  status: { position: 'absolute', top: 12, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.faint },
  buttons: { flexDirection: 'row', gap: 8, height: 56 },
  click: {
    flex: 1, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  clickPressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
});
