import * as Haptics from 'expo-haptics';
import { type ComponentRef, useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { usePointer } from '@/lib/pointer';
import { usePress } from '@/lib/touch';
import { C, F } from '@/theme';

// A keyboard for the PC, in two views: Type (the phone's own keyboard types into whatever has focus on the PC) and
// Keys (what a phone keyboard lacks). Keys are multi-touch: hold Alt and tap Tab to switch windows, hold Shift and
// tap arrows to select. A quick tap on Ctrl, Win, Alt or Shift latches it for the next key instead (tap Ctrl, then
// C). The most-used keys sit at the bottom, under the thumb.
type Mod = 'ctrl' | 'win' | 'alt' | 'shift';
const MODS: { id: Mod; label: string }[] = [
  { id: 'ctrl', label: 'Ctrl' }, { id: 'win', label: 'Win' }, { id: 'alt', label: 'Alt' }, { id: 'shift', label: 'Shift' },
];
const MOD_HOLD = 250; // a modifier held this long goes down on the PC; a shorter tap latches it
const REPEAT_AFTER = 380;
const REPEAT_EVERY = 70;
const REPEATS = new Set(['up', 'down', 'left', 'right', 'backspace', 'delete', 'pgup', 'pgdn', 'volup', 'voldown']);
const MEDIA: [string, string][] = [['voldown', 'Vol −'], ['mute', 'Mute'], ['volup', 'Vol +'], ['prev', '⏮'], ['playpause', '⏯'], ['next', '⏭']];
const SHORTCUTS: [string, string][][] = [
  [['ctrl+c', 'Copy'], ['ctrl+v', 'Paste'], ['ctrl+z', 'Undo'], ['ctrl+a', 'All']],
  [['win+shift+s', 'Snip'], ['win+d', 'Desktop'], ['win+tab', 'Tasks'], ['alt+f4', 'Close']],
];

const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };
type Pc = ReturnType<typeof usePointer>;
type Held = { sent: boolean; used: boolean; timer: ReturnType<typeof setTimeout> | null };

/** The keyboard's state, shared by both views: which modifiers are held or latched, and an echo of what was sent. */
export function usePcKeys(pc: Pc) {
  const [latched, setLatched] = useState<Mod[]>([]);
  const [held, setHeld] = useState<Mod[]>([]);
  const [echo, setEcho] = useState('');
  const pcr = useRef(pc);
  useLayoutEffect(() => { pcr.current = pc; });
  const st = useRef({ held: new Map<Mod, Held>(), latched: [] as Mod[] });

  const [api] = useState(() => {
    const shown = (t: string) => setEcho((e) => (e + t).slice(-40));
    const sync = () => { setHeld([...st.current.held.keys()]); setLatched([...st.current.latched]); };
    // another key while a modifier is held: the modifier goes down on the PC first
    const flushHeld = () => {
      for (const [m, h] of st.current.held) {
        h.used = true;
        if (!h.sent) { h.sent = true; if (h.timer) clearTimeout(h.timer); h.timer = null; pcr.current.keyDown(m); }
      }
    };
    const modDown = (m: Mod) => {
      const S = st.current;
      if (S.held.has(m)) return;
      const h: Held = { sent: false, used: false, timer: null };
      h.timer = setTimeout(() => { h.timer = null; if (!h.sent) { h.sent = true; pcr.current.keyDown(m); } }, MOD_HOLD);
      S.held.set(m, h);
      sync();
    };
    const modUp = (m: Mod) => {
      const S = st.current;
      const h = S.held.get(m);
      if (!h) return;
      S.held.delete(m);
      if (h.timer) clearTimeout(h.timer);
      if (h.sent) pcr.current.keyUp(m);
      else if (!h.used) S.latched = S.latched.includes(m) ? S.latched.filter((x) => x !== m) : [...S.latched, m];
      sync();
    };
    const press = (k: string) => {
      const S = st.current;
      flushHeld();
      const lat = S.latched.filter((m) => !S.held.has(m));
      pcr.current.key([...lat, k].join('+'));
      const mods = [...S.held.keys(), ...lat];
      shown(mods.length ? ` ${[...mods, k].join('+')} ` : k.length === 1 ? k : ` ${k} `);
      if (S.latched.length) { S.latched = []; sync(); }
    };
    const type = (t: string) => {
      if (!t) return;
      const S = st.current;
      if ((S.latched.length || S.held.size) && [...t].length === 1) { press(t.toLowerCase()); return; }
      pcr.current.type(t); shown(t);
    };
    const shortcut = (combo: string) => { pcr.current.key(combo); shown(` ${combo} `); };
    return { modDown, modUp, press, type, shortcut };
  });
  return { ...api, latched, held, echo, connected: pc.connected };
}
export type PcKeys = ReturnType<typeof usePcKeys>;

