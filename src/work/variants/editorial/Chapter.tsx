import { useLayoutEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { F } from '@/theme';
import { PlusIcon } from '../../ui/icons';
import { Press } from '../../ui/Press';
import { LEAD } from '../../ui/tokens';
import type { SectionHeaderProps } from '../types';
import { ACCENT, INK, INK_FAINT, RULE, useFaces } from './ink';

// Section headers as numbered chapters: a hairline across the column, the chapter number in the accent where the
// rows' state dots sit, the title on the rows' text line, and the count set like a page number on the right.
// The numbers run over the sections on screen in the page's order, so they stay 01, 02, 03 as sections come and go.

const ORDER = ['Needs you', 'Live', 'Projects', 'Recent in Orca', 'Inbox'];
const rank = (t: string) => { const i = ORDER.indexOf(t); return i < 0 ? ORDER.length : i; };
const mounted = new Map<string, number>(); // title -> headers with it on screen
let order = ''; // mounted titles in page order, one per line
const subs = new Set<() => void>();
function publish() {
  order = [...mounted.keys()].sort((a, b) => rank(a) - rank(b)).join('\n');
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** "01" for the first section on screen; null for the instant before the header has registered. */
function useChapter(title: string) {
  const list = useSyncExternalStore(subscribe, () => order);
  useLayoutEffect(() => {
    mounted.set(title, (mounted.get(title) ?? 0) + 1);
    publish();
    return () => {
      const n = (mounted.get(title) ?? 1) - 1;
      if (n > 0) mounted.set(title, n);
      else mounted.delete(title);
      publish();
    };
  }, [title]);
  const i = list ? list.split('\n').indexOf(title) : -1;
  return i < 0 ? null : String(i + 1).padStart(2, '0');
}

export function Chapter({ title, count, add, extra }: SectionHeaderProps) {
  const n = useChapter(title);
  const face = useFaces();
  return (
    <View style={s.head} accessibilityRole="header">
      <View style={s.lead}>
        <Text maxFontSizeMultiplier={1.2} style={s.num}>{n ?? ''}</Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.title}>{title}</Text>
      </View>
      {extra}
      <View style={s.end}>
        {count && !extra ? <Text maxFontSizeMultiplier={1.3} style={[s.count, { fontFamily: face.light }]}>{count}</Text> : null}
        {add ? (
          <Press accessibilityLabel={add.label} onPress={add.onPress} haptic hitSlop={8} style={s.add}>
            {(pressed) => (
              <View style={[s.addBox, pressed && s.addPressed]}><PlusIcon size={14} color={INK} /></View>
            )}
          </Press>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32, paddingTop: 14, paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: RULE,
  },
  lead: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
  num: { width: LEAD + 12, fontFamily: F.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, color: ACCENT, fontVariant: ['tabular-nums'] },
  title: { flexShrink: 1, fontFamily: F.semibold, fontSize: 21, lineHeight: 28, letterSpacing: -0.5, color: INK },
  end: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
  count: { fontSize: 21, lineHeight: 28, letterSpacing: -0.4, color: INK_FAINT, fontVariant: ['tabular-nums'] },
  add: { width: 32, height: 32 },
  addBox: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,243,238,0.32)',
  },
  addPressed: { backgroundColor: 'rgba(245,243,238,0.1)' },
});
