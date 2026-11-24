import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { C, F } from '@/theme';
import { ago, countsLine } from '../../ui/format';
import { PinIcon, PlusIcon } from '../../ui/icons';
import { Press } from '../../ui/Press';
import { T } from '../../ui/tokens';
import type { SectionHeaderProps, TileProps } from '../types';
import { useFlow } from './motion';
import { AQUA, LIVE, NEEDS } from './palette';
import { svgId, wavePath } from './Vessel';

// Liquid's list skin. Section heads are soft glass capsules with a small bead in the section's colour. Active tiles
// are frosted cards with a thin line of liquid along the bottom: green and flowing while agents work, amber and
// still while something waits on him, none while the project is quiet.

const TINT: Record<string, string> = { 'Needs you': NEEDS, Live: LIVE };

export function LiquidSectionHeader({ title, count, add, extra }: SectionHeaderProps) {
  const tint = TINT[title] ?? AQUA;
  const shown = count && !extra ? count : null;
  return (
    <View style={s.head}>
      <View style={s.left}>
        <View style={s.capsule} accessible accessibilityRole="header" accessibilityLabel={shown ? `${title}, ${shown}` : title}>
          <View style={[s.bead, { backgroundColor: tint, boxShadow: `0 0 10px ${tint}99` }]}>
            <View style={s.beadGlint} />
          </View>
          <Text style={s.title}>{title}</Text>
          {shown ? <Text style={s.count}>{shown}</Text> : null}
        </View>
        {extra}
      </View>
      {add ? (
        <Press accessibilityLabel={add.label} onPress={add.onPress} haptic hitSlop={8}>
          {(pressed) => (
            <View style={[s.add, pressed && s.addPressed]}>
              <PlusIcon size={16} color={C.textSoft} />
            </View>
          )}
        </Press>
      ) : null}
    </View>
  );
}

// ---- Active tiles ----

const POOL_PERIOD = 32;
const POOL_SPAN = 720; // wider than any tile, plus a period, so the strip can slide a period and loop
const POOL_H = 10;
const POOL_FILL = wavePath(POOL_SPAN, POOL_PERIOD, 4, 1.2, POOL_H);
const POOL_LINE = wavePath(POOL_SPAN, POOL_PERIOD, 4, 1.2);

export function LiquidTile({ project: p, orcaWorking, orcaWaiting, onPress, onLongPress }: TileProps) {
  const needs = p.counts.needs + orcaWaiting;
  const working = p.counts.live + orcaWorking;
  const status = needs ? { text: needs === 1 ? 'Needs you' : `${needs} need you`, color: NEEDS, flowing: false }
    : working ? { text: `${working} working`, color: LIVE, flowing: true } : null;
  const folders = p.folders.map((f) => f.label).filter(Boolean).slice(0, 3).join(' · ');
  return (
    <Press onPress={onPress} onLongPress={onLongPress} style={s.wrap}
      accessibilityLabel={[p.name, p.pinned ? 'pinned' : null, status?.text, countsLine(p.counts), ago(p.lastActiveAt)].filter(Boolean).join(', ')}
      accessibilityHint="Hold for pin, move to ideas and settings">
      {(pressed) => (
        <View style={[s.tile, pressed && s.tilePressed, status && { borderColor: `${status.color}40` }]}>
          <Sheen />
          {status ? <Pool color={status.color} flowing={status.flowing} /> : null}
          <View style={s.top}>
            <Text numberOfLines={2} style={s.name}>{p.name}</Text>
            {p.pinned ? <View style={s.pin}><PinIcon /></View> : null}
          </View>
          <Text numberOfLines={1} style={s.sub}>{countsLine(p.counts)}</Text>
          <View style={s.foot}>
            {status ? (
              <View style={s.status}>
                <View style={[s.dot, { backgroundColor: status.color, boxShadow: `0 0 8px ${status.color}` }]} />
                <Text numberOfLines={1} style={[s.statusText, { color: status.color }]}>{status.text}</Text>
              </View>
            ) : <Text numberOfLines={1} style={s.folders}>{folders || 'No folder'}</Text>}
            <Text style={T.meta}>{ago(p.lastActiveAt)}</Text>
          </View>
        </View>
      )}
    </Press>
  );
}

/** The frost's top light. */
function Sheen() {
  const id = svgId(useId());
  return (
    <View pointerEvents="none" style={s.sheen}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The liquid line along a tile's bottom edge and the light it throws up the card. */
function Pool({ color, flowing }: { color: string; flowing: boolean }) {
  const id = svgId(useId());
  return (
    <View pointerEvents="none" style={s.pool}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${id}g`} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0.2} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}g)`} />
      </Svg>
      {flowing ? <Flowing id={id} color={color} /> : <View style={s.strip}><Strip id={id} color={color} /></View>}
    </View>
  );
}

/** A working project's liquid slides along, on the clock every flowing tile shares. */
function Flowing({ id, color }: { id: string; color: string }) {
  const flow = useFlow(true);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: -(flow.value % 1) * POOL_PERIOD }] }));
  return <Animated.View style={[s.strip, slide]}><Strip id={id} color={color} /></Animated.View>;
}

function Strip({ id, color }: { id: string; color: string }) {
  return (
    <Svg width={POOL_SPAN} height={POOL_H}>
      <Defs>
        <LinearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.95} />
          <Stop offset="1" stopColor={color} stopOpacity={0.5} />
        </LinearGradient>
      </Defs>
      <Path d={POOL_FILL} fill={`url(#${id}l)`} />
      <Path d={POOL_LINE} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.8} />
    </Svg>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, paddingBottom: 8 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  capsule: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingLeft: 12, paddingRight: 14, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  bead: { width: 9, height: 9, borderRadius: 4.5 },
  beadGlint: { position: 'absolute', top: 1.5, left: 2, width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.85)' },
  title: { fontFamily: F.semibold, fontSize: 14, lineHeight: 20, letterSpacing: -0.1, color: C.textSoft },
  count: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.faint, fontVariant: ['tabular-nums'] },
  add: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
  },
  addPressed: { backgroundColor: 'rgba(255,255,255,0.15)' },

  wrap: { flex: 1 },
  tile: {
    height: 116, borderRadius: 22, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 17, justifyContent: 'space-between',
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.11)',
  },
  tilePressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: 64 },
  pool: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 46 },
  strip: { position: 'absolute', left: 0, bottom: 0, width: POOL_SPAN, height: POOL_H },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  name: { flex: 1, fontFamily: F.semibold, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: C.text },
  pin: { paddingTop: 4 },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, flexShrink: 1 },
  folders: { flexShrink: 1, fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: 'rgba(161,166,174,0.75)' },
});
