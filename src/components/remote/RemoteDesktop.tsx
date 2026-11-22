import { requireOptionalNativeModule } from 'expo';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  Animated, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TurboModuleRegistry, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap } from '@/components/Glass';
import { usePcKeys, type PcKeys } from '@/components/PcKeyboard';
import { Sym } from '@/components/Sym';
import { API, currentToken } from '@/lib/api';
import { usePointer } from '@/lib/pointer';
import { C, F } from '@/theme';
import { REMOTE_PAGE } from './page';

// The remote desktop (the top bar's Remote PC button): the PC's screen full screen, edge to edge, in either
// orientation, controlled the way remote desktop apps on phones work. One floating button (drag it to either edge)
// opens the session menu: keyboard, mouse or touch input, actions (Task Manager, lock, Alt+Tab...), display
// (quality, fit or fill, rotation), fit to screen, and end session. The keyboard brings a row of PC keys above it
// (Esc, Tab, Ctrl, Alt, Shift, Win, arrows, Delete, Home/End, F1-F12). The video page is page.ts; input goes over
// the trackpad socket (usePointer), so clicks land as fast as the trackpad's.
type WebViewT = typeof import('react-native-webview').WebView;
type SO = typeof import('expo-screen-orientation');
/* eslint-disable @typescript-eslint/no-require-imports */
const WebView: WebViewT | null = TurboModuleRegistry?.get?.('RNCWebViewModule') ? require('react-native-webview').WebView : null;
const orient: SO | null = requireOptionalNativeModule('ExpoScreenOrientation') ? require('expo-screen-orientation') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const ACCENT = '#766BE6';
const RED = '#FF5A5F';
type Input = 'mouse' | 'touch';
type Quality = 'auto' | 'pc' | 'lite';
type Fit = 'fit' | 'fill';
type Rotate = 'auto' | 'landscape' | 'portrait';
type Route = { route: 'connecting' | 'direct' | 'relay' | 'frames'; net?: string; stream?: string };
type Stats = { fps: number; rtt: number; w: number; h: number };

// kept for the rest of the app session, so the next session opens the way the last one was left
const prefs = { input: 'mouse' as Input, quality: 'auto' as Quality, fit: 'fit' as Fit, rotate: 'auto' as Rotate, side: 'r' as 'l' | 'r', y: 0.62 };

