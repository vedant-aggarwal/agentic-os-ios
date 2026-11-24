import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { F } from '@/theme';
import { ago, countsLine } from '../../ui/format';
import { Press } from '../../ui/Press';
import type { TileProps } from '../types';
import { ACCENT, display, INK, INK_FAINT, LIVE, PAPER, RULE, useFaces, WARN } from './ink';

// An Active project as a print card: square corners, a hairline edge, a large light initial, the name and what's
// open in it, and a ruled foot with its state (amber when it needs him, green while agents work) or its folders,
// and when it was last touched. A pinned project carries a cobalt ribbon on its top edge.

const INITIAL = 40;

export function Card({ project: p, orcaWorking, orcaWaiting, onPress, onLongPress }: TileProps) {
  const face = useFaces();
  const needs = p.counts.needs + orcaWaiting;
  const working = p.counts.live + orcaWorking;
  const status = needs ? { text: needs === 1 ? 'Needs you' : `${needs} need you`, color: WARN }
    : working ? { text: `${working} working`, color: LIVE } : null;
  const folders = p.folders.map((f) => f.label).filter(Boolean).slice(0, 3).join(' · ');
  const initial = (Array.from(p.name.trim())[0] ?? '·').toUpperCase();
  const when = ago(p.lastActiveAt);
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.wrap}
      accessibilityLabel={[p.name, p.pinned ? 'pinned' : null, status?.text, countsLine(p.counts), when].filter(Boolean).join(', ')}
      accessibilityHint="Hold for pin, move to ideas and settings">
      {(pressed) => (
        <View style={[s.card, pressed && s.pressed]}>
          <Text maxFontSizeMultiplier={1} style={[s.initial, { fontFamily: face.light }]}>{initial}</Text>
          {p.pinned ? (
            <Svg width={10} height={17} viewBox="0 0 10 17" style={s.ribbon}>
              <Path d="M0 0H10V17L5 12.5L0 17Z" fill={ACCENT} />
            </Svg>
          ) : null}
          <View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.name}>{p.name}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={s.counts}>{countsLine(p.counts)}</Text>
            <View style={s.foot}>
              {status ? (
                <View style={s.status}>
                  <View style={[s.mark, { backgroundColor: status.color }]} />
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.caps, { color: status.color }]}>{status.text}</Text>
                </View>
              ) : <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.caps, s.folders]}>{folders || 'No folder'}</Text>}
              <Text maxFontSizeMultiplier={1.2} style={s.ago}>{when}</Text>
            </View>
          </View>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  card: {
    height: 132, paddingHorizontal: 12, paddingTop: 13, paddingBottom: 10, justifyContent: 'space-between',
    backgroundColor: PAPER, borderWidth: StyleSheet.hairlineWidth, borderColor: RULE, borderRadius: 2,
  },
  pressed: { backgroundColor: 'rgba(245,243,238,0.08)' },
  initial: { ...display(INITIAL), alignSelf: 'flex-start', color: INK, letterSpacing: -1 },
  ribbon: { position: 'absolute', top: -StyleSheet.hairlineWidth, right: 12 },
  name: { fontFamily: F.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, color: INK },
  counts: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: INK_FAINT },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: RULE,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  mark: { width: 6, height: 6 },
  caps: { flexShrink: 1, fontFamily: F.semibold, fontSize: 10, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  folders: { color: INK_FAINT },
  ago: { fontFamily: F.regular, fontSize: 11.5, lineHeight: 15, color: INK_FAINT, fontVariant: ['tabular-nums'] },
});
