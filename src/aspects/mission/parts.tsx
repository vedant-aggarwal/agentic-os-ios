import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { CheckRing, haptic, Icon, MOTION, Press, R, SURF, t, tint, undoable, useAspect } from '@/aspects/kit';
import { call, collection, invalidate } from '@/lib/mod';
import { ASPECT_COLOR, C, type AspectKey } from '@/theme';
import { ASPECT_LABEL, daysLeftLabel, message, pctKnown, progressOf, refresh, sourceLine, type Sources } from './data';
import { useNav } from './nav';
import type { Goal, Milestone } from './types';

export const colorOf = (a: AspectKey | null | undefined, fallback: string = C.faint) => (a ? ASPECT_COLOR[a] : fallback);

/** A goal's section, as a small dot in that section's colour. */
export function Dot({ aspect, size = 8, top }: { aspect: AspectKey | null | undefined; size?: number; top?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, marginTop: top, backgroundColor: colorOf(aspect, 'rgba(255,255,255,0.28)') }} />;
}

/** What a goal or project serves, or the section it belongs to: the dot and one short line. */
export function Serves({ aspect, text, strong }: { aspect: AspectKey | null | undefined; text: string; strong?: boolean }) {
  return (
    <View style={s.serves}>
      <Dot aspect={aspect} />
      <Text numberOfLines={1} style={[t.footnote, s.flex, strong && { color: C.textSoft }]}>{text}</Text>
    </View>
  );
}
export const aspectName = (a: AspectKey | null | undefined) => (a ? ASPECT_LABEL[a] : 'No section yet');
export const lower = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);

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

/** The line under a goal's bar: how far, from where, and the days left. */
export function goalLine(g: Goal, src: Sources, days = true) {
  const p = progressOf(g, src);
  // a count says it already ("1 of 3 tasks done"); the rest lead with the percentage
  const counted = g.source.kind === 'tasks' || g.source.kind === 'milestones';
  const what = g.source.kind === 'none' ? 'No number yet' : pctKnown(g, src) && !counted ? `${Math.round(p * 100)}%, ${lower(sourceLine(g, src))}` : sourceLine(g, src);
  return days && g.end && g.status === 'active' && !g.stale ? `${what}. ${daysLeftLabel(g.end)}` : what;
}

/** A goal as a row inside a Group: its title, its bar with the time gone, and where the number comes from. */
export function GoalRow({ g, src, serves }: { g: Goal; src: Sources; serves?: boolean }) {
  const a = useAspect();
  const nav = useNav();
  const done = g.status !== 'active';
  return (
    <Press label={g.title} onPress={() => nav.goal(g.id)} scale={0.99} style={s.goalRow}>
      <View style={s.goalHead}>
        <Dot aspect={g.aspect} top={7} />
        <Text numberOfLines={3} style={[t.callout, s.flex, done && { color: C.faint }]}>{g.title}</Text>
        <Icon name="right" size={14} color={C.faint} />
      </View>
      {g.source.kind === 'none' ? null : <GoalBar progress={progressOf(g, src)} time={done ? null : g.time} color={colorOf(g.aspect, a.color)} height={4} />}
      <Text numberOfLines={2} style={[t.footnote, t.num]}>{g.status === 'done' ? 'Done' : goalLine(g, src)}</Text>
      {serves && g.parent ? <Serves aspect={g.parent.aspect} text={`Serves ${g.parent.title}`} /> : null}
    </Press>
  );
}

/**
 * A row with its own tick: the ring marks the thing done (or not), the rest of the row opens it. Two controls side
 * by side, never one inside the other, each at least 44 points.
 */
export function TickRow({ done, onTick, tickLabel, title, sub, onPress, color, value, left, lines = 2 }: {
  done: boolean; onTick: () => Promise<boolean> | void; tickLabel: string; title: string; sub?: string | null; onPress?: () => void;
  color?: string; value?: string | null; left?: ReactNode; lines?: number;
}) {
  // the ring fills the moment it is tapped; the row then follows what the PC says (a refusal puts the ring back)
  const [shown, setShown] = useState<boolean | null>(null);
  const on = shown ?? done;
  const sig = `${done}:${title}`;
  const [was, setWas] = useState(sig);
  if (was !== sig) { setWas(sig); setShown(null); }
  const tick = () => {
    setShown(!on);
    const r = onTick();
    if (r) void r.then((ok) => { if (!ok) setShown(null); });
  };
  const body = (
    <>
      {left}
      <View style={s.tickMid}>
        <Text numberOfLines={lines} style={[t.callout, on && { color: C.faint }]}>{title}</Text>
        {sub ? <Text numberOfLines={lines} style={t.footnote}>{sub}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={[t.subhead, t.num, s.value]}>{value}</Text> : null}
      {onPress ? <Icon name="right" size={14} color={C.faint} /> : null}
    </>
  );
  return (
    <View style={s.tickRow}>
      <Press label={tickLabel} onPress={tick} role="checkbox" state={{ checked: on }} feel="none" scale={0.9} style={s.tickBtn}>
        <CheckRing done={on} size={26} color={color} />
      </Press>
      {onPress ? <Press label={title} onPress={onPress} scale={0.99} wrap={s.flex} style={s.tickBody}>{body}</Press> : <View style={[s.flex, s.tickBody]}>{body}</View>}
    </View>
  );
}

