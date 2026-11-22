import { useState } from 'react';
import { Text, View } from 'react-native';
import { fileSource } from '@/lib/mod';
import { Button, Card, Failed, Icon, IconButton, Loading, Row, Screen, Section, shortDay, Skeleton, Spark, t, timer, useAspect } from '@/aspects/kit';
import { agoDays, filePath, measureSample, tick, usePoll, useVoice, type DimId, type Drill, type Voice } from '../api';
import { useNav } from '../nav';
import { Delta, List, Score, ScoreRow, Tag, s as u, useInnerWidth, useSeen } from '../ui';
import { usePlayer } from './recorder';

export function VoiceScreen({ open, onClose, title }: { open: boolean; onClose: () => void; title: string }) {
  const read = useVoice(useSeen(open));
  const { data, error, refresh } = read;
  const [dim, setDim] = useState<DimId | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const measuring = data?.open?.status === 'measuring' || !!data?.today.drills.some((d) => d.take?.status === 'measuring');
  usePoll(refresh, open && measuring, 3000);
  return (
    <>
      <Screen open={open} onClose={onClose} title={title}>
        {!data && error ? <Failed message={error} onRetry={() => { void refresh(); }} /> : null}
        {!data && !error ? <View style={u.gap16}><Skeleton height={180} radius={24} /><Skeleton height={200} radius={24} /><Skeleton height={280} radius={24} /></View> : null}
        {data ? (
          <>
            {data.open ? <OpenSample v={data} /> : null}
            {data.latest ? <Hero v={data} /> : !data.open ? <Intro /> : null}
            <Today v={data} />
            {data.latest ? <Dims v={data} onOpen={setDim} /> : null}
            {data.latest ? <Trend v={data} /> : null}
            <Section title="How it is measured">
              <Text style={t.small}>{`Your PC measures each recording with ffmpeg and its own code: pace, pitch spread, loudness drift and pauses come from the sound itself. Clarity and fillers need a transcript, which Nora writes on your PC. A change smaller than ${data.realChange} points is not counted.`}</Text>
            </Section>
          </>
        ) : null}
      </Screen>
      <DimDetail id={dim} v={data} onClose={() => setDim(null)} onDrill={setDrill} />
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </>
  );
}

function Intro() {
  const nav = useNav();
  return (
    <Card style={u.gap12}>
      <Text style={t.title2}>Your voice, measured</Text>
      <Text style={t.body}>Read a short passage aloud, then talk for 30 seconds. Your PC scores pace, pitch, loudness, pauses, clarity and fillers from 0 to 100, and picks a few minutes of drills a day for the weakest one. A new sample each week shows the trend.</Text>
      <Button label="Record first sample" kind="accent" onPress={() => nav.openFlow({ kind: 'sample' })} />
    </Card>
  );
}

function OpenSample({ v }: { v: Voice }) {
  const nav = useNav();
  const a = useAspect();
  const o = v.open!;
  const [busy, setBusy] = useState(false);
  if (o.status === 'measuring') return <Card tone={a.color}><Loading label="Measuring your sample on the PC. About a minute; you can leave." /></Card>;
  const parts = (o.parts.read ? 1 : 0) + (o.parts.free ? 1 : 0);
  const again = async () => { setBusy(true); try { await measureSample(o.id); } catch (e) { a.notice((e as Error).message); } setBusy(false); };
  return (
    <Card tone={a.color} style={u.gap12}>
      <Text style={[t.label, { color: a.color }]}>{o.status === 'failed' ? 'The measuring stopped' : 'Sample in progress'}</Text>
      <Text style={t.body}>{o.status === 'failed' ? o.error ?? 'Measure it again.' : `${parts} of 2 parts recorded.`}</Text>
      {o.status === 'failed' && parts === 2 ? <Button label="Measure again" kind="accent" busy={busy} onPress={() => { void again(); }} />
        : <Button label="Continue" kind="accent" onPress={() => nav.openFlow({ kind: 'sample' })} />}
    </Card>
  );
}

