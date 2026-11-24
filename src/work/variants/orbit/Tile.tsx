import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, F } from '@/theme';
import { ago, countsLine } from '../../ui/format';
import { PinIcon } from '../../ui/icons';
import { Press } from '../../ui/Press';
import { LIVE, NEEDS, T } from '../../ui/tokens';
import type { TileProps } from '../types';
import { arcPath, polar, useOrbitClock } from './kit';

// An Active project as a small body with its own orbit in the corner: a green arc circles while agents work on it,
// an amber ring holds while it needs him, and a quiet planet sits on a hairline orbit otherwise.

type Tone = 'live' | 'needs' | 'idle';
const RING = 28;
const c = RING / 2, r = 10;

function ActivityRing({ tone }: { tone: Tone }) {
  const spin = useOrbitClock(9_000, tone === 'live');
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${(spin.value % 1) * 360}deg` }] }));
  const color = tone === 'live' ? LIVE : tone === 'needs' ? NEEDS : 'rgba(200,214,255,0.5)';
  const rest = polar(c, r, 0.125);
  const head = polar(c, r, 0.34);
  return (
    <View style={s.ring}>
      <Svg width={RING} height={RING}>
        {tone !== 'idle' ? <Circle cx={c} cy={c} r={r + 3.5} fill={color} fillOpacity={0.08} /> : null}
        <Circle cx={c} cy={c} r={r} stroke={color} strokeOpacity={tone === 'needs' ? 0.9 : 0.24} strokeWidth={tone === 'needs' ? 1.6 : 1} fill="none" />
        {tone === 'needs' ? <Circle cx={c} cy={c} r={2.6} fill={color} /> : null}
        {tone === 'idle' ? <Circle cx={rest.x} cy={rest.y} r={2} fill={color} /> : null}
      </Svg>
      {tone === 'live' ? (
        <Animated.View style={[StyleSheet.absoluteFill, turn]}>
          <Svg width={RING} height={RING}>
            <Path d={arcPath(c, r, 0.34)} stroke={color} strokeWidth={1.8} strokeLinecap="round" fill="none" />
            <Circle cx={head.x} cy={head.y} r={4.2} fill={color} fillOpacity={0.25} />
            <Circle cx={head.x} cy={head.y} r={2.2} fill={color} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function OrbitTile({ project: p, orcaWorking, orcaWaiting, onPress, onLongPress }: TileProps) {
  const needs = p.counts.needs + orcaWaiting;
  const working = p.counts.live + orcaWorking;
  const status = needs ? { text: needs === 1 ? 'Needs you' : `${needs} need you`, color: NEEDS }
    : working ? { text: `${working} working`, color: LIVE } : null;
  const tone: Tone = needs ? 'needs' : working ? 'live' : 'idle';
  const folders = p.folders.map((f) => f.label).filter(Boolean).slice(0, 3).join(' · ');
  const when = ago(p.lastActiveAt);
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.wrap}
      accessibilityLabel={[p.name, p.pinned ? 'pinned' : null, status?.text, countsLine(p.counts), when].filter(Boolean).join(', ')}
      accessibilityHint="Hold for pin, move to ideas and settings">
      {(pressed) => (
        <View style={[s.tile, pressed && s.pressed, status && { borderColor: `${status.color}4D` }]}>
          <View style={s.top}>
            <Text numberOfLines={2} style={s.name}>{p.name}</Text>
            {p.pinned ? <View style={s.pin}><PinIcon color={C.muted} /></View> : null}
            <ActivityRing tone={tone} />
          </View>
          <Text numberOfLines={1} style={s.sub}>{countsLine(p.counts)}</Text>
          <View style={s.foot}>
            {status
              ? <Text numberOfLines={1} style={[s.status, { color: status.color }]}>{status.text}</Text>
              : <Text numberOfLines={1} style={s.folders}>{folders || 'No folder'}</Text>}
            <Text style={T.meta}>{when}</Text>
          </View>
        </View>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1 },
  tile: {
    height: 116, borderRadius: 22, paddingTop: 12, paddingBottom: 13, paddingLeft: 14, paddingRight: 10, justifyContent: 'space-between',
    backgroundColor: 'rgba(200,214,255,0.045)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(200,214,255,0.13)',
  },
  pressed: { backgroundColor: 'rgba(200,214,255,0.1)' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { flex: 1, paddingTop: 3, fontFamily: F.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: C.text },
  pin: { paddingTop: 7 },
  ring: { width: RING, height: RING },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, marginTop: -2 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingRight: 4 },
  status: { flexShrink: 1, fontFamily: F.semibold, fontSize: 12, lineHeight: 16 },
  folders: { flexShrink: 1, fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: 'rgba(161,166,174,0.75)' },
});
