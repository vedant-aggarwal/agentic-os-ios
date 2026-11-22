import { Text, View } from 'react-native';
import { C } from '@/theme';
import type { Read } from '@/lib/mod';
import { Button, Card, Failed, Glyph, num, Row, Section, shortDay, Skeleton, Spark, t, useAspect } from '@/aspects/kit';
import { agoDays, goalOf, inDays, PART_NAME, useGym, type Home as HomeData, type Part } from './api';
import { useNav } from './nav';
import { Delta, List, MiniRing, s as u } from './ui';

const DIM_NAME: Record<string, string> = { pace: 'pace', pitch: 'pitch variation', loudness: 'steady loudness', pauses: 'pauses', clarity: 'clarity', fillers: 'fewer fillers' };
const PART_ICON: Record<Part, [string, string]> = {
  gym: ['dumbbell', 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12'],
  diet: ['fork.knife', 'M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-1.5 2-2 4-2 6s1 3 2 3v9'],
  face: ['face.smiling', 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5c1.8 2 5.2 2 7 0'],
  voice: ['waveform', 'M4 12h1M8 8v8M12 5v14M16 9v6M20 12h0'],
};

/** What to do for the body today, and whether it's working. */
export function Home({ read }: { read: Read<HomeData> }) {
  const { data, error, refresh } = read;
  if (!data && error) return <Failed message={error} onRetry={() => { void refresh(); }} />;
  if (!data) {
    return (
      <View style={u.gap16}>
        <Skeleton height={196} radius={24} />
        <Skeleton height={20} width={120} />
        <Skeleton height={216} radius={24} />
        <Skeleton height={20} width={120} />
        <Skeleton height={248} radius={24} />
      </View>
    );
  }
  return (
    <>
      <Lead h={data} />
      <Section title={data.lead === 'done' ? 'Today' : 'Also today'}>
        <List>{data.order.map((p) => <PartRow key={p} part={p} h={data} />)}</List>
      </Section>
      <Proof h={data} />
    </>
  );
}

// ── the one thing that matters now ──
function Lead({ h }: { h: HomeData }) {
  const a = useAspect();
  const nav = useNav();
  const gymRead = useGym();   // today's full session, so Start begins the workout in one tap
  const { gym, diet, face, voice } = h;
  let kicker = '', title = '', body = '', meta = '';
  let act: { label: string; run: () => void } | null = null;
  let more: { label: string; run: () => void } | null = null;
  const half = face.half;
  if (h.lead === 'gym' && gym.state === 'live') {
    kicker = 'Workout in progress'; title = gym.session?.name ?? 'Workout'; body = `${gym.session?.sets ?? 0} sets done so far.`;
    act = { label: 'Resume', run: () => { void nav.startWorkout(null); } };
  } else if (h.lead === 'gym' && gym.plan) {
    kicker = gym.plan.at ? `Gym at ${gym.plan.at}` : 'Gym today'; title = gym.plan.name; body = gym.plan.why;
    meta = `${gym.plan.items.length} exercises`;
    const session = gymRead.data?.session ?? null;
    act = { label: 'Start workout', run: () => { if (session) void nav.startWorkout(session); else nav.openPart('gym'); } };
    more = { label: 'See plan', run: () => nav.openPart('gym') };
  } else if (h.lead === 'face' && (face.am.total || face.pm.total) && (face.am.done < face.am.total || face.pm.done < face.pm.total)) {
    const w = half === 'pm' || face.am.done >= face.am.total ? 'pm' : 'am';
    const r = face[w];
    kicker = w === 'am' ? 'Morning routine' : 'Night routine'; title = `${r.done} of ${r.total} done`;
    body = w === 'am' ? 'Skin first, then the rest of the face plan.' : 'Clean skin before bed, then the night steps.';
    act = { label: 'Start', run: () => nav.openFlow({ kind: 'routine', when: w }) };
    more = { label: 'Face plan', run: () => nav.openPart('face') };
  } else if (h.lead === 'face') {
    kicker = 'Face'; title = face.open?.status === 'shooting' ? 'Finish your scan' : 'Take your first face scan';
    body = 'Six photos, scored on a fixed rubric, turned into a plan of what you can change.';
    act = { label: face.open?.status === 'shooting' ? 'Continue scan' : 'Start scan', run: () => nav.openFlow({ kind: 'scan' }) };
  } else if (h.lead === 'diet') {
    kicker = diet.behind ? 'Protein' : 'Diet'; title = `${diet.protein} of ${diet.protein_target} g protein`;
    body = diet.behind ? 'A protein meal now keeps the day on pace.' : `${diet.protein_target - diet.protein} g to go today.`;
    meta = diet.meals ? `${diet.meals} ${diet.meals === 1 ? 'meal' : 'meals'} logged` : 'Nothing logged yet';
    act = { label: 'Log a meal', run: () => nav.openSheet({ kind: 'meal' }) };
  } else if (h.lead === 'voice') {
    kicker = 'Voice drills'; title = `${voice.minutes} minutes`;
    body = voice.focus ? `Aimed at ${DIM_NAME[voice.focus] ?? voice.focus}, your lowest score.` : 'A first set of warmups and drills. Record a sample to aim them.';
    meta = voice.done ? `${voice.done} of ${voice.total} done` : `${voice.total} drills`;
    act = { label: 'Start drills', run: () => nav.openFlow({ kind: 'drills' }) };
  } else {
    kicker = 'Done for today'; title = 'Everything is kept';
    const kept = [gym.trained.length ? `trained ${gym.trained.map((x) => x.name).join(' and ')}` : null, diet.protein >= diet.protein_target ? 'protein met' : null,
      face.total && face.done >= face.total ? 'face routine done' : null, voice.total && voice.done >= voice.total ? 'voice drills done' : null].filter(Boolean);
    body = kept.length ? `Today you ${kept.join(', ')}.` : 'Nothing is waiting.';
  }
  return (
    <Card tone={a.color} style={u.gap16}>
      <View style={u.gap4}>
        <Text style={[t.label, { color: a.color }]}>{kicker}</Text>
        <Text style={[t.title2, t.num]}>{title}</Text>
        {body ? <Text style={t.body}>{body}</Text> : null}
        {meta ? <Text style={t.small}>{meta}</Text> : null}
      </View>
      {act ? (
        <View style={u.row}>
          <Button label={act.label} kind="accent" onPress={act.run} wrap={u.flex} />
          {more ? <Button label={more.label} kind="quiet" onPress={more.run} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

// ── the other parts, one line each ──
function PartRow({ part, h }: { part: Part; h: HomeData }) {
  const nav = useNav();
  const icon = PART_ICON[part];
  let sub = '', done = 0, total = 0;
  let btn: { label: string; run: () => void } | null = null;
  if (part === 'gym') {
    const g = h.gym;
    if (g.state === 'live') { sub = `${g.session?.name ?? 'Workout'} in progress`; btn = { label: 'Resume', run: () => { void nav.startWorkout(null); } }; }
    else if (g.state === 'done') { sub = `Done: ${g.trained.map((x) => `${x.name}, ${x.sets} sets`).join(' and ')}`; done = 1; total = 1; }
    else if (g.state === 'planned' && g.plan) { sub = `${g.plan.name}, ${g.plan.items.length} exercises`; btn = { label: 'Open', run: () => nav.openPart('gym') }; }
    else { sub = g.next ? `Rest day. Next: ${g.next.name}` : 'Rest day'; btn = { label: 'Log', run: () => nav.openSheet({ kind: 'quick', quick: 'boxing' }) }; }
  } else if (part === 'diet') {
    const d = h.diet; done = d.protein; total = d.protein_target;
    sub = `${d.protein} of ${d.protein_target} g protein`;
    btn = { label: 'Log', run: () => nav.openSheet({ kind: 'meal' }) };
  } else if (part === 'face') {
    const f = h.face;
    const w = f.half === 'pm' || f.am.done >= f.am.total ? 'pm' : 'am';
    if (f.open && (f.open.status === 'reading' || f.open.status === 'planning')) sub = 'Reading your scan';
    else if (!f.scanned && !f.total) { sub = 'No scan yet'; btn = { label: 'Scan', run: () => nav.openFlow({ kind: 'scan' }) }; }
    else {
      done = f[w].done; total = f[w].total;
      sub = total ? `${w === 'am' ? 'Morning' : 'Night'}, ${done} of ${total}` : 'No routine today';
      if (total && done < total) btn = { label: 'Start', run: () => nav.openFlow({ kind: 'routine', when: w }) };
      if (f.due && f.due.days <= 0) sub = `${sub}. Rescan due`;
    }
  } else {
    const v = h.voice; done = v.done; total = v.total;
    sub = v.open?.status === 'measuring' ? 'Measuring your sample' : v.focus ? `${v.minutes} min, ${DIM_NAME[v.focus] ?? v.focus}` : `${v.minutes} min of drills`;
    if (v.done < v.total) btn = { label: 'Start', run: () => nav.openFlow({ kind: 'drills' }) };
  }
  const left = total > 0
    ? <MiniRing done={Math.min(done, total)} total={total} text={part === 'diet' ? `${Math.round((Math.min(done, total) / total) * 100)}%` : undefined} />
    : <View style={u.icon40}><Glyph sf={icon[0] as never} d={icon[1]} size={22} color={C.muted} /></View>;
  return (
    // the row opens the part; the button beside it (not inside it) does today's one thing
    <View style={u.row}>
      <Row title={PART_NAME[part]} sub={sub} label={`Open ${PART_NAME[part]}, ${sub}`} onPress={() => nav.openPart(part)} left={left} style={u.flex} chevron={!btn} />
      {btn ? <Button label={btn.label} kind="soft" small onPress={btn.run} /> : null}
    </View>
  );
}

// ── is it working ──
function Proof({ h }: { h: HomeData }) {
  const nav = useNav();
  const { weight, face, voice } = h.proof;
  const goal = goalOf(weight);
  const trail = weight.trail.map((x) => x.v);
  const monthAgo = weight.trail.find((x) => weight.date && x.date >= shiftDay(weight.date, -35));
  const wd = weight.now != null && monthAgo && monthAgo.date !== weight.date ? Math.round((weight.now - monthAgo.v) * 10) / 10 : null;
  return (
    <Section title="Is it working">
      <List>
        {[
          <ProofLine key="w" title="Weight" value={weight.now != null ? `${num(weight.now)} kg` : null} date={weight.date} days={weight.days}
            note={wd != null && Math.abs(wd) >= 0.5 && monthAgo ? `${wd < 0 ? 'Down' : 'Up'} ${num(Math.abs(wd))} kg since ${shortDay(monthAgo.date)}` : goal ? `Goal ${num(goal)} kg` : null}
            spark={trail.length > 1 ? trail : null} goal={goal ?? undefined}
            stale={(weight.days ?? 0) > 7} action={{ label: 'Weigh in', run: () => nav.openSheet({ kind: 'weigh' }) }} />,
          <ProofLine key="f" title="Face score" value={face ? `${face.v}${face.margin ? ` ± ${face.margin}` : ''}` : null} date={face?.date ?? null} days={face?.days ?? null}
            delta={face?.delta} spark={face && face.trend.length > 1 ? face.trend : null}
            note={face && h.face.due ? `Next scan ${inDays(h.face.due.days)}` : null}
            stale={!!h.face.due && h.face.due.days <= 0} action={{ label: face ? 'Rescan' : 'Scan', run: () => nav.openFlow({ kind: 'scan' }) }} />,
          <ProofLine key="v" title="Voice score" value={voice ? String(voice.v) : null} date={voice?.date ?? null} days={voice?.days ?? null}
            delta={voice?.delta} spark={voice && voice.trend.length > 1 ? voice.trend : null}
            stale={(voice?.days ?? 0) >= 7} action={{ label: voice ? 'New sample' : 'Record', run: () => nav.openFlow({ kind: 'sample' }) }} />,
        ]}
      </List>
    </Section>
  );
}
const shiftDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function ProofLine({ title, value, date, days, note, delta, spark, goal, stale, action }: {
  title: string; value: string | null; date: string | null; days: number | null; note?: string | null; delta?: number | null;
  spark: number[] | null; goal?: number; stale: boolean; action: { label: string; run: () => void };
}) {
  return (
    <View style={[u.row, { paddingVertical: 12 }]}>
      <View style={[u.flex, u.gap4]}>
        <Text style={t.label}>{title}</Text>
        {value ? (
          <>
            <Text style={[t.heading, t.num]}>{value}</Text>
            <Text style={t.small}>{date ? `${shortDay(date)}, ${agoDays(days)}` : ''}</Text>
            {delta != null ? <Delta d={delta} /> : note ? <Text style={t.caption}>{note}</Text> : null}
          </>
        ) : <Text style={t.body}>Not measured yet</Text>}
      </View>
      {value && spark && !stale ? <Spark values={spark} width={96} height={44} goal={goal} /> : <Button label={action.label} kind={value ? 'quiet' : 'soft'} small onPress={action.run} />}
    </View>
  );
}
