import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Check, Plus } from '@/components/Icons';
import type { BodyToday } from '@/lib/body';
import type { Row, Section } from '@/lib/today';
import { ASPECT_COLOR, C, F, SPRING } from '@/theme';
import { GymCard } from './GymCard';
import { Pictogram } from './Pictogram';

const WATER = '#7CC8F8';
const SHOWN = 3; // carried-over tasks shown before "Show more"

type Props = {
  sections: Section[];
  body: BodyToday | null;
  onToggle: (id: string) => void;
  /** Opens a section page on one of its parts: 'body', 'body/gym' (src/lib/links.ts lists them). */
  onOpen: (link: string) => void;
  onWater: () => void;
};

/**
 * The day's plan, one part per aspect in life-wheel order. Body leads with the workout, water and protein. Each part
 * opens its section where the same thing lives: the head opens the page, the gym card Gym, water and protein Diet.
 */
export function DayPlan({ sections, body, onToggle, onOpen, onWater }: Props) {
  const parts = sections.slice();
  if (body && !parts.some((x) => x.key === 'body')) {
    parts.unshift({ key: 'body', label: 'Body', color: ASPECT_COLOR.body, done: 0, total: 0, rows: [], carried: [] });
  }
  if (body) parts.sort((a, b) => Number(b.key === 'body') - Number(a.key === 'body'));
  return (
    <View style={s.wrap}>
      {parts.map((sec) => (
        <View key={sec.key} style={s.section}>
          <Head sec={sec} onOpen={sec.key === 'none' ? undefined : () => onOpen(sec.key)} />
          {sec.key === 'body' && body ? (
            <>
              <GymCard body={body} onOpen={() => onOpen('body/gym')} />
              <View style={s.tiles}>
                {body.food.water_target ? <WaterTile n={body.food.water} of={body.food.water_target} onAdd={onWater} onOpen={() => onOpen('body/diet')} /> : null}
                {body.food.protein_target ? <ProteinTile n={body.food.protein} of={body.food.protein_target} onOpen={() => onOpen('body/diet/meal')} /> : null}
              </View>
            </>
          ) : null}
          <Rows sec={sec} onToggle={onToggle} />
        </View>
      ))}
    </View>
  );
}

function Head({ sec, onOpen }: { sec: Section; onOpen?: () => void }) {
  const right = sec.total ? `${sec.done} of ${sec.total}` : sec.carried.length ? `${sec.carried.length} carried over` : '';
  return (
    <Pressable accessibilityRole={onOpen ? 'button' : 'header'} accessibilityLabel={`${sec.label}${right ? `, ${right}` : ''}`}
      disabled={!onOpen} onPress={onOpen} style={({ pressed }) => [s.head, pressed && { opacity: 0.6 }]}>
      <View style={s.headLeft}>
        {sec.color ? <View style={[s.headDot, { backgroundColor: sec.color }]} /> : null}
        <Text style={s.headLabel}>{sec.label}</Text>
        {onOpen ? <Text style={s.chev}>›</Text> : null}
      </View>
      <Text style={s.headCount}>{right}</Text>
    </Pressable>
  );
}