function Key({ label, onDown, onUp, on, flex = 1, small }: {
  label: string; onDown: () => void; onUp?: () => void; on?: boolean; flex?: number; small?: boolean;
}) {
  const { props, pressed } = usePress(() => { tick(); onDown(); }, onUp);
  const lit = pressed || on;
  return (
    <View {...props} accessible accessibilityRole="button" accessibilityLabel={label}
      onAccessibilityTap={() => { onDown(); onUp?.(); }} style={[s.key, { flex }, lit && s.keyOn]}>
      <Text pointerEvents="none" style={[s.keyText, small && s.small, lit && { color: '#0B0C10' }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A key that repeats while held (arrows, Backspace, Delete, Page Up/Down). */
function RepeatKey({ k, label, kb, flex }: { k: string; label: string; kb: PcKeys; flex?: number }) {
  const t = useRef<{ wait: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null }>({ wait: null, every: null });
  const stop = () => {
    if (t.current.wait) clearTimeout(t.current.wait);
    if (t.current.every) clearInterval(t.current.every);
    t.current = { wait: null, every: null };
  };
  const down = () => {
    kb.press(k);
    if (!REPEATS.has(k)) return;
    t.current.wait = setTimeout(() => { t.current.every = setInterval(() => kb.press(k), REPEAT_EVERY); }, REPEAT_AFTER);
  };
  return <Key label={label} flex={flex} onDown={down} onUp={stop} />;
}

function ModRow({ kb }: { kb: PcKeys }) {
  return (
    <View style={s.row}>
      {MODS.map((m) => (
        <Key key={m.id} label={m.label} on={kb.held.includes(m.id) || kb.latched.includes(m.id)}
          onDown={() => kb.modDown(m.id)} onUp={() => kb.modUp(m.id)} />
      ))}
    </View>
  );
}

function Echo({ kb, idle }: { kb: PcKeys; idle: string }) {
  return (
    <View style={s.top}>
      <View style={[s.dot, { backgroundColor: kb.connected ? '#3DDC97' : C.faint }]} />
      <Text style={s.echo} numberOfLines={1}>{kb.echo || (kb.connected ? idle : 'Connecting')}</Text>
    </View>
  );
}

const Gap = () => <View style={{ flex: 1 }} />;

/** The keys a phone keyboard lacks, bottom-heavy: modifiers on the bottom row, then Space and Enter, arrows. */
export function PcKeysPad({ kb }: { kb: PcKeys }) {
  const fn = (from: number) => Array.from({ length: 6 }, (_, i) => `f${from + i}`);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.wrap}>
      <Echo kb={kb} idle="Hold Alt and tap Tab to switch windows" />
      <View style={{ flex: 1 }} />
      <View style={s.row}>
        {MEDIA.map(([k, label]) => <RepeatKey key={k} k={k} label={label} kb={kb} />)}
      </View>
      {SHORTCUTS.map((row, i) => (
        <View key={i} style={s.row}>
          {row.map(([k, label]) => <Key key={k} label={label} small onDown={() => kb.shortcut(k)} />)}
        </View>
      ))}
      {[1, 7].map((from) => (
        <View key={from} style={s.row}>
          {fn(from).map((k) => <RepeatKey key={k} k={k} label={k.toUpperCase()} kb={kb} />)}
        </View>
      ))}
      <View style={s.row}>
        <RepeatKey k="esc" label="Esc" kb={kb} />
        <RepeatKey k="home" label="Home" kb={kb} />
        <RepeatKey k="pgup" label="PgUp" kb={kb} />
        <Gap />
        <RepeatKey k="up" label="↑" kb={kb} />
        <Gap />
      </View>
      <View style={s.row}>
        <RepeatKey k="delete" label="Del" kb={kb} />
        <RepeatKey k="end" label="End" kb={kb} />
        <RepeatKey k="pgdn" label="PgDn" kb={kb} />
        <RepeatKey k="left" label="←" kb={kb} />
        <RepeatKey k="down" label="↓" kb={kb} />
        <RepeatKey k="right" label="→" kb={kb} />
      </View>
      <View style={s.row}>
        <RepeatKey k="tab" label="Tab" kb={kb} flex={1.2} />
        <RepeatKey k="space" label="Space" kb={kb} flex={2.4} />
        <RepeatKey k="backspace" label="⌫" kb={kb} />
        <RepeatKey k="enter" label="Enter" kb={kb} flex={1.4} />
      </View>
      <ModRow kb={kb} />
    </Animated.View>
  );
}

/** The phone's keyboard typing on the PC, with the modifier row just above it. */
export function PcTypePad({ kb }: { kb: PcKeys }) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.wrap}>
      <Echo kb={kb} idle="Typing on your PC" />
      <Pressable style={{ flex: 1 }} onPress={() => input.current?.focus()} accessibilityLabel="Show the keyboard" />
      <ModRow kb={kb} />
      <TextInput ref={input} autoFocus value="" onChangeText={kb.type} style={s.capture}
        autoCorrect={false} autoCapitalize="none" spellCheck={false} autoComplete="off" keyboardAppearance="dark"
        onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace') kb.press('backspace'); }}
        onSubmitEditing={() => kb.press('enter')} submitBehavior="submit" returnKeyType="default"
        placeholder="Tap here and type" placeholderTextColor={C.faint} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, gap: 6, padding: 10, borderRadius: 24, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  echo: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  row: { flexDirection: 'row', gap: 6, flexBasis: 44, flexShrink: 1, minHeight: 32 },
  key: {
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
    backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  keyOn: { backgroundColor: '#3DDC97' },
  keyText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  small: { fontSize: 13, fontFamily: F.medium },
  capture: {
    height: 46, borderRadius: 14, paddingHorizontal: 14, fontFamily: F.medium, fontSize: 15, color: C.text,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
