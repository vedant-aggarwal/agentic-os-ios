import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ago, countsLine } from '../../ui/format';
import { PinIcon } from '../../ui/icons';
import { Press } from '../../ui/Press';
import type { TileProps } from '../types';
import { beat, blinkOpacity } from './clock';
import { alpha, MONO, P } from './palette';

// An Active project as a terminal pane: a header strip with a status lamp (amber and blinking while it needs him,
// steady green while agents work, dark when idle) and when it was last active; then the name, what's open, and its
// folders.

function BlinkLamp({ color }: { color: string }) {
  const st = useAnimatedStyle(() => ({ opacity: blinkOpacity(beat.value, 0.2) }));
  return <Animated.View style={[s.lamp, { backgroundColor: color, boxShadow: `0 0 6px ${color}` }, st]} />;
}

function Lamp({ color, blink }: { color: string | null; blink: boolean }) {
  if (!color) return <View style={[s.lamp, s.lampOff]} />;
  if (blink) return <BlinkLamp color={color} />;
  return <View style={[s.lamp, { backgroundColor: color, boxShadow: `0 0 6px ${color}` }]} />;
}

export function Tile({ project: p, orcaWorking, orcaWaiting, onPress, onLongPress }: TileProps) {
  const needs = p.counts.needs + orcaWaiting;
  const working = p.counts.live + orcaWorking;
  const status = needs ? { text: needs === 1 ? 'Needs you' : `${needs} need you`, color: P.amber }
    : working ? { text: `${working} working`, color: P.green } : null;
  const folders = p.folders.map((f) => f.label).filter(Boolean).slice(0, 3).join(' · ');
  const when = ago(p.lastActiveAt);
  const edge = status ? alpha(status.color, 0.42) : P.rule;
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.wrap}
      accessibilityLabel={[p.name, p.pinned ? 'pinned' : null, status?.text, countsLine(p.counts), when].filter(Boolean).join(', ')}
      accessibilityHint="Hold for pin, move to ideas and settings">
      {(pressed) => (
        <View style={[s.tile, { borderColor: edge }, pressed && s.pressed]}>
          <View style={[s.strip, { borderBottomColor: edge, backgroundColor: status ? alpha(status.color, 0.1) : 'rgba(255,255,255,0.025)' }]}>
            <Lamp color={status?.color ?? null} blink={!!needs} />
            <Text numberOfLines={1} style={[s.state, { color: status?.color ?? P.dim }]}>{status?.text ?? 'idle'}</Text>
            {when ? <Text style={s.when}>{when}</Text> : null}
          </View>
          <View style={s.body}>
            <View style={s.nameRow}>
              <Text numberOfLines={2} style={s.name}>{p.name}</Text>
              {p.pinned ? <View style={s.pin}><PinIcon size={11} color={P.dim} /></View> : null}
            </View>
            <View style={s.foot}>
              <Text numberOfLines={1} style={s.counts}>{countsLine(p.counts)}</Text>
              <Text numberOfLines={1} style={s.folders}>{folders || 'No folder'}</Text>
            </View>
          </View>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  tile: { height: 120, borderWidth: 1, borderRadius: 3, backgroundColor: P.pane, overflow: 'hidden' },
  pressed: { backgroundColor: 'rgba(16,28,22,0.92)' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 26, paddingHorizontal: 10, borderBottomWidth: 1 },
  lamp: { width: 6, height: 6, borderRadius: 3 },
  lampOff: { borderWidth: 1, borderColor: P.faint },
  state: {
    flex: 1, fontFamily: MONO, fontWeight: '700', fontSize: 10, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase',
  },
  when: { fontFamily: MONO, fontSize: 11, lineHeight: 14, color: P.dim, fontVariant: ['tabular-nums'] },
  body: { flex: 1, paddingHorizontal: 10, paddingTop: 9, paddingBottom: 10, justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { flex: 1, fontFamily: MONO, fontWeight: '700', fontSize: 14, lineHeight: 18, color: P.text },
  pin: { paddingTop: 3 },
  foot: { gap: 2 },
  counts: { fontFamily: MONO, fontSize: 11, lineHeight: 15, color: P.soft },
  folders: { fontFamily: MONO, fontSize: 11, lineHeight: 15, color: P.dim },
});