const haptic = (k: 'light' | 'medium' | 'select') => {
  if (Platform.OS === 'web') return;
  (k === 'select' ? Haptics.selectionAsync() : Haptics.impactAsync(k === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
};

function applyRotation(r: Rotate) {
  if (!orient) return;
  const O = orient.OrientationLock;
  (r === 'auto' ? orient.unlockAsync() : orient.lockAsync(r === 'landscape' ? O.LANDSCAPE : O.PORTRAIT_UP)).catch(() => {});
}

export function RemoteDesktop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const pc = usePointer(open);
  const kb = usePcKeys(pc);
  const web = useRef<ComponentRef<WebViewT>>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [mode, setMode] = useState<Input>(prefs.input);
  const [quality, setQuality] = useState<Quality>(prefs.quality);
  const [fit, setFit] = useState<Fit>(prefs.fit);
  const [rotate, setRotate] = useState<Rotate>(prefs.rotate);
  const [route, setRoute] = useState<Route>({ route: 'connecting' });
  const [stats, setStats] = useState<Stats | null>(null);
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<null | 'actions' | 'display'>(null);
  const [typing, setTyping] = useState(false); // the phone keyboard is up
  const [keysOnly, setKeysOnly] = useState(false); // the PC keys row without the phone keyboard
  const [kbH, setKbH] = useState(0);
  const [bar, setBar] = useState(true); // the session bar at the top
  const [hint, setHint] = useState<string | null>(null);
  const [inject] = useState(() => `window.AOS = ${JSON.stringify({ api: API, token: currentToken() ?? '', quality: prefs.quality, input: prefs.input, fit: prefs.fit })}; true;`);

  // rotation: free (or as chosen) while open, back to portrait on close
  useEffect(() => {
    if (!open) return;
    applyRotation(prefs.rotate);
    return () => { if (orient) orient.lockAsync(orient.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, [open]);

  // the session bar shows on open and when the route changes, then gets out of the way
  useEffect(() => {
    if (!open) return;
    const show = setTimeout(() => setBar(true), 0);
    const hide = setTimeout(() => setBar(false), 4500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [open, route.route]);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 3200);
    return () => clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKbH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => { setKbH(0); setTyping(false); });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const js = (code: string) => web.current?.injectJavaScript(`${code}; true;`);
  const toggleKeyboard = () => {
    if (typing) { input.current?.blur(); setTyping(false); return; }
    setTyping(true); setKeysOnly(false);
    setTimeout(() => input.current?.focus(), 30);
  };
  const close = () => {
    Keyboard.dismiss();
    setMenu(false); setSheet(null);
    if (orient) orient.lockAsync(orient.OrientationLock.PORTRAIT_UP).catch(() => {});
    onClose();
  };
  const pickMode = (m: Input) => {
    prefs.input = m; setMode(m); js(`setMode(${JSON.stringify(m)})`);
    setHint(m === 'mouse'
      ? 'Mouse: drag to move the pointer, tap to click, hold to right-click, hold then drag to drag.'
      : 'Touch: tap where you want to click, hold to right-click, hold then move to drag.');
  };
  const pickQuality = (q: Quality) => { prefs.quality = q; setQuality(q); js(`setQuality(${JSON.stringify(q)})`); };
  const pickFit = (f: Fit) => { prefs.fit = f; setFit(f); js(`setFit(${JSON.stringify(f)})`); };
  const pickRotate = (r: Rotate) => { prefs.rotate = r; setRotate(r); applyRotation(r); };

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let m: { type: string; [k: string]: any };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    switch (m.type) {
      case 'a': pc.abs(m.x, m.y); break;
      case 'btn':
        pc.button(m.op, m.which === 'r' ? 'r' : 'l');
        haptic(m.op === 'd' ? 'medium' : 'select');
        break;
      case 'scroll': pc.scroll(Math.round(m.dx * 4), Math.round(m.dy * 4)); break;
      case 'hold': haptic('medium'); break;
      case 'kbd': toggleKeyboard(); break;
      case 'route': setRoute({ route: m.route, net: m.net, stream: m.stream }); if (m.route !== 'direct' && m.route !== 'relay') setStats(null); break;
      case 'stats': setStats({ fps: m.fps, rtt: m.rtt, w: m.w, h: m.h }); break;
      case 'zoom': setZoom(m.s); break;
    }
  };

  const keysRow = typing || keysOnly;
  return (
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={close}
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      {open ? <StatusBar hidden /> : null}
      <View style={s.root}>
        {WebView && open ? (
          <WebView ref={web} source={{ html: REMOTE_PAGE, baseUrl: 'https://agentic.norrita.com' }} originWhitelist={['*']}
            injectedJavaScriptBeforeContentLoaded={inject} onMessage={onMessage}
            allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} scrollEnabled={false} bounces={false}
            contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false}
            style={s.web} containerStyle={s.web} />
        ) : (
          <View style={s.missing}><Text style={s.missingText}>Update the app from TestFlight to see your PC screen here.</Text></View>
        )}

        {/* the phone keyboard types on the PC through this hidden field */}
        <TextInput ref={input} style={s.hiddenInput} value="" autoCorrect={false} autoCapitalize="none" spellCheck={false}
          autoComplete="off" textContentType="none" keyboardAppearance="dark" submitBehavior="submit" returnKeyType="default"
          onChangeText={(t) => kb.type(t)} onSubmitEditing={() => kb.press('enter')}
          onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace') kb.press('backspace'); }}
          onBlur={() => setTyping(false)} />

        <SessionBar visible={bar || menu} top={insets.top + 8} route={route} stats={stats} zoom={zoom} controls={pc.connected}
          onPress={() => setBar((b) => !b)} />

        {hint ? <View pointerEvents="none" style={[s.hint, { top: insets.top + 52 }]}><Text style={s.hintText}>{hint}</Text></View> : null}

        {keysRow ? <KeysRow kb={kb} bottom={kbH || insets.bottom} typing={typing} onKeyboard={toggleKeyboard}
          onHide={() => { setKeysOnly(false); if (typing) toggleKeyboard(); }} /> : null}

        {menu ? <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Close the menu" /> : null}

        <Fab width={width} height={height} insets={insets} bottomLimit={keysRow ? (kbH || insets.bottom) + 52 : insets.bottom}
          open={menu} onToggle={() => { setMenu((v) => !v); setSheet(null); }}
          items={[
            { key: 'kb', icon: 'keyboard', label: typing ? 'Hide keyboard' : 'Keyboard', on: typing, onPress: () => { setMenu(false); toggleKeyboard(); } },
            { key: 'keys', icon: 'command', label: 'PC keys', on: keysOnly, onPress: () => { setMenu(false); setKeysOnly((v) => !v); } },
            {
              key: 'mode', icon: mode === 'mouse' ? 'cursorarrow' : 'hand.point.up.left', label: mode === 'mouse' ? 'Mouse mode' : 'Touch mode',
              onPress: () => pickMode(mode === 'mouse' ? 'touch' : 'mouse'),
            },
            { key: 'act', icon: 'bolt.fill', label: 'Actions', onPress: () => { setMenu(false); setSheet('actions'); } },
            { key: 'disp', icon: 'display', label: 'Display', onPress: () => { setMenu(false); setSheet('display'); } },
            { key: 'fit', icon: 'arrow.down.right.and.arrow.up.left', label: 'Fit screen', onPress: () => { setMenu(false); js('resetView()'); } },
            { key: 'end', icon: 'xmark', label: 'End session', danger: true, onPress: close },
          ]} />

        {sheet ? (
          <Sheet title={sheet === 'actions' ? 'Actions' : 'Display'} bottom={insets.bottom} onClose={() => setSheet(null)}>
            {sheet === 'actions'
              ? <Actions onKey={(k) => { kb.shortcut(k); haptic('light'); }} />
              : <Display quality={quality} fit={fit} rotate={rotate} mode={mode} canRotate={!!orient}
                  onQuality={pickQuality} onFit={pickFit} onRotate={pickRotate} onMode={pickMode}
                  onReconnect={() => { js('start()'); setSheet(null); }} />}
          </Sheet>
        ) : null}
      </View>
    </Modal>
  );
}

// ---- the session bar: route, frame rate, round trip ----
function SessionBar({ visible, top, route, stats, zoom, controls, onPress }: {
  visible: boolean; top: number; route: Route; stats: Stats | null; zoom: number; controls: boolean; onPress: () => void;
}) {
  const [a] = useState(() => new Animated.Value(1));
  useEffect(() => { Animated.timing(a, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start(); }, [visible, a]);
  const net = route.route === 'relay' ? 'Relay' : route.route === 'frames' ? 'Slow link' : route.route === 'connecting' ? 'Connecting'
    : route.net === 'tailscale' ? 'Tailscale' : route.net === 'wifi' ? 'Wi-Fi' : 'Direct';
  const color = route.route === 'direct' ? '#3DDC97' : route.route === 'relay' ? '#FFB547' : route.route === 'frames' ? '#FF7A59' : C.faint;
  const parts = [net];
  if (stats?.fps) parts.push(`${stats.fps} fps`);
  if (stats?.rtt) parts.push(`${stats.rtt} ms`);
  if (stats?.h) parts.push(`${stats.h}p`);
  if (zoom > 1.04) parts.push(`${Math.round(zoom * 100)}%`);
  if (!controls) parts.push('controls connecting');
  return (
    <Animated.View pointerEvents={visible ? 'box-none' : 'none'} style={[s.barWrap, { top, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}>
      <Pressable onPress={onPress} style={s.bar} accessibilityRole="button" accessibilityLabel={`Connection: ${parts.join(', ')}`}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.barText} numberOfLines={1}>{parts.join('  ·  ')}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---- the floating button and its menu ----
type Item = { key: string; icon: string; label: string; on?: boolean; danger?: boolean; onPress: () => void };
const FAB = 54;
const ITEM = 46;

function Fab({ width, height, insets, bottomLimit, open, onToggle, items }: {
  width: number; height: number; insets: { top: number; left: number; right: number; bottom: number }; bottomLimit: number;
  open: boolean; onToggle: () => void; items: Item[];
}) {
  const [side, setSide] = useState(prefs.side);
  const [fy, setFy] = useState(prefs.y); // 0..1 down the screen
  const minY = insets.top + 12, maxY = height - bottomLimit - FAB - 12;
  const x = side === 'l' ? insets.left + 12 : width - insets.right - FAB - 12;
  const y = Math.min(Math.max(minY + (maxY - minY) * fy, minY), maxY);
  const [drag] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [start, setStart] = useState<{ x: number; y: number } | null>(null); // where the finger went down

  // drag it anywhere; let go and it snaps to the nearer side. A touch that hardly moves is a tap.
  const release = (dx: number, dy: number) => {
    setStart(null);
    drag.setValue({ x: 0, y: 0 });
    if (Math.hypot(dx, dy) < 6) { lightTap(); onToggle(); return; }
    const ny = Math.min(Math.max(y + dy, minY), maxY);
    const nside = x + dx + FAB / 2 < width / 2 ? 'l' : 'r';
    const nfy = maxY > minY ? (ny - minY) / (maxY - minY) : 0.5;
    prefs.side = nside; prefs.y = nfy;
    setSide(nside); setFy(nfy);
    if (nside !== side || Math.abs(dy) > 6) haptic('light');
  };
  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: { nativeEvent: { pageX: number; pageY: number } }) => setStart({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }),
    onResponderMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      if (start) drag.setValue({ x: e.nativeEvent.pageX - start.x, y: e.nativeEvent.pageY - start.y });
    },
    onResponderRelease: (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      if (start) release(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y); else setStart(null);
    },
    onResponderTerminate: () => { setStart(null); drag.setValue({ x: 0, y: 0 }); },
  };

  // the menu opens toward the middle of the screen: up from a low button, down from a high one
  const up = y > height / 2;
  const listH = items.length * (ITEM + 10);
  const listTop = up ? Math.max(insets.top + 8, y - listH - 4) : y + FAB + 10;
  return (
    <>
      {open ? (
        <View pointerEvents="box-none" style={[s.menu, side === 'l' ? { left: x + (FAB - ITEM) / 2 } : { right: width - x - FAB + (FAB - ITEM) / 2 }, { top: listTop }]}>
          {items.map((it) => (
            <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={it.label} onPress={() => { lightTap(); it.onPress(); }}
              style={({ pressed }) => [s.itemRow, side === 'r' && { flexDirection: 'row-reverse' }, pressed && { opacity: 0.7 }]}>
              <View style={[s.item, it.on && { backgroundColor: ACCENT }, it.danger && { backgroundColor: RED }]}>
                <Sym name={it.icon as never} size={19} color="#fff" fallback={<Text style={s.itemFallback}>{it.label[0]}</Text>} />
              </View>
              <View style={s.itemLabel}><Text style={s.itemLabelText}>{it.label}</Text></View>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Animated.View {...handlers} accessible accessibilityRole="button" accessibilityLabel={open ? 'Close the session menu' : 'Session menu'}
        onAccessibilityTap={onToggle}
        style={[s.fab, { left: x, top: y, transform: drag.getTranslateTransform() }, open && { backgroundColor: '#2A2D36' }]}>
        <Sym name={open ? 'xmark' : 'ellipsis'} size={open ? 18 : 22} color="#fff" fallback={<Text style={s.itemFallback}>{open ? '×' : '•••'}</Text>} />
      </Animated.View>
    </>
  );
}

// ---- the PC keys row, above the phone keyboard ----
type Mod = 'ctrl' | 'alt' | 'shift' | 'win';
const MODS: [Mod, string][] = [['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['win', 'Win']];
const NAV: [string, string][] = [['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→']];
const EDIT: [string, string][] = [['delete', 'Del'], ['home', 'Home'], ['end', 'End'], ['pgup', 'PgUp'], ['pgdn', 'PgDn'], ['insert', 'Ins'], ['printscreen', 'PrtSc']];
const FKEYS: [string, string][] = Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, `F${i + 1}`]);
const REPEAT = new Set(['left', 'up', 'down', 'right', 'delete', 'backspace', 'pgup', 'pgdn']);

function KeysRow({ kb, bottom, typing, onKeyboard, onHide }: { kb: PcKeys; bottom: number; typing: boolean; onKeyboard: () => void; onHide: () => void }) {
  return (
    <View style={[s.keysWrap, { bottom }]}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={s.keys}>
        <K label="Esc" onPress={() => kb.press('esc')} />
        <K label="Tab" onPress={() => kb.press('tab')} />
        {MODS.map(([m, l]) => (
          <K key={m} label={l} on={kb.latched.includes(m) || kb.held.includes(m)} onIn={() => kb.modDown(m)} onOut={() => kb.modUp(m)} />
        ))}
        <View style={s.sep} />
        {NAV.map(([k, l]) => <K key={k} label={l} repeat={() => kb.press(k)} />)}
        <View style={s.sep} />
        <K label="⌫" repeat={() => kb.press('backspace')} />
        <K label="Enter" onPress={() => kb.press('enter')} />
        {EDIT.map(([k, l]) => (REPEAT.has(k) ? <K key={k} label={l} repeat={() => kb.press(k)} /> : <K key={k} label={l} onPress={() => kb.press(k)} />))}
        <View style={s.sep} />
        {FKEYS.map(([k, l]) => <K key={k} label={l} onPress={() => kb.press(k)} />)}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel={typing ? 'Hide the keyboard' : 'Show the keyboard'} onPress={() => { lightTap(); if (typing) onHide(); else onKeyboard(); }} style={s.kbBtn}>
        <Sym name={typing ? 'keyboard.chevron.compact.down' : 'keyboard'} size={18} color="#fff" fallback={<Text style={s.keyText}>⌨</Text>} />
      </Pressable>
      {!typing ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Hide the PC keys" onPress={() => { lightTap(); onHide(); }} style={s.kbBtn}>
          <Sym name="xmark" size={14} color="#fff" fallback={<Text style={s.keyText}>×</Text>} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** One key: a tap, a press-and-release pair (modifiers), or a key that repeats while held (arrows, Delete). */
function K({ label, onPress, onIn, onOut, repeat, on }: {
  label: string; onPress?: () => void; onIn?: () => void; onOut?: () => void; repeat?: () => void; on?: boolean;
}) {
  const t = useRef<{ wait: ReturnType<typeof setTimeout> | null; every: ReturnType<typeof setInterval> | null }>({ wait: null, every: null });
  const stop = () => {
    if (t.current.wait) clearTimeout(t.current.wait);
    if (t.current.every) clearInterval(t.current.every);
    t.current = { wait: null, every: null };
  };
  useEffect(() => stop, []);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }}
      onPressIn={() => {
        haptic('select');
        onIn?.();
        if (repeat) { repeat(); t.current.wait = setTimeout(() => { t.current.every = setInterval(repeat, 70); }, 380); }
      }}
      onPressOut={() => { onOut?.(); stop(); }}
      onPress={onPress}
      style={({ pressed }) => [s.key, (pressed || on) && s.keyOn]}>
      {({ pressed }) => <Text style={[s.keyText, (pressed || on) && { color: '#0B0C10' }]}>{label}</Text>}
    </Pressable>
  );
}

// ---- sheets ----
function Sheet({ title, bottom, onClose, children }: { title: string; bottom: number; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: bottom + 14 }]}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={() => { lightTap(); onClose(); }} style={s.sheetClose}>
            <Sym name="xmark" size={13} color="#fff" fallback={<Text style={s.keyText}>×</Text>} />
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 14, paddingBottom: 4 }}>{children}</ScrollView>
      </View>
    </>
  );
}

const ACTIONS: { k: string; label: string; icon: string }[] = [
  { k: 'ctrl+shift+esc', label: 'Task Manager', icon: 'list.bullet.rectangle' },
  { k: 'win+l', label: 'Lock PC', icon: 'lock.fill' },
  { k: 'win', label: 'Start', icon: 'square.grid.2x2' },
  { k: 'alt+tab', label: 'Switch app', icon: 'rectangle.on.rectangle' },
  { k: 'win+tab', label: 'All windows', icon: 'square.stack.3d.up' },
  { k: 'win+d', label: 'Desktop', icon: 'menubar.dock.rectangle' },
  { k: 'win+e', label: 'Files', icon: 'folder' },
  { k: 'win+shift+s', label: 'Snip', icon: 'scissors' },
  { k: 'alt+f4', label: 'Close window', icon: 'xmark.square' },
  { k: 'ctrl+c', label: 'Copy', icon: 'doc.on.doc' },
  { k: 'ctrl+v', label: 'Paste', icon: 'doc.on.clipboard' },
  { k: 'ctrl+z', label: 'Undo', icon: 'arrow.uturn.backward' },
  { k: 'ctrl+a', label: 'Select all', icon: 'selection.pin.in.out' },
  { k: 'f5', label: 'Refresh', icon: 'arrow.clockwise' },
  { k: 'mute', label: 'Mute', icon: 'speaker.slash' },
  { k: 'playpause', label: 'Play / pause', icon: 'playpause' },
];

function Actions({ onKey }: { onKey: (k: string) => void }) {
  return (
    <View style={s.grid}>
      {ACTIONS.map((a) => (
        <Pressable key={a.k} accessibilityRole="button" accessibilityLabel={a.label} onPress={() => onKey(a.k)}
          style={({ pressed }) => [s.tile, pressed && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          <Sym name={a.icon as never} size={20} color="#fff" fallback={null} />
          <Text style={s.tileText} numberOfLines={1}>{a.label}</Text>
        </Pressable>
      ))}
      <Text style={s.small}>Ctrl+Alt+Del can&apos;t be sent from an app; Task Manager and Lock PC cover what it opens.</Text>
    </View>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {options.map(([v, l]) => (
        <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: v === value }} onPress={() => { lightTap(); onChange(v); }}
          style={[s.segItem, v === value && s.segOn]}>
          <Text style={[s.segText, v === value && { color: '#0B0C10' }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Display({ quality, fit, rotate, mode, canRotate, onQuality, onFit, onRotate, onMode, onReconnect }: {
  quality: Quality; fit: Fit; rotate: Rotate; mode: Input; canRotate: boolean;
  onQuality: (q: Quality) => void; onFit: (f: Fit) => void; onRotate: (r: Rotate) => void; onMode: (m: Input) => void; onReconnect: () => void;
}) {
  return (
    <>
      <Field label="Quality" note="Auto picks Best on Wi-Fi or Tailscale and Fast through the relay.">
        <Seg value={quality} onChange={onQuality} options={[['auto', 'Auto'], ['pc', 'Best 1080p'], ['lite', 'Fast 720p']]} />
      </Field>
      <Field label="Picture"><Seg value={fit} onChange={onFit} options={[['fit', 'Fit'], ['fill', 'Fill screen']]} /></Field>
      <Field label="Input"><Seg value={mode} onChange={onMode} options={[['mouse', 'Mouse'], ['touch', 'Touch']]} /></Field>
      {canRotate ? (
        <Field label="Rotation"><Seg value={rotate} onChange={onRotate} options={[['auto', 'Auto'], ['landscape', 'Landscape'], ['portrait', 'Portrait']]} /></Field>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => { lightTap(); onReconnect(); }} style={({ pressed }) => [s.wide, pressed && { opacity: 0.7 }]}>
        <Sym name="arrow.clockwise" size={15} color="#fff" fallback={null} />
        <Text style={s.tileText}>Reconnect video</Text>
      </Pressable>
      <Text style={s.small}>Gestures: two fingers scroll, pinch zooms, two-finger tap right-clicks, three-finger tap opens the keyboard.</Text>
    </>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
      {note ? <Text style={s.small}>{note}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1, backgroundColor: '#000' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  missingText: { fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.faint, textAlign: 'center' },
  hiddenInput: { position: 'absolute', left: -100, top: 0, width: 10, height: 10, opacity: 0 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: 'rgba(16,17,22,0.82)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', maxWidth: '92%',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  barText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text, fontVariant: ['tabular-nums'] },
  hint: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  hintText: {
    fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.text, textAlign: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(16,17,22,0.88)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, maxWidth: 460,
  },
  fab: {
    position: 'absolute', width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: ACCENT, opacity: 0.94, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  menu: { position: 'absolute', gap: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  item: {
    width: ITEM, height: ITEM, borderRadius: ITEM / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(32,34,42,0.96)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  itemFallback: { fontFamily: F.semibold, fontSize: 15, color: '#fff' },
  itemLabel: { paddingHorizontal: 11, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: 'rgba(16,17,22,0.9)' },
  itemLabelText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 17, color: C.text },
  keysWrap: {
    position: 'absolute', left: 0, right: 0, height: 52, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(22,23,29,0.88)', borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  keys: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  key: { minWidth: 42, height: 38, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  keyOn: { backgroundColor: C.text },
  keyText: { fontFamily: F.semibold, fontSize: 14, lineHeight: 18, color: C.text },
  sep: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 2 },
  kbBtn: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  sheet: {
    position: 'absolute', bottom: 0, alignSelf: 'center', width: '100%', maxWidth: 560, paddingHorizontal: 16, paddingTop: 14,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(18,19,25,0.9)', gap: 12,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: F.semibold, fontSize: 17, lineHeight: 22, color: C.text },
  sheetClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '23%', flexGrow: 1, minWidth: 74, height: 70, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tileText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.text },
  small: { fontFamily: F.medium, fontSize: 12, lineHeight: 17, color: C.faint },
  fieldLabel: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  segItem: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text },
  segText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 17, color: C.text },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
});
