import { useEffect } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Glass } from '@/components/Glass';
import { C } from '@/theme';
import type { ResolvedItem } from '../types';
import { ago } from './format';
import { JobIcon } from './icons';
import { Press } from './Press';
import { EASE, GUTTER, LEAD, LIVE, T } from './tokens';

// Resolved: what he swiped away. A row reads like the others (mark, title, one line, age); tap opens its saved chat,
// hold opens a small menu whose first item carries it on in a new job.

const ENGINE: Record<string, string> = { claude: 'Claude', codex: 'Codex' };
export const resolvedEngine = (r: ResolvedItem) => ENGINE[r.engine] ?? r.engine.charAt(0).toUpperCase() + r.engine.slice(1);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "Claude · Orca · 6 turns", and "continued" once a new job carried it on. */
export function resolvedLine(r: ResolvedItem) {
  return [resolvedEngine(r), r.kind === 'orca' ? 'Orca' : 'App job', r.turns ? plural(r.turns, 'turn') : null, r.continuedIn.length ? 'continued' : null]
    .filter(Boolean).join(' · ');
}

const Check = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" fill={color} opacity={0.18} />
    <Path d="M8 12.4l2.8 2.8L16.2 9.6" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export function ResolvedRow({ item, where, onPress, onLongPress }: {
  item: ResolvedItem; where?: string | null; onPress: () => void; onLongPress: (e: GestureResponderEvent) => void;
}) {
  const pending = item.id.startsWith('tmp-');
  return (
    <Press onPress={onPress} onLongPress={onLongPress} disabled={pending} style={s.row}
      accessibilityLabel={[item.title, 'resolved', resolvedLine(item), where, ago(item.resolvedAt)].filter(Boolean).join(', ')}
      accessibilityHint="Opens its chat. Hold to continue working on it"
      accessibilityActions={[{ name: 'longpress', label: 'Continue working on this' }]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'longpress') onLongPress(e as unknown as GestureResponderEvent); }}>
      <View style={s.lead}><Check color={item.continuedIn.length ? C.faint : LIVE} /></View>
      <View style={s.mid}>
        <Text numberOfLines={1} style={[T.row, s.title]}>{item.title}</Text>
        <Text numberOfLines={1} style={T.sub}>{pending ? 'Saving its chat…' : resolvedLine(item)}</Text>
      </View>
      <View style={s.right}>
        <Text numberOfLines={1} style={[T.meta, s.rightText]}>{where ?? ago(item.resolvedAt)}</Text>
        {where ? <Text style={T.meta}>{ago(item.resolvedAt)}</Text> : null}
      </View>
    </Press>
  );
}

export type ResolvedMenuAt = { item: ResolvedItem; y: number };
const ITEM = 52;

/** What a held resolved row offers: carry it on (first, so the finger finds it), read it, copy its session id. */
export function ResolvedMenu({ at, top, bottom, onContinue, onOpen, onCopy, onClose }: {
  at: ResolvedMenuAt; top: number; bottom: number; onContinue: () => void; onOpen: () => void; onCopy: (() => void) | null; onClose: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const w = Math.min(320, width - GUTTER * 2);
  const reduce = useReducedMotion();
  const H = ITEM * (onCopy ? 3 : 2) + 44;
  const below = at.y + 16 + H <= height - bottom;
  const y = below ? Math.max(top, at.y + 16) : Math.max(top, at.y - 16 - H);
  const v = useSharedValue(0);
  useEffect(() => { v.set(withTiming(1, { duration: 200, easing: EASE })); }, [v]);
  const grow = useAnimatedStyle(() => ({ opacity: v.value, transform: reduce ? [] : [{ scale: 0.94 + 0.06 * v.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={StyleSheet.absoluteFill}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} style={[StyleSheet.absoluteFill, s.dim]} />
      <Animated.View accessibilityViewIsModal style={[s.menu, { top: y, width: w, transformOrigin: below ? 'top left' : 'bottom left' }, grow]}>
        <Glass radius={20} />
        <Text numberOfLines={1} style={[T.meta, s.name]}>{at.item.title}</Text>
        <Item label="Continue working on this" sub="New job with this chat handed over" icon={<JobIcon size={16} />} onPress={onContinue} strong />
        <Item label="Open chat" sub={`${resolvedLine(at.item)}`} icon={<Check color={C.text} />} onPress={onOpen} />
        {onCopy ? <Item label="Copy session ID" sub={at.item.sessionId?.slice(0, 18) ?? null} icon={<CopyGlyph />} onPress={onCopy} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

const CopyGlyph = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24">
    <Path d="M9 9h10v11H9z M5 15V4h10" stroke={C.text} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

function Item({ label, sub, icon, onPress, strong }: { label: string; sub: string | null; icon: React.ReactNode; onPress: () => void; strong?: boolean }) {
  return (
    <Press onPress={onPress} haptic accessibilityLabel={label} accessibilityHint={sub ?? undefined}>
      {(pressed) => (
        <View style={[s.item, strong && s.itemStrong, pressed && s.itemPressed]}>
          <View style={s.icon}>{icon}</View>
          <View style={s.flex}>
            <Text style={[T.row, s.label]} numberOfLines={1}>{label}</Text>
            {sub ? <Text style={T.meta} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  lead: { width: LEAD, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0 },
  title: { color: C.textSoft },
  right: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  rightText: { textAlign: 'right' },
  flex: { flex: 1, minWidth: 0 },
  dim: { backgroundColor: 'rgba(0,0,0,0.4)' },
  menu: { position: 'absolute', left: GUTTER, padding: 8, borderRadius: 20, boxShadow: '0 16px 40px rgba(0,0,0,0.5)' },
  name: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 4 },
  item: { height: ITEM, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemStrong: { backgroundColor: 'rgba(255,255,255,0.08)' },
  itemPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  icon: { width: 24, alignItems: 'center' },
  label: { color: C.text },
});