/** A round plate for a row's icon. */
export function Disc({ children, color }: { children: ReactNode; color?: string }) {
  return <View style={[s.disc, color ? { backgroundColor: tint(color, 0.16) } : null]}>{children}</View>;
}

/** A tappable text link in the page colour ("Change how it's measured", "Undo"). */
export function Link({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  const a = useAspect();
  return (
    <Press label={label} onPress={onPress} hitSlop={12} wrap={s.linkWrap} style={s.link}>
      <Text style={[t.subhead, { color: color ?? a.color }]}>{label}</Text>
    </Press>
  );
}

/**
 * A choice tile: a short title, and a line under it when the title needs one. `nested` is for tiles inside a padded
 * group (its radius minus the padding); elsewhere they sit in a sheet.
 */
export function Tile({ title, sub, onPress, selected, color, wrap, nested }: {
  title: string; sub?: string; onPress: () => void; selected?: boolean; color?: string; wrap?: object; nested?: boolean;
}) {
  const a = useAspect();
  const tone = color ?? a.color;
  return (
    <Press label={sub ? `${title}, ${sub}` : title} onPress={onPress} role="radio" state={{ selected: !!selected }} feel="tick" wrap={[s.tileWrap, wrap]}
      style={[s.tile, sub ? s.tileTall : null, { borderRadius: nested ? R.inner + 4 : R.tile }, selected && { backgroundColor: tint(tone, 0.16), borderColor: tint(tone, 0.5) }]}>
      <Text style={[t.callout, selected && { color: tone }]}>{title}</Text>
      {sub ? <Text style={t.footnote}>{sub}</Text> : null}
    </Press>
  );
}

// ── one tap writes ───────────────────────────────────────────────────────────────────────────────────────────
/** Marks one of his tasks done (PATCH /tasks/<id>, the same write Today makes); Undo puts it back to do. */
export function useTickTask() {
  const a = useAspect();
  return async (task: { id: string; title: string }, done = true): Promise<boolean> => {
    const set = (status: 'done' | 'todo') => call(`/tasks/${task.id}`, { status }, 'PATCH').then(() => { refresh(); invalidate('/tasks'); });
    try {
      await set(done ? 'done' : 'todo');
      if (done) {
        haptic.success();
        undoable(`Done: ${task.title}`, () => set('todo').catch((e) => a.notice(message(e))));
      }
      return true;
    } catch (e) { a.notice(message(e)); return false; }
  };
}

/** Ticks a milestone (Mission's milestones collection) done or not; done gets Undo. */
export function useTickMilestone() {
  const a = useAspect();
  return async (id: string, done = true): Promise<boolean> => {
    const coll = collection<Milestone>('mission', 'milestones');
    const set = async (on: boolean) => {
      let m = coll.get()?.find((x) => x.id === id);
      if (!m) { await coll.refresh(); m = coll.get()?.find((x) => x.id === id); }
      if (!m) throw new Error('That milestone is gone.');
      await coll.put({ ...m, done: on, done_at: on ? new Date().toISOString() : null });
      refresh();
      return m.title;
    };
    try {
      const title = await set(done);
      if (done) {
        haptic.success();
        undoable(`Done: ${title}`, () => set(false).then(() => {}).catch((e) => a.notice(message(e))));
      }
      return true;
    } catch (e) { a.notice(message(e)); return false; }
  };
}

export const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  serves: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  track: { backgroundColor: SURF.track, overflow: 'visible', justifyContent: 'center' },
  tick: { position: 'absolute', width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.55)' },
  goalRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  goalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  tickRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  tickBtn: { width: 64, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },
  tickBody: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingRight: 16, paddingVertical: 10 },
  tickMid: { flex: 1, minWidth: 0, gap: 2 },
  value: { color: C.textSoft },
  disc: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  linkWrap: { alignSelf: 'flex-start' },
  link: { minHeight: 44, justifyContent: 'center' },
  tileWrap: { flexBasis: '47%', flexGrow: 1 },
  tile: {
    minHeight: 52, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 10, gap: 2, justifyContent: 'center',
    backgroundColor: SURF.raised, borderWidth: 1, borderColor: 'transparent',
  },
  tileTall: { minHeight: 64 },
});
