import { StyleSheet, Text, View } from 'react-native';
import { dayAhead, streakWords, trainedWords } from '@/lib/body';
import type { Read } from '@/lib/mod';
import { C } from '@/theme';
import {
  Block, Button, Failed, Group, Item, Lead, num, Press, Skeleton, Tag, t, undoable, useAspect,
} from '@/aspects/kit';
import { agoDays, goalOf, logWater, useGym, type Home } from '../api';
import { useNav } from '../nav';
import { minutesFor, Progress, s as u, Trend } from '../parts';
import { Week as TrainWeek } from '../train/Train';
import { Linked } from '@/aspects/_linked/Linked';

const DIM: Record<string, string> = { pace: 'pace', pitch: 'pitch variation', loudness: 'steady loudness', pauses: 'pauses', clarity: 'clarity', fillers: 'fewer fillers' };

/**
 * Body today: what to do for the body today, and whether it is working. The lead is whatever matters most right
 * now (the server picks it from the clock and what is done); the rest of today is one list, each line doable from
 * here; the proof sits underneath with the date each number was true.
 */
export function TodayTab({ read }: { read: Read<Home> }) {
  const { data: h, error, refresh } = read;
  if (!h) return error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : <TodaySkeleton />;
  return (
    <>
      <LeadCard h={h} />
      <Week h={h} />
      <Rest h={h} />
      <Proof h={h} />
      <Linked />
    </>
  );
}

function TodaySkeleton() {
  return (
    <View style={u.gap16}>
      <Skeleton height={232} radius={28} />
      <Skeleton height={64} />
      <Skeleton height={220} radius={22} />
    </View>
  );
}

// ── the lead ──
/** Start today's planned session in one tap: the full session comes from Train's read (the same cached request). */
function useStart() {
  const nav = useNav();
  const gym = useGym();
  const session = gym.data?.session ?? null;
  return () => { if (session && session.status !== 'done') void nav.startWorkout(session); else nav.openTab('train'); };
}

function LeadCard({ h }: { h: Home }) {
  const a = useAspect();
  const nav = useNav();
  const start = useStart();
  const g = h.gym;
  if (g.state === 'live' && g.session) {
    return (
      <Lead>
        <Tag label="In progress" tone="aspect" />
        <View style={u.gap4}>
          <Text style={t.large}>{g.session.name}</Text>
          <Text style={[t.subhead, t.num]}>{`${g.session.sets} ${g.session.sets === 1 ? 'set' : 'sets'} done so far`}</Text>
        </View>
        <Button label="Resume workout" kind="accent" onPress={() => nav.openFlow({ kind: 'live' })} />
      </Lead>
    );
  }
  if (h.lead === 'gym' && g.plan) {
    const p = g.plan;
    const min = minutesFor(p);
    return (
      <Lead>
        <View style={u.between}>
          <Text style={[t.footnote, { color: a.color }]}>Today&apos;s session</Text>
          <Text style={[t.footnote, t.num]}>{`About ${min} min`}</Text>
        </View>
        <View style={u.gap4}>
          <Text style={t.large}>{p.name}</Text>
          {p.why ? <Text numberOfLines={3} style={t.subhead}>{p.why}</Text> : null}
        </View>
        <View style={s.exList}>
          {p.items.slice(0, 4).map((it) => (
            <View key={it.ex} style={s.exRow}>
              <Text numberOfLines={1} style={[t.callout, u.flex]}>{it.name}</Text>
              <Text style={[t.footnote, t.num]}>{it.target?.t ? `${it.sets} × ${it.target.t} s` : `${it.sets} × ${it.target?.r ?? 10}${it.target?.w ? ` at ${num(it.target.w)} kg` : ''}`}</Text>
            </View>
          ))}
          {p.items.length > 4 ? <Text style={t.footnote}>{`and ${p.items.length - 4} more`}</Text> : null}
        </View>
        <View style={u.row}>
          <Button label="Start workout" kind="accent" onPress={start} wrap={u.flex} />
          <Button label="Details" kind="quiet" onPress={() => nav.openTab('train')} />
        </View>
      </Lead>
    );
  }
  if (h.lead === 'face') {
    const half = h.face.half;
    const x = h.face[half];
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>{half === 'am' ? 'Morning routine' : 'Night routine'}</Text>
        <View style={u.row}>
          <Progress done={x.done} total={x.total} size={64} label={`${x.done}/${x.total}`} />
          <View style={[u.flex, u.gap4]}>
            <Text style={t.title3}>{x.done >= x.total ? 'Done for tonight' : `${x.total - x.done} ${x.total - x.done === 1 ? 'step' : 'steps'} left`}</Text>
            <Text style={t.footnote}>Each step has its own timer.</Text>
          </View>
        </View>
        <Button label={x.done ? 'Carry on' : 'Start'} kind="accent" onPress={() => nav.openFlow({ kind: 'routine', when: half })} />
      </Lead>
    );
  }
  if (h.lead === 'diet') {
    const left = Math.max(0, h.diet.protein_target - h.diet.protein);
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>Protein</Text>
        <View style={u.row}>
          <Progress done={h.diet.protein} total={h.diet.protein_target} size={64} />
          <View style={[u.flex, u.gap4]}>
            <Text style={[t.title3, t.num]}>{`${h.diet.protein} of ${h.diet.protein_target} g`}</Text>
            <Text style={[t.footnote, t.num]}>{`${left} g to go today`}</Text>
          </View>
        </View>
        <Button label="Log a meal" kind="accent" onPress={() => nav.openSheet({ kind: 'meal' })} />
      </Lead>
    );
  }
  if (h.lead === 'voice') {
    return (
      <Lead>
        <Text style={[t.footnote, { color: a.color }]}>Voice drills</Text>
        <View style={u.gap4}>
          <Text style={[t.title3, t.num]}>{`${h.voice.minutes} minutes today`}</Text>
          {h.voice.focus ? <Text style={t.subhead}>{`Aimed at ${DIM[h.voice.focus] ?? h.voice.focus}, your weakest measure.`}</Text> : null}
        </View>
        <Button label="Start" kind="accent" onPress={() => nav.openFlow({ kind: 'drills' })} />
      </Lead>
    );
  }
  // everything for today is done, or there is nothing planned
  const trained = g.trained[0];
  const next = g.next && g.next.date > h.today ? g.next : null;
  return (
    <Lead>
      <Text style={[t.footnote, { color: a.color }]}>{trained ? 'Trained today' : g.state === 'rest' ? 'Rest day' : 'Today'}</Text>
      <Text style={t.title3}>{trained ? `${trained.name}, ${trainedWords(trained)}${g.trained.length > 1 ? `, and ${g.trained.length - 1} more` : ''}` : 'Nothing left to do for the body today.'}</Text>
      {next ? <Text style={t.subhead}>{`Next: ${next.name}, ${dayAhead(next.date, h.today)}.`}</Text> : null}
      {!trained && g.state === 'rest' ? <Text style={t.subhead}>A walk or a round of boxing still counts. One tap logs it.</Text> : null}
      {!trained ? <Button label="Log other training" kind="quiet" onPress={() => nav.openSheet({ kind: 'quick', quick: 'boxing' })} /> : null}
    </Lead>
  );
}