function Hero({ v }: { v: Voice }) {
  const nav = useNav();
  const l = v.latest!;
  const days = v.due ? 7 - v.due.days : null;
  const n = l.dims.filter((d) => d.v != null).length;
  return (
    <Card style={u.gap12}>
      <Text style={t.label}>Overall</Text>
      <View style={u.between}>
        <Score v={l.overall} />
        <Delta d={l.delta} />
      </View>
      <Text style={t.small}>{`${shortDay(l.date)}, ${agoDays(days)}. The average of ${n === 6 ? 'the six measures' : `the ${n} measures taken`} below.`}</Text>
      {l.explain?.text ? <Text style={t.body}>{l.explain.text}</Text> : null}
      <Listen v={v} />
      {v.due ? (
        <View style={u.between}>
          <Text style={[t.small, u.flex]}>{v.due.days <= 0 ? 'This week\'s sample is due.' : v.due.days === 1 ? 'Next sample tomorrow.' : `Next sample on ${shortDay(v.due.date)}.`}</Text>
          <Button label="Record sample" kind={v.due.days <= 0 ? 'soft' : 'quiet'} small onPress={() => nav.openFlow({ kind: 'sample' })} />
        </View>
      ) : null}
    </Card>
  );
}

/** Play back the two parts of the latest sample. */
function Listen({ v }: { v: Voice }) {
  const l = v.latest!;
  const read = l.parts.read, free = l.parts.free;
  if (!read && !free) return null;
  return (
    <View style={u.row}>
      {read ? <PlayChip label="Passage" file={read.file} secs={read.seconds} /> : null}
      {free ? <PlayChip label="Free talk" file={free.file} secs={free.seconds} /> : null}
    </View>
  );
}
function PlayChip({ label, file, secs }: { label: string; file: string; secs: number | null }) {
  const [on, setOn] = useState(false);
  // the player loads only once asked, so opening Voice doesn't fetch both recordings
  return on ? <Player label={label} file={file} /> : (
    <Button label={`${label}${secs ? `, ${timer(secs)}` : ''}`} kind="quiet" small icon={<Icon name="play" size={14} />} onPress={() => setOn(true)} />
  );
}
function Player({ label, file }: { label: string; file: string }) {
  const p = usePlayer(fileSource(filePath(file)));
  if (!p.available) return <Text style={t.caption}>Playback comes with the next app build.</Text>;
  return (
    <View style={u.row}>
      <IconButton label={p.playing ? `Pause ${label}` : `Play ${label}`} size={36} onPress={p.toggle}><Icon name={p.playing ? 'pause' : 'play'} size={16} /></IconButton>
      <Text style={[t.caption, t.num]}>{`${label} ${timer(p.at)}${p.duration ? ` of ${timer(p.duration)}` : ''}`}</Text>
    </View>
  );
}

// ── today's drills ──
function Today({ v }: { v: Voice }) {
  const nav = useNav();
  const a = useAspect();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const d = v.today;
  const focus = v.dims.find((x) => x.id === d.focus);
  const isDone = (id: string, done: boolean) => local[id] ?? done;
  const left = d.drills.filter((x) => !isDone(x.id, x.done)).length;
  const toggle = async (id: string, done: boolean) => {
    const on = !isDone(id, done);
    setLocal({ ...local, [id]: on });
    try { await tick(`voice-${id}`, on); } catch (e) { setLocal((l) => { const n = { ...l }; delete n[id]; return n; }); a.notice((e as Error).message); }
  };
  return (
    <Section title="Today's drills">
      <Card style={u.gap4}>
        <View style={u.between}>
          <View style={u.flex}>
            <Text style={t.strong}>{focus ? `Aimed at ${focus.name.toLowerCase()}` : 'A warm up for every measure'}</Text>
            <Text style={[t.caption, t.num]}>{`${d.drills.length - left} of ${d.drills.length} done, about ${d.minutes} min`}</Text>
          </View>
          <Button label={left ? (left < d.drills.length ? 'Continue' : 'Start') : 'Again'} kind={left ? (v.latest ? 'accent' : 'soft') : 'quiet'} small onPress={() => nav.openFlow({ kind: 'drills' })} />
        </View>
        {d.drills.map((x) => (
          <Row key={x.id} title={x.name} done={isDone(x.id, x.done)} onToggle={() => { void toggle(x.id, x.done); }}
            sub={x.take?.status === 'done' && x.take.score != null ? `Take scored ${x.take.score}${x.take.value ? `, ${x.take.value}` : ''}` : `${x.minutes} min${x.measure ? ', recorded' : ''}`} />
        ))}
        {!v.latest ? <Text style={t.small}>Your first sample aims these at your weakest measure.</Text> : null}
      </Card>
    </Section>
  );
}

