import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useScale } from '@/components/Glass';
import { ScrollWheel } from '@/components/ScrollWheel';
import type { usePointer } from '@/lib/pointer';
import { type Finger, useOwnTouches, usePress } from '@/lib/touch';
import { C, F } from '@/theme';

// A trackpad for the PC. One finger moves the cursor; two fingers scroll (natural direction, like a Mac);
// a quick tap clicks, a two-finger tap right-clicks. Three- and four-finger swipes do what they do on a Windows
// precision touchpad: three across switches apps, up opens Task view, down shows the desktop; four across moves
// between virtual desktops. The two buttons below press and hold like real ones,
// so holding Left while moving drags. No labels: left is left. Only fingers that land on the pad count, so a
// thumb holding a mic button or a click button doesn't throw the cursor around.
// PC pixels per finger point, before Windows' own acceleration: slow strokes stay precise, quick ones travel.
const GAIN_SLOW = 1.2;
const GAIN_FAST = 2.4;
const FAST = 1.2; // pt per ms at which the gain is fully fast
const SCROLL = 5; // wheel units per point (120 is one notch)
const TAP_MS = 220;
const TAP_PT = 8;
const SWIPE_PT = 50; // multi-finger travel that counts as a swipe

/** The keys a Windows touchpad sends for a three- or four-finger swipe. */
function swipeCombo(fingers: number, dx: number, dy: number) {
  const across = Math.abs(dx) > Math.abs(dy);
  if (across) return fingers >= 4 ? (dx < 0 ? 'ctrl+win+right' : 'ctrl+win+left') : 'alt+tab';
  return dy < 0 ? 'win+tab' : 'win+d';
}

const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
const thud = () => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

function centroid(t: Finger[]) {
  let x = 0, y = 0;
  for (const p of t) { x += p.x; y += p.y; }
  return { x: x / Math.max(t.length, 1), y: y / Math.max(t.length, 1), n: t.length };
}

function ClickButton({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  const p = useScale(0.96);
  const { props, pressed } = usePress(() => { p.set(p.to); thud(); onDown(); }, () => { p.set(1); onUp(); });
  return (
    <View {...props} style={{ flex: 1 }} accessible accessibilityRole="button" accessibilityLabel={label}
      onAccessibilityTap={() => { onDown(); onUp(); }}>
      <Animated.View pointerEvents="none" style={[s.click, p.style, pressed && s.clickPressed]} />
    </View>
  );
}

/** pc: the sheet's one PC connection (usePointer), shared with the keyboard. */
export function Trackpad({ pc }: { pc: ReturnType<typeof usePointer> }) {
  const g = useRef({ x: 0, y: 0, n: 0, maxN: 0, t0: 0, travel: 0, t: 0, speed: 0, gx: 0, gy: 0 });

  const grant = (mine: Finger[]) => {
    const c = centroid(mine);
    g.current = { x: c.x, y: c.y, n: c.n, maxN: c.n, t0: Date.now(), travel: 0, t: Date.now(), speed: 0, gx: 0, gy: 0 };
  };
  const move = (mine: Finger[]) => {
    const st = g.current, c = centroid(mine);
    if (c.n !== st.n) { st.x = c.x; st.y = c.y; st.n = c.n; st.maxN = Math.max(st.maxN, c.n); return; } // a finger landed or lifted: no jump
    const dx = c.x - st.x, dy = c.y - st.y, now = Date.now(), d = Math.hypot(dx, dy);
    // finger speed, smoothed so one uneven touch sample doesn't jerk the gain
    st.speed = st.speed * 0.6 + (d / Math.max(now - st.t, 4)) * 0.4;
    st.x = c.x; st.y = c.y; st.t = now; st.travel += d;
    if (c.n >= 3 || st.maxN >= 3) { st.gx += dx; st.gy += dy; return; } // a multi-finger swipe: keys on release
    if (c.n === 2) { pc.scroll(-dx * SCROLL, dy * SCROLL); return; }
    const gain = GAIN_SLOW + (GAIN_FAST - GAIN_SLOW) * Math.min(st.speed / FAST, 1);
    pc.move(dx * gain, dy * gain);
  };
  const release = () => {
    const st = g.current;
    if (st.maxN >= 3) {
      if (Math.hypot(st.gx, st.gy) >= SWIPE_PT) { pc.key(swipeCombo(st.maxN, st.gx, st.gy)); thud(); }
      return;
    }
    if (Date.now() - st.t0 < TAP_MS && st.travel < TAP_PT) { pc.button('c', st.maxN >= 2 ? 'r' : 'l'); tick(); }
  };

  const touches = useOwnTouches({
    start: (_f, mine) => {
      if (mine.length === 1) { grant(mine); return; }
      const st = g.current, c = centroid(mine); // another finger landed: re-anchor so the cursor doesn't jump
      st.x = c.x; st.y = c.y; st.n = c.n; st.maxN = Math.max(st.maxN, c.n);
    },
    move,
    end: (_f, mine) => {
      if (!mine.length) { release(); return; }
      const st = g.current, c = centroid(mine);
      st.x = c.x; st.y = c.y; st.n = c.n;
    },
  });

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <ScrollWheel onScroll={(dy) => pc.scroll(0, dy)} />
        <View style={s.pad} {...touches}>
          <View pointerEvents="none" style={s.status}>
            <View style={[s.dot, { backgroundColor: pc.route === 'direct' ? '#3DDC97' : pc.route === 'tunnel' ? '#FFB547' : C.faint }]} />
            {pc.route === 'direct' ? null : <Text style={s.statusText}>{pc.route === 'tunnel' ? 'Via internet' : 'Connecting'}</Text>}
          </View>
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
  row: { flex: 1, flexDirection: 'row', gap: 8 },
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