// ── this week ──
/** Train's week block, from the same read, so the two tabs (and Home's gym card) show one count and one streak. */
function Week({ h }: { h: Home }) {
  const gym = useGym();
  if (gym.data) return <TrainWeek g={gym.data} />;
  const w = h.gym.week;
  return (
    <Block title="This week" sub={streakWords(w.streak)} right={<Text style={[t.subhead, t.num, { color: C.muted }]}>{`${w.days} of ${w.target} days`}</Text>}>
      <Skeleton height={88} radius={22} />
    </Block>
  );
}

// ── the rest of today ──
function Rest({ h }: { h: Home }) {
  const nav = useNav();
  const start = useStart();
  const a = useAspect();
  const rows: React.ReactNode[] = [];
  const g = h.gym;
  if (h.lead !== 'gym' || !g.plan) {
    if (g.state === 'planned' && g.plan) {
      rows.push(<Item key="gym" title={g.plan.name} sub={`${g.plan.items.length} exercises, about ${minutesFor(g.plan)} min`} left={<Glyphless done={false} />}
        action={<Button label="Start" kind="soft" small onPress={start} />} onPress={() => nav.openTab('train')} />);
    } else if (g.state === 'done' && g.trained[0]) {
      rows.push(<Item key="gym" title={`Trained: ${g.trained.map((x) => x.name).join(', ')}`} sub={g.trained.map(trainedWords).join(', ')} left={<Progress done={1} total={1} label="" />} onPress={() => nav.openTab('train')} />);
    } else if (g.state === 'rest') {
      rows.push(<Item key="gym" title="Rest day" sub="Boxing, a run or a walk logs in one tap" left={<Glyphless done={false} />}
        action={<Button label="Log" kind="soft" small onPress={() => nav.openSheet({ kind: 'quick', quick: 'boxing' })} />} />);
    }
  }
  if (h.lead !== 'diet') {
    rows.push(<Item key="protein" title="Protein" sub={`${h.diet.protein} of ${h.diet.protein_target} g, ${h.diet.kcal.toLocaleString('en-IN')} kcal`}
      left={<Progress done={h.diet.protein} total={h.diet.protein_target} />} action={<Button label="Log" kind="soft" small onPress={() => nav.openSheet({ kind: 'meal' })} />}
      onPress={() => nav.openTab('diet')} />);
  }
  const water = h.diet.water;
  rows.push(<Item key="water" title="Water" sub={`${water} of ${h.diet.water_target} glasses`} left={<Progress done={water} total={h.diet.water_target} label={String(water)} />}
    action={<Button label="Add a glass" kind="soft" small onPress={async () => {
      try { await logWater(water + 1); undoable(`Glass ${water + 1} of water`, () => { void logWater(water); }); }
      catch (e) { a.notice((e as Error).message); }
    }} />} />);
  if (h.lead !== 'face' && h.face.total > 0) {
    const half = h.face.half; const x = h.face[half];
    rows.push(<Item key="face" title={half === 'am' ? 'Morning routine' : 'Night routine'} sub={x.done >= x.total ? 'Done' : `${x.done} of ${x.total} done`}
      left={<Progress done={x.done} total={x.total} label={`${x.done}/${x.total}`} />}
      action={x.done < x.total ? <Button label="Start" kind="soft" small onPress={() => nav.openFlow({ kind: 'routine', when: half })} /> : undefined} onPress={() => nav.openTab('face')} />);
  }
  if (h.lead !== 'voice' && h.voice.total > 0) {
    rows.push(<Item key="voice" title="Voice drills" sub={h.voice.done >= h.voice.total ? 'Done' : `${h.voice.minutes} min${h.voice.focus ? `, ${DIM[h.voice.focus] ?? h.voice.focus}` : ''}`}
      left={<Progress done={h.voice.done} total={h.voice.total} label={`${h.voice.done}/${h.voice.total}`} />}
      action={h.voice.done < h.voice.total ? <Button label="Start" kind="soft" small onPress={() => nav.openFlow({ kind: 'drills' })} /> : undefined} onPress={() => nav.openTab('voice')} />);
  }
  return (
    <Block title="Also today">
      <Group inset={64}>{rows}</Group>
    </Block>
  );
}

