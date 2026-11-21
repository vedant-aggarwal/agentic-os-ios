import * as Haptics from 'expo-haptics';
import { type ComponentRef, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { lightTap } from '@/components/Glass';
import { Sym } from '@/components/Sym';
import { C, F } from '@/theme';

// A keyboard for the PC. The phone's own keyboard types into whatever has focus on the PC; the switch swaps it for
// the keys a phone keyboard lacks: Esc and F1–F12, Tab, Delete, Home/End, Page Up/Down, arrows and a few shortcuts.
// Ctrl, Win, Alt and Shift stay on top in both modes and latch: tap Ctrl, then C (on either keyboard) sends Ctrl+C.
type Mod = 'ctrl' | 'win' | 'alt' | 'shift';
const MODS: { id: Mod; label: string }[] = [
  { id: 'ctrl', label: 'Ctrl' }, { id: 'win', label: 'Win' }, { id: 'alt', label: 'Alt' }, { id: 'shift', label: 'Shift' },
];
const FROW = ['esc', ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`)];
const NAV: { k: string; label: string }[] = [
  { k: 'tab', label: 'Tab' }, { k: 'home', label: 'Home' }, { k: 'end', label: 'End' }, { k: 'pgup', label: 'PgUp' },
  { k: 'pgdn', label: 'PgDn' }, { k: 'delete', label: 'Del' }, { k: 'backspace', label: '⌫' },
];
const SHORTCUTS: { k: string; label: string }[] = [
  { k: 'ctrl+c', label: 'Copy' }, { k: 'ctrl+v', label: 'Paste' }, { k: 'ctrl+z', label: 'Undo' }, { k: 'ctrl+a', label: 'All' },
  { k: 'alt+tab', label: 'Alt Tab' }, { k: 'win+d', label: 'Desktop' }, { k: 'win+shift+s', label: 'Snip' }, { k: 'alt+f4', label: 'Close' },
];

const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

function Key({ label, onPress, on, wide, flex }: { label: string; onPress: () => void; on?: boolean; wide?: boolean; flex?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tick(); onPress(); }}
      style={({ pressed }) => [s.key, wide && { minWidth: 64 }, flex && { flex: 1 }, (pressed || on) && s.keyOn]}>
      <Text style={[s.keyText, on && { color: '#0B0C10' }]}>{label}</Text>
    </Pressable>
  );
}

export function PcKeyboard({ connected, onType, onKey }: {
  connected: boolean; onType: (text: string) => void; onKey: (combo: string) => void;
}) {
  const [extra, setExtra] = useState(false);
  const [mods, setMods] = useState<Mod[]>([]);
  const [echo, setEcho] = useState(''); // the last few things sent, so he can see it typed
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const shown = (t: string) => setEcho((e) => (e + t).slice(-40));
  const press = (k: string) => {
    const combo = [...mods, k].join('+');
    onKey(combo); setMods([]);
    shown(k.length === 1 ? (mods.length ? ` ${combo} ` : k) : ` ${combo} `);
  };
  const typed = (t: string) => {
    if (!t) return;
    // a latched modifier turns the next character into a shortcut
    if (mods.length && t.length === 1) { press(t.toLowerCase()); return; }
    onType(t); shown(t);
  };
  const toggleMod = (m: Mod) => setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  const swap = () => {
    lightTap();
    if (extra) { setExtra(false); setTimeout(() => input.current?.focus(), 60); }
    else { setExtra(true); Keyboard.dismiss(); }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={s.wrap}>
      <View style={s.top}>
        <View style={[s.dot, { backgroundColor: connected ? '#3DDC97' : C.faint }]} />
        <Text style={s.echo} numberOfLines={1}>{echo || (connected ? 'Typing on your PC' : 'Connecting')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={extra ? 'Phone keyboard' : 'Extra keys'} onPress={swap} style={s.swap}>
          <Sym name={extra ? 'keyboard' : 'command'} size={16} fallback={<Text style={s.keyText}>{extra ? 'ABC' : '⌘'}</Text>} />
          <Text style={s.swapText}>{extra ? 'ABC' : 'Keys'}</Text>
        </Pressable>
      </View>

      <View style={s.mods}>
        {MODS.map((m) => <Key key={m.id} label={m.label} on={mods.includes(m.id)} flex onPress={() => toggleMod(m.id)} />)}
      </View>

      {extra ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FROW.map((k) => <Key key={k} label={k === 'esc' ? 'Esc' : k.toUpperCase()} onPress={() => press(k)} />)}
          </ScrollView>
          <View style={s.grid}>{NAV.map((n) => <Key key={n.k} label={n.label} onPress={() => press(n.k)} />)}</View>
          <View style={s.arrows}>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}><Key label="↑" wide onPress={() => press('up')} /></View>
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
              <Key label="←" wide onPress={() => press('left')} />
              <Key label="↓" wide onPress={() => press('down')} />
              <Key label="→" wide onPress={() => press('right')} />
            </View>
          </View>
          <View style={s.grid}>
            <Key label="Space" flex onPress={() => press('space')} />
            <Key label="Enter" flex onPress={() => press('enter')} />
          </View>
          <View style={s.grid}>{SHORTCUTS.map((c) => <Key key={c.k} label={c.label} onPress={() => { onKey(c.k); shown(` ${c.k} `); }} />)}</View>
        </ScrollView>
      ) : (
        <Pressable style={{ flex: 1 }} onPress={() => input.current?.focus()}>
          <TextInput ref={input} autoFocus value="" onChangeText={typed} style={s.capture}
            autoCorrect={false} autoCapitalize="none" spellCheck={false} autoComplete="off" keyboardAppearance="dark"
            onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace') press('backspace'); }}
            onSubmitEditing={() => press('enter')} submitBehavior="submit" returnKeyType="default"
            placeholder="Tap here and type" placeholderTextColor={C.faint} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1, gap: 10, padding: 12, borderRadius: 24, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  echo: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  swap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  swapText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.text },
  mods: { flexDirection: 'row', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  arrows: { gap: 6 },
  key: {
    minWidth: 46, height: 42, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  keyOn: { backgroundColor: '#3DDC97' },
  keyText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  capture: {
    height: 46, borderRadius: 14, paddingHorizontal: 14, fontFamily: F.medium, fontSize: 15, color: C.text,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
