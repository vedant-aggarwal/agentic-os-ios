import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Icon, MOTION, Press, R, SURF, t, tint, useAspect } from '@/aspects/kit';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';
import { ASPECT_LABEL } from './data';

export const colorOf = (a: AspectKey | null | undefined, fallback: string = C.faint) => (a ? ASPECT_COLOR[a] : fallback);

/** A goal's aspect, as a small dot in that aspect's colour. */
export function Dot({ aspect, size = 8, top }: { aspect: AspectKey | null | undefined; size?: number; top?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, marginTop: top, backgroundColor: colorOf(aspect, 'rgba(255,255,255,0.28)') }} />;
}

/** "Serves" lines and aspect tags: the dot and a short text. */
export function Tag({ aspect, text, strong }: { aspect: AspectKey | null | undefined; text: string; strong?: boolean }) {
  return (
    <View style={s.tag}>
      <Dot aspect={aspect} />
      <Text numberOfLines={1} style={[t.small, s.flex, strong && { color: C.textSoft }]}>{text}</Text>
    </View>
  );
}
export const aspectName = (a: AspectKey | null | undefined) => (a ? ASPECT_LABEL[a] : 'No aspect yet');

/**
 * Progress toward a goal, with a thin mark for how much of its time has gone. Ahead of the mark is fine; behind it
 * is shown as it is, without a warning colour.
 */
export function GoalBar({ progress, time, color, height = 6 }: { progress: number; time: number | null; color: string; height?: number }) {
  const p = useSharedValue(0);
  useEffect(() => { p.set(withSpring(Math.max(0, Math.min(1, progress)), MOTION.slow)); }, [progress, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%`, opacity: p.value > 0.004 ? 1 : 0 }));
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
      {time != null && time > 0.02 && time < 0.98 ? <View style={[s.tick, { left: `${time * 100}%`, height: height + 8, top: -4 }]} /> : null}
    </View>
  );
}

/**
 * One rung of the page's thread: the line runs down the left from the purpose to today's first block. Each rung is a
 * period nearer than the one above it. `live` marks the rung that is this week's move, in the page colour.
 */
export function Rung({ label, right, live, last, children, onLabel }: {
  label: string; right?: ReactNode; live?: boolean; last?: boolean; children: ReactNode; onLabel?: () => void;
}) {
  const a = useAspect();
  return (
    <View style={s.rung}>
      <View style={s.gutter}>
        <View style={[s.node, live ? { backgroundColor: a.color, borderColor: a.color, boxShadow: `0 0 12px ${tint(a.color, 0.55)}` } : null]} />
        {last ? null : <View style={s.line} />}
      </View>
      <View style={[s.rungBody, last && s.rungLast]}>
        <View style={s.rungHead}>
          {onLabel ? (
            <Press label={label} onPress={onLabel} feel="tick" wrap={s.flex} style={s.rungLabelRow}>
              <Text style={[t.section, live && { color: a.color }]}>{label}</Text>
              <Icon name="right" size={12} color={C.faint} />
            </Press>
          ) : <Text style={[t.section, s.flex, live && { color: a.color }]}>{label}</Text>}
          {typeof right === 'string' ? <Text style={[t.caption, t.num]}>{right}</Text> : right}
        </View>
        {children}
      </View>
    </View>
  );
}

/** A tappable text link in the page colour ("Open Growth", "Undo"). */
export function Link({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const a = useAspect();
  return (
    <Press label={label} onPress={onPress} hitSlop={12} wrap={s.linkWrap} style={s.link}>
      <Text style={[t.label, { color: color ?? a.color }]}>{label}</Text>
    </Press>
  );
}

/**
 * A choice tile: a short title, and a line under it when the title needs one. `nested` is for tiles inside a padded
 * card (its radius minus the padding); elsewhere they sit in a sheet.
 */
export function Tile({ title, sub, onPress, selected, color, wrap, nested }: {
  title: string; sub?: string; onPress: () => void; selected?: boolean; color?: string; wrap?: object; nested?: boolean;
}) {
  const a = useAspect();
  const tone = color ?? a.color;
  return (
    <Press label={sub ? `${title}, ${sub}` : title} onPress={onPress} role="radio" state={{ selected: !!selected }} feel="tick" wrap={[s.tileWrap, wrap]}
      style={[s.tile, sub ? s.tileTall : null, { borderRadius: nested ? R.inner : R.chip }, selected && { backgroundColor: tint(tone, 0.16), borderColor: tint(tone, 0.5) }]}>
      <Text style={[t.strong, selected && { color: tone }]}>{title}</Text>
      {sub ? <Text style={t.small}>{sub}</Text> : null}
    </Press>
  );
}

export const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  track: { backgroundColor: SURF.track, overflow: 'visible', justifyContent: 'center' },
  tick: { position: 'absolute', width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.55)' },
  rung: { flexDirection: 'row', gap: 12 },
  gutter: { width: 12, alignItems: 'center' },
  node: { width: 10, height: 10, borderRadius: 5, marginTop: 5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.32)', backgroundColor: '#11141C' },
  line: { flex: 1, width: 1, marginTop: 4, backgroundColor: SURF.line },
  rungBody: { flex: 1, minWidth: 0, gap: 12, paddingBottom: 32 },
  rungLast: { paddingBottom: 0 },
  rungHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  rungLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  linkWrap: { alignSelf: 'flex-start' },
  link: { minHeight: 32, justifyContent: 'center' },
  tileWrap: { flexBasis: '47%', flexGrow: 1 },
  tile: {
    minHeight: 48, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 8, gap: 2, justifyContent: 'center',
    backgroundColor: SURF.raised, borderWidth: 1, borderColor: 'transparent',
  },
  tileTall: { minHeight: 64 },
});