// ── the six measures ──
function Dims({ v, onOpen }: { v: Voice; onOpen: (id: DimId) => void }) {
  const dims = [...v.latest!.dims].sort((a, b) => (a.v ?? 101) - (b.v ?? 101));
  return (
    <Section title="By measure">
      <List>
        {dims.map((d) => (
          <ScoreRow key={d.id} name={d.name} v={d.v} note={d.v == null ? d.why : d.value ? `${d.value}. Target ${d.target.charAt(0).toLowerCase()}${d.target.slice(1)}` : d.target}
            right={d.id === v.today.focus ? <Tag>Today&apos;s focus</Tag> : d.delta ? <Delta d={d.delta} /> : undefined} onPress={() => onOpen(d.id)} />
        ))}
      </List>
    </Section>
  );
}

function DimDetail({ id, v, onClose, onDrill }: { id: DimId | null; v: Voice | null; onClose: () => void; onDrill: (d: Drill) => void }) {
  const w = useInnerWidth();
  const d = v?.latest?.dims.find((x) => x.id === id);
  const trend = v?.trend.find((x) => x.id === id)?.points ?? [];
  const drills = (v?.library ?? []).filter((x) => id && x.dims.includes(id));
  return (
    <Screen open={!!id && !!d} onClose={onClose} title={d?.name ?? ''}>
      {d && v ? (
        <>
          <Card style={u.gap12}>
            <View style={u.between}><Score v={d.v} /><Delta d={d.delta} /></View>
            {d.value ? <Text style={[t.strong, t.num]}>{d.value}</Text> : null}
            <Text style={t.small}>{`Target: ${d.target}.`}</Text>
            {d.why ? <Text style={t.body}>{d.why}</Text> : null}
            {trend.filter((p) => p.v != null).length > 1 ? <Spark values={trend.map((p) => p.v)} width={w} height={56} /> : null}
          </Card>
          {drills.length ? (
            <Section title="Drills that train it">
              <List>{drills.map((x) => <Row key={x.id} title={x.name} sub={`${x.minutes} min${x.measure ? ', recorded and scored' : ''}`} chevron onPress={() => onDrill(x)} />)}</List>
            </Section>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function DrillSheet({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  return (
    <Screen open={!!drill} onClose={onClose} title={drill?.name ?? ''}>
      {drill ? (
        <>
          <Text style={t.body}>{drill.does}</Text>
          {drill.text ? <Card><Text style={t.lead}>{drill.text}</Text></Card> : null}
          <Section title="Steps">
            {drill.steps.map((s, i) => (
              <View key={i} style={[u.row, { alignItems: 'flex-start' }]}>
                <Text style={[t.label, t.num, { width: 20 }]}>{i + 1}</Text>
                <Text style={[t.body, u.flex]}>{s.text}</Text>
                {s.sec ? <Text style={[t.caption, t.num]}>{s.sec >= 60 ? `${Math.round(s.sec / 60)} min` : `${s.sec} s`}</Text> : null}
              </View>
            ))}
          </Section>
          <Text style={t.small}>{drill.measure ? 'Recorded in the drills player, and scored on your PC.' : 'Guided with a timer in the drills player.'}</Text>
        </>
      ) : null}
    </Screen>
  );
}

// ── the trend ──
function Trend({ v }: { v: Voice }) {
  const w = useInnerWidth();
  const overall = v.trend.find((x) => x.id === 'overall')?.points ?? [];
  if (v.samples.length < 2) {
    return (
      <Section title="Trend">
        <Text style={t.small}>Your first sample. Next week&apos;s shows here as a line, with each measure&apos;s change.</Text>
      </Section>
    );
  }
  return (
    <Section title="Trend">
      <Card style={u.gap12}>
        <Spark values={overall.map((p) => p.v)} width={w} height={64} />
        <Text style={t.small}>{`${v.samples.length} samples since ${shortDay(v.samples.at(-1)!.date)}.`}</Text>
      </Card>
      <List>{v.samples.map((s) => <Row key={s.id} title={shortDay(s.date)} right={s.overall != null ? String(s.overall) : ''} />)}</List>
    </Section>
  );
}