function Rows({ sec, onToggle }: { sec: Section; onToggle: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const late = all ? sec.carried : sec.carried.slice(0, SHOWN);
  const list = [...sec.rows, ...late];
  if (!list.length) return null;
  const more = sec.carried.length - SHOWN;
  return (
    <View style={s.list}>
      {list.map((r, k) => <TaskLine key={r.id} row={r} first={k === 0} onToggle={onToggle} />)}
      {more > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((x) => !x)} style={({ pressed }) => [s.more, pressed && { opacity: 0.6 }]}>
          <Text style={s.moreText}>{all ? 'Show fewer' : `Show ${more} more carried over`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TaskLine({ row, first, onToggle }: { row: Row; first: boolean; onToggle: (id: string) => void }) {
  const color = row.color ?? C.muted;
  const done = row.done;
  const fill = useAnimatedStyle(() => ({
    opacity: withTiming(done ? 1 : 0, { duration: 160, reduceMotion: ReduceMotion.System }),
    transform: [{ scale: withSpring(done ? 1 : 0.6, { ...SPRING, reduceMotion: ReduceMotion.System }) }],
  }));
  return (
    <Pressable
      accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`${row.title}, ${row.right}`}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
        onToggle(row.id);
      }}
      style={({ pressed }) => [s.line, pressed && { backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      <Pictogram title={row.title} aspect={row.aspect} color={color} done={done} />
      <View style={[s.mid, !first && s.rule]}>
        <View style={s.words}>
          <Text numberOfLines={2} style={[s.title, done && { color: C.faint }]}>{row.title}</Text>
          <Text numberOfLines={1} style={[s.sub, row.rightStrong && { color: C.textSoft }]}>{row.sub ? `${row.right}, ${row.sub}` : row.right}</Text>
        </View>
        <View style={[s.ring, { borderColor: done ? color : `${color}80` }]}>
          <Animated.View style={[s.ringFill, { backgroundColor: color }, fill]}><Check /></Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

/** Water: the plus adds a glass here; the rest of the tile opens Diet, where the same glasses are. */
function WaterTile({ n, of, onAdd, onOpen }: { n: number; of: number; onAdd: () => void; onOpen: () => void }) {
  const pips = Math.min(of, 16), lines = pips > 8 ? 2 : 1, per = Math.ceil(pips / lines);
  const full = Math.min(pips, Math.round((n / of) * pips));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Water ${n} of ${of} glasses. Open Diet`} onPress={onOpen}
      // VoiceOver reads the tile as one button, so the plus is also offered as its action
      accessibilityActions={[{ name: 'add', label: 'Add a glass of water' }]}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'add') onAdd(); }}
      style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={s.tileTop}>
        <Text style={s.tileLabel}>Water</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a glass of water" hitSlop={8}
          onPress={() => { if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(); }}
          style={({ pressed }) => [s.add, pressed && { transform: [{ scale: 0.92 }] }]}>
          <Plus size={16} />
        </Pressable>
      </View>
      <Text style={s.big}>{n}<Text style={s.of}>{` of ${of} glasses`}</Text></Text>
      <View style={s.pips}>
        {Array.from({ length: lines }, (_, r) => (
          <View key={r} style={s.pipRow}>
            {Array.from({ length: per }, (_, c) => {
              const k = r * per + c;
              return <View key={c} style={[s.pip, k >= pips && { opacity: 0 }, k < full && { backgroundColor: WATER }]} />;
            })}
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function ProteinTile({ n, of, onOpen }: { n: number; of: number; onOpen: () => void }) {
  const pct = Math.min(1, n / of);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Protein ${n} of ${of} grams. Log a meal`} onPress={onOpen}
      style={({ pressed }) => [s.tile, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={s.tileTop}>
        <Text style={s.tileLabel}>Protein</Text>
        <Text style={s.log}>Log</Text>
      </View>
      <Text style={s.big}>{Math.round(n)}<Text style={s.of}>{` of ${of} g`}</Text></Text>
      <View style={s.track}><View style={[s.bar, { width: `${pct * 100}%` }]} /></View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 28 },
  section: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headDot: { width: 8, height: 8, borderRadius: 4 },
  headLabel: { fontFamily: F.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: C.text },
  chev: { fontFamily: F.medium, fontSize: 22, lineHeight: 26, color: C.faint, marginLeft: -2 },
  headCount: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.faint, fontVariant: ['tabular-nums'] },
  list: { borderRadius: 20, backgroundColor: C.glass, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  mid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingRight: 16 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  words: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.medium, fontSize: 16, lineHeight: 21, color: C.text },
  sub: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.faint, fontVariant: ['tabular-nums'], marginTop: 1 },
  ring: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ringFill: { position: 'absolute', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  more: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)' },
  moreText: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 20, backgroundColor: C.glass, padding: 14, gap: 6, minHeight: 116 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 },
  tileLabel: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.muted },
  add: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  log: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: C.textSoft },
  big: { fontFamily: F.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: C.text, fontVariant: ['tabular-nums'] },
  of: { fontFamily: F.regular, fontSize: 14, letterSpacing: 0, color: C.muted },
  pips: { gap: 4, marginTop: 'auto' },
  pipRow: { flexDirection: 'row', gap: 4 },
  pip: { flex: 1, height: 12, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: 'auto', marginBottom: 5 },
  bar: { height: 6, borderRadius: 3, backgroundColor: ASPECT_COLOR.body },
});
