import { requireOptionalNativeModule } from 'expo';
import type { SymbolViewProps } from 'expo-symbols';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glyph, Icon, Press, SURF, t, tint } from '@/aspects/kit';
import { Toast } from '@/capture/parts';
import { Backdrop } from '@/components/Backdrop';
import { SignIn } from '@/components/SignIn';
import { EdgeBlur } from '@/components/EdgeBlur';
import { useDesktop } from '@/desk/store';
import { currentToken, loadToken, onAuth } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { categoryOf } from '@/lib/line';
import { NORA } from '@/nora/parts';
import { C, F } from '@/theme';

// Pieces the line's screens share (src/line): the page around them, the top row, a caller's category mark, grouped
// rows and the toast. Same type, surfaces and Nora rose as her Home and page.

export { NORA };
export const NORA_TEXT = '#FF7AA2';
/** "You are on the call": the green iOS uses for a call in progress. */
export const ONCALL = '#30D158';
export const END_RED = '#E5484D';

const go = (path: string) => router.push(path as Href);
export const openCalls = () => go('/line');
export const openCall = (id: string, query = '') => go(`/line/${encodeURIComponent(id)}${query}`);
export const openSetup = () => go('/line/setup');

/** Back one page; a page opened straight from a link has nothing behind it, so it lands on Today. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as Href);
}

/** A line page: the app background, the content (it scrolls itself), a soft top edge, a readable column on desktop. */
export function LineScreen({ children, overlay }: { children: ReactNode; overlay?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  return (
    <View style={s.screen}>
      <Backdrop />
      <View style={[s.fill, desktop && s.column]}>{children}</View>
      <EdgeBlur edge="top" height={insets.top + 24} strength={30} />
      {overlay}
    </View>
  );
}

/** A line page opened straight from a link can come before anything has read the sign-in: read it, and ask for it
 *  when there is none. */
export function SignedIn({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'in' | 'out'>(() => (DEMO || currentToken() ? 'in' : 'checking'));
  useEffect(() => {
    if (state !== 'checking') return;
    let on = true;
    loadToken().then((tk) => { if (on) setState(tk ? 'in' : 'out'); }, () => { if (on) setState('out'); });
    return () => { on = false; };
  }, [state]);
  useEffect(() => (DEMO ? undefined : onAuth((ok) => setState(ok ? 'in' : 'out'))), []);
  if (state === 'checking') return <LineScreen>{null}</LineScreen>;
  if (state === 'out') return <SignIn onDone={() => setState('in')} />;
  return <>{children}</>;
}

/** The top row: Back, the page's title with a line under it, and one optional button on the right. */
export function LineTop({ title, sub, subColor, right, backLabel = 'Back' }: {
  title?: string; sub?: string | null; subColor?: string; right?: ReactNode; backLabel?: string;
}) {
  return (
    <View style={s.top}>
      <RoundButton label={backLabel} onPress={goBack}><Icon name="left" size={18} /></RoundButton>
      <View style={s.topText}>
        {title ? <Text accessibilityRole="header" numberOfLines={1} style={t.title2}>{title}</Text> : null}
        {sub ? <Text numberOfLines={1} style={[t.small, subColor ? { color: subColor } : null]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function RoundButton({ label, onPress, children, size = 44 }: { label: string; onPress: () => void; children: ReactNode; size?: number }) {
  return (
    <Press label={label} onPress={onPress} scale={0.92} hitSlop={Math.max(0, (44 - size) / 2)}
      style={[s.round, { width: size, height: size, borderRadius: size / 2 }]}>{children}</Press>
  );
}

/** A caller's mark: the category's symbol in a quiet circle. Spam takes the danger tint; nothing else is coloured. */
export function CategoryMark({ category, size = 40, live }: { category: string; size?: number; live?: boolean }) {
  const c = categoryOf(category);
  const spam = category === 'spam';
  const color = live ? NORA : spam ? C.danger : C.textSoft;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[s.mark, { width: size, height: size, borderRadius: size / 2 }, live ? { backgroundColor: tint(NORA, 0.16) } : spam ? { backgroundColor: tint(C.danger, 0.14) } : null]}>
      <Glyph sf={c.sf as SymbolViewProps['name']} d={c.d} size={Math.round(size * 0.45)} color={color} />
    </View>
  );
}

/** Rows that belong together, on one rounded surface with hairlines between them. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.group, style]}>{children}</View>;
}

/** A small heading over a group. */
export function GroupHead({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={s.groupHead}>
      <Text accessibilityRole="header" style={t.section}>{children}</Text>
      {right}
    </View>
  );
}

/** Nora's breathing dots, for what is live. */
export { Dots } from '@/nora/parts';

/** A status line's dot: up (green), down (red), live (rose). */
export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** The page's status line: what just happened, with an optional Undo. At the bottom, or under the top row on a
 *  screen whose bottom holds its controls (the live call). */
export function useToast(at: 'top' | 'bottom' = 'bottom') {
  const [toast, setToast] = useState<{ text: string; action?: { label: string; onPress: () => void } | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string, action?: { label: string; onPress: () => void } | null) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, action });
    timer.current = setTimeout(() => setToast(null), action ? 5000 : 2600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const hide = useCallback(() => setToast(null), []);
  return { say, hide, node: <ToastSpot text={toast?.text ?? null} action={toast?.action} at={at} /> };
}
function ToastSpot({ text, action, at }: { text: string | null; action?: { label: string; onPress: () => void } | null; at: 'top' | 'bottom' }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[s.toast, at === 'top' ? { top: insets.top + 60 } : { bottom: Math.max(insets.bottom, 12) + 16 }]}>
      <Toast text={text} action={action} />
    </View>
  );
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The time now, ticking every `ms` while `running`; it holds where it was once stopped (a call's timer at its end). */
export function useNow(ms: number, running = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, running]);
  return now;
}

type Clip = typeof import('expo-clipboard');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const clip: Clip | null = requireOptionalNativeModule('ExpoClipboard') ? require('expo-clipboard') : null;
/** Puts text on the clipboard. False when there is no clipboard to reach. */
export async function copy(text: string): Promise<boolean> {
  try {
    if (clip) { await clip.setStringAsync(text); return true; }
    if (typeof navigator !== 'undefined' && navigator.clipboard) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  return false;
}

/** A square action under a caller's name (Call back, Copy, Block), the way Contacts lays out its actions. */
export function ActionTile({ label, sf, d, onPress, color = C.text, disabled, busy, a11y }: {
  label: string; sf: SymbolViewProps['name']; d: string; onPress: () => void; color?: string; disabled?: boolean; busy?: boolean; a11y?: string;
}) {
  return (
    <Press label={a11y ?? label} onPress={onPress} disabled={disabled || busy} wrap={s.tileWrap} style={s.tile}>
      <Glyph sf={sf} d={d} size={22} color={color} />
      <Text numberOfLines={1} style={[s.tileText, { color }]}>{label}</Text>
    </Press>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.scene, overflow: 'hidden' },
  fill: { flex: 1 },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  topText: { flex: 1, minWidth: 0 },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.card },
  mark: { alignItems: 'center', justifyContent: 'center', backgroundColor: SURF.raised },
  group: { borderRadius: 20, borderCurve: 'continuous', backgroundColor: SURF.card, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  toast: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  mono: { fontFamily: F.medium, fontSize: 17, lineHeight: 24, letterSpacing: 0.4, color: C.text, fontVariant: ['tabular-nums'] },
  tileWrap: { flex: 1 },
  tile: { height: 64, borderRadius: 16, borderCurve: 'continuous', backgroundColor: SURF.card, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tileText: { fontFamily: F.medium, fontSize: 13, lineHeight: 18 },
});