/** An empty ring, for a line with nothing measured yet. */
function Glyphless({ done }: { done: boolean }) {
  return <Progress done={done ? 1 : 0} total={1} label="" />;
}

// ── is it working ──
function Proof({ h }: { h: Home }) {
  const nav = useNav();
  const w = h.proof.weight;
  const goal = goalOf(w);
  const face = h.proof.face;
  const voice = h.proof.voice;
  return (
    <Block title="Is it working" action="Weigh in" onAction={() => nav.openSheet({ kind: 'weigh' })}>
      <Group>
        <ProofRow label="Weight" value={w.now != null ? num(w.now) : null} unit="kg"
          when={w.date ? `${agoDays(w.days)}${goal ? `, goal ${num(goal)} kg` : ''}` : 'Not weighed yet'}
          spark={<Trend values={w.trail.map((x) => x.v)} minSpan={5} height={32} />}
          onPress={() => nav.openDetail({ kind: 'weight' })} />
        <ProofRow label="Face" value={face?.v != null ? String(face.v) : null} unit={face?.margin ? `± ${face.margin}` : null}
          when={face ? `${agoDays(face.days)}${face.measured != null && face.of != null && face.measured < face.of ? `, ${face.measured} of ${face.of} measured` : ''}` : 'No scan yet'}
          delta={face?.delta != null && face.margin != null && Math.abs(face.delta) > face.margin ? face.delta : null}
          spark={face ? <Trend values={face.trend} range={[0, 100]} height={32} /> : null}
          onPress={() => nav.openTab('face')} />
        <ProofRow label="Voice" value={voice?.v != null ? String(voice.v) : null}
          when={voice ? `${agoDays(voice.days)}${voice.measured != null && voice.of != null && voice.measured < voice.of ? `, ${voice.measured} of ${voice.of} measured` : ''}` : 'No sample yet'}
          delta={voice?.delta ?? null} spark={voice ? <Trend values={voice.trend} range={[0, 100]} height={32} /> : null}
          onPress={() => nav.openTab('voice')} />
      </Group>
    </Block>
  );
}

function ProofRow({ label, value, unit, when, delta, spark, onPress }: {
  label: string; value: string | null; unit?: string | null; when: string; delta?: number | null; spark?: React.ReactNode; onPress: () => void;
}) {
  const a = useAspect();
  return (
    <Press label={`${label}, ${value ?? 'not measured'}${unit ? ` ${unit}` : ''}, ${when}`} onPress={onPress} scale={0.99} style={s.proof}>
      <View style={s.proofLeft}>
        <Text style={t.footnote}>{label}</Text>
        <View style={s.proofValue}>
          <Text style={[t.title3, t.num, value == null && { color: C.faint }]}>{value ?? 'None'}</Text>
          {value != null && unit ? <Text style={[t.footnote, t.num]}>{unit}</Text> : null}
        </View>
        <Text numberOfLines={1} style={[t.micro, s.when]}>{when}</Text>
      </View>
      <View style={s.proofRight}>
        {spark ? <View style={s.spark}>{spark}</View> : null}
        <View style={u.row}>
          {delta != null && delta !== 0 ? <Text style={[t.footnote, t.num, { color: delta > 0 ? a.color : C.muted }]}>{`${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)}`}</Text> : null}
        </View>
      </View>
    </Press>
  );
}

const s = StyleSheet.create({
  exList: { gap: 8 },
  exRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  proof: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 84, paddingHorizontal: 16, paddingVertical: 12 },
  proofLeft: { flex: 1, minWidth: 0, gap: 2 },
  proofValue: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  when: { color: C.muted },
  proofRight: { alignItems: 'flex-end', gap: 6, width: 120 },
  spark: { width: 112, height: 32, flexDirection: 'row' },
});
